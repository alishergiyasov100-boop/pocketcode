/* ============================================================
   PocketCode bridge — драйвер настоящего Claude Code.

   Один долгоживущий процесс держит многоходовую сессию через
   stream-json в обе стороны. Сырые события приводятся к тому
   словарю, на котором нарисован интерфейс: step / tool / agent / note.
   ============================================================ */
"use strict";

const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const path = require("path");

const CLAUDE = process.env.CLAUDE_BIN || "claude";

/* ---------- человеческие подписи вместо имён инструментов ---------- */

const base = (p) => (p ? path.basename(String(p)) : "");
const hostOf = (u) => { try { return new URL(String(u)).host; } catch (e) { return String(u || ""); } };
const clip = (s, n) => {
  s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

function humanize(name, input) {
  const i = input || {};
  switch (name) {
    case "Read":       return `Read ${base(i.file_path)}`;
    case "Write":      return `Wrote ${base(i.file_path)}`;
    case "Edit":       return `Edited ${base(i.file_path)}`;
    case "NotebookEdit": return `Edited ${base(i.notebook_path)}`;
    case "Glob":       return `Looked for ${clip(i.pattern, 40)}`;
    case "Grep":       return `Searched for ${clip(i.pattern, 40)}`;
    case "Bash":       return describeBash(i.command, i.description);
    case "WebFetch":   return `Opened ${clip(i.url, 48)}`;
    case "WebSearch":  return `Searched the web for ${clip(i.query, 40)}`;
    case "mcp__search__web_search": return `Searched the web for ${clip(i.query, 40)}`;
    case "mcp__search__web_read":   return `Read ${clip(hostOf(i.url), 44)}`;
    case "Task":       return `Sent a helper to ${clip(i.description, 40)}`;
    case "TodoWrite":  return "Updated its checklist";
    default:           return `${name}${i.description ? " · " + clip(i.description, 40) : ""}`;
  }
}

/* баш — самое частое, и именно его стоит переводить на человеческий */
function describeBash(cmd, fallback) {
  const c = String(cmd || "").trim();
  if (/^git\s+commit/.test(c)) return "Committed";
  if (/^git\s+push/.test(c)) return "Pushed the branch";
  if (/^git\s+diff/.test(c)) return "Looked at the changes";
  if (/^git\s+status/.test(c)) return "Checked what changed";
  if (/^gh\s+pr\s+create/.test(c)) return "Opened a pull request";
  if (/(pytest|unittest|jest|vitest|go test|cargo test|npm (run )?test)/.test(c)) return "Ran the tests";
  if (/^(ls|find|tree)\b/.test(c)) return "Looked around the project";
  if (/^(npm|pnpm|yarn|pip|uv|cargo|go)\s+(i|install|add|get)\b/.test(c)) return "Installed a dependency";
  if (/^(npm|pnpm|yarn)\s+run\s+build|^(cargo|go)\s+build/.test(c)) return "Built the project";
  return fallback ? clip(fallback, 48) : `Ran ${clip(c, 44)}`;
}

/* вывод инструмента ужимаем до пары строк — на телефоне больше не нужно */
function shortOutput(text, limit = 420) {
  const s = String(text == null ? "" : text).replace(/\[[0-9;]*m/g, "");
  if (s.length <= limit) return s;
  const head = s.slice(0, limit - 120);
  const tail = s.slice(-100);
  return `${head}\n…\n${tail}`;
}

function okFromResult(content, isError) {
  if (isError) return false;
  const s = typeof content === "string" ? content : JSON.stringify(content || "");
  return !/\b(error|failed|failure|traceback|exception)\b/i.test(s.slice(0, 400));
}

/* ---------- сессия ---------- */

class Session extends EventEmitter {
  /**
   * @param {object} opts
   *   cwd            — папка проекта
   *   resume         — id сессии для продолжения
   *   permissionMode — default | plan | acceptEdits | dontAsk | bypassPermissions
   *   allowedTools   — массив правил, напр. ["Read","Edit","Bash(git *)"]
   *   model, bare, extraArgs
   */
  constructor(opts = {}) {
    super();
    this.opts = opts;
    this.id = opts.resume || null;
    this.pending = new Map();   // tool_use_id -> нормализованное событие
    this.buf = "";
    this.busy = false;
    this.closed = false;
    this.cost = 0;
    this.turns = 0;
    this.tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    this.badTools = 0;
    this.startedAt = Date.now();
  }

  start() {
    const o = this.opts;
    const args = [
      "-p",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
      "--replay-user-messages"
    ];
    if (o.bare !== false) args.push("--bare");
    if (o.resume) args.push("--resume", o.resume);
    if (o.permissionMode) args.push("--permission-mode", o.permissionMode);
    if (o.allowedTools && o.allowedTools.length) args.push("--allowedTools", o.allowedTools.join(","));
    if (o.disallowedTools && o.disallowedTools.length) args.push("--disallowedTools", o.disallowedTools.join(","));
    if (o.model) args.push("--model", o.model);

    /* поиск приезжает своим MCP-сервером: встроенный WebSearch ходит
       через API Anthropic и мимо чужого шлюза не работает */
    if (o.mcpConfig) {
      args.push("--mcp-config", o.mcpConfig);
      args.push("--strict-mcp-config");
    }
    if (o.extraArgs) args.push(...o.extraArgs);

    this.args = args;
    this.proc = spawn(CLAUDE, args, {
      cwd: o.cwd || process.cwd(),
      env: Object.assign({}, process.env, o.env || {}),
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => this._onData(chunk));
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (d) => this.emit("stderr", d));
    this.proc.on("exit", (code, sig) => {
      this.closed = true;
      this.emit("exit", { code, signal: sig });
    });
    this.proc.on("error", (e) => this.emit("error", e));
    return this;
  }

  /** отправить ход; процесс остаётся живым и ждёт следующий */
  send(text) {
    if (this.closed) throw new Error("session is closed");
    this.busy = true;
    this.turns++;
    this.emit("ui", { type: "user", text });
    this.proc.stdin.write(JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text }] }
    }) + "\n");
  }

  interrupt() {
    if (!this.closed) this.proc.kill("SIGINT");
  }

  stop() {
    if (this.closed) return;
    try { this.proc.stdin.end(); } catch (e) {}
    setTimeout(() => { if (!this.closed) this.proc.kill("SIGTERM"); }, 1500);
  }

  _onData(chunk) {
    this.buf += chunk;
    let nl;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); }
      catch (e) { this.emit("unparsed", line); continue; }
      this.emit("raw", ev);
      try { this._translate(ev); }
      catch (e) { this.emit("error", e); }
    }
  }

  /* сырое событие -> словарь интерфейса */
  _translate(ev) {
    if (ev.session_id && !this.id) {
      this.id = ev.session_id;
      this.emit("session", this.id);
    }

    if (ev.type === "system") {
      if (ev.subtype === "init") {
        this.emit("ready", {
          session: ev.session_id || this.id,
          model: ev.model,
          cwd: ev.cwd,
          tools: ev.tools,
          permissionMode: ev.permissionMode
        });
      } else {
        this.emit("system", ev);
      }
      return;
    }

    if (ev.type === "assistant" || (ev.type === "message" && ev.role === "assistant")) {
      const msg = ev.message || ev;
      for (const part of msg.content || []) {
        if (part.type === "text" && part.text && part.text.trim()) {
          this.emit("ui", { type: "agent", text: part.text });
        } else if (part.type === "thinking" && part.thinking) {
          this.emit("ui", { type: "think", text: part.thinking });
        } else if (part.type === "tool_use") {
          /* пустое имя инструмента = шлюз покрошил потоковый вызов на куски.
             Дальше модель будет долбиться в стену, так что рвём ход сами. */
          if (!part.name) {
            this.badTools++;
            if (this.badTools >= 3) this._toolWall();
            continue;
          }
          const item = {
            type: "tool",
            id: part.id,
            name: part.name,
            label: humanize(part.name, part.input),
            input: part.input,
            state: "running"
          };
          this.pending.set(part.id, item);
          this.emit("ui", item);
        }
      }
      return;
    }

    if (ev.type === "user" || (ev.type === "message" && ev.role === "user")) {
      const msg = ev.message || ev;
      for (const part of msg.content || []) {
        if (part.type !== "tool_result") continue;
        const item = this.pending.get(part.tool_use_id);
        const text = typeof part.content === "string"
          ? part.content
          : (part.content || []).map((c) => c.text || "").join("\n");
        if (/No such tool available/i.test(text)) {
          this.badTools++;
          if (this.badTools >= 3) this._toolWall();
        } else if (!part.is_error) {
          this.badTools = 0;
        }
        const ok = okFromResult(text, part.is_error);
        this.pending.delete(part.tool_use_id);
        this.emit("ui", {
          type: "tool_done",
          id: part.tool_use_id,
          label: item ? item.label : "Did something",
          ok,
          out: shortOutput(text)
        });
      }
      return;
    }

    if (ev.type === "result") {
      this.busy = false;
      if (typeof ev.total_cost_usd === "number") this.cost = ev.total_cost_usd;
      var u = ev.usage || {};
      this.tokens.input      += u.input_tokens || 0;
      this.tokens.output     += u.output_tokens || 0;
      this.tokens.cacheRead  += u.cache_read_input_tokens || 0;
      this.tokens.cacheWrite += u.cache_creation_input_tokens || 0;
      this.emit("ui", {
        type: "turn_done",
        ok: ev.subtype === "success" || !ev.is_error,
        text: ev.result || "",
        cost: this.cost,
        usage: ev.usage || null,
        session: ev.session_id || this.id
      });
      this.emit("idle");
      return;
    }

    if (ev.type === "stream_event") { this.emit("delta", ev); return; }
  }
}

/* Останавливаем бесполезный цикл и объясняем по-человечески, что сломалось. */
Session.prototype._toolWall = function () {
  if (this._walled) return;
  this._walled = true;
  this.emit("ui", {
    type: "turn_done",
    ok: false,
    wall: "tools",
    text:
      "The engine kept handing back broken tool calls, so I stopped it before it burned " +
      "more of your allowance.\n\nThis is the model endpoint, not your project: it is " +
      "sending tool calls in pieces that cannot be put back together. Try another model, " +
      "or a provider whose streaming is sane.",
    cost: this.cost,
    session: this.id
  });
  this.interrupt();
  setTimeout(() => { this.badTools = 0; this._walled = false; }, 2000);
};

Session.prototype.usage = function () {
  var t = this.tokens;
  return {
    cost: this.cost,
    turns: this.turns,
    tokens: t.input + t.output + t.cacheRead + t.cacheWrite,
    detail: t,
    startedAt: this.startedAt,
    elapsed: Date.now() - this.startedAt
  };
};

module.exports = { Session, humanize, describeBash, shortOutput };

/* ---------- прогон одной задачи для проверки ---------- */
if (require.main === module) {
  const cwd = process.argv[2] || process.cwd();
  const prompt = process.argv[3] || "What is in this folder? Answer in one sentence.";
  const t0 = Date.now();
  const ms = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5) + "s";

  const s = new Session({
    cwd,
    permissionMode: "acceptEdits",
    allowedTools: ["Read", "Edit", "Write", "Glob", "Grep", "Bash"],
    bare: true
  }).start();

  s.on("ready", (r) => console.log(`${ms()}  ready · model ${r.model} · session ${String(r.session).slice(0, 8)}`));
  s.on("ui", (e) => {
    if (e.type === "user") console.log(`${ms()}  YOU   ${clip(e.text, 90)}`);
    else if (e.type === "agent") console.log(`${ms()}  SAYS  ${clip(e.text, 140)}`);
    else if (e.type === "think") console.log(`${ms()}  (thinks) ${clip(e.text, 90)}`);
    else if (e.type === "tool") console.log(`${ms()}  ...   ${e.label}`);
    else if (e.type === "tool_done") console.log(`${ms()}  ${e.ok ? "ok " : "FAIL"}  ${e.label}  ${clip(e.out, 70)}`);
    else if (e.type === "turn_done") console.log(`${ms()}  DONE  $${(e.cost || 0).toFixed(4)}  ${clip(e.text, 120)}`);
  });
  s.on("stderr", (d) => process.stderr.write("[claude] " + d));
  s.on("error", (e) => console.error("ERR", e.message));
  s.on("exit", (x) => { console.log(`${ms()}  exit ${x.code}`); process.exit(x.code || 0); });
  s.on("idle", () => { console.log(`${ms()}  — idle, closing —`); s.stop(); });

  s.send(prompt);
  setTimeout(() => { console.log("timeout"); s.stop(); }, 240000);
}
