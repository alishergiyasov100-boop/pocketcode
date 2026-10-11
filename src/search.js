#!/usr/bin/env node
/* ============================================================
   Поиск для агента — отдельный MCP-сервер на stdio, без зависимостей.

   Встроенный WebSearch Клода ходит через API Anthropic и на телефоне
   через чужой шлюз не работает. Поэтому инструмент свой: ищет сам и
   сам же открывает страницы.
   ============================================================ */
"use strict";

var KEY = process.env.POCKETCODE_SEARCH_KEY || "";
var ENDPOINT = process.env.POCKETCODE_SEARCH_ENDPOINT || "https://google.serper.dev/search";

var TOOLS = [
  {
    name: "web_search",
    description:
      "Search the web and get back titles, links and snippets. " +
      "Use it whenever the answer depends on something current, external " +
      "or that you are not sure about.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for" },
        count: { type: "number", description: "How many results, 1-20 (default 8)" }
      },
      required: ["query"]
    }
  },
  {
    name: "web_read",
    description: "Open one web page and read it as plain text.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", description: "Full http(s) address" } },
      required: ["url"]
    }
  }
];

/* ---------- поиск ---------- */

function clip(s, n) {
  s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

async function search(query, count) {
  if (!KEY) {
    return "Web search is not set up yet: no search key. " +
           "Run `pocketcode search <key>` on the phone, a free key comes from serper.dev.";
  }
  var n = Math.max(1, Math.min(20, count || 8));
  var r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "X-API-KEY": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: n })
  });
  if (!r.ok) throw new Error("search failed: " + r.status + " " + clip(await r.text(), 120));
  var j = await r.json();

  var out = [];
  if (j.answerBox) {
    var a = j.answerBox;
    var head = a.answer || a.snippet || a.title;
    if (head) out.push("Answer box: " + clip(head, 400));
  }
  if (j.knowledgeGraph && j.knowledgeGraph.description) {
    out.push("Knowledge panel: " + clip(j.knowledgeGraph.description, 300));
  }
  (j.organic || []).slice(0, n).forEach(function (o, i) {
    out.push(
      (i + 1) + ". " + clip(o.title, 120) + "\n   " + o.link +
      (o.snippet ? "\n   " + clip(o.snippet, 300) : "")
    );
  });
  if (j.relatedSearches && j.relatedSearches.length) {
    out.push("Related: " + j.relatedSearches.slice(0, 5)
      .map(function (x) { return x.query || x; }).join(" · "));
  }
  return out.length ? out.join("\n\n") : "Nothing found for " + JSON.stringify(query);
}

/* ---------- чтение страницы ---------- */

function toText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

async function read(url) {
  if (!/^https?:\/\//i.test(url || "")) throw new Error("need a full http(s) address");
  var r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 14) PocketCode",
      "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"
    },
    redirect: "follow"
  });
  var type = r.headers.get("content-type") || "";
  var body = await r.text();
  if (!r.ok) throw new Error("page returned " + r.status);
  var text = /json/i.test(type) ? body : toText(body);
  var LIMIT = 12000;
  if (text.length > LIMIT) text = text.slice(0, LIMIT) + "\n\n…cut here, the page is longer.";
  return text || "The page came back empty.";
}

/* ---------- JSON-RPC по stdio ---------- */

function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
function ok(id, result) { send({ jsonrpc: "2.0", id: id, result: result }); }
function fail(id, message) {
  send({ jsonrpc: "2.0", id: id, result: { isError: true, content: [{ type: "text", text: message }] } });
}

async function handle(m) {
  if (m.method === "initialize") {
    var v = (m.params && m.params.protocolVersion) || "2024-11-05";
    return ok(m.id, {
      protocolVersion: v,
      capabilities: { tools: {} },
      serverInfo: { name: "pocketcode-search", version: "1.0.0" }
    });
  }
  if (m.method === "notifications/initialized" || m.method === "notifications/cancelled") return;
  if (m.method === "ping") return ok(m.id, {});
  if (m.method === "tools/list") return ok(m.id, { tools: TOOLS });
  if (m.method === "resources/list") return ok(m.id, { resources: [] });
  if (m.method === "prompts/list") return ok(m.id, { prompts: [] });

  if (m.method === "tools/call") {
    var p = m.params || {}, a = p.arguments || {};
    try {
      var text;
      if (p.name === "web_search") text = await search(a.query, a.count);
      else if (p.name === "web_read") text = await read(a.url);
      else return fail(m.id, "no tool named " + p.name);
      return ok(m.id, { content: [{ type: "text", text: text }] });
    } catch (e) {
      return fail(m.id, String((e && e.message) || e));
    }
  }

  if (m.id != null) send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "unknown method " + m.method } });
}

var buf = "", pending = 0, ended = false;
function done() { if (--pending <= 0 && ended) process.exit(0); }
process.stdin.setEncoding("utf8");
process.stdin.on("data", function (c) {
  buf += c;
  var nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    var line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    var m;
    try { m = JSON.parse(line); } catch (e) { continue; }
    pending++;
    Promise.resolve(handle(m)).catch(function (e) {
      if (m.id != null) fail(m.id, String((e && e.message) || e));
    }).then(done, done);
  }
});
/* закрытый stdin не повод бросать запрос на полпути */
process.stdin.on("end", function () { ended = true; if (pending <= 0) process.exit(0); });
