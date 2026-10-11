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
  var histBtn = el("button", "ibtn"); histBtn.type = "button";
  histBtn.setAttribute("aria-label", "Sessions");
  histBtn.appendChild(ic("clock", 20));
  bar.appendChild(histBtn);
  app.appendChild(bar);

  var strip = el("div", "strip"); strip.setAttribute("data-on", "false");
  app.appendChild(strip);

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

  function setBusy(on) {
    st.busy = on;
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
  sendBtn.addEventListener("click", submit);
  ta.addEventListener("focus", function () { setTimeout(scroll, 300); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () { setTimeout(scroll, 60); });
  }
  plusBtn.addEventListener("click", function () {
    openSheet("Attach", C.attach.map(function (a) { return { t: a.t }; }),
      function (r) { toast(r.t + " attached"); });
  });
  micBtn.addEventListener("click", function () { toast("Voice input is not wired yet"); });

  function fillChips(list) {
    chips.textContent = "";
    list.forEach(function (c) {
      var b = el("button", "chip", c); b.type = "button";
      b.addEventListener("click", function () { send(c); });
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
      b.addEventListener("click", function () { closeSheet(); onPick && onPick(r); });
      sheet.appendChild(b);
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
    if (window.PC_LIVE) {
      var u = usageData;
      var any = (u.session && u.session.tokens) || (u.today && u.today.tokens) || u.allowance || u.plan;
      if (!any) {
        if (stripEl && stripEl.parentNode) { stripEl.remove(); stripEl = null; }
        return;
      }
    }
    var fresh = PCUSAGE.renderAccountStrip(usageData, { el: el, ic: ic });
    fresh.classList.add("acct");
    fresh.addEventListener("click", openLimits);
    if (stripEl && stripEl.parentNode) stripEl.replaceWith(fresh);
    else feed.insertBefore(fresh, feed.firstChild);
    stripEl = fresh;
  }

  function openModels() {
    var rows = [];
    C.models.forEach(function (g) {
      g.items.forEach(function (m) {
        rows.push({ t: m.n, d: g.co + " · " + m.d, brand: g.brand, on: m.n === st.model, crew: g.crew });
      });
    });
    openSheet("Model", rows, function (m) {
      st.model = m.t; st.brand = m.brand;
      if (m.crew && E.SH[m.crew]) E.setCrew(m.crew);
      syncModel();
      toast("Now working: " + m.t);
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

  function sessionRows(list) {
    var rows = [{ t: "New session", d: "start from a blank page", sid: "__new" }];
    list.forEach(function (x) {
      rows.push({
        t: x.title || "Untitled",
        d: ago(x.at) + (x.current ? " · open now" : ""),
        on: !!x.current,
        sid: x.id
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
    if (r.sid && SEND && window.__pcws) {
      window.__pcws.send(JSON.stringify({ t: "resume", id: r.sid }));
      clearFeed();
      toast("Picked it back up");
      return;
    }
    toast("Start the engine to open past sessions");
  }

  function openSessions() {
    if (!window.PC_LIVE) {
      openSheet("Sessions", sessionRows(C.sessions.map(function (x, i) {
        return { id: null, title: x.sum, at: Date.now() - i * 36e5, current: false };
      })), pickSession);
      return;
    }
    fetch("/api/sessions").then(function (r) { return r.json(); }).then(function (j) {
      openSheet("Sessions", sessionRows(j.sessions || []), pickSession);
    })["catch"](function () {
      openSheet("Sessions", sessionRows([]), pickSession);
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

  pet = new E.Pet(stage, 3);
  setTimeout(function () { petEvent("app_opened"); }, 400);

  /* в демо показываем образец, в живом режиме его заменит демон */
  if (!window.PC_LIVE && window.PC_SET && PC_SET.usage_sample) showAccount(PC_SET.usage_sample);

  window.PCUI = {
    addYou: addYou, addSay: addSay, addStep: addStep, addTool: addTool,
    addCard: addCard, planCard: planCard, askCard: askCard, button: button,
    setStrip: setStrip, setBusy: setBusy, toast: toast, scroll: scroll,
    clearIdle: clearIdle, fillChips: fillChips, petAct: petAct,
    el: el, ind: ind, ic: ic, feed: feed, input: ta,
    startClock: function () { t0 = Date.now(); },
    focus: function () { ta.focus(); },
    toolDone: function (node, ok, out) {
      if (!node) return;
      if (node._out) node._out.textContent = out || "";
      if (node._glyph && node._glyph.parentNode) {
        node._glyph.parentNode.replaceChild(
          ic(ok ? "check" : "cross", 15, 2.2, ok ? "var(--ok)" : "var(--bad)"), node._glyph);
      }
      scroll();
    },
    setSender: function (fn) { SEND = fn; },
    openModels: openModels, openPerms: openPerms, openLimits: openLimits,
    openSessions: openSessions, clearFeed: clearFeed, newSession: function () { pickSession({ sid: "__new" }); },
    showAccount: showAccount, syncModel: function () { syncModel(); },
    usage: function () { return usageData; },
    pet: function () { return pet; },
    state: st
  };

  window.addEventListener("resize", scroll);
})();
