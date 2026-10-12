/* ============================================================
   Живой транспорт: интерфейс подключается к демону по WebSocket
   и рисует настоящие события Claude Code вместо сценария.
   ============================================================ */
(function () {
  "use strict";
  if (!window.PC_LIVE || !window.PCUI) return;

  var U = window.PCUI;
  var tools = {};
  var ws, retry = 0, ready = false, gone = false;

  function strip(text, tone, spin) { U.setStrip(text, tone, spin); }

  function connect() {
    ws = new WebSocket(window.PC_LIVE);
    window.__pcws = ws;

    ws.onopen = function () {
      retry = 0; gone = false;
      strip("Connected", "ok", "pc-done");
      U.petEvent && U.petEvent("connection_restored");
      setTimeout(function () { if (!U.state.busy) strip("Ready", "", "pc-dot-fade"); }, 1200);
    };

    ws.onclose = function () {
      ready = false;
      retry++;
      /* короткий обрыв — это нормально, движок сам поднимается за пару секунд.
         Если не вернулся за десяток попыток, значит его действительно нет. */
      if (retry < 8) strip("Reconnecting", "wait", "pc-dots");
      else {
        strip("Engine is not running", "wait", "pc-dot-fade");
        if (!gone) {
          gone = true;
          U.addSay("The engine is not answering.<br><br>Open Termux and run <code>pocketcode</code>. " +
                   "It keeps itself up after that, so this should be a one-off.");
        }
      }
      setTimeout(connect, Math.min(400 * retry, 4000));
    };

    ws.onerror = function () { /* onclose разберётся */ };

    ws.onmessage = function (m) {
      var p;
      try { p = JSON.parse(m.data); } catch (e) { return; }
      handle(p);
    };
  }

  /* ошибка без выхода — предложить повтор прямо в ленте */
  function offerRetry(message) {
    var n = U.addNote ? U.addNote(message) : null;
    if (!n || !U.button) { U.toast(message, "bad"); return; }
    var b = U.button("Try again", true, function () {
      ws && ws.send(JSON.stringify({ t: "retry" }));
      b.disabled = true; b.textContent = "Trying\u2026";
    });
    b.classList.add("note__go");
    n.appendChild(b);
  }

  function handle(p) {
    if (p.t === "hello") {
      ready = true;
      var was = U.state && U.state.project;
      if (U.state) U.state.project = p.project || null;
      if (p.project && was && was !== p.project && U.addNote) U.addNote("Now working in " + p.project);
      U.toast("Connected to " + (p.project || "your project"));
      return;
    }
    if (p.t === "usage") { U.showAccount && U.showAccount(p.u); return; }
    if (p.t === "cleared") { tools = {}; if (U.state) U.state.project = null; strip(p.resumed ? "Picked up where it left off" : "Ready", "", "pc-dot-fade"); U.petEvent && U.petEvent("app_opened"); return; }
    if (p.t === "state") {
      U.setBusy(p.busy);
      if (p.busy) { U.startClock(); strip("WORKING", "", "pc-ring-px"); }
      return;
    }
    if (p.t === "error") { offerRetry(p.message || "Something broke"); U.setBusy(false); return; }
    if (p.t === "sessions_changed") return;
    if (p.t === "checkpoints") { U.setCheckpoints && U.setCheckpoints(p.list); return; }
    if (p.t !== "ui") return;

    var e = p.e;
    if (e.type === "user") { U.addYou(e.text); return; }
    if (e.type === "todos") { U.showTodos && U.showTodos(e.items); return; }
    if (e.type === "note") { U.addNote && U.addNote(e.text); return; }
    if (e.type === "warn") { U.addWarn && U.addWarn(e.text, e.cmd); return; }
    if (e.type === "changes") { U.showChanges && U.showChanges(e.files); return; }
    if (e.type === "agent") { U.addSay(esc(e.text)); U.petEvent && U.petEvent("agent_thinking"); return; }
    if (e.type === "think") { U.addStep(short(e.text, 140), true); return; }

    if (e.type === "tool") {
      tools[e.id] = U.addTool(e.label, "");
      strip(e.label, "", "pc-ring-px");
      U.petEvent && U.petEvent("tool_started", { node: tools[e.id] });
      return;
    }
    if (e.type === "tool_done") {
      U.toolDone(tools[e.id], e.ok, e.out, e.full, e.lines);
      delete tools[e.id];
      U.petEvent && U.petEvent(e.ok ? "tool_finished_ok" : "tool_failed", { node: tools[e.id] });
      return;
    }
    if (e.type === "turn_done") {
      U.setBusy(false);
      strip("Waiting on you", "wait", "pc-dots");
      U.petEvent && U.petEvent(e.wall ? "agent_stopped" : "agent_finished");
      if (e.cost) U.toast("Spent " + (e.cost < 0.01 ? "<1 cent" : "$" + e.cost.toFixed(2)));
      return;
    }
  }

  /* текст агента приходит как обычный текст — переносы в абзацы, html экранируем */
  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
      .replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>");
  }
  function short(s, n) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  U.setSender(function (text) {
    if (!ws || ws.readyState !== 1) { U.toast("Not connected yet", "bad"); return; }
    U.setBusy(true);
    U.startClock();
    U.petEvent && U.petEvent("message_sent");
    /* строка на $ — прямая команда в Termux, без агента */
    if (/^\s*\$\s*/.test(text)) {
      strip("RUNNING", "", "pc-ring-px");
      ws.send(JSON.stringify({ t: "run", cmd: text.replace(/^\s*\$\s*/, "") }));
      return;
    }
    strip("THINKING", "", "pc-ring-px");
    ws.send(JSON.stringify({ t: "send", text: text }));
  });

  strip("Connecting", "", "pc-dots");
  /* пока печатаешь — питомец это видит */
  if (U.input) {
    U.input.addEventListener("input", function () { U.petTyping && U.petTyping(U.input.value.length > 0); });
  }
  connect();
})();
