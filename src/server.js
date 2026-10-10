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

  function blast(obj) {
    const s = JSON.stringify(obj);
    for (const c of clients) c.send(s);
  }

  function ensure() {
    if (session && !session.closed) return session;
    session = new Session({
      cwd: cfg.project,
      permissionMode: cfg.permissionMode,
      allowedTools: cfg.allowedTools,
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
