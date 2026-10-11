"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const DIR = path.join(os.homedir(), ".pocketcode");
const FILE = path.join(DIR, "config.json");

const DEFAULTS = {
  port: 4848,
  project: process.cwd(),
  model: "",
  smallModel: "",
  baseUrl: "",
  token: "",
  permissionMode: "acceptEdits",
  allowedTools: ["Read", "Edit", "Write", "Glob", "Grep", "Bash"],
  bare: true,
  wakeLock: true,
  providers: [],
  activeProvider: null,
  searchKey: "",
  searchEndpoint: "",
  effort: "",
  replyLanguage: "",
  replyLanguageName: "",
  instructions: ""
};

function load() {
  try { return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(FILE, "utf8"))); }
  catch (e) { return Object.assign({}, DEFAULTS); }
}

function save(cfg) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  return FILE;
}

/* Точечная запись: читаем файл заново и меняем только названные поля.
   Иначе демон, держащий конфиг в памяти, откатывает чужие правки —
   поменял что-то в терминале, приложение сохранило своё, и терминальной
   правки больше нет. */
function patch(fields) {
  const now = load();
  Object.assign(now, fields || {});
  save(now);
  return now;
}

function exists() { return fs.existsSync(FILE); }

/** переменные окружения для вложенного Claude Code */
function envFor(cfg) {
  const env = {};
  if (cfg.baseUrl) env.ANTHROPIC_BASE_URL = cfg.baseUrl;
  if (cfg.token) { env.ANTHROPIC_AUTH_TOKEN = cfg.token; env.ANTHROPIC_API_KEY = cfg.token; }
  if (cfg.model) {
    env.ANTHROPIC_MODEL = cfg.model;
    const small = cfg.smallModel || cfg.model;
    env.ANTHROPIC_SMALL_FAST_MODEL = small;
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = small;
  }
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  return env;
}

module.exports = { DIR, FILE, DEFAULTS, load, save, patch, exists, envFor };
