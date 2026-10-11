/* ============================================================
   Свой учёт расхода.

   Шлюз в ответах шлёт нули, зато у ключа есть общий счётчик.
   Снимаем его после каждого хода и пишем дельту со временем —
   из этих записей уже складываются настоящие окна: сессия,
   сутки, неделя. И настоящий лимит, который можно упереть.
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const config = require("./config");

const FILE = path.join(config.DIR, "ledger.jsonl");
const KEEP_DAYS = 70;

function append(entry) {
  try {
    fs.mkdirSync(config.DIR, { recursive: true });
    fs.appendFileSync(FILE, JSON.stringify(entry) + "\n", { mode: 0o600 });
  } catch (e) {}
}

function read() {
  let raw = "";
  try { raw = fs.readFileSync(FILE, "utf8"); } catch (e) { return []; }
  const cut = Date.now() - KEEP_DAYS * 864e5;
  const out = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e && typeof e.at === "number" && e.at >= cut) out.push(e);
    } catch (x) {}
  }
  return out;
}

/** записать ход: сколько прибавилось с прошлого раза */
function record(tokens, cost, model) {
  const t = Number(tokens), c = Number(cost);
  append({
    at: Date.now(),
    t: isFinite(t) && t > 0 ? Math.round(t) : 0,
    c: isFinite(c) && c > 0 ? c : 0,
    m: model || null
  });
}

/* ---------- окна ---------- */

function startOfDay(now) { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }
function startOfWeek(now) {
  const d = new Date(now);
  const dow = (d.getDay() + 6) % 7;            /* понедельник = 0 */
  d.setHours(0, 0, 0, 0);
  return d.getTime() - dow * 864e5;
}

function sum(list, since) {
  let t = 0, c = 0, n = 0;
  for (const e of list) {
    if (e.at < since) continue;
    t += e.t || 0; c += e.c || 0; n++;
  }
  return { tokens: t, cost: c, turns: n };
}

function byModel(list, since) {
  const map = {};
  for (const e of list) {
    if (e.at < since || !e.m) continue;
    const m = map[e.m] || (map[e.m] = { name: e.m, tokens: 0, cost: 0, turns: 0 });
    m.tokens += e.t || 0; m.cost += e.c || 0; m.turns++;
  }
  return Object.values(map).sort((a, b) => b.tokens - a.tokens);
}

/** всё, что нужно шапке и окну лимитов */
function snapshot(cfg, sessionSince) {
  const now = Date.now();
  const list = read();
  const day = startOfDay(now), week = startOfWeek(now);

  const lim = cfg.limits || {};
  const windowName = lim.window === "day" ? "day" : "week";
  const since = windowName === "day" ? day : week;
  const resetsAt = windowName === "day" ? day + 864e5 : week + 7 * 864e5;

  const used = sum(list, since);
  const capT = Number(lim.tokens) > 0 ? Number(lim.tokens) : null;
  const capC = Number(lim.costUsd) > 0 ? Number(lim.costUsd) : null;
  const capN = Number(lim.turns) > 0 ? Number(lim.turns) : null;

  /* процент — по самому близкому к исчерпанию */
  let pct = null;
  const take = (v) => { if (v == null) return; pct = pct == null ? v : Math.max(pct, v); };
  if (capT) take(Math.min(100, (used.tokens / capT) * 100));
  if (capC) take(Math.min(100, (used.cost / capC) * 100));
  if (capN) take(Math.min(100, (used.turns / capN) * 100));

  return {
    window: windowName,
    since,
    resetsAt,
    resetsInSec: Math.max(0, Math.round((resetsAt - now) / 1000)),
    used,
    cap: { tokens: capT, cost: capC, turns: capN },
    pct,
    over: !!((capT && used.tokens >= capT) || (capC && used.cost >= capC) || (capN && used.turns >= capN)),
    session: sessionSince ? sum(list, sessionSince) : { tokens: 0, cost: 0, turns: 0 },
    today: sum(list, day),
    week: sum(list, week),
    models: byModel(list, since)
  };
}

module.exports = { record, snapshot, read, FILE };
