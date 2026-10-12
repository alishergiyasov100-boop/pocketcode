/* ============================================================
   Найти рабочий бинарь Claude Code.

   Верить PATH нельзя: рядом может лежать обломок установки —
   заглушка в пару сотен байт, у которой не докачался нативный
   бинарь. Она первая в PATH, запускается с ошибкой формата, и
   со стороны это выглядит как «запросы не проходят».
   ============================================================ */
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

function works(bin) {
  if (!bin) return false;
  try {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 25000 });
    return r.status === 0 && /\d+\.\d+\.\d+/.test(String(r.stdout || ""));
  } catch (e) { return false; }
}

function sh(cmd) {
  try { return String(spawnSync("sh", ["-c", cmd], { encoding: "utf8" }).stdout || ""); }
  catch (e) { return ""; }
}

function candidates(cfg) {
  const home = os.homedir();
  const list = [];
  if (cfg && cfg.claudeBin) list.push(cfg.claudeBin);
  if (process.env.CLAUDE_BIN) list.push(process.env.CLAUDE_BIN);

  /* все claude в PATH, а не только первый */
  (sh("which -a claude 2>/dev/null; command -v claude 2>/dev/null"))
    .split("\n").map((s) => s.trim()).filter(Boolean).forEach((p) => list.push(p));

  [
    path.join(home, ".npm-global/bin/claude"),
    path.join(home, ".local/bin/claude"),
    path.join(home, ".claude/local/claude"),
    "/usr/local/bin/claude"
  ].forEach((p) => list.push(p));

  const pfx = sh("npm prefix -g 2>/dev/null").trim();
  if (pfx) list.push(path.join(pfx, "bin", "claude"));

  const seen = new Set();
  return list.filter((p) => {
    if (!p || seen.has(p)) return false;
    seen.add(p);
    try { return fs.existsSync(p); } catch (e) { return false; }
  });
}

/** первый, который действительно запускается */
function resolve(cfg) {
  const all = candidates(cfg);
  for (const c of all) if (works(c)) return c;
  return null;
}

/** человеческое объяснение, когда ни один не завёлся */
function why(cfg) {
  const all = candidates(cfg);
  const inTermux = /com\.termux/.test(process.env.PREFIX || "") ||
                   fs.existsSync("/data/data/com.termux/files/usr/bin/pkg");
  const bionic = inTermux && !fs.existsSync("/etc/os-release");

  if (!all.length && bionic) {
    return "Claude Code has no build for Android, so it cannot run in Termux itself. " +
           "Install a Linux container once and PocketCode will use it automatically: " +
           "pkg install proot-distro && proot-distro install alpine && " +
           "proot-distro login alpine -- sh -c 'apk add nodejs npm && npm i -g @anthropic-ai/claude-code'";
  }
  if (!all.length) return "Claude Code is not installed: npm i -g @anthropic-ai/claude-code";
  if (bionic) {
    return "The claude at " + all[0] + " is a stub: there is no Android build of the agent, " +
           "only glibc and musl ones. Run PocketCode from inside your Linux container, " +
           "or install one: proot-distro install alpine.";
  }
  return "Found claude at " + all[0] + " but it does not run. Its native binary never downloaded — " +
         "reinstall it without --ignore-scripts.";
}

module.exports = { resolve, works, candidates, why };
