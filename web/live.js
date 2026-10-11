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

    ws.onopen = function () {
      retry = 0; gone = false;
      strip("CONNECTED", "ok", "pc-done");
      setTimeout(function () { if (!U.state.busy) strip("READY", "", "pc-dot-fade"); }, 1200);
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

  function handle(p) {
    if (p.t === "hello") {
      ready = true;
      U.toast("Connected to " + (p.project || "your project"));
      return;
    }
    if (p.t === "usage") { U.showAccount && U.showAccount(p.u); return; }
    if (p.t === "state") {
      U.setBusy(p.busy);
      if (p.busy) { U.startClock(); strip("WORKING", "", "pc-ring-px"); }
      return;
    }
    if (p.t === "error") { U.toast(p.message || "Something broke", "bad"); U.setBusy(false); return; }
    if (p.t !== "ui") return;

    var e = p.e;
    if (e.type === "user") { U.addYou(e.text); return; }
    if (e.type === "agent") { U.addSay(esc(e.text)); return; }
    if (e.type === "think") { U.addStep(short(e.text, 140), true); return; }

    if (e.type === "tool") {
      tools[e.id] = U.addTool(e.label, "");
      strip(e.label.toUpperCase(), "", "pc-ring-px");
      return;
    }
    if (e.type === "tool_done") {
      U.toolDone(tools[e.id], e.ok, e.out);
      delete tools[e.id];
      if (!e.ok) U.petAct("panic");
      return;
    }
    if (e.type === "turn_done") {
      U.setBusy(false);
      strip("WAITING ON YOU", "wait", "pc-dots");
      U.petAct("cheer");
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
    U.petAct("read");
    /* строка на $ — прямая команда в Termux, без агента */
    if (/^\s*\$\s*/.test(text)) {
      strip("RUNNING", "", "pc-ring-px");
      ws.send(JSON.stringify({ t: "run", cmd: text.replace(/^\s*\$\s*/, "") }));
      return;
    }
    strip("THINKING", "", "pc-ring-px");
    ws.send(JSON.stringify({ t: "send", text: text }));
  });

  strip("CONNECTING", "", "pc-dots");
  connect();
})();
