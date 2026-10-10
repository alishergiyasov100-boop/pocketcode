#!/usr/bin/env node
/* ============================================================
   PocketCode CLI — ставит всё, что нужно, и поднимает демон.
   ============================================================ */
"use strict";
const { execSync, spawnSync, spawn } = require("child_process");
const readline = require("readline");
const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("../src/config");

const C = {
  dim: (s) => "\x1b[2m" + s + "\x1b[0m",
  b: (s) => "\x1b[1m" + s + "\x1b[0m",
  ok: (s) => "\x1b[32m" + s + "\x1b[0m",
  warn: (s) => "\x1b[33m" + s + "\x1b[0m",
  bad: (s) => "\x1b[31m" + s + "\x1b[0m"
};

const PID = path.join(config.DIR, "daemon.pid");

function has(cmd) {
  const r = spawnSync("sh", ["-c", "command -v " + cmd], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim();
}

function run(cmd, opts) {
  return execSync(cmd, Object.assign({ stdio: "inherit" }, opts || {}));
}

function ask(rl, q, def) {
  return new Promise((res) => {
    rl.question(C.b("? ") + q + (def ? C.dim(" [" + def + "]") : "") + " ", (a) => res((a || "").trim() || def || ""));
  });
}

/* ---------- проверка окружения ---------- */
function doctor(quiet) {
  const out = [];
  const node = process.versions.node.split(".")[0] | 0;
  out.push([node >= 18, "node " + process.versions.node, "need node 18+"]);
  out.push([!!has("claude"), "claude code", "will install @anthropic-ai/claude-code"]);
  out.push([!!has("git"), "git", "pkg install git"]);
  const termux = fs.existsSync("/data/data/com.termux/files/usr");
  if (termux) out.push([!!has("termux-wake-lock"), "termux-api", "pkg install termux-api"]);
  if (!quiet) {
    console.log("");
    for (const [ok, name, fix] of out) {
      console.log("  " + (ok ? C.ok("ok  ") : C.warn("--  ")) + name + (ok ? "" : C.dim("  → " + fix)));
    }
    console.log("");
  }
  return out;
}

/* ---------- установка недостающего ---------- */
function installMissing() {
  if (!has("claude")) {
    console.log(C.b("\ninstalling claude code…"));
    try { run("npm install -g @anthropic-ai/claude-code"); }
    catch (e) { console.log(C.bad("could not install claude code — do it yourself: npm i -g @anthropic-ai/claude-code")); }
  }
  if (fs.existsSync("/data/data/com.termux/files/usr") && !has("termux-wake-lock")) {
    console.log(C.b("\ninstalling termux-api (keeps the agent alive with the screen off)…"));
    try { run("pkg install -y termux-api"); }
    catch (e) { console.log(C.warn("skipped termux-api — run: pkg install termux-api")); }
  }
}

/* ---------- какие модели отдаёт шлюз ---------- */
function probeModels(baseUrl, token) {
  return new Promise((res) => {
    if (!baseUrl) return res([]);
    const url = baseUrl.replace(/\/+$/, "") + "/v1/models";
    const mod = url.startsWith("https") ? require("https") : require("http");
    const req = mod.get(url, { headers: { authorization: "Bearer " + token, "user-agent": "pocketcode" } }, (r) => {
      let b = "";
      r.on("data", (d) => (b += d));
      r.on("end", () => {
        try { res((JSON.parse(b).data || []).map((m) => m.id)); }
        catch (e) { res([]); }
      });
    });
    req.on("error", () => res([]));
    req.setTimeout(12000, () => { req.destroy(); res([]); });
  });
}

/* ---------- мастер настройки ---------- */
async function setup() {
  console.log(C.b("\nPocketCode setup\n"));
  doctor();
  installMissing();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const cfg = config.load();

  cfg.project = path.resolve(await ask(rl, "project folder the agent works in", cfg.project));
  if (!fs.existsSync(cfg.project)) {
    console.log(C.warn("  that folder does not exist — creating it"));
    fs.mkdirSync(cfg.project, { recursive: true });
  }

  console.log(C.dim("\n  Leave the gateway blank to use your normal Claude login."));
  cfg.baseUrl = await ask(rl, "gateway base url (optional)", cfg.baseUrl);
  if (cfg.baseUrl) {
    cfg.token = await ask(rl, "gateway key", cfg.token);
    process.stdout.write(C.dim("  asking the gateway what it serves… "));
    const models = await probeModels(cfg.baseUrl, cfg.token);
    console.log(models.length ? C.ok(models.length + " models") : C.warn("no answer"));
    if (models.length) {
      const pick = models.filter((m) => /claude|gpt|kimi|glm|grok|gemini/i.test(m)).slice(0, 14);
      pick.forEach((m, i) => console.log("    " + C.dim(String(i + 1).padStart(2)) + "  " + m));
      const n = await ask(rl, "pick a number (or type a model id)", cfg.model || "1");
      cfg.model = /^\d+$/.test(n) ? (pick[(n | 0) - 1] || pick[0]) : n;
    } else {
      cfg.model = await ask(rl, "model id", cfg.model);
    }
  }

  const perm = await ask(rl, "how much should it ask you? (ask / edits / auto)", "edits");
  cfg.permissionMode = perm === "ask" ? "default" : perm === "auto" ? "bypassPermissions" : "acceptEdits";
  cfg.port = parseInt(await ask(rl, "port", String(cfg.port)), 10) || 4848;

  rl.close();
  const file = config.save(cfg);
  console.log("\n  saved " + C.dim(file));
  console.log("  start it with " + C.b("pocketcode") + "\n");
  return cfg;
}

/* ---------- запуск ---------- */
function start(cfg) {
  cfg = cfg || config.load();
  if (cfg.wakeLock && has("termux-wake-lock")) {
    try { execSync("termux-wake-lock", { stdio: "ignore" }); } catch (e) {}
  }
  fs.mkdirSync(config.DIR, { recursive: true });
  fs.writeFileSync(PID, String(process.pid));
  notify("PocketCode is running", "http://127.0.0.1:" + cfg.port);

  const { start: boot } = require("../src/server");
  const app = boot(cfg);

  const bye = () => {
    try { fs.unlinkSync(PID); } catch (e) {}
    if (has("termux-wake-unlock")) { try { execSync("termux-wake-unlock", { stdio: "ignore" }); } catch (e) {} }
    if (has("termux-notification-remove")) { try { execSync("termux-notification-remove pocketcode", { stdio: "ignore" }); } catch (e) {} }
    app.stop();
    process.exit(0);
  };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
}

function notify(title, body) {
  if (!has("termux-notification")) return;
  try {
    spawnSync("termux-notification", [
      "--id", "pocketcode", "--title", title, "--content", body, "--ongoing", "--priority", "low"
    ], { stdio: "ignore" });
  } catch (e) {}
}

function stop() {
  try {
    const pid = parseInt(fs.readFileSync(PID, "utf8"), 10);
    process.kill(pid, "SIGTERM");
    console.log("stopped " + pid);
  } catch (e) { console.log("nothing running"); }
}

/* ---------- ярлык на рабочий стол Termux ---------- */
function widget() {
  const dir = path.join(os.homedir(), ".shortcuts");
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, "PocketCode");
  fs.writeFileSync(f, "#!/data/data/com.termux/files/usr/bin/bash\nexec pocketcode start\n", { mode: 0o700 });
  console.log("shortcut written to " + f);
  console.log("add the Termux:Widget to your home screen and tap it");
}

/* ---------- разбор команды ---------- */
(async function main() {
  const cmd = process.argv[2];
  if (cmd === "setup") { await setup(); return; }
  if (cmd === "doctor") { doctor(); return; }
  if (cmd === "stop") { stop(); return; }
  if (cmd === "widget") { widget(); return; }
  if (cmd === "-h" || cmd === "--help") {
    console.log("\n" + C.b("pocketcode") + "          set up if needed, then run\n" +
      "  setup         change project, gateway, model\n" +
      "  start         run without the wizard\n" +
      "  doctor        check what is missing\n" +
      "  widget        home-screen shortcut for Termux\n" +
      "  stop          stop a running daemon\n");
    return;
  }
  let cfg = config.load();
  if (!config.exists() && cmd !== "start") cfg = await setup();
  start(cfg);
})();
