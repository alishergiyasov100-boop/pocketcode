/* ============================================================
   Демон PocketCode: раздаёт интерфейс и проксирует настоящий
   Claude Code в браузер по WebSocket.
   ============================================================ */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Session } = require("./bridge");
const { attach } = require("./ws");
const config = require("./config");

const WEB = path.join(__dirname, "..", "web");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function start(cfg) {
  cfg = cfg || config.load();
  const clients = new Set();
  let session = null;

  /* всё, что мы честно знаем о расходе; чего не знаем — null, а не ноль */
  const day = { cost: 0, tokens: 0, turns: 0, since: Date.now() };
  function usageSnapshot() {
    const s = session && !session.closed ? session.usage() : null;
    return {
      plan: cfg.plan || null,
      model: cfg.model || "default",
      gateway: cfg.baseUrl || null,
      session: s ? { cost: s.cost, tokens: s.tokens, turns: s.turns, elapsed: s.elapsed } : null,
      today: { cost: day.cost, tokens: day.tokens, turns: day.turns, since: day.since },
      allowance: cfg.allowance || null,     /* { limitUsd, usedUsd, resetsAt } если задано */
      project: path.basename(cfg.project)
    };
  }

  /* ---------- свои провайдеры ----------
     Проверку делает демон, а не браузер: чужой шлюз почти наверняка
     не отдаёт CORS-заголовки, и запрос со страницы просто не уйдёт. */

  function readBody(req) {
    return new Promise((resolve) => {
      let b = "";
      req.on("data", (d) => { b += d; if (b.length > 1e6) req.destroy(); });
      req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch (e) { resolve({}); } });
    });
  }

  function probe(baseUrl, token) {
    return new Promise((resolve) => {
      let url;
      try { url = new URL(String(baseUrl).replace(/\/+$/, "") + "/v1/models"); }
      catch (e) { return resolve({ ok: false, error: "that does not look like a URL" }); }
      const mod = url.protocol === "https:" ? require("https") : require("http");
      const t0 = Date.now();
      const req = mod.get(url, {
        headers: {
          authorization: "Bearer " + (token || ""),
          "x-api-key": token || "",
          "user-agent": "pocketcode"
        }
      }, (r) => {
        let b = "";
        r.on("data", (d) => { b += d; if (b.length > 2e6) r.destroy(); });
        r.on("end", () => {
          const ms = Date.now() - t0;
          if (r.statusCode === 401 || r.statusCode === 403) {
            return resolve({ ok: false, ms, error: "the key was refused (" + r.statusCode + ")" });
          }
          let j = null;
          try { j = JSON.parse(b); } catch (e) {}
          const list = j && Array.isArray(j.data) ? j.data.map((m) => m.id).filter(Boolean) : null;
          if (!list) return resolve({ ok: false, ms, error: "answered " + r.statusCode + " but not with a model list" });
          resolve({ ok: true, ms, models: list });
        });
      });
      req.on("error", (e) => resolve({ ok: false, error: e.code === "ENOTFOUND" ? "no such host" : String(e.message) }));
      req.setTimeout(12000, () => { req.destroy(); resolve({ ok: false, error: "no answer in 12s" }); });
    });
  }

  /* ---------- какие проекты вообще есть ---------- */
  function listProjects() {
    const home = require("os").homedir();
    const roots = [path.join(home, "projects"), home];
    const seen = new Set();
    const out = [];
    for (const root of roots) {
      let names = [];
      try { names = fs.readdirSync(root, { withFileTypes: true }); } catch (e) { continue; }
      for (const d of names) {
        if (!d.isDirectory() || d.name.startsWith(".")) continue;
        const full = path.join(root, d.name);
        if (seen.has(full)) continue;
        seen.add(full);
        let at = 0, git = false;
        try { at = fs.statSync(full).mtimeMs; } catch (e) {}
        try { git = fs.existsSync(path.join(full, ".git")); } catch (e) {}
        out.push({ name: d.name, path: full, at, git, current: full === cfg.project });
      }
      if (root === home) break;
    }
    return out.sort((a, b) => (b.git - a.git) || (b.at - a.at)).slice(0, 60);
  }

  /* ---------- настоящие сессии с диска ----------
     Claude Code складывает их в ~/.claude/projects/<путь-через-дефисы>/<id>.jsonl.
     Формат внутренний, поэтому читаем осторожно: только первое сообщение
     пользователя на заголовок, остальное берём из файловой системы. */

  function sessionsDir() {
    const slug = String(cfg.project).replace(/[\/\\.]/g, "-");
    return path.join(require("os").homedir(), ".claude", "projects", slug);
  }

  function titleOf(file) {
    let fd;
    try {
      fd = fs.openSync(file, "r");
      const buf = Buffer.alloc(Math.min(64 * 1024, fs.fstatSync(fd).size));
      fs.readSync(fd, buf, 0, buf.length, 0);
      for (const line of buf.toString("utf8").split("\n")) {
        if (!line.trim()) continue;
        let j;
        try { j = JSON.parse(line); } catch (e) { continue; }
        if (j.type !== "user") continue;
        const c = j.message && j.message.content;
        const text = typeof c === "string"
          ? c
          : Array.isArray(c) ? (c.find((x) => x.type === "text") || {}).text : null;
        if (text && text.trim()) return text.replace(/\s+/g, " ").trim().slice(0, 90);
      }
    } catch (e) { /* файла нет или он занят — не беда */ }
    finally { if (fd !== undefined) try { fs.closeSync(fd); } catch (e) {} }
    return null;
  }

  function listSessions() {
    const dir = sessionsDir();
    let names = [];
    try { names = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")); } catch (e) { return []; }
    const live = session && !session.closed ? session.id : null;
    return names.map((f) => {
      const full = path.join(dir, f);
      let st = null;
      try { st = fs.statSync(full); } catch (e) {}
      return {
        id: f.replace(/\.jsonl$/, ""),
        title: titleOf(full),
        at: st ? st.mtimeMs : 0,
        size: st ? st.size : 0,
        current: f.replace(/\.jsonl$/, "") === live
      };
    }).filter((x) => x.size > 200)          /* пустые черновики не показываем */
      .sort((a, b) => b.at - a.at)
      .slice(0, 40);
  }

  function blast(obj) {
    const s = JSON.stringify(obj);
    for (const c of clients) c.send(s);
  }

  /* поиск приезжает отдельным MCP-сервером; без ключа его просто нет */
  const SEARCH_TOOLS = ["mcp__search__web_search", "mcp__search__web_read"];
  function mcpFor(c) {
    if (!c.searchKey) return null;
    const file = path.join(config.DIR, "mcp.json");
    const env = { POCKETCODE_SEARCH_KEY: c.searchKey };
    if (c.searchEndpoint) env.POCKETCODE_SEARCH_ENDPOINT = c.searchEndpoint;
    fs.writeFileSync(file, JSON.stringify({
      mcpServers: {
        search: {
          command: process.execPath,
          args: [path.join(__dirname, "search.js")],
          env
        }
      }
    }, null, 2));
    return file;
  }
  function toolsFor(c) {
    const base = c.allowedTools || [];
    return c.searchKey ? base.concat(SEARCH_TOOLS.filter((t) => base.indexOf(t) < 0)) : base;
  }

  function ensure() {
    if (session && !session.closed) return session;
    session = new Session({
      cwd: cfg.project,
      permissionMode: cfg.permissionMode,
      allowedTools: toolsFor(cfg),
      mcpConfig: mcpFor(cfg),
      bare: cfg.bare,
      model: cfg.model || undefined,
      resume: cfg.resume || undefined,
      env: config.envFor(cfg)
    }).start();

    session.on("ui", (e) => blast({ t: "ui", e }));
    session.on("idle", () => {
      const u = session.usage();
      day.cost = u.cost;                 /* шлюз отдаёт накопленную стоимость сессии */
      day.tokens = u.tokens;
      day.turns = u.turns;
      blast({ t: "state", busy: false });
      blast({ t: "usage", u: usageSnapshot() });
    });
    session.on("session", (id) => { cfg.resume = id; });
    session.on("stderr", (d) => process.stderr.write("[claude] " + d));
    session.on("error", (e) => blast({ t: "error", message: String(e && e.message || e) }));
    session.on("exit", (x) => {
      blast({ t: "state", busy: false });
      if (x.code) blast({ t: "error", message: "Agent exited with code " + x.code });
      session = null;
    });
    return session;
  }

  const server = http.createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];

    /* настоящий каталог моделей: спрашиваем у шлюза, браузеру туда нельзя */
    if (url === "/api/models") {
      if (!cfg.baseUrl) {
        res.writeHead(200, { "content-type": TYPES[".json"] });
        res.end(JSON.stringify({ models: [], source: "login", current: cfg.model || null }));
        return;
      }
      probe(cfg.baseUrl, cfg.token).then((r) => {
        res.writeHead(200, { "content-type": TYPES[".json"] });
        res.end(JSON.stringify({
          models: r.ok ? r.models : [],
          error: r.ok ? null : (r.error || "no answer"),
          source: cfg.baseUrl,
          current: cfg.model || null
        }));
      });
      return;
    }

    if (url === "/api/projects") {
      res.writeHead(200, { "content-type": TYPES[".json"] });
      res.end(JSON.stringify({ projects: listProjects(), current: cfg.project }));
      return;
    }

    if (url === "/api/sessions") {
      res.writeHead(200, { "content-type": TYPES[".json"] });
      res.end(JSON.stringify({ sessions: listSessions(), project: path.basename(cfg.project) }));
      return;
    }

    if (url === "/api/search" && req.method === "GET") {
      res.writeHead(200, { "content-type": TYPES[".json"] });
      res.end(JSON.stringify({
        on: !!cfg.searchKey,
        hint: cfg.searchKey ? "…" + String(cfg.searchKey).slice(-4) : "",
        endpoint: cfg.searchEndpoint || "https://google.serper.dev/search"
      }));
      return;
    }

    if (url === "/api/search" && req.method === "POST") {
      readBody(req).then((body) => {
        cfg.searchKey = String(body.key || "").trim();
        cfg.searchEndpoint = String(body.endpoint || "").trim();
        config.save(cfg);
        if (session && !session.closed) { session.stop(); session = null; }
        blast({ t: "hello", project: path.basename(cfg.project), cwd: cfg.project, model: cfg.model || "default", busy: false });
        res.writeHead(200, { "content-type": TYPES[".json"] });
        res.end(JSON.stringify({ ok: true, on: !!cfg.searchKey }));
      }).catch((e) => {
        res.writeHead(400, { "content-type": TYPES[".json"] });
        res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
      });
      return;
    }

    if (url === "/api/providers" && req.method === "GET") {
      res.writeHead(200, { "content-type": TYPES[".json"] });
      res.end(JSON.stringify({ providers: cfg.providers || [], active: cfg.activeProvider || null }));
      return;
    }

    if (url === "/api/providers" && req.method === "POST") {
      readBody(req).then((body) => {
        cfg.providers = Array.isArray(body.providers) ? body.providers : (cfg.providers || []);
        if (body.active !== undefined) cfg.activeProvider = body.active;
        /* выбранный провайдер становится боевым движком */
        const a = (cfg.providers || []).filter((p) => p.id === cfg.activeProvider)[0];
        if (a) { cfg.baseUrl = a.baseUrl || ""; cfg.token = a.token || ""; if (a.model) cfg.model = a.model; }
        config.save(cfg);
        if (session && !session.closed) { session.stop(); session = null; }   /* подхватится на следующем ходу */
        res.writeHead(200, { "content-type": TYPES[".json"] });
        res.end(JSON.stringify({ ok: true, providers: cfg.providers, active: cfg.activeProvider }));
      });
      return;
    }

    if (url === "/api/providers/test" && req.method === "POST") {
      readBody(req).then((body) => probe(body.baseUrl, body.token)).then((r) => {
        res.writeHead(200, { "content-type": TYPES[".json"] });
        res.end(JSON.stringify(r));
      });
      return;
    }

    if (url === "/api/usage") {
      res.writeHead(200, { "content-type": TYPES[".json"] });
      res.end(JSON.stringify(usageSnapshot()));
      return;
    }

    if (url === "/api/status") {
      res.writeHead(200, { "content-type": TYPES[".json"] });
      res.end(JSON.stringify({
        ok: true, project: cfg.project, model: cfg.model || "default",
        busy: !!(session && session.busy), clients: clients.size
      }));
      return;
    }

    let file = url === "/" ? "index.html" : url.replace(/^\/+/, "");
    const full = path.join(WEB, file);
    if (!full.startsWith(WEB)) { res.writeHead(403).end("no"); return; }
    fs.readFile(full, (err, buf) => {
      if (err) { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); return; }
      res.writeHead(200, {
        "content-type": TYPES[path.extname(full)] || "application/octet-stream",
        "cache-control": "no-cache"
      });
      res.end(buf);
    });
  });

  attach(server, "/ws", (sock) => {
    clients.add(sock);
    sock.send(JSON.stringify({ t: "usage", u: usageSnapshot() }));
    sock.send(JSON.stringify({
      t: "hello",
      project: path.basename(cfg.project),
      cwd: cfg.project,
      model: cfg.model || "default",
      busy: !!(session && session.busy)
    }));

    sock.on("message", (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch (e) { return; }

      if (m.t === "send" && m.text) {
        const s = ensure();
        blast({ t: "state", busy: true });
        try { s.send(String(m.text)); }
        catch (e) { blast({ t: "error", message: String(e.message || e) }); }
        return;
      }
      /* прямая команда в Termux — без агента, просто шелл в папке проекта */
      if (m.t === "run" && m.cmd) {
        const cmd = String(m.cmd);
        blast({ t: "state", busy: true });
        blast({ t: "ui", e: { type: "user", text: "$ " + cmd } });
        const id = "sh" + Date.now();
        blast({ t: "ui", e: { type: "tool", id, name: "Shell", label: "Running " + cmd.slice(0, 48) } });
        let out = "";
        const sh = spawn("sh", ["-c", cmd], { cwd: cfg.project, env: process.env });
        const grab = (d) => { out += d; if (out.length > 8000) out = out.slice(-8000); };
        sh.stdout.on("data", grab);
        sh.stderr.on("data", grab);
        sh.on("close", (code) => {
          blast({ t: "ui", e: { type: "tool_done", id, label: "Ran " + cmd.slice(0, 48), ok: code === 0, out: out.trim() || "(no output)" } });
          blast({ t: "ui", e: { type: "turn_done", ok: code === 0, text: "", cost: 0 } });
          blast({ t: "state", busy: false });
        });
        sh.on("error", (e) => {
          blast({ t: "ui", e: { type: "tool_done", id, label: "Shell failed", ok: false, out: String(e.message) } });
          blast({ t: "state", busy: false });
        });
        return;
      }

      /* сменить папку, в которой работает агент */
      /* сменить модель на лету */
      if (m.t === "model" && m.model) {
        cfg.model = String(m.model);
        if (!cfg.smallModel) cfg.smallModel = cfg.model;
        config.save(cfg);
        if (session && !session.closed) { session.stop(); session = null; }
        blast({ t: "hello", project: path.basename(cfg.project), cwd: cfg.project, model: cfg.model, busy: false });
        blast({ t: "usage", u: usageSnapshot() });
        return;
      }

      if (m.t === "project" && m.path) {
        if (session) { session.stop(); session = null; }
        cfg.project = String(m.path);
        cfg.resume = null;
        config.save(cfg);
        blast({ t: "cleared", project: path.basename(cfg.project) });
        blast({ t: "hello", project: path.basename(cfg.project), cwd: cfg.project, model: cfg.model || "default", busy: false });
        blast({ t: "state", busy: false });
        return;
      }

      /* начать с чистого листа: старый процесс закрываем, resume сбрасываем */
      if (m.t === "new") {
        if (session) { session.stop(); session = null; }
        cfg.resume = null;
        blast({ t: "cleared" });
        blast({ t: "state", busy: false });
        return;
      }

      /* продолжить прошлую сессию по её id */
      if (m.t === "resume" && m.id) {
        if (session) { session.stop(); session = null; }
        cfg.resume = String(m.id);
        blast({ t: "cleared", resumed: cfg.resume });
        blast({ t: "state", busy: false });
        return;
      }

      if (m.t === "interrupt" && session) { session.interrupt(); return; }
      if (m.t === "stop" && session) { session.stop(); session = null; blast({ t: "state", busy: false }); }
    });

    sock.on("close", () => clients.delete(sock));
  });

  server.listen(cfg.port, "127.0.0.1", () => {
    console.log("PocketCode is up");
    console.log("  open      http://127.0.0.1:" + cfg.port);
    console.log("  project   " + cfg.project);
    console.log("  engine    " + (cfg.model || "whatever claude defaults to"));
    if (cfg.baseUrl) console.log("  gateway   " + cfg.baseUrl);
  });

  return { server, stop: () => { if (session) session.stop(); server.close(); } };
}

module.exports = { start };
