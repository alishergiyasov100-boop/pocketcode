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
const claudeBin = require("./claude");
const ledger = require("./ledger");

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
  /* Шлюз в ответах шлёт нули, но про сам ключ знает всё: /v1/me.
     Спрашиваем редко и кэшируем — это строка в шапке, а не телеметрия. */
  let acct = { at: 0, data: null };
  function refreshAccount() {
    if (!cfg.baseUrl) return Promise.resolve(null);
    if (Date.now() - acct.at < 60000) return Promise.resolve(acct.data);
    const base = String(cfg.baseUrl).replace(/\/+$/, "");
    const tryOne = (p) => new Promise((resolve) => {
      let u;
      try { u = new URL(base + p); } catch (e) { return resolve(null); }
      const mod = u.protocol === "https:" ? require("https") : require("http");
      const req = mod.request({
        hostname: u.hostname, port: u.port, path: u.pathname, method: "GET",
        headers: {
          authorization: "Bearer " + (cfg.token || ""),
          "user-agent": "pocketcode"        /* без UA шлюз отвечает 403 */
        }
      }, (r) => {
        let b = "";
        r.on("data", (d) => (b += d));
        r.on("end", () => { try { const j = JSON.parse(b); resolve(j && j.ok !== false ? j : null); } catch (e) { resolve(null); } });
      });
      req.on("error", () => resolve(null));
      req.setTimeout(6000, () => { req.destroy(); resolve(null); });
      req.end();
    });
    return tryOne("/v1/me")
      .then((j) => j || tryOne("/v1/key"))
      .then((j) => { acct = { at: Date.now(), data: j || null }; return acct.data; });
  }

  function accountBits() {
    const a = acct.data;
    if (!a) return {};
    const label = [a.typeLabel || a.type, a.plan && a.plan !== a.type ? a.plan : null]
      .filter(Boolean).join(" · ");
    const n = (v) => (typeof v === "number" && isFinite(v) ? v : null);
    return {
      plan: label || "Account",
      weeklyPct: n(a.usedPct),
      totals: {
        tokens: n(a.used),
        cost: n(a.costMicroUsd) != null ? a.costMicroUsd / 1e6 : null,
        requests: n(a.requests)
      },
      limit: n(a.limit),
      remaining: n(a.remaining),
      unlimited: !!a.unlimited,
      keyMasked: a.keyMasked || null,
      allowanceLabel: a.unlimited ? "no cap on this key" : null
    };
  }

  /* ---------- страховка: снимок перед ходом ----------
     Новичок боится, что агент сломает файлы. git stash create делает
     коммит-снимок, не трогая ни рабочую папку, ни историю. */
  let snapshot = null;
  const checkpoints = [];               /* { sha, head, at, label } — до 30 */
  function git(args, cb) {
    const p = spawn("git", args, { cwd: cfg.project, env: process.env });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => cb(code, out.trim(), err.trim()));
    p.on("error", () => cb(1, "", "no git"));
  }
  function takeSnapshot(label) {
    git(["rev-parse", "--is-inside-work-tree"], (code) => {
      if (code !== 0) { snapshot = null; return; }
      git(["add", "-A", "--intent-to-add"], () => {
        git(["stash", "create"], (c2, sha) => {
          git(["rev-parse", "HEAD"], (c3, head) => {
            snapshot = { sha: sha || null, head: c3 === 0 ? head : null, at: Date.now(), label: label || "before a turn" };
            checkpoints.push(snapshot);
            if (checkpoints.length > 30) checkpoints.shift();
            blast({ t: "checkpoints", list: checkpoints.map((c, i) => ({ i, at: c.at, label: c.label })) });
          });
        });
      });
    });
  }

  function restoreTo(i, cb) {
    const c = checkpoints[i];
    if (!c) return cb("that point is gone");
    const target = c.sha || c.head;
    if (!target) return cb("nothing was recorded there");
    git(["checkout", target, "--", "."], (code, _o, err) => cb(code === 0 ? null : (err || "git refused")));
  }

  /* автокоммит: история появляется сама, новичку не надо знать про git */
  function autoCommit(text) {
    if (!cfg.autoCommit) return;
    git(["rev-parse", "--is-inside-work-tree"], (code) => {
      if (code !== 0) return;
      git(["add", "-A"], () => {
        const msg = (text || "work from PocketCode").replace(/\s+/g, " ").slice(0, 72);
        git(["-c", "user.email=pocketcode@local", "-c", "user.name=PocketCode", "commit", "-m", msg], () => {});
      });
    });
  }

  /* опасное стоит назвать вслух, даже если мы это не запрещаем */
  const DANGER = [
    [/\brm\s+-[a-z]*r[a-z]*f?\b|\brm\s+-[a-z]*f[a-z]*r?\b/, "deletes whole folders"],
    [/\bgit\s+push\b.*(--force|-f)\b/, "force-pushes over the remote"],
    [/\bgit\s+reset\s+--hard\b/, "throws away uncommitted work"],
    [/\bgit\s+clean\s+-[a-z]*f/, "deletes untracked files"],
    [/\bmkfs|\bdd\s+if=|>\s*\/dev\/[sh]d/, "writes to a raw device"],
    [/\bchmod\s+-R\s+777\b/, "opens everything to everyone"],
    [/\bcurl\b[^|]*\|\s*(ba)?sh\b/, "runs a script straight off the internet"]
  ];
  function dangerOf(cmd) {
    for (const [re, why] of DANGER) if (re.test(cmd)) return why;
    return null;
  }
  function undoTurn(cb) {
    if (!snapshot) {
      return git(["rev-parse", "--is-inside-work-tree"], (code) => {
        cb(code === 0
          ? "no turn to undo yet — the safety net starts with your next message"
          : "this folder is not a git repository, so there is no safety net. Run git init here and it will have one.");
      });
    }
    if (!snapshot.sha && !snapshot.head) return cb("nothing to go back to");
    const target = snapshot.sha || snapshot.head;
    git(["checkout", target, "--", "."], (code, _o, err) => {
      if (code !== 0) return cb(err || "git refused");
      snapshot = null;
      cb(null);
    });
  }

  /* ---------- позвать, когда дело сделано ---------- */
  function nudge(text) {
    if (!cfg.notify) return;
    try {
      spawn("termux-notification", [
        "--id", "pocketcode-done",
        "--title", "PocketCode",
        "--content", String(text).slice(0, 140),
        "--priority", "high"
      ], { stdio: "ignore" }).on("error", () => {});
    } catch (e) {}
  }

  let sessionSince = Date.now();
  let lastSent = null;
  function capLabel(L) {
    const bits = [];
    if (L.cap.turns) bits.push(L.cap.turns + " turns");
    if (L.cap.tokens) bits.push(Math.round(L.cap.tokens / 1000) + "K tokens");
    if (L.cap.cost) bits.push("$" + L.cap.cost);
    return bits.length ? bits.join(" · ") + " a " + L.window : "no budget set";
  }
  function ledgerBits() {
    const L = ledger.snapshot(cfg, sessionSince);
    const pack = (w) => ({ cost: w.cost, tokens: w.tokens, turns: w.turns });
    return {
      session: pack(L.session),
      today: pack(L.today),
      week: Object.assign(pack(L.week), { pct: L.pct }),
      weeklyPct: L.pct,
      resetsAt: L.resetsAt,
      resetsInSec: L.resetsInSec,
      limitWindow: L.window,
      cap: L.cap,
      over: L.over,
      models: L.models.map((m) => ({ name: m.name, tokens: m.tokens, cost: m.cost, turns: m.turns })),
      allowanceLabel: capLabel(L),
      limitNote: (L.cap.tokens || L.cap.cost || L.cap.turns)
        ? "Your own budget. Turns are counted exactly; tokens and cost come from what the gateway bills this key."
        : "No budget set yet — set one in Settings so this bar means something."
    };
  }

  function usageSnapshot() {
    const s = session && !session.closed ? session.usage() : null;
    return {
      plan: cfg.plan || null,
      model: cfg.model || "default",
      gateway: cfg.baseUrl || null,
      session: s ? { cost: s.cost, tokens: s.tokens, turns: s.turns, elapsed: s.elapsed } : null,
      today: { cost: day.cost, tokens: day.tokens, turns: day.turns, since: day.since },
      allowance: cfg.allowance || null,     /* { limitUsd, usedUsd, resetsAt } если задано */
      project: path.basename(cfg.project),
      activeModel: cfg.model || null,
      gatewayName: cfg.baseUrl ? String(cfg.baseUrl).replace(/^https?:\/\//, "").split("/")[0] : null,
      ...accountBits(),
      ...ledgerBits()       /* наш лимит важнее того, что говорит про себя ключ */
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
      const id = f.replace(/\.jsonl$/, "");
      const meta = (cfg.sessionMeta || {})[id] || {};
      return {
        id,
        title: meta.title || titleOf(full),
        renamed: !!meta.title,
        pinned: !!meta.pinned,
        at: st ? st.mtimeMs : 0,
        size: st ? st.size : 0,
        current: id === live
      };
    }).filter((x) => x.size > 200)          /* пустые черновики не показываем */
      .sort((a, b) => (b.pinned - a.pinned) || (b.at - a.at))
      .slice(0, 40);
  }

  function blast(obj) {
    const s = JSON.stringify(obj);
    for (const c of clients) c.send(s);
  }

  /* поиск приезжает отдельным MCP-сервером; без ключа его просто нет */
  const SEARCH_TOOLS = ["mcp__search__web_search", "mcp__search__web_read"];
  /* штамп меняется от любой правки интерфейса, не только от смены версии */
  const STAMP = (() => {
    let v = "1";
    try { v = String(require("../package.json").version).replace(/[^0-9a-z.]/gi, ""); } catch (e) {}
    let newest = 0;
    try {
      for (const f of fs.readdirSync(WEB)) {
        const st = fs.statSync(path.join(WEB, f));
        if (st.mtimeMs > newest) newest = st.mtimeMs;
      }
    } catch (e) {}
    return v + "-" + Math.round(newest / 1000).toString(36);
  })();
  function stamped(html) {
    return String(html).replace(/(src|href)="([a-z0-9_.-]+\.(?:js|css))"/gi,
      (m, a, f) => a + '="' + f + "?v=" + STAMP + '"');
  }

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
  /* настройки, которые должны доезжать до агента, а не лежать в интерфейсе */
  const EFFORT = { instant: "low", quick: "medium", balanced: "high", deep: "xhigh", maximum: "max" };
  const LANGS = {
    en: "English", ru: "Russian", uk: "Ukrainian", de: "German", fr: "French",
    es: "Spanish", pt: "Portuguese", it: "Italian", pl: "Polish", tr: "Turkish",
    ar: "Arabic", fa: "Persian", hi: "Hindi", id: "Indonesian", ja: "Japanese",
    ko: "Korean", zh: "Chinese", kk: "Kazakh", uz: "Uzbek", az: "Azerbaijani",
    vi: "Vietnamese", he: "Hebrew"
  };
  function systemFor(c) {
    const bits = [];
    const lang = c.replyLanguageName || LANGS[c.replyLanguage];
    if (lang && c.replyLanguage !== "en") {
      bits.push("Write every reply to the user in " + lang +
                ". Keep code, file paths, commands and identifiers as they are.");
    }
    if (c.instructions && c.instructions.trim()) bits.push(c.instructions.trim());
    return bits.join("\n\n");
  }

  function toolsFor(c) {
    const base = c.allowedTools || [];
    return c.searchKey ? base.concat(SEARCH_TOOLS.filter((t) => base.indexOf(t) < 0)) : base;
  }

  /* бинарь ищем один раз и запоминаем: PATH может указывать на обломок */
  let BIN = null;
  function engineBin() {
    if (BIN && claudeBin.works(BIN)) return BIN;
    BIN = claudeBin.resolve(cfg);
    if (BIN && BIN !== cfg.claudeBin) Object.assign(cfg, config.patch({ claudeBin: BIN }));
    return BIN;
  }

  function ensure() {
    if (session && !session.closed) return session;
    /* правки из терминала должны доезжать без перезапуска демона */
    Object.assign(cfg, config.load());

    const bin = engineBin();
    if (!bin) {
      blast({ t: "error", message: claudeBin.why(cfg) });
      blast({ t: "state", busy: false });
      return null;
    }
    session = new Session({
      cwd: cfg.project,
      permissionMode: cfg.planFirst ? "plan" : (cfg.askFirst ? "default" : cfg.permissionMode),
      disallowedTools: (cfg.protect || []).flatMap((p) => ["Edit(" + p + ")", "Write(" + p + ")"]),
      allowedTools: toolsFor(cfg),
      mcpConfig: mcpFor(cfg),
      bin: bin,
      effort: EFFORT[cfg.effort] || undefined,
      systemPrompt: systemFor(cfg) || undefined,
      bare: cfg.bare,
      model: cfg.model || undefined,
      resume: cfg.resume || undefined,
      env: config.envFor(cfg)
    }).start();

    session.on("ui", (e) => {
      if (e.type === "tool" && e.name === "Bash" && e.input && e.input.command) {
        const why = dangerOf(String(e.input.command));
        if (why) blast({ t: "ui", e: { type: "warn", text: "Careful: that command " + why + ".", cmd: String(e.input.command).slice(0, 160) } });
      }
      blast({ t: "ui", e });
    });
    session.on("idle", () => {
      /* счётчик ключа — единственный правдивый источник: берём дельту.
         Шлюз дописывает свой учёт чуть позже ответа, поэтому не спешим. */
      setTimeout(() => {
      acct.at = 0;
      refreshAccount().then((a) => {
        if (!a) return;
        const used = typeof a.used === "number" ? a.used : null;
        const cost = typeof a.costMicroUsd === "number" ? a.costMicroUsd / 1e6 : null;
        const prevU = typeof cfg.meterTokens === "number" ? cfg.meterTokens : null;
        const prevC = typeof cfg.meterCost === "number" ? cfg.meterCost : null;
        if (used != null && prevU != null && used >= prevU) {
          ledger.record(used - prevU, cost != null && prevC != null && cost >= prevC ? cost - prevC : 0, cfg.model || null);
        }
        Object.assign(cfg, config.patch({
          meterTokens: used != null ? used : cfg.meterTokens,
          meterCost: cost != null ? cost : cfg.meterCost
        }));
        blast({ t: "usage", u: usageSnapshot() });
      });
      }, 2500);

      const last = session.lastText || "";
      nudge(last ? last.replace(/\s+/g, " ").slice(0, 140) : "Done.");
      autoCommit(lastSent || last);

      const u = session.usage();
      day.cost = u.cost;                 /* шлюз отдаёт накопленную стоимость сессии */
      day.tokens = u.tokens;
      day.turns = u.turns;
      blast({ t: "state", busy: false });
      blast({ t: "usage", u: usageSnapshot() });
    });
    session.on("session", (id) => { cfg.resume = id; config.patch({ resume: id }); });
    session.on("stderr", (d) => {
      process.stderr.write("[claude] " + d);
      if (/native binary not installed|Exec format error/i.test(String(d))) {
        BIN = null;                       /* этот бинарь мёртв, поищем другой */
        blast({ t: "error", message: claudeBin.why(cfg) });
      }
    });
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

    if (url === "/api/limits" && req.method === "GET") {
      res.writeHead(200, { "content-type": TYPES[".json"] });
      res.end(JSON.stringify(Object.assign(
        { limits: cfg.limits || {} },
        ledger.snapshot(cfg, sessionSince)
      )));
      return;
    }

    if (url === "/api/limits" && req.method === "POST") {
      readBody(req).then((body) => {
        const lim = {
          window: body.window === "day" ? "day" : "week",
          tokens: Number(body.tokens) > 0 ? Math.round(Number(body.tokens)) : 0,
          costUsd: Number(body.costUsd) > 0 ? Number(body.costUsd) : 0,
          turns: Number(body.turns) > 0 ? Math.round(Number(body.turns)) : 0
        };
        Object.assign(cfg, config.patch({ limits: lim }));
        blast({ t: "usage", u: usageSnapshot() });
        res.writeHead(200, { "content-type": TYPES[".json"] });
        res.end(JSON.stringify({ ok: true, limits: lim }));
      }).catch(() => {
        res.writeHead(400, { "content-type": TYPES[".json"] });
        res.end(JSON.stringify({ ok: false }));
      });
      return;
    }

    if (url === "/api/prefs" && req.method === "GET") {
      res.writeHead(200, { "content-type": TYPES[".json"] });
      res.end(JSON.stringify({
        effort: cfg.effort || "",
        language: cfg.replyLanguage || "",
        instructions: cfg.instructions || "",
        bashTimeoutMs: cfg.bashTimeoutMs || 600000,
        notify: cfg.notify !== false,
        askFirst: !!cfg.askFirst,
        planFirst: !!cfg.planFirst,
        autoCommit: !!cfg.autoCommit,
        protect: (cfg.protect || []).join("\n")
      }));
      return;
    }

    if (url === "/api/prefs" && req.method === "POST") {
      readBody(req).then((body) => {
        const fields = {};
        if (body.effort !== undefined) fields.effort = String(body.effort || "");
        if (body.language !== undefined) {
          fields.replyLanguage = String(body.language || "");
          fields.replyLanguageName = String(body.languageName || LANGS[fields.replyLanguage] || "");
        }
        if (body.instructions !== undefined) fields.instructions = String(body.instructions || "");
        if (body.notify !== undefined) fields.notify = !!body.notify;
        if (body.askFirst !== undefined) fields.askFirst = !!body.askFirst;
        if (body.planFirst !== undefined) fields.planFirst = !!body.planFirst;
        if (body.autoCommit !== undefined) fields.autoCommit = !!body.autoCommit;
        if (body.protect !== undefined) {
          fields.protect = String(body.protect || "").split("\n")
            .map((x) => x.trim()).filter(Boolean).slice(0, 40);
        }
        if (body.bashTimeoutMs !== undefined) {
          const t = Number(body.bashTimeoutMs);
          fields.bashTimeoutMs = isFinite(t) && t > 0 ? Math.round(t) : 600000;
        }
        Object.assign(cfg, config.patch(fields));
        if (session && !session.closed) { session.stop(); session = null; }
        res.writeHead(200, { "content-type": TYPES[".json"] });
        res.end(JSON.stringify({
          ok: true, effort: cfg.effort, language: cfg.replyLanguage,
          instructions: cfg.instructions
        }));
      }).catch(() => {
        res.writeHead(400, { "content-type": TYPES[".json"] });
        res.end(JSON.stringify({ ok: false }));
      });
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
        Object.assign(cfg, config.patch({
          searchKey: String(body.key || "").trim(),
          searchEndpoint: String(body.endpoint || "").trim()
        }));
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
        Object.assign(cfg, config.patch({ providers: cfg.providers, activeProvider: cfg.activeProvider, baseUrl: cfg.baseUrl, token: cfg.token, model: cfg.model }));
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
      const type = TYPES[path.extname(full)] || "application/octet-stream";
      /* в странице проставляем версию в адреса — кэш WebView иначе живучий */
      const body = /\.html$/i.test(full) ? Buffer.from(stamped(buf.toString("utf8"))) : buf;
      res.writeHead(200, {
        "content-type": type,
        "cache-control": "no-store, no-cache, must-revalidate",
        "pragma": "no-cache",
        "expires": "0"
      });
      res.end(body);
    });
  });

  refreshAccount();                       /* чтобы шапка знала про ключ сразу */

  attach(server, "/ws", (sock) => {
    clients.add(sock);
    refreshAccount().then((a) => { if (a) sock.send(JSON.stringify({ t: "usage", u: usageSnapshot() })); });
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
        const L = ledger.snapshot(cfg, sessionSince);
        if (L.over) {
          const when = new Date(L.resetsAt).toLocaleString();
          blast({ t: "error", message: "You are at your own " + L.window + "ly budget. Sending resumes " + when + ", or raise it in Settings." });
          blast({ t: "state", busy: false });
          return;
        }
        takeSnapshot();
        lastSent = String(m.text);
        const s = ensure();
        if (!s) return;                   /* ensure уже объяснил, что не так */
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
        Object.assign(cfg, config.patch({
          model: String(m.model),
          smallModel: cfg.smallModel || String(m.model)
        }));
        if (session && !session.closed) { session.stop(); session = null; }
        blast({ t: "hello", project: path.basename(cfg.project), cwd: cfg.project, model: cfg.model, busy: false });
        blast({ t: "usage", u: usageSnapshot() });
        return;
      }

      if (m.t === "project" && m.path) {
        if (session) { session.stop(); session = null; }
        Object.assign(cfg, config.patch({ project: String(m.path), resume: null }));
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

      if (m.t === "interrupt") {
        if (session && !session.closed) session.interrupt();
        blast({ t: "state", busy: false });
        blast({ t: "ui", e: { type: "note", text: "Stopped. Say what to do instead." } });
        return;
      }

      if (m.t === "session_meta" && m.id) {
        const meta = Object.assign({}, cfg.sessionMeta || {});
        const cur = Object.assign({}, meta[m.id] || {});
        if (m.title !== undefined) cur.title = String(m.title || "").slice(0, 80) || undefined;
        if (m.pinned !== undefined) cur.pinned = !!m.pinned;
        meta[m.id] = cur;
        Object.assign(cfg, config.patch({ sessionMeta: meta }));
        blast({ t: "sessions_changed" });
        return;
      }

      if (m.t === "retry") {
        if (!lastSent) { blast({ t: "error", message: "Nothing to try again yet." }); return; }
        const text = lastSent;
        takeSnapshot();
        const s2 = ensure();
        if (!s2) return;
        blast({ t: "state", busy: true });
        blast({ t: "ui", e: { type: "note", text: "Trying that again." } });
        try { s2.send(text); } catch (e) { blast({ t: "error", message: String(e.message || e) }); }
        return;
      }

      if (m.t === "restore" && typeof m.i === "number") {
        restoreTo(m.i, (err) => {
          if (err) blast({ t: "error", message: "Could not go back: " + err });
          else blast({ t: "ui", e: { type: "note", text: "Back to how things were " + new Date(checkpoints[m.i].at).toLocaleTimeString() + "." } });
        });
        return;
      }

      if (m.t === "checkpoints") {
        blast({ t: "checkpoints", list: checkpoints.map((c, i) => ({ i, at: c.at, label: c.label })) });
        return;
      }

      if (m.t === "undo") {
        undoTurn((err) => {
          if (err) blast({ t: "error", message: "Could not undo: " + err });
          else blast({ t: "ui", e: { type: "note", text: "Files are back as they were before that turn. Anything it newly created is still there." } });
        });
        return;
      }
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
