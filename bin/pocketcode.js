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

/* ---------- присмотр за демоном ----------
   Android охотно убивает фоновые процессы, а нода может упасть сама.
   Поэтому боевой режим — отцепленный надзиратель, который поднимает
   сервер заново, если тот умер. */

const SUP = path.join(config.DIR, "supervisor.pid");

function supervise() {
  fs.mkdirSync(config.DIR, { recursive: true });
  fs.writeFileSync(SUP, String(process.pid));
  const cfg = config.load();
  if (cfg.wakeLock && has("termux-wake-lock")) {
    try { execSync("termux-wake-lock", { stdio: "ignore" }); } catch (e) {}
  }
  notify("PocketCode is running", "http://127.0.0.1:" + cfg.port);

  let stopping = false;
  let child = null;
  let backoff = 1000;

  const spawnOnce = () => {
    child = spawn(process.execPath, [__filename, "serve"], {
      stdio: ["ignore", "inherit", "inherit"],
      env: process.env
    });
    const t0 = Date.now();
    child.on("exit", (code, sig) => {
      child = null;
      if (stopping) return;
      const lived = Date.now() - t0;
      backoff = lived > 20000 ? 1000 : Math.min(backoff * 2, 30000);
      console.log("[supervisor] engine exited (" + (sig || code) + "), back in " + Math.round(backoff / 1000) + "s");
      setTimeout(spawnOnce, backoff);
    });
  };
  spawnOnce();

  const bye = () => {
    stopping = true;
    try { fs.unlinkSync(SUP); } catch (e) {}
    try { fs.unlinkSync(PID); } catch (e) {}
    if (child) try { child.kill("SIGTERM"); } catch (e) {}
    if (has("termux-wake-unlock")) { try { execSync("termux-wake-unlock", { stdio: "ignore" }); } catch (e) {} }
    if (has("termux-notification-remove")) { try { execSync("termux-notification-remove pocketcode", { stdio: "ignore" }); } catch (e) {} }
    process.exit(0);
  };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
}

/* отцепить надзирателя от текущего терминала и выйти */
/* ---------- где вообще может работать агент ----------
   У Claude Code нет сборки под Android: есть glibc и musl для arm64,
   а Termux — bionic. В самом Termux он не запустится никогда. Зато он
   прекрасно работает в дистрибутиве под proot, который у многих уже
   стоит. Если мы в Termux и агента тут нет — уходим туда вместе с
   демоном: внутри дистрибутива видны те же папки и тот же порт. */
function distroHop() {
  const cb = require("../src/claude");
  if (cb.resolve(config.load())) return null;          /* агент здесь есть */
  const pd = "/data/data/com.termux/files/usr/bin/proot-distro";
  if (!fs.existsSync(pd)) return null;
  let names = [];
  try { names = fs.readdirSync("/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs"); }
  catch (e) { return null; }
  /* Достаточно найти node: агента внутри поищет уже сам демон,
     и если его там нет — скажет об этом человеческими словами. */
  for (const name of names) {
    const root = "/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/" + name;
    const node = ["/usr/bin/node", "/usr/local/bin/node", "/usr/bin/nodejs"]
      .find((n) => fs.existsSync(path.join(root, n.slice(1))));
    if (node) return { pd, name, node };
  }
  return null;
}

function up() {
  const out = fs.openSync(path.join(config.DIR, "daemon.log"), "a");
  const hop = distroHop();
  let cmd = process.execPath, args = [__filename, "supervise"];
  if (hop) {
    console.log(C.dim("  the agent cannot run in Termux itself, going through " + hop.name));
    cmd = hop.pd;
    args = ["login", hop.name, "--shared-tmp", "--",
            "env", "HOME=" + os.homedir(), hop.node, __filename, "supervise"];
  }
  const ch = spawn(cmd, args, {
    detached: true,
    stdio: ["ignore", out, out],
    env: process.env
  });
  ch.unref();
  return ch.pid;
}

/* ---------- сам сервер, без присмотра ---------- */
function serve() {
  const cfg = config.load();
  fs.mkdirSync(config.DIR, { recursive: true });
  fs.writeFileSync(PID, String(process.pid));
  const { start: boot } = require("../src/server");
  const app = boot(cfg);
  const bye = () => { app.stop(); process.exit(0); };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
  process.on("uncaughtException", (e) => {
    console.error("[engine] " + (e && e.stack || e));
    /* падаем намеренно — надзиратель поднимет чистый процесс */
    process.exit(1);
  });
}

/* ---------- жив ли демон ---------- */
function get(url, ms) {
  return new Promise((res) => {
    const mod = url.startsWith("https") ? require("https") : require("http");
    const req = mod.get(url, { headers: { "user-agent": "pocketcode" } }, (r) => {
      let b = "";
      r.on("data", (d) => (b += d));
      r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { res(null); } });
    });
    req.on("error", () => res(null));
    req.setTimeout(ms || 2500, () => { req.destroy(); res(null); });
  });
}

function post(url, body, ms) {
  return new Promise((res) => {
    const mod = url.startsWith("https") ? require("https") : require("http");
    const data = Buffer.from(JSON.stringify(body || {}));
    const u = new URL(url);
    const req = mod.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: "POST",
      headers: { "content-type": "application/json", "content-length": data.length, "user-agent": "pocketcode" }
    }, (r) => {
      let b = "";
      r.on("data", (d) => (b += d));
      r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { res(null); } });
    });
    req.on("error", () => res(null));
    req.setTimeout(ms || 4000, () => { req.destroy(); res(null); });
    req.end(data);
  });
}

function pidAlive() {
  try {
    const pid = parseInt(fs.readFileSync(PID, "utf8"), 10);
    process.kill(pid, 0);
    return pid;
  } catch (e) { return 0; }
}

function human(n) {
  if (n == null) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return Math.round(n / 1e3) + "K";
  return String(n);
}

function since(ms) {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m";
  return Math.floor(m / 60) + "h " + (m % 60) + "m";
}

async function status(quiet) {
  const cfg = config.load();
  const base = "http://127.0.0.1:" + cfg.port;
  const st = await get(base + "/api/status", 2500);
  const pid = pidAlive();

  if (!st) {
    if (!quiet) {
      console.log("\n  " + C.bad("not running") + C.dim("   nothing is listening on " + cfg.port));
      if (pid) console.log("  " + C.warn("stale pid " + pid) + C.dim("   the process died without cleaning up"));
      console.log("\n  start it with " + C.b("pocketcode") + "\n");
    }
    return false;
  }

  const us = await get(base + "/api/usage", 2500);
  let gw = null;
  if (cfg.baseUrl) {
    const t = Date.now();
    const m = await get(cfg.baseUrl.replace(/\/+$/, "") + "/v1/models", 8000);
    gw = m ? (Date.now() - t) + "ms" : null;
  }

  console.log("");
  console.log("  " + C.ok("running") + C.dim("       pid " + (pid || "?") + " · " + base));
  console.log("  project     " + C.b(st.project.split("/").pop()) + C.dim("  " + st.project));
  console.log("  engine      " + st.model + (cfg.baseUrl ? C.dim("  via your gateway") : C.dim("  via your claude login")));
  if (cfg.baseUrl) {
    const where = runningFrom();
  const real = (x) => { try { return fs.realpathSync(x); } catch (e) { return path.resolve(x); } };
  const mine = real(path.resolve(__dirname, ".."));
  if (where && real(where) !== mine) {
    console.log("  version     " + C.b("v" + PKG.version) + C.dim("  but the daemon runs from " + where));
    console.log("              " + C.bad("stale") + C.dim("  fix it with ") + C.b("pocketcode restart"));
  } else {
    console.log("  version     " + C.b("v" + PKG.version));
  }
  const cb = require("../src/claude");
  const bin = cb.resolve(cfg);
  const onPath = spawnSync("sh", ["-c", "command -v claude"], { encoding: "utf8" }).stdout.trim();
  if (!bin) {
    console.log("  engine bin  " + C.bad("nothing runs") + C.dim("  " + cb.why(cfg)));
  } else if (onPath && bin !== onPath) {
    console.log("  engine bin  " + C.dim(bin) + C.dim("   (" + onPath + " is broken, skipping it)"));
  }
  console.log("  gateway     " + (gw ? C.ok("answering") + C.dim(" in " + gw) : C.bad("no answer")) + C.dim("  " + cfg.baseUrl));
  }
  console.log("  agent       " + (st.busy ? C.warn("working right now") : "idle"));
  console.log("  app open    " + (st.clients ? C.ok(st.clients + " connected") : C.dim("nobody")));
  if (us && us.session) {
    console.log("  session     " + ("$" + (us.session.cost || 0).toFixed(2)) +
      C.dim("  " + human(us.session.tokens) + " tokens · " + us.session.turns + " turns · " + since(us.session.elapsed)));
  } else {
    console.log("  session     " + C.dim("not started yet"));
  }
  console.log("\n  open " + C.b(base) + " or tap the app\n");
  return true;
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
      /* Claude-модели идут первыми: у них нет перевода вызовов инструментов,
         а значит нет и целого класса поломок на чужих шлюзах. */
      const all = models.filter((m) => /claude|gpt|kimi|glm|grok|gemini|deepseek|llama|mistral/i.test(m));
      /* самый быстрый из безопасных — первым, он же предлагается по умолчанию */
      const fast = all.filter((m) => /claude-haiku/i.test(m));
      const rest = all.filter((m) => /claude/i.test(m) && !/claude-haiku/i.test(m));
      const other = all.filter((m) => !/claude/i.test(m));
      const pick = fast.concat(rest, other).slice(0, 14);
      pick.forEach((m, i) => console.log("    " + C.dim(String(i + 1).padStart(2)) + "  " + m));
      const n = await ask(rl, "pick a number (or type a model id)", cfg.model || "1");
      cfg.model = /^\d+$/.test(n) ? (pick[(n | 0) - 1] || pick[0]) : n;
    } else {
      cfg.model = await ask(rl, "model id", cfg.model);
    }
  }

  console.log(C.dim("\n  web search is its own tool — the built-in one needs Anthropic's API"));
  console.log(C.dim("  a free key with 2500 searches comes from serper.dev, blank = no search"));
  cfg.searchKey = await ask(rl, "search key (optional)", cfg.searchKey);

  const perm = await ask(rl, "how much should it ask you? (ask / edits / auto)", "edits");
  cfg.permissionMode = perm === "ask" ? "default" : perm === "auto" ? "bypassPermissions" : "acceptEdits";
  cfg.port = parseInt(await ask(rl, "port", String(cfg.port)), 10) || 4848;

  rl.close();
  const file = config.save(cfg);
  console.log("\n  saved " + C.dim(file));
  console.log("  start it with " + C.b("pocketcode") + "\n");
  return cfg;
}

/* ---------- обновление ---------- */
const PKG = require("../package.json");
const REPO = "github:alishergiyasov100-boop/pocketcode";

/* npm бывает настроен на один префикс, а команда живёт в другом —
   тогда установка уходит мимо и остаётся старая копия. Ставим туда,
   откуда реально запускается pocketcode. */
function installPrefix() {
  try {
    const bin = spawnSync("sh", ["-c", "command -v pocketcode"], { encoding: "utf8" }).stdout.trim();
    if (!bin) return null;
    const real = fs.realpathSync(bin);
    const i = real.indexOf("/lib/node_modules/");
    if (i > 0) return real.slice(0, i);
    return path.resolve(path.dirname(bin), "..");
  } catch (e) { return null; }
}

async function update() {
  console.log("\n  installed  " + C.b("v" + PKG.version));
  console.log("  pulling " + C.dim(REPO));
  const prefix = installPrefix();
  const args = prefix ? ["i", "-g", "--prefix", prefix, REPO] : ["i", "-g", REPO];
  if (prefix) console.log("  into " + C.dim(prefix));
  const r = spawnSync("npm", args, { stdio: "inherit" });
  if (r.status !== 0) {
    console.log("\n  " + C.bad("npm could not do it") + C.dim("  try it by hand:"));
    console.log("  npm i -g " + REPO + "\n");
    return;
  }
  /* проверяем, что обновилась именно та копия, которая запускается */
  let now = PKG.version;
  try {
    const bin = spawnSync("sh", ["-c", "command -v pocketcode"], { encoding: "utf8" }).stdout.trim();
    const root = path.resolve(path.dirname(fs.realpathSync(bin)), "..");
    now = require(path.join(root, "package.json")).version;
  } catch (e) {}
  console.log("\n  " + C.ok("updated") + C.dim("   now v" + now + ", restarting"));
  stop();
  await new Promise((r2) => setTimeout(r2, 1200));
  await start();
}

/* где лежит код, который сейчас крутится */
function runningFrom() {
  try {
    const out = spawnSync("ps", ["-o", "args="], { encoding: "utf8" }).stdout || "";
    const line = out.split("\n").find((l) => /pocketcode[\/\\]bin[\/\\]pocketcode\.js\s+(serve|supervise)/.test(l));
    if (!line) return null;
    const m = line.match(/(\S+pocketcode)[\/\\]bin[\/\\]pocketcode\.js/);
    return m ? m[1] : null;
  } catch (e) { return null; }
}

/* ---------- поиск ---------- */
async function searchKey(key) {
  const cfg = config.load();
  if (key === undefined) {
    console.log("\n  web search  " + (cfg.searchKey ? C.ok("on") + C.dim("  key …" + cfg.searchKey.slice(-4)) : C.dim("off")));
    console.log(C.dim("  turn it on with ") + C.b("pocketcode search <key>") + C.dim("   free key: serper.dev"));
    console.log(C.dim("  turn it off with ") + C.b("pocketcode search off") + "\n");
    return;
  }
  cfg.searchKey = key === "off" || key === "none" ? "" : String(key).trim();
  config.patch({ searchKey: cfg.searchKey });
  console.log("\n  web search  " + (cfg.searchKey ? C.ok("on") : C.dim("off")));

  /* демон перечитает конфиг только на перезапуске сессии */
  const live = await get("http://127.0.0.1:" + cfg.port + "/api/status", 1500);
  if (live) {
    const r = await post("http://127.0.0.1:" + cfg.port + "/api/search", { key: cfg.searchKey });
    if (r && r.ok) console.log(C.dim("  the running app picked it up\n"));
    else console.log(C.dim("  restart it to pick this up: ") + C.b("pocketcode restart") + "\n");
  } else {
    console.log(C.dim("  start the app with ") + C.b("pocketcode") + "\n");
  }
}

/* ---------- запуск ---------- */
async function start(cfg) {
  cfg = cfg || config.load();
  const already = await get("http://127.0.0.1:" + cfg.port + "/api/status", 1500);
  if (already) {
    console.log("\n  " + C.ok("already running") + C.dim("   nothing to do"));
    await status(false);
    return;
  }
  const pid = up();
  process.stdout.write("\n  starting");
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 700));
    process.stdout.write(".");
    if (await get("http://127.0.0.1:" + cfg.port + "/api/status", 900)) {
      process.stdout.write("\n");
      await status(false);
      console.log("  " + C.dim("it keeps itself up — close this terminal if you like") + "\n");
      return;
    }
  }
  console.log("\n  " + C.bad("it did not come up") + C.dim("   see " + path.join(config.DIR, "daemon.log")) + "\n");
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
  let killed = 0;
  for (const f of [SUP, PID]) {
    try {
      const pid = parseInt(fs.readFileSync(f, "utf8"), 10);
      process.kill(pid, "SIGTERM");
      killed++;
    } catch (e) {}
    try { fs.unlinkSync(f); } catch (e) {}
  }
  console.log(killed ? "stopped" : "nothing running");
}

/* ---------- запуск при включении телефона ---------- */
function boot() {
  const dir = path.join(os.homedir(), ".termux", "boot");
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, "pocketcode");
  fs.writeFileSync(f,
    "#!/data/data/com.termux/files/usr/bin/sh\n" +
    "termux-wake-lock\n" +
    "exec " + process.execPath + " " + __filename + " supervise\n", { mode: 0o700 });
  console.log("written " + f);
  console.log("install the Termux:Boot app once, open it, and it will start on boot");
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
  if (cmd === "status" || cmd === "st") { await status(); return; }
  if (cmd === "serve") { serve(); return; }          /* внутреннее: сервер без присмотра */
  if (cmd === "supervise") { supervise(); return; }  /* внутреннее: надзиратель */
  if (cmd === "boot") { boot(); return; }
  if (cmd === "restart") { stop(); await new Promise((r) => setTimeout(r, 1200)); await start(); return; }
  if (cmd === "stop") { stop(); return; }
  if (cmd === "widget") { widget(); return; }
  if (cmd === "search") { await searchKey(process.argv[3]); return; }
  if (cmd === "update" || cmd === "upgrade") { await update(); return; }
  if (cmd === "-h" || cmd === "--help") {
    console.log("\n" + C.b("pocketcode") + "          set up if needed, then run\n" +
      "  setup         change project, gateway, model\n" +
      "  status        is it running, on what, how much spent\n" +
      "  restart       stop and start again\n" +
      "  boot          start automatically when the phone boots\n" +
      "  start         run without the wizard\n" +
      "  doctor        check what is missing\n" +
      "  widget        home-screen shortcut for Termux\n" +
      "  stop          stop a running daemon\n");
    return;
  }
  let cfg = config.load();
  if (!config.exists() && cmd !== "start") cfg = await setup();
  await start(cfg);
})();
