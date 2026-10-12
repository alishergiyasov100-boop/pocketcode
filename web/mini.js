/* ============================================================
   PocketCode — один экран, одна лента.
   Структура чата и композера снята с референсов: ответ агента
   обычным текстом, сообщение пользователя пилюлей справа,
   композер карточкой с панелью под строкой ввода.
   ============================================================ */
(function () {
  "use strict";

  var E = window.PC;
  var $ = E.$, el = E.el, ind = E.ind;
  var REDUCED = E.REDUCED;
  var C = window.PC_CONTENT;

  /* ---------- иконки линиями, как в референсах ---------- */
  var P = {
    burger: "M4 7h16M4 12h16M4 17h10",
    down:   "M6 9l6 6 6-6",
    right:  "M9 6l6 6-6 6",
    plus:   "M12 5v14M5 12h14",
    mic:    "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
    send:   "M5 12h14M13 6l6 6-6 6",
    check:  "M4 12.5 9.5 18 20 6.5",
    cross:  "M6 6l12 12M18 6 6 18",
    clock:  "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
    paste:  "M9 4h6v3H9zM7 6H5v14h14V6h-2M9 12h6M9 16h4",
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
    undo:   "M9 10H5V6M5.6 15a8 8 0 1 0 1.3-7.4L5 10",
    play:   "M7 5l12 7-12 7z",
    pin:    "M12 3v7M8 10h8l-1 4H9zM12 14v7",
    fold:   "M6 9l6 6 6-6",
    pen:    "M16 3l5 5L8 21H3v-5zM13 6l5 5",
    dot:    "M12 12h.01",
    sun:    "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19",
    moon:   "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"
  };

  function ic(name, size, w, color) {
    var ns = "http://www.w3.org/2000/svg";
    var v = document.createElementNS(ns, "svg");
    v.setAttribute("viewBox", "0 0 24 24");
    v.setAttribute("width", size || 20);
    v.setAttribute("height", size || 20);
    v.setAttribute("fill", "none");
    v.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", P[name] || P.dot);
    p.setAttribute("stroke", color || "currentColor");
    p.setAttribute("stroke-width", w || 1.8);
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    v.appendChild(p);
    return v;
  }

  /* ---------- каркас ---------- */
  var app = el("div", "app");
  document.body.appendChild(app);

  var bar = el("div", "bar");
  var burgerBtn = el("button", "ibtn"); burgerBtn.type = "button";
  burgerBtn.setAttribute("aria-label", "Menu");
  burgerBtn.appendChild(ic("burger", 21));
  bar.appendChild(burgerBtn);
  bar.appendChild(el("div", "bar__sp"));

  var modelPill = el("button", "mpill"); modelPill.type = "button";
  var mpBrand = el("span", "mpill__b");
  var mpName = el("span", "mpill__n");
  modelPill.appendChild(mpBrand);
  modelPill.appendChild(mpName);
  var mpChev = el("span", "mpill__c"); mpChev.appendChild(ic("down", 15, 2));
  modelPill.appendChild(mpChev);
  bar.appendChild(modelPill);

  bar.appendChild(el("div", "bar__sp"));

  var quietBtn = el("button", "ibtn"); quietBtn.type = "button";
  quietBtn.setAttribute("aria-label", "Simple view");
  quietBtn.appendChild(ic("fold", 19, 2));
  var quiet = false;
  try { quiet = localStorage.getItem("pc-quiet") === "1"; } catch (e) {}
  function applyQuiet() {
    app.setAttribute("data-quiet", String(quiet));
    quietBtn.setAttribute("data-on", String(quiet));
    try { localStorage.setItem("pc-quiet", quiet ? "1" : "0"); } catch (e) {}
  }
  quietBtn.addEventListener("click", function () {
    quiet = !quiet; applyQuiet();
    toast(quiet ? "Just the conversation" : "Every step shown");
    scroll();
  });
  bar.appendChild(quietBtn);

  var searchBtn = el("button", "ibtn"); searchBtn.type = "button";
  searchBtn.setAttribute("aria-label", "Find");
  searchBtn.appendChild(ic("search", 18, 2));
  bar.appendChild(searchBtn);

  var histBtn = el("button", "ibtn"); histBtn.type = "button";
  histBtn.setAttribute("aria-label", "Sessions");
  histBtn.appendChild(ic("clock", 20));
  bar.appendChild(histBtn);
  app.appendChild(bar);

  var strip = el("div", "strip"); strip.setAttribute("data-on", "false");
  app.appendChild(strip);

  var find = el("div", "find"); find.setAttribute("data-on", "false");
  var findIn = document.createElement("input");
  findIn.className = "find__i"; findIn.type = "search";
  findIn.placeholder = "Find in this conversation";
  findIn.setAttribute("autocomplete", "off");
  var findN = el("span", "find__n", "");
  var findX = el("button", "find__x"); findX.type = "button";
  findX.appendChild(ic("cross", 15, 2.2));
  find.appendChild(findIn); find.appendChild(findN); find.appendChild(findX);
  app.appendChild(find);

  /* полоса запущенного приложения живёт под строкой состояния */
  var runbar = el("div", "runbar"); runbar.setAttribute("data-on", "false");
  app.appendChild(runbar);

  var stage = el("div", "stage");
  var feed = el("div", "feed");
  stage.appendChild(feed);
  app.appendChild(stage);

  var foot = el("div", "foot");
  var queue = el("div", "queue"); queue.setAttribute("data-on", "false");
  foot.appendChild(queue);
  var chips = el("div", "chips");
  foot.appendChild(chips);

  var input = el("div", "input");
  var ta = document.createElement("textarea");
  ta.className = "input__ta";
  ta.rows = 1;
  ta.setAttribute("enterkeyhint", "send");
  ta.setAttribute("autocapitalize", "sentences");
  ta.setAttribute("autocomplete", "off");
  ta.setAttribute("spellcheck", "false");
  input.appendChild(ta);

  var ibar = el("div", "input__bar");
  var plusBtn = el("button", "cbtn"); plusBtn.type = "button";
  plusBtn.setAttribute("aria-label", "Attach");
  plusBtn.appendChild(ic("plus", 18, 2));
  ibar.appendChild(plusBtn);

  var pasteBtn = el("button", "cbtn"); pasteBtn.type = "button";
  pasteBtn.setAttribute("aria-label", "Paste");
  pasteBtn.appendChild(ic("paste", 17, 1.9));
  pasteBtn.addEventListener("click", function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) { toast("Clipboard is not available here", "bad"); return; }
    navigator.clipboard.readText().then(function (t) {
      if (!t) { toast("Clipboard is empty"); return; }
      ta.value = ta.value ? ta.value.replace(/\s*$/, " ") + t : t;
      grow(); ta.focus();
      try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {}
    })["catch"](function () { toast("Android did not let me read the clipboard", "bad"); });
  });
  ibar.appendChild(pasteBtn);

  var modelMini = el("button", "modelmini"); modelMini.type = "button";
  var mmName = el("span", "", "");
  modelMini.appendChild(mmName);
  modelMini.appendChild(ic("down", 13, 2));
  ibar.appendChild(modelMini);

  ibar.appendChild(el("div", "input__sp"));
  var micBtn = el("button", "cbtn"); micBtn.type = "button";
  micBtn.setAttribute("aria-label", "Voice");
  micBtn.appendChild(ic("mic", 17));
  ibar.appendChild(micBtn);

  var sendBtn = el("button", "send"); sendBtn.type = "button";
  sendBtn.setAttribute("aria-label", "Send");
  sendBtn.appendChild(ic("send", 17, 2));
  ibar.appendChild(sendBtn);

  input.appendChild(ibar);
  foot.appendChild(input);
  app.appendChild(foot);

  function runFind() {
    var q = findIn.value.trim().toLowerCase();
    var hit = 0, first = null;
    Array.prototype.forEach.call(feed.children, function (n) {
      if (!q) { n.removeAttribute("data-find"); return; }
      var on = (n.textContent || "").toLowerCase().indexOf(q) >= 0;
      n.setAttribute("data-find", on ? "hit" : "miss");
      if (on) { hit++; if (!first) first = n; }
    });
    findN.textContent = q ? (hit ? hit + " found" : "nothing") : "";
    if (first) first.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  findIn.addEventListener("input", runFind);
  searchBtn.addEventListener("click", function () {
    var on = find.getAttribute("data-on") !== "true";
    find.setAttribute("data-on", String(on));
    if (on) findIn.focus();
    else { findIn.value = ""; runFind(); }
  });
  findX.addEventListener("click", function () {
    find.setAttribute("data-on", "false");
    findIn.value = ""; runFind();
  });

  var scrim = el("div", "scrim"); scrim.setAttribute("data-on", "false");
  app.appendChild(scrim);
  var sheet = el("div", "sheet"); sheet.setAttribute("data-on", "false");
  app.appendChild(sheet);
  var toastEl = el("div", "toast"); toastEl.setAttribute("data-on", "false");
  toastEl.setAttribute("role", "status");
  app.appendChild(toastEl);

  /* ---------- состояние ---------- */
  var st = { busy: false, started: false, q: [], model: "Claude Opus 5", brand: "anthropic" };
  var SEND = null;

  function scroll() { feed.scrollTop = feed.scrollHeight; }

  var toastT;
  function toast(text, tone) {
    toastEl.textContent = "";
    toastEl.appendChild(ic(tone === "bad" ? "cross" : "check", 17, 2.2,
      tone === "bad" ? "var(--bad)" : "var(--ok)"));
    toastEl.appendChild(el("span", "", text));
    toastEl.setAttribute("data-on", "true");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.setAttribute("data-on", "false"); }, 2600);
  }

  var t0 = 0;
  function clock() {
    if (!t0) return "0:00";
    var s = Math.floor((Date.now() - t0) / 1000);
    return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }

  function setStrip(text, tone, spin) {
    if (!text) { strip.setAttribute("data-on", "false"); return; }
    strip.textContent = "";
    strip.setAttribute("data-tone", tone || "");
    strip.appendChild(ind(spin || "pc-ring-px"));
    strip.appendChild(el("span", "", text));
    strip.appendChild(el("div", "strip__sp"));
    var t = el("span", "strip__t", clock());
    strip.appendChild(t);
    strip._t = t;
    strip.setAttribute("data-on", "true");
  }
  setInterval(function () {
    if (strip.getAttribute("data-on") !== "true" || !strip._t || !t0) return;
    strip._t.textContent = clock();
  }, 1000);

  /* ---------- печать по буквам ---------- */
  function type(node, html, cps, done) {
    node.innerHTML = html;
    if (REDUCED) { if (done) done(); return; }
    var texts = [];
    (function walk(x) {
      for (var i = 0; i < x.childNodes.length; i++) {
        var c = x.childNodes[i];
        if (c.nodeType === 3) { texts.push({ n: c, f: c.data }); c.data = ""; }
        else walk(c);
      }
    })(node);
    var caret = ind("pc-caret"); node.appendChild(caret);
    var ti = 0, ci = 0;
    var h = setInterval(function () {
      if (!node.isConnected) { clearInterval(h); return; }
      var k = 2;
      while (k-- > 0) {
        if (ti >= texts.length) {
          clearInterval(h);
          if (caret.parentNode) caret.parentNode.removeChild(caret);
          if (done) done();
          return;
        }
        var t = texts[ti];
        if (ci >= t.f.length) { ti++; ci = 0; continue; }
        t.n.data = t.f.slice(0, ++ci);
      }
      scroll();
    }, 1000 / (cps || 60));
  }

  /* ---------- элементы ленты ---------- */
  /* строка-пометка в ленте: в отличие от тоста её видно и через минуту */
  var GLOSS = {
    "commit": "A save point in the project's history. You can always come back to it.",
    "branch": "A parallel copy of the project where you can try things without breaking the main one.",
    "git": "The thing that remembers every version of your files.",
    "dependency": "Someone else's code your project uses.",
    "npm": "The tool that fetches other people's code for you.",
    "build": "Turning your source files into the thing people actually run.",
    "server": "A program that waits for requests and answers them.",
    "port": "A numbered door on your phone. The app listens behind one.",
    "repository": "The folder git watches over. Often just called a repo.",
    "merge": "Bringing two lines of work back together.",
    "deploy": "Putting your thing somewhere other people can open it."
  };
  function glossify(node) {
    var words = Object.keys(GLOSS);
    var re = new RegExp("\\b(" + words.join("|") + ")\\b", "gi");
    var walk = function (n) {
      for (var i = 0; i < n.childNodes.length; i++) {
        var c = n.childNodes[i];
        if (c.nodeType === 3) {
          var txt = c.data;
          if (!re.test(txt)) { re.lastIndex = 0; continue; }
          re.lastIndex = 0;
          var frag = document.createDocumentFragment(), last = 0, m;
          while ((m = re.exec(txt))) {
            frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
            var w = el("button", "gloss", m[0]); w.type = "button";
            w.addEventListener("click", function (term) {
              return function (e) { e.stopPropagation(); toast(GLOSS[term.toLowerCase()]); };
            }(m[0]));
            frag.appendChild(w);
            last = m.index + m[0].length;
          }
          frag.appendChild(document.createTextNode(txt.slice(last)));
          c.parentNode.replaceChild(frag, c);
        } else if (c.nodeType === 1 && !c.classList.contains("gloss")) walk(c);
      }
    };
    walk(node);
    return node;
  }

  function addNote(text) {
    var n = el("div", "note");
    n.appendChild(ic("dot", 13, 3, "var(--ink3)"));
    n.appendChild(el("span", "", text));
    feed.appendChild(n);
    scroll();
    return n;
  }

  /* план агента, который обновляется по ходу дела */
  var todoCard = null;
  var todoState = { items: [], done: 0 };
  function showTodos(items) {
    if (!items || !items.length) return;
    todoState.items = items;
    todoState.done = items.filter(function (i) { return i.state === "completed"; }).length;
    var now = items.filter(function (i) { return i.state === "in_progress"; })[0];
    if (now) setStrip(now.text + "  ·  " + (todoState.done + 1) + " of " + items.length, null, "pc-ring-px");
    var fresh = el("div", "todos");
    var done = items.filter(function (i) { return i.state === "completed"; }).length;
    var head = el("div", "todos__h");
    head.appendChild(el("span", "todos__t", "Its plan"));
    head.appendChild(el("span", "todos__n", done + " of " + items.length));
    fresh.appendChild(head);

    items.forEach(function (i) {
      var r = el("div", "todo");
      r.setAttribute("data-state", i.state || "pending");
      var g = el("span", "todo__g");
      if (i.state === "completed") g.appendChild(ic("check", 13, 2.6, "var(--ok)"));
      else if (i.state === "in_progress") g.appendChild(ind("pc-ring-px"));
      else g.appendChild(ic("dot", 13, 3, "var(--ink3)"));
      r.appendChild(g);
      r.appendChild(el("span", "todo__t", i.text));
      fresh.appendChild(r);
    });

    if (todoCard && todoCard.parentNode) todoCard.replaceWith(fresh);
    else feed.appendChild(fresh);
    todoCard = fresh;
    scroll();
  }

  function addYou(text) { var n = el("div", "you", text); feed.appendChild(n); scroll(); return n; }

  function addSay(html, done) {
    var n = el("div", "say");
    feed.appendChild(n); scroll();
    type(n, html, 62, done);
    return n;
  }

  function addStep(text, ok) {
    var n = el("div", "step" + (ok === false ? " step--bad" : ""));
    var g = el("span", "step__g");
    g.appendChild(ic(ok === false ? "cross" : "check", 15, 2.2,
      ok === false ? "var(--bad)" : "var(--ok)"));
    n.appendChild(g);
    n.appendChild(el("span", "", text));
    feed.appendChild(n); scroll();
    return n;
  }

  function addTool(label, out) {
    var w = el("div", "");
    var b = el("button", "tool"); b.type = "button";
    var g = ic("right", 14, 2);
    b.appendChild(g);
    b.appendChild(el("span", "", label));
    var o = el("div", "toolout", out || ""); o.setAttribute("data-on", "false");
    b.addEventListener("click", function () {
      var on = o.getAttribute("data-on") === "true";
      o.setAttribute("data-on", String(!on));
      scroll();
    });
    w.appendChild(b); w.appendChild(o);
    w._out = o; w._glyph = g;
    feed.appendChild(w); scroll();
    return w;
  }

  function addCard(head, tag, build) {
    var c = el("div", "card");
    var h = el("div", "card__h");
    h.appendChild(el("span", "card__hn", head));
    if (tag) h.appendChild(el("span", "card__tag", tag));
    c.appendChild(h);
    var b = el("div", "card__b");
    build(b, c);
    c.appendChild(b);
    feed.appendChild(c); scroll();
    return c;
  }

  function button(text, primary, onClick) {
    var b = el("button", "btn" + (primary ? " btn--p" : ""), text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  /* ---------- сценарий демо ---------- */
  function planCard(onGo) {
    addCard("The plan", "nothing touched yet", function (b) {
      b.appendChild(el("div", "card__t", C.plan.title));
      b.appendChild(el("div", "card__d", C.plan.intro));
      var list = el("div", "plan");
      C.plan.items.forEach(function (x, i) {
        var r = el("div", "plan__r");
        r.appendChild(el("span", "plan__n", String(i + 1)));
        var xx = el("span", "plan__x");
        xx.appendChild(el("span", "plan__t", x.t));
        xx.appendChild(el("span", "plan__d", x.d));
        r.appendChild(xx);
        list.appendChild(r);
      });
      b.appendChild(list);
      var f = el("div", "facts");
      f.appendChild(el("span", "", C.plan.touch));
      b.appendChild(f);
      var acts = el("div", "acts");
      acts.appendChild(button("Go ahead", true, function () { acts.remove(); onGo(); }));
      acts.appendChild(button("Another way", false, function () {
        acts.remove();
        addSay("Alright — tell me how you'd rather do it.");
        setBusy(false);
      }));
      b.appendChild(acts);
    });
  }

  function askCard(q, options, onPick) {
    addCard("Needs you", "waiting", function (b) {
      b.appendChild(el("div", "card__t", q));
      var acts = el("div", "acts");
      options.forEach(function (o, i) {
        acts.appendChild(button(o.t, i === 0, function () { acts.remove(); onPick(o); }));
      });
      b.appendChild(acts);
    });
  }

  function stopAgent() {
    if (window.__pcws) window.__pcws.send(JSON.stringify({ t: "interrupt" }));
    setBusy(false);
  }

  function setBusy(on) {
    st.busy = on;
    /* пока он работает, та же кнопка останавливает — искать нечего */
    sendBtn.textContent = "";
    sendBtn.appendChild(ic(on ? "cross" : "send", on ? 16 : 17, on ? 2.4 : 2));
    sendBtn.setAttribute("aria-label", on ? "Stop" : "Send");
    sendBtn.setAttribute("data-stop", String(!!on));
    if (!on) { setStrip("Waiting on you", "wait", "pc-dots"); pump(); }
  }

  function play(list, done) {
    var i = 0;
    (function run() {
      if (i >= list.length) { done && done(); return; }
      var e = list[i++];
      if (e.type === "agent") { addSay(e.text, function () { setTimeout(run, 260); }); return; }
      if (e.type === "step") {
        addStep(e.text, e.tone !== "bad");
        if (e.tone === "bad") petEvent("tool_failed"); else petEvent("tool_done");
        setTimeout(run, REDUCED ? 0 : 760);
        return;
      }
      if (e.type === "tool") { addTool(e.label, e.out); petEvent("tool_started"); setTimeout(run, REDUCED ? 0 : 600); return; }
      setTimeout(run, 300);
    })();
  }

  var FIRST = C.session.simple.filter(function (e) { return e.type === "step" || e.type === "agent"; });

  function firstRun(text) {
    st.started = true;
    setBusy(true);
    t0 = Date.now();
    setStrip("Thinking", "", "pc-ring-px");
    addYou(text);
    petEvent("message_sent");
    setTimeout(function () {
      addSay("Let me look at it first.", function () {
        setTimeout(function () {
          petEvent("plan_waiting");
          planCard(function () {
            setStrip("Working", "", "pc-ring-px");
            petEvent("agent_thinking");
            play(FIRST, function () {
              setBusy(false);
              petEvent("agent_finished");
              fillChips(C.session.chips);
              ta.placeholder = C.session.placeholder;
            });
          });
        }, 320);
      });
    }, 420);
  }

  function followUp(text) {
    var f = C.session.followups[text];
    setBusy(true);
    t0 = Date.now();
    setStrip("Working", "", "pc-ring-px");
    addYou(text);
    petEvent("message_sent");
    if (/ship it/i.test(text)) {
      setTimeout(function () {
        askCard("Straight to main, or open a pull request?", [
          { t: "Open a PR" }, { t: "Straight to main" }
        ], function (o) { addStep("You chose: " + o.t.toLowerCase(), true); runFollow(f); });
        petEvent("question_waiting");
      }, 500);
      return;
    }
    runFollow(f);
  }

  function runFollow(f) {
    if (!f) { setBusy(false); return; }
    setTimeout(function () {
      addSay(f.splain, function () {
        setTimeout(function () {
          addStep(f.sstep, true);
          setTimeout(function () {
            addSay(f.sreply, function () { setBusy(false); petEvent("agent_finished"); });
          }, 700);
        }, 500);
      });
    }, 380);
  }

  function send(text) {
    if (st.busy) { st.q.push(text); drawQueue(); toast("Queued — it'll read it next"); return; }
    clearIdle();
    if (SEND) { st.started = true; SEND(text); return; }
    if (!st.started) firstRun(text); else followUp(text);
  }

  function pump() {
    if (st.busy || !st.q.length) return;
    var next = st.q.shift();
    drawQueue();
    setTimeout(function () { send(next); }, 500);
  }

  function drawQueue() {
    queue.textContent = "";
    queue.setAttribute("data-on", String(st.q.length > 0));
    if (!st.q.length) return;
    queue.appendChild(ind("pc-dots"));
    queue.appendChild(el("span", "", st.q[0]));
  }

  /* ---------- ввод ---------- */
  function grow() {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 116) + "px";
  }
  function submit() {
    var v = ta.value.trim();
    if (!v) { var f = chips.querySelector(".chip"); if (f) send(f.textContent); return; }
    ta.value = "";
    grow();
    send(v);
  }
  ta.addEventListener("input", function () { grow(); if (pet && pet.typing) pet.typing(ta.value.length > 0); });
  ta.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  });
  sendBtn.addEventListener("click", function () {
    if (st.busy && window.PC_LIVE) { stopAgent(); return; }
    submit();
  });
  /* черновик не теряется, если свернул приложение на полуслове */
  try {
    var saved = localStorage.getItem("pc-draft");
    if (saved) { ta.value = saved; setTimeout(grow, 0); }
  } catch (e) {}
  ta.addEventListener("input", function () {
    try { localStorage.setItem("pc-draft", ta.value); } catch (e) {}
  });

  ta.addEventListener("focus", function () { setTimeout(scroll, 300); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () { setTimeout(scroll, 60); });
  }
  plusBtn.addEventListener("click", function () {
    var rows = [
      { t: "New session", d: "Start from a blank page", act: "new" },
      { t: "Past sessions", d: "Pick up where you left off", act: "sessions" },
      { t: "Project folder", d: "Switch what it works on", act: "project" },
      { t: "Run a command", d: "Puts $ in the box, the shell answers", act: "shell" },
      { t: "Run it", d: "Start the project and look at it", act: "run" },
      { t: "Browse the project", d: "Files, with changed ones marked", act: "tree" },
      { t: "Undo last turn", d: "Put the files back as they were", act: "undo" }
    ];
    openSheet("Do", rows, function (r) {
      if (r.act === "new") { pickSession({ sid: "__new" }); return; }
      if (r.act === "sessions") { openSessions(); return; }
      if (r.act === "project") { openProjects(); return; }
      if (r.act === "run") {
        if (!window.PC_LIVE) { toast("Start the engine first", "bad"); return; }
        if (runState.state === "up" && runState.port) { openPreview(); return; }
        ws({ t: "run_app" });
        toast("Starting it");
        return;
      }
      if (r.act === "tree") { openTree(); return; }
      if (r.act === "undo") {
        if (!window.__pcws) { toast("Start the engine first", "bad"); return; }
        window.__pcws.send(JSON.stringify({ t: "undo" }));
        return;
      }
      if (r.act === "shell") {
        ta.value = "$ ";
        ta.focus();
        try { ta.setSelectionRange(2, 2); } catch (e) {}
        grow();
      }
    });
  });
  /* голос есть только внутри приложения: в браузере его неоткуда взять,
     поэтому кнопка не висит мёртвой, а просто не появляется */
  var VOICE = (function () {
    try { return !!(window.PocketNative && window.PocketNative.hasVoice && window.PocketNative.hasVoice()); }
    catch (e) { return false; }
  })();

  if (!VOICE) {
    micBtn.style.display = "none";
  } else {
    micBtn.addEventListener("click", function () {
      micBtn.setAttribute("data-on", "true");
      try { window.PocketNative.startVoice(); }
      catch (e) { micBtn.removeAttribute("data-on"); toast("Could not open the microphone", "bad"); }
    });
    window.PCVOICE = function (text, err) {
      micBtn.removeAttribute("data-on");
      if (err) { toast(err, "bad"); return; }
      if (!text) return;
      ta.value = ta.value ? ta.value.replace(/\s*$/, " ") + text : text;
      grow();
      ta.focus();
      try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {}
    };
  }

  function fillChips(list) {
    chips.textContent = "";
    list.forEach(function (c) {
      var b = el("button", "chip", c); b.type = "button";
      var held = false, timer = null;
      var hold = function () {
        held = true;
        ta.value = c; grow(); ta.focus();
        try { ta.setSelectionRange(c.length, c.length); } catch (e) {}
        toast("Edit it, then send");
      };
      b.addEventListener("touchstart", function () { held = false; timer = setTimeout(hold, 480); }, { passive: true });
      b.addEventListener("touchend", function () { clearTimeout(timer); });
      b.addEventListener("touchmove", function () { clearTimeout(timer); });
      b.addEventListener("contextmenu", function (e) { e.preventDefault(); hold(); });
      b.addEventListener("click", function () { if (!held) send(c); held = false; });
      chips.appendChild(b);
    });
  }

  /* ---------- пустой экран ---------- */
  var idle;
  function showIdle() {
    idle = el("div", "idle");
    var p = el("div", "idle__pet");
    E.pet(p, E.active, "idle", 4);
    idle.appendChild(p);
    var h = new Date().getHours();
    var when = h < 6 ? "Still up" : h < 12 ? "Good morning" : h < 19 ? "Good afternoon" : "Good evening";
    idle.appendChild(el("div", "idle__hi", when + ", Alisher"));
    idle.appendChild(el("div", "idle__sub", "Say what needs doing."));
    feed.appendChild(idle);
  }
  function clearIdle() { if (idle) { idle.remove(); idle = null; } }

  /* ---------- листы ---------- */
  function openSheet(title, rows, onPick) {
    sheet.textContent = "";
    sheet.appendChild(el("div", "sheet__k", title));

    /* длинный список на телефоне без фильтра — мучение */
    var body = el("div", "sheet__b");
    if (rows.length > 18) {
      var f = el("input", "sheet__f");
      f.type = "search"; f.placeholder = "Filter"; f.autocomplete = "off";
      f.addEventListener("input", function () {
        var q = f.value.trim().toLowerCase();
        Array.prototype.forEach.call(body.children, function (n) {
          n.style.display = !q || (n._key || "").indexOf(q) >= 0 ? "" : "none";
        });
      });
      sheet.appendChild(f);
    }
    sheet.appendChild(body);

    rows.forEach(function (r) {
      var b = el("button", "row"); b.type = "button";
      if (r.brand) { var g = el("span", "row__g"); g.appendChild(E.brand(r.brand, 18)); b.appendChild(g); }
      var x = el("span", "row__x");
      x.appendChild(el("span", "row__t", r.t));
      if (r.d) x.appendChild(el("span", "row__d", r.d));
      b.appendChild(x);
      var g2 = el("span", "row__g");
      g2.appendChild(r.on ? ic("check", 17, 2.2, "var(--ok)") : ic("right", 16, 2));
      b.appendChild(g2);
      if (r.hold) {
        var held = false, tm = null;
        var fire = function () { held = true; closeSheet(); setTimeout(r.hold, 200); };
        b.addEventListener("touchstart", function () { held = false; tm = setTimeout(fire, 500); }, { passive: true });
        b.addEventListener("touchend", function () { clearTimeout(tm); });
        b.addEventListener("touchmove", function () { clearTimeout(tm); });
        b.addEventListener("contextmenu", function (e) { e.preventDefault(); fire(); });
        b.addEventListener("click", function () { if (held) { held = false; return; } closeSheet(); onPick && onPick(r); });
      } else {
        b.addEventListener("click", function () { closeSheet(); onPick && onPick(r); });
      }
      b._key = ((r.t || "") + " " + (r.d || "")).toLowerCase();
      body.appendChild(b);
    });
    sheet.setAttribute("data-on", "true");
    scrim.setAttribute("data-on", "true");
  }
  function closeSheet() {
    sheet.setAttribute("data-on", "false");
    scrim.setAttribute("data-on", "false");
  }
  scrim.addEventListener("click", closeSheet);

  function openPerms() {
    openSheet("How much it asks you", C.perms.items.map(function (p) {
      return { t: p.t, d: p.d, on: !!p.on };
    }), function (p) {
      C.perms.items.forEach(function (x) { x.on = x.t === p.t; });
      toast(p.t);
    });
  }

  /* расход и лимиты */
  var usageData = null;
  /* лист лимитов приходит самостоятельным оверлеем — кладём его в корень
     приложения и слушаем его же событие закрытия */
  function openLimits() {
    if (!window.PCUSAGE) { toast("Usage is not available yet"); return; }
    var data = usageData || (window.PC_SET && PC_SET.usage_sample) || {};
    var old = app.querySelector(".pc-sheet-root");
    if (old) old.remove();
    var node = PCUSAGE.renderLimitsSheet(data, { el: el, ic: ic });
    node.classList.add("pcu-in-app");
    app.appendChild(node);
    node.addEventListener("pcusage:close", function () { node.remove(); });
  }

  var stripEl = null;
  function showAccount(data) {
    usageData = data || usageData;
    if (!window.PCUSAGE || !usageData) return;
    /* пока ничего не потрачено, показывать строку из прочерков незачем */
    /* раньше при нулях строка пряталась — и верх экрана выглядел сломанным.
       Показываем всегда: модель, окно и то, что уже израсходовано, известны. */
    var fresh = PCUSAGE.renderAccountStrip(usageData, { el: el, ic: ic });
    fresh.classList.add("acct");
    fresh.addEventListener("click", openLimits);
    if (stripEl && stripEl.parentNode) stripEl.replaceWith(fresh);
    else feed.insertBefore(fresh, feed.firstChild);
    stripEl = fresh;
  }

  /* ---------- настоящий каталог моделей ---------- */
  var BRANDOF = [
    [/^claude|^anthropic/i, "anthropic", "Anthropic"],
    [/^gpt|^o[0-9]|^openai/i, "openai", "OpenAI"],
    [/^kimi|^moonshot/i, "moonshot", "Moonshot"],
    [/^gemini|^google/i, "google", "Google"],
    [/^grok|^xai/i, "xai", "xAI"],
    [/^deepseek/i, "deepseek", "DeepSeek"],
    [/^mistral|^magistral|^codestral/i, "mistral", "Mistral"],
    [/^llama|^meta/i, "meta", "Meta"]
  ];
  function brandOfModel(id) {
    for (var i = 0; i < BRANDOF.length; i++) if (BRANDOF[i][0].test(id)) return BRANDOF[i];
    return [null, null, "Other"];
  }
  function groupModels(ids) {
    var by = {}, order = [];
    ids.forEach(function (id) {
      var b = brandOfModel(id);
      if (!by[b[2]]) { by[b[2]] = { co: b[2], brand: b[1], items: [] }; order.push(b[2]); }
      by[b[2]].items.push({ n: id, d: null });
    });
    return order.map(function (k) { return by[k]; });
  }
  function fetchModels(cb) {
    if (!window.PC_LIVE) return cb(C.models, null);
    fetch("/api/models").then(function (r) { return r.json(); }).then(function (j) {
      if (!j.models || !j.models.length) return cb(C.models, j.error || "the engine has no catalogue");
      cb(groupModels(j.models), null);
    })["catch"](function () { cb(C.models, "could not reach the engine"); });
  }

  function openModels() {
    fetchModels(function (groups, err) {
      var rows = [];
      groups.forEach(function (g) {
        g.items.forEach(function (m) {
          rows.push({
            t: m.n,
            d: g.co + (m.d ? " · " + m.d : ""),
            brand: g.brand,
            on: m.n === st.model,
            crew: g.crew
          });
        });
      });
      if (err) rows.unshift({ t: "Showing examples", d: err, noop: true });
      openSheet("Model", rows, function (m) {
        if (m.noop) return;
        st.model = m.t; st.brand = m.brand;
        if (m.crew && E.SH[m.crew]) E.setCrew(m.crew);
        syncModel();
        if (window.__pcws) window.__pcws.send(JSON.stringify({ t: "model", model: m.t }));
        toast("Now working: " + m.t);
      });
    });
  }
  modelPill.addEventListener("click", openModels);
  modelMini.addEventListener("click", openModels);

  /* ---------- сессии ---------- */
  function ago(ms) {
    if (!ms) return "";
    var s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 90) return "just now";
    var m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    if (h < 24) return h + "h ago";
    return Math.round(h / 24) + "d ago";
  }

  function clearFeed() {
    feed.textContent = "";
    stripEl = null;
    st.started = false;
    st.busy = false;
    st.q = [];
    drawQueue();
    showIdle();
    if (usageData) showAccount(usageData);
    fillChips(C.session.freshChips);
    ta.placeholder = C.session.freshPlaceholder;
    setStrip(null);
  }

  function sessionRows(list, project) {
    var rows = [{ t: "New session", d: "start from a blank page", sid: "__new" }];
    if (!list.length) {
      rows.push({ t: "Nothing here yet", d: project ? "no past runs in " + project : "no past runs", sid: null });
      return rows;
    }
    list.forEach(function (x) {
      rows.push({
        t: (x.pinned ? "· " : "") + (x.title || "Untitled"),
        d: ago(x.at) + (x.current ? " · open now" : "") + (x.pinned ? " · kept on top" : ""),
        on: !!x.current,
        sid: x.id,
        pinned: !!x.pinned,
        hold: function () { sessionMenu(x); }
      });
    });
    return rows;
  }

  function pickSession(r) {
    if (r.sid === "__new") {
      if (SEND && window.__pcws) window.__pcws.send(JSON.stringify({ t: "new" }));
      clearFeed();
      toast("New session");
      return;
    }
    if (!r.sid) return;
    if (r.sid && SEND && window.__pcws) {
      window.__pcws.send(JSON.stringify({ t: "resume", id: r.sid }));
      clearFeed();
      toast("Picked it back up");
      return;
    }
    toast("Start the engine to open past sessions");
  }

  function openProjects() {
    if (!window.PC_LIVE) { toast("Start the engine to switch projects"); return; }
    fetch("/api/projects").then(function (r) { return r.json(); }).then(function (j) {
      openSheet("Project folder", (j.projects || []).map(function (p) {
        return { t: p.name, d: (p.git ? "git · " : "") + p.path.replace(/^.*\/home\//, "~/"), on: p.current, ppath: p.path };
      }), function (r) {
        if (!r.ppath || !window.__pcws) return;
        window.__pcws.send(JSON.stringify({ t: "project", path: r.ppath }));
        clearFeed();
        st.project = r.t;
        addNote("Now working in " + r.t);
        toast("Working in " + r.t);
      });
    })["catch"](function () { toast("Could not read the folders"); });
  }

  /* долгое нажатие по сессии: назвать по-своему или закрепить */
  function sessionMenu(x) {
    openSheet(x.title || "Session", [
      { t: "Rename", d: "Give it a name you will recognise", act: "rename" },
      { t: x.pinned ? "Unpin" : "Keep on top", d: x.pinned ? "Back in date order" : "Always first in the list", act: "pin" }
    ], function (r) {
      if (!window.__pcws) { toast("Start the engine first", "bad"); return; }
      if (r.act === "pin") {
        window.__pcws.send(JSON.stringify({ t: "session_meta", id: x.id, pinned: !x.pinned }));
        toast(x.pinned ? "Unpinned" : "Kept on top");
        return;
      }
      askName(x.title || "", function (name) {
        if (name == null) return;
        window.__pcws.send(JSON.stringify({ t: "session_meta", id: x.id, title: name }));
        toast(name ? "Called it " + name : "Name cleared");
      });
    });
  }

  /* маленький диалог ввода — prompt() в WebView выглядит чужеродно */
  function askName(value, cb) {
    var wrap = el("div", "ask");
    var card = el("div", "ask__c");
    card.appendChild(el("div", "ask__t", "Name this session"));
    var i = document.createElement("input");
    i.className = "ask__i"; i.value = value; i.placeholder = "Rocket site";
    i.setAttribute("autocomplete", "off");
    card.appendChild(i);
    var row = el("div", "ask__r");
    row.appendChild(button("Cancel", false, function () { wrap.remove(); cb(null); }));
    row.appendChild(button("Save", true, function () { var v = i.value.trim(); wrap.remove(); cb(v); }));
    card.appendChild(row);
    wrap.appendChild(card);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) { wrap.remove(); cb(null); } });
    app.appendChild(wrap);
    setTimeout(function () { i.focus(); }, 60);
  }

  var checkpoints = [];
  function setCheckpoints(list) { checkpoints = list || []; }

  function openCheckpoints() {
    if (!window.PC_LIVE || !window.__pcws) { toast("Start the engine first", "bad"); return; }
    window.__pcws.send(JSON.stringify({ t: "checkpoints" }));
    setTimeout(function () {
      if (!checkpoints.length) {
        openSheet("Go back in time", [{ t: "Nothing recorded yet", d: "A point is saved before every message", noop: true }], function () {});
        return;
      }
      var rows = checkpoints.slice().reverse().map(function (c, n) {
        var d = new Date(c.at);
        return {
          t: n === 0 ? "Just before the last message" : c.label,
          d: d.toLocaleTimeString() + (n === checkpoints.length - 1 ? " · start of this session" : ""),
          idx: c.i
        };
      });
      openSheet("Go back in time", rows, function (r) {
        if (r.noop) return;
        window.__pcws.send(JSON.stringify({ t: "restore", i: r.idx }));
        toast("Putting the files back");
      });
    }, 260);
  }

  /* предупреждение об опасной команде — отдельной заметной строкой */
  function addWarn(text, cmd) {
    var n = el("div", "warn");
    n.appendChild(ic("cross", 14, 2.4, "var(--warn)"));
    var x = el("span", "warn__x");
    x.appendChild(el("span", "warn__t", text));
    if (cmd) x.appendChild(el("code", "warn__c", cmd));
    n.appendChild(x);
    feed.appendChild(n);
    scroll();
    return n;
  }

  /* ---------- смотреть код ---------- */

  /* крошечная подсветка: строки, комментарии, числа, ключевые слова.
     Библиотеку сюда не затащить — CSP артефакта режет внешние скрипты. */
  /* Один проход, иначе вторая замена начинает калечить разметку первой:
     слово class в ключевых словах ломало уже вставленные теги. */
  var TOK = new RegExp([
    '("(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)',
    '(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*|#[^\\n]*)',
    '(\\b\\d+(?:\\.\\d+)?\\b)',
    '(\\b(?:function|return|const|let|var|if|else|for|while|class|new|import|export|from|async|await|try|catch|throw|typeof|instanceof|this|null|undefined|true|false|def|elif|lambda|None|True|False)\\b)'
  ].join('|'), 'g');

  function esc(x) {
    return String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function paint(code) {
    var src = String(code), out = "", last = 0, m;
    TOK.lastIndex = 0;
    while ((m = TOK.exec(src))) {
      out += esc(src.slice(last, m.index));
      var cls = m[1] ? "st" : m[2] ? "cm" : m[3] ? "nu" : "kw";
      out += "<i class=" + cls + ">" + esc(m[0]) + "</i>";
      last = m.index + m[0].length;
    }
    return out + esc(src.slice(last));
  }

  function codeSheet(title, build, extra) {
    sheet.textContent = "";
    var k = el("div", "sheet__k", title);
    sheet.appendChild(k);
    var body = el("div", "sheet__b code");
    sheet.appendChild(body);
    build(body);
    if (extra) sheet.appendChild(extra);
    sheet.setAttribute("data-on", "true");
    scrim.setAttribute("data-on", "true");
  }

  function showDiff(file) {
    fetch("/api/diff?file=" + encodeURIComponent(file)).then(function (r) { return r.json(); }).then(function (j) {
      codeSheet(file.split("/").pop(), function (body) {
        if (j.error) { body.appendChild(el("div", "pnl__note", j.error)); return; }
        var pre = el("pre", "diff");
        if (j.kind === "whole") {
          pre.innerHTML = paint(j.body);
        } else {
          var html = j.diff.split("\n").map(function (l) {
            var cls = l[0] === "+" && l[1] !== "+" ? "add"
                    : l[0] === "-" && l[1] !== "-" ? "del"
                    : l[0] === "@" ? "hunk" : "";
            var safe = l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            return cls ? "<span class=" + cls + ">" + safe + "</span>" : safe;
          }).join("\n");
          pre.innerHTML = html;
        }
        body.appendChild(pre);
      }, (function () {
        var acts = el("div", "sheet__acts");
        acts.appendChild(button("Copy", false, function () {
          var t = j.kind === "whole" ? j.body : j.diff;
          if (navigator.clipboard) navigator.clipboard.writeText(t);
          toast("Copied");
        }));
        if (j.kind !== "whole") {
          acts.appendChild(button("Put this file back", false, function () {
            if (window.__pcws) window.__pcws.send(JSON.stringify({ t: "revert_file", path: file }));
            closeSheet();
          }));
        }
        return acts;
      })());
    })["catch"](function () { toast("Could not read that file", "bad"); });
  }

  function showFile(path) {
    fetch("/api/file?path=" + encodeURIComponent(path)).then(function (r) { return r.json(); }).then(function (j) {
      codeSheet(path.split("/").pop(), function (body) {
        if (j.error) { body.appendChild(el("div", "pnl__note", j.error)); return; }
        var pre = el("pre", "diff");
        pre.innerHTML = paint(j.body);
        body.appendChild(pre);
      }, (function () {
        var acts = el("div", "sheet__acts");
        acts.appendChild(button("Copy", false, function () {
          if (navigator.clipboard && j.body) navigator.clipboard.writeText(j.body);
          toast("Copied");
        }));
        return acts;
      })());
    })["catch"](function () { toast("Could not read that file", "bad"); });
  }

  /* 43, 44 — после хода всегда есть, что спросить дальше */
  var NEXT = [
    { when: /\.css|style|design|цвет/i, ask: ["Make it look better on a phone", "Add a dark mode"] },
    { when: /test|тест/i, ask: ["Run the tests and fix what fails"] },
    { when: /index\.html|\.jsx?$|\.tsx?$/i, ask: ["Show me how it looks", "Add one more feature to it"] },
    { when: /readme|\.md$/i, ask: ["Explain this project to a beginner"] },
    { when: /package\.json/i, ask: ["Start it and show me"] }
  ];
  function nextSteps(files) {
    var out = [];
    (files || []).forEach(function (f) {
      NEXT.forEach(function (n) {
        if (n.when.test(f.path)) n.ask.forEach(function (a) { if (out.indexOf(a) < 0) out.push(a); });
      });
    });
    if (out.indexOf("Show me how it looks") < 0) out.push("Show me how it looks");
    out.push("What should I do next?");
    fillChips(out.slice(0, 4));
  }

  /* кнопка после хода: пусть расскажет по-человечески, что сделал */
  function offerErrorHelp(label, out) {
    var n = el("div", "note");
    n.appendChild(ic("cross", 13, 2.6, "var(--bad)"));
    n.appendChild(el("span", "", "That step failed."));
    var b = button("What does this mean?", false, function () {
      b.disabled = true;
      send("The step \"" + label + "\" failed with this output:\n\n" + String(out || "").slice(0, 1200) +
           "\n\nExplain in plain words what went wrong and fix it.");
    });
    b.classList.add("note__go");
    n.appendChild(b);
    feed.appendChild(n);
    scroll();
  }

  function offerExplain() {
    var n = el("div", "note");
    n.appendChild(ic("dot", 13, 3, "var(--ink3)"));
    n.appendChild(el("span", "", "Not sure what just happened?"));
    var b = button("Explain it simply", false, function () {
      b.disabled = true;
      send("Explain what you just did, in plain words, as if I am new to this. No code unless it helps.");
    });
    b.classList.add("note__go");
    n.appendChild(b);
    feed.appendChild(n);
    scroll();
  }

  /* сводка «что изменилось» в конце хода */
  function showChanges(files) {
    if (!files || !files.length) return;
    var card = el("div", "chg");
    var head = el("div", "chg__h");
    head.appendChild(el("span", "chg__t", files.length === 1 ? "1 file changed" : files.length + " files changed"));
    card.appendChild(head);
    files.forEach(function (f) {
      var r = el("button", "chg__r"); r.type = "button";
      r.appendChild(el("span", "chg__n", f.path));
      var n = el("span", "chg__d");
      if (f.add) n.appendChild(el("span", "chg__a", "+" + f.add));
      if (f.del) n.appendChild(el("span", "chg__m", "\u2212" + f.del));
      if (f.fresh) n.appendChild(el("span", "chg__new", "new"));
      r.appendChild(n);
      r.addEventListener("click", function () { showDiff(f.path); });
      card.appendChild(r);
    });
    feed.appendChild(card);
    scroll();
  }

  function openTree() {
    if (!window.PC_LIVE) { toast("Start the engine first", "bad"); return; }
    fetch("/api/tree").then(function (r) { return r.json(); }).then(function (j) {
      var rows = (j.items || []).map(function (i) {
        return {
          t: "\u00a0\u00a0".repeat(i.depth) + (i.dir ? i.path.split("/").pop() + "/" : i.path.split("/").pop()),
          d: i.touched ? "changed in this session" : null,
          fpath: i.dir ? null : i.path
        };
      });
      openSheet(j.root || "Project", rows, function (r) { if (r.fpath) showFile(r.fpath); });
    })["catch"](function () { toast("Could not read the project", "bad"); });
  }

  /* ---------- запуск и просмотр ---------- */
  var runState = { state: "idle", port: null, cmd: null, log: "", lan: null };

  function ws(obj) { if (window.__pcws) window.__pcws.send(JSON.stringify(obj)); }

  function setRun(p) {
    if (p.state) runState.state = p.state;
    if (p.port !== undefined && p.port !== null) runState.port = p.port;
    if (p.cmd !== undefined) runState.cmd = p.cmd;
    if (p.lan) runState.lan = p.lan;
    if (p.log) runState.log = p.log;
    if (p.state === "stopped" || p.state === "idle") { runState.port = null; runState.cmd = null; }
    drawRun();
  }
  function addRunLog(text) {
    runState.log = (runState.log + text).slice(-16000);
    if (logPre && logPre.isConnected) { logPre.textContent = runState.log; logPre.scrollTop = logPre.scrollHeight; }
  }

  var logPre = null;
  function drawRun() {
    var on = runState.state === "starting" || runState.state === "up";
    runbar.setAttribute("data-on", String(on));
    runbar.textContent = "";
    if (!on) return;
    runbar.appendChild(ind(runState.state === "up" ? "pc-dot-fade" : "pc-ring-px"));
    var t = el("span", "runbar__t", runState.state === "up"
      ? (runState.cmd || "running") + (runState.port ? " · :" + runState.port : "")
      : "starting " + (runState.cmd || ""));
    runbar.appendChild(t);
    runbar.appendChild(el("div", "runbar__sp"));
    if (runState.port) {
      var o = el("button", "runbar__b", "Open"); o.type = "button";
      o.addEventListener("click", openPreview);
      runbar.appendChild(o);
    }
    var l = el("button", "runbar__b", "Logs"); l.type = "button";
    l.addEventListener("click", openLogs);
    runbar.appendChild(l);
    var x = el("button", "runbar__b runbar__b--off", "Stop"); x.type = "button";
    x.addEventListener("click", function () { ws({ t: "stop_app" }); });
    runbar.appendChild(x);
  }

  function openPreview() {
    if (!runState.port) { toast("It has not told me a port yet"); return; }
    var wrap = el("div", "prev");
    var head = el("div", "prev__h");
    head.appendChild(el("span", "prev__t", "localhost:" + runState.port));
    var share = el("button", "prev__b", "Share"); share.type = "button";
    share.addEventListener("click", function () {
      var url = runState.lan ? "http://" + runState.lan + ":" + runState.port : "http://127.0.0.1:" + runState.port;
      if (navigator.clipboard) navigator.clipboard.writeText(url);
      toast(runState.lan ? "Copied " + url : "Only this phone can open it — no network address");
    });
    head.appendChild(share);
    var live = el("button", "prev__b", "Live"); live.type = "button";
    live.setAttribute("data-on", "true");
    live.addEventListener("click", function () {
      var on = live.getAttribute("data-on") !== "true";
      live.setAttribute("data-on", String(on));
      toast(on ? "Reloads itself when files change" : "Reload by hand now");
    });
    head.appendChild(live);

    var re = el("button", "prev__b", "Reload"); re.type = "button";
    var x = el("button", "prev__b", "Close"); x.type = "button";
    x.addEventListener("click", function () { wrap.remove(); });
    head.appendChild(re); head.appendChild(x);
    wrap.appendChild(head);
    var f = document.createElement("iframe");
    f.className = "prev__f";
    f.src = "http://127.0.0.1:" + runState.port + "/";
    re.addEventListener("click", function () { f.src = f.src; });
    wrap.appendChild(f);
    app.appendChild(wrap);

    /* живое обновление: агент поправил файл — страница перечиталась */
    wrap._reload = function () {
      if (live.getAttribute("data-on") !== "true") return;
      f.src = f.src;
    };
    previewWrap = wrap;        /* живость проверяем по isConnected, без устаревших событий */
  }

  var previewWrap = null;
  function reloadPreview() { if (previewWrap && previewWrap.isConnected) previewWrap._reload(); }

  function openLogs() {
    codeSheet("Output", function (body) {
      logPre = el("pre", "diff");
      logPre.textContent = runState.log || "(nothing yet)";
      body.appendChild(logPre);
    }, (function () {
      var acts = el("div", "sheet__acts");
      acts.appendChild(button("Copy", false, function () {
        if (navigator.clipboard) navigator.clipboard.writeText(runState.log || "");
        toast("Copied");
      }));
      acts.appendChild(button("Stop it", false, function () { ws({ t: "stop_app" }); closeSheet(); }));
      return acts;
    })());
  }

  function openSessions() {
    if (!window.PC_LIVE) {
      openSheet("Sessions", sessionRows(C.sessions.map(function (x, i) {
        return { id: null, title: x.sum, at: Date.now() - i * 36e5, current: false };
      })), pickSession);
      return;
    }
    fetch("/api/sessions").then(function (r) { return r.json(); }).then(function (j) {
      openSheet("Sessions", sessionRows(j.sessions || [], j.project), pickSession);
    })["catch"](function () {
      openSheet("Sessions", sessionRows([], null), pickSession);
    });
  }

  histBtn.addEventListener("click", openSessions);

  function theme() { return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
  function setTheme(v) {
    if (v === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("pc-theme", v); } catch (e) {}
  }

  burgerBtn.addEventListener("click", function (e) {
    if (window.PCPANEL) {
      var r = burgerBtn.getBoundingClientRect();
      PCPANEL.open(e.clientX || (r.left + r.width / 2), e.clientY || (r.top + r.height / 2));
      return;
    }
    openSheet("Menu", [
      { t: "Model", d: st.model, go: "model" },
      { t: "Sessions", d: "what you ran before", go: "sessions" },
      { t: "How much it asks you", d: "permission level", go: "perms" },
      { t: theme() === "dark" ? "Light theme" : "Dark theme", d: "appearance", go: "theme" }
    ], function (r) {
      if (r.go === "theme") { setTheme(theme() === "dark" ? "light" : "dark"); return; }
      setTimeout(function () {
        if (r.go === "model") return openModels();
        if (r.go === "sessions") return histBtn.click();
        openSheet("How much it asks you", C.perms.items.map(function (p) {
          return { t: p.t, d: p.d, on: !!p.on };
        }), function (p) {
          C.perms.items.forEach(function (x) { x.on = x.t === p.t; });
          toast(p.t);
        });
      }, 180);
    });
  });

  /* ---------- питомец ---------- */
  var pet;
  function petAct(a) { if (pet) pet.act(a); }
  function petEvent(n, x) { if (pet && pet.event) pet.event(n, x); else if (pet) petAct(n === "tool_failed" ? "panic" : "work"); }

  /* ---------- старт ---------- */
  E.boot();
  try { if (localStorage.getItem("pc-theme") === "dark") setTheme("dark"); } catch (e) {}

  function syncModel() {
    mpBrand.textContent = "";
    mpBrand.appendChild(E.brand(st.brand, 16));
    var short = st.model.replace(/^(Claude|Kimi|Gemini|Mistral|Llama|DeepSeek)\s/, "");
    mpName.textContent = short;
    mmName.textContent = short;
  }
  syncModel();

  ta.placeholder = C.session.freshPlaceholder;
  fillChips(C.session.freshChips);
  showIdle();
  setStrip(null);

  /* первый запуск: не тур по кнопкам, а настоящее маленькое дело */
  function firstTimeCard() {
    var first = true;
    try { first = !localStorage.getItem("pc-seen"); } catch (e) {}
    if (!first) return;
    try { localStorage.setItem("pc-seen", "1"); } catch (e) {}
    var card = el("div", "chg");
    var h = el("div", "chg__h");
    h.appendChild(el("span", "chg__t", "First time? Pick one"));
    card.appendChild(h);
    [
      "Make me a one-page site about something I like",
      "Build a tiny game I can play on my phone",
      "Look at this project and tell me what it is"
    ].forEach(function (t) {
      var r = el("button", "chg__r"); r.type = "button";
      r.appendChild(el("span", "chg__n2", t));
      r.addEventListener("click", function () { card.remove(); send(t); });
      card.appendChild(r);
    });
    feed.appendChild(card);
  }

  applyQuiet();
  pet = new E.Pet(app, 3);
  setTimeout(function () { petEvent("app_opened"); }, 400);

  /* в демо показываем образец, в живом режиме его заменит демон */
  if (!window.PC_LIVE && window.PC_SET && PC_SET.usage_sample) showAccount(PC_SET.usage_sample);

  window.PCUI = {
    addYou: addYou, addSay: addSay, addStep: addStep, addTool: addTool, addNote: addNote,
    addCard: addCard, planCard: planCard, askCard: askCard, button: button,
    setStrip: setStrip, setBusy: setBusy, toast: toast, scroll: scroll,
    showTodos: showTodos, stopAgent: stopAgent,
    openCheckpoints: openCheckpoints, setCheckpoints: setCheckpoints, addWarn: addWarn,
    showChanges: showChanges, showDiff: showDiff, showFile: showFile, openTree: openTree,
    offerExplain: offerExplain, glossify: glossify,
    nextSteps: nextSteps, offerErrorHelp: offerErrorHelp, firstTimeCard: firstTimeCard,
    setRun: setRun, addRunLog: addRunLog, reloadPreview: reloadPreview,
    clearIdle: clearIdle, fillChips: fillChips, petAct: petAct, petEvent: petEvent,
    petTyping: function (on) { if (pet && pet.typing) pet.typing(on); },
    el: el, ind: ind, ic: ic, feed: feed, input: ta,
    startClock: function () { t0 = Date.now(); },
    focus: function () { ta.focus(); },
    toolDone: function (node, ok, out, full, lines) {
      if (!node) return;
      if (node._out) node._out.textContent = out || "";
      if (full) {
        node.classList.add("tool--more");
        var more = el("button", "tool__more"); more.type = "button";
        more.textContent = "show all " + (lines || 0) + " lines";
        var open = false;
        more.addEventListener("click", function (e) {
          e.stopPropagation();
          open = !open;
          if (node._out) node._out.textContent = open ? full : (out || "");
          if (node._out) node._out.classList.toggle("toolout--full", open);
          more.textContent = open ? "show less" : ("show all " + (lines || 0) + " lines");
          scroll();
        });
        node.appendChild(more);
      }
      if (node._glyph && node._glyph.parentNode) {
        node._glyph.parentNode.replaceChild(
          ic(ok ? "check" : "cross", 15, 2.2, ok ? "var(--ok)" : "var(--bad)"), node._glyph);
      }
      scroll();
    },
    setSender: function (fn) { SEND = fn; },
    openModels: openModels, openPerms: openPerms, openLimits: openLimits,
    openSessions: openSessions, openProjects: openProjects, clearFeed: clearFeed,
    fetchModels: fetchModels, newSession: function () { pickSession({ sid: "__new" }); },
    showAccount: showAccount, syncModel: function () { syncModel(); },
    usage: function () { return usageData; },
    pet: function () { return pet; },
    state: st
  };

  window.addEventListener("resize", scroll);
})();
