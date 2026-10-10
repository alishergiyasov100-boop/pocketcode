/* ============================================================
   PocketCode — минимальная версия. Один экран, одна лента.
   Решения (план, вопрос) приходят карточками прямо в ленту,
   поэтому отдельных экранов нет вообще.
   ============================================================ */
(function () {
  "use strict";

  var E = window.PC;
  var $ = E.$, el = E.el, ind = E.ind;
  var REDUCED = E.REDUCED;
  var C = window.PC_CONTENT;

  /* ---------- пиксельные иконки 9x9 ---------- */
  var ICON = {
    dots:  "........." + "....##..." + "....##..." + "........." + "....##..." + "....##..." + "........." + "....##..." + "....##...",
    plus:  "........." + "....##..." + "....##..." + "....##..." + ".########" + ".########" + "....##..." + "....##..." + "....##...",
    send:  "........." + ".##......" + ".####...." + ".######.." + ".########" + ".######.." + ".####...." + ".##......" + ".........",
    check: "........." + ".......##" + "......##." + ".##..##.." + ".#####..." + "..###...." + "...#....." + "........." + ".........",
    cross: "........." + ".##....##" + ".##....##" + "..##..##." + "...####.." + "..##..##." + ".##....##" + ".##....##" + ".........",
    chev:  "........." + "..##....." + "...##...." + "....##..." + ".....##.." + "....##..." + "...##...." + "..##....." + ".........",
    mic:   "...###..." + "...###..." + "...###..." + "...###..." + ".#.###.#." + ".#.....#." + "..#####.." + "....#...." + "...###...",
    stop:  "........." + ".#######." + ".#######." + ".#######." + ".#######." + ".#######." + ".#######." + ".#######." + ".........",
    dot:   "........." + "........." + "...###..." + "..#####.." + "..#####.." + "..#####.." + "...###..." + "........." + ".........",
    burger:"........." + "........." + ".#######." + "........." + ".#######." + "........." + ".#######." + "........." + ".........",
    undo:  "........." + "...#....." + "..##....." + ".#######." + "..##...#." + "...#...#." + ".....###." + "........." + "........."
  };

  function px(name, k, color) {
    var g = ICON[name] || ICON.dot, n = 9;
    var c = document.createElement("canvas");
    c.className = "px";
    c.width = n * k; c.height = n * k;
    c.style.width = (n * k) + "px"; c.style.height = (n * k) + "px";
    var x = c.getContext("2d");
    x.fillStyle = color || "#fff";
    for (var i = 0; i < g.length; i++) {
      if (g.charAt(i) !== "#") continue;
      x.fillRect((i % n) * k, Math.floor(i / n) * k, k, k);
    }
    return c;
  }

  /* подписи набраны растровым шрифтом — весь хром пиксельный */
  function lab(text, k, color) { return E.textCanvas(String(text), k || 2, color || "#F2F2F5", 1); }

  function labIn(parent, text, k, color) { parent.appendChild(lab(text, k, color)); return parent; }

  /* ---------- каркас ---------- */
  var app = el("div", "app");
  document.body.appendChild(app);

  var bar = el("div", "bar");
  var burgerBtn = el("button", "ibtn"); burgerBtn.type = "button"; burgerBtn.setAttribute("aria-label", "Menu");
  bar.appendChild(burgerBtn);
  bar.appendChild(el("div", "bar__sp"));
  var mark = el("div", "bar__mark");
  bar.appendChild(mark);
  bar.appendChild(el("div", "bar__sp"));
  var menuBtn = el("button", "ibtn"); menuBtn.type = "button"; menuBtn.setAttribute("aria-label", "Session actions");
  bar.appendChild(menuBtn);
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
  var ph = el("div", "input__ph");
  input.appendChild(ph);
  var sendBtn = el("button", "send"); sendBtn.type = "button"; sendBtn.setAttribute("aria-label", "Send");
  input.appendChild(sendBtn);
  foot.appendChild(input);
  app.appendChild(foot);

  var scrim = el("div", "scrim"); scrim.setAttribute("data-on", "false");
  app.appendChild(scrim);
  var sheet = el("div", "sheet"); sheet.setAttribute("data-on", "false");
  app.appendChild(sheet);
  var toastEl = el("div", "toast"); toastEl.setAttribute("data-on", "false"); toastEl.setAttribute("role", "status");
  app.appendChild(toastEl);

  /* ---------- состояние ---------- */
  var st = { busy: false, started: false, q: [] };
  var SEND = null;   /* в живом режиме сюда подставляется отправка на демон */

  function scroll() { feed.scrollTop = feed.scrollHeight; }

  var toastT;
  function toast(text, tone) {
    toastEl.textContent = "";
    toastEl.appendChild(px(tone === "bad" ? "cross" : "check", 2, tone === "bad" ? "#FF6B6B" : "#5BD68F"));
    toastEl.appendChild(el("span", "", text));
    toastEl.setAttribute("data-on", "true");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.setAttribute("data-on", "false"); }, 2600);
  }

  function setStrip(text, tone, spinner) {
    if (!text) { strip.setAttribute("data-on", "false"); return; }
    strip.textContent = "";
    strip.setAttribute("data-tone", tone || "");
    strip.appendChild(ind(spinner || "pc-ring-px"));
    strip.appendChild(lab(text, 2, tone === "wait" ? "#F2C14E" : tone === "ok" ? "#5BD68F" : "#F2F2F5"));
    strip.appendChild(el("div", "strip__sp"));
    var t = lab(stripClock(), 2, "#5A5A66");
    strip.appendChild(t);
    strip.setAttribute("data-on", "true");
    strip._t = t;
  }
  var t0 = 0;
  function stripClock() {
    if (!t0) return "0:00";
    var s = Math.floor((Date.now() - t0) / 1000);
    return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }
  setInterval(function () {
    if (strip.getAttribute("data-on") !== "true" || !strip._t || !t0) return;
    var fresh = lab(stripClock(), 2, "#5A5A66");
    strip.replaceChild(fresh, strip._t);
    strip._t = fresh;
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
    var n = el("div", "step " + (ok === false ? "step--bad" : "step--ok"));
    var g = el("span", "step__g");
    g.appendChild(px(ok === false ? "cross" : "check", 2, ok === false ? "#FF6B6B" : "#5BD68F"));
    n.appendChild(g);
    n.appendChild(el("span", "", text));
    feed.appendChild(n); scroll();
    return n;
  }

  function addTool(label, out) {
    var w = el("div", "");
    var b = el("button", "tool"); b.type = "button";
    b.appendChild(px("chev", 2, "#5A5A66"));
    b.appendChild(el("span", "", label));
    var o = el("div", "toolout", out || ""); o.setAttribute("data-on", "false");
    b.addEventListener("click", function () {
      var on = o.getAttribute("data-on") === "true";
      o.setAttribute("data-on", String(!on));
      scroll();
    });
    w.appendChild(b); w.appendChild(o);
    w._out = o; w._glyph = b.firstChild;
    feed.appendChild(w); scroll();
    return w;
  }

  function addCard(head, build) {
    var c = el("div", "card");
    var h = el("div", "card__h");
    h.appendChild(px("dot", 2, "#F2F2F5"));
    h.appendChild(lab(head, 2, "#F2F2F5"));
    c.appendChild(h);
    var b = el("div", "card__b");
    build(b, c);
    c.appendChild(b);
    feed.appendChild(c); scroll();
    return c;
  }

  function button(text, primary, onClick) {
    var b = el("button", "btn btn--w" + (primary ? " btn--p" : "")); b.type = "button";
    b.appendChild(lab(text, 2, primary ? "#000000" : "#F2F2F5"));
    b.addEventListener("click", onClick);
    return b;
  }

  /* ---------- сценарий ---------- */
  function planCard(onGo) {
    addCard("WANTS TO DO THIS", function (b) {
      b.appendChild(el("div", "card__t", C.plan.title));
      b.appendChild(el("div", "card__d", C.plan.intro));
      var list = el("div", "plan");
      C.plan.items.forEach(function (x, i) {
        var r = el("div", "plan__r");
        var n = el("span", "plan__n");
        n.appendChild(lab(String(i + 1), 2, "#5A5A66"));
        r.appendChild(n);
        var xx = el("span", "plan__x");
        xx.appendChild(el("span", "plan__t", x.t));
        xx.appendChild(el("span", "plan__d", x.d));
        r.appendChild(xx);
        list.appendChild(r);
      });
      b.appendChild(list);
      b.appendChild(el("div", "card__d", C.plan.touch));
      var acts = el("div", "acts");
      var go = button("GO AHEAD", true, function () {
        acts.remove();
        onGo();
      });
      var no = button("ANOTHER WAY", false, function () {
        acts.remove();
        addSay("Alright — tell me how you'd rather do it.");
        setBusy(false);
      });
      acts.appendChild(go); acts.appendChild(no);
      b.appendChild(acts);
    });
  }

  function askCard(q, options, onPick) {
    addCard("NEEDS YOU", function (b) {
      b.appendChild(el("div", "card__t", q));
      var acts = el("div", "acts");
      options.forEach(function (o, i) {
        acts.appendChild(button(o.t, i === 0, function () {
          acts.remove();
          onPick(o);
        }));
      });
      b.appendChild(acts);
    });
  }

  function setBusy(on) {
    st.busy = on;
    if (!on) {
      setStrip("WAITING ON YOU", "wait", "pc-dots");
      pump();
    }
  }

  /* проигрываем шаги вживую, один за другим */
  function play(list, done) {
    var i = 0;
    (function run() {
      if (i >= list.length) { done && done(); return; }
      var e = list[i++];
      if (e.type === "agent") { addSay(e.text, function () { setTimeout(run, 260); }); return; }
      if (e.type === "step") {
        addStep(e.text, e.tone !== "bad");
        if (e.tone === "bad") petAct("panic"); else if (/green|done/i.test(e.text)) petAct("cheer");
        setTimeout(run, REDUCED ? 0 : 780);
        return;
      }
      if (e.type === "tool") { addTool(e.label, e.out); setTimeout(run, REDUCED ? 0 : 620); return; }
      setTimeout(run, 300);
    })();
  }

  var FIRST = C.session.simple.filter(function (e) { return e.type === "step" || e.type === "agent"; });

  function firstRun(text) {
    st.started = true;
    setBusy(true);
    t0 = Date.now();
    setStrip("THINKING", "", "pc-ring-px");
    petAct("read");
    addYou(text);
    setTimeout(function () {
      addSay("Let me look at it first.", function () {
        setTimeout(function () {
          planCard(function () {
            setStrip("WORKING", "", "pc-ring-px");
            play(FIRST, function () {
              setBusy(false);
              petAct("cheer");
              fillChips(C.session.chips);
              ph.firstChild.textContent = C.session.placeholder;
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
    setStrip("WORKING", "", "pc-ring-px");
    addYou(text);
    petAct("read");

    if (/ship it/i.test(text)) {
      setTimeout(function () {
        askCard("Straight to main, or open a pull request?", [
          { t: "OPEN A PR", d: "safer" },
          { t: "STRAIGHT TO MAIN", d: "no review" }
        ], function (o) {
          addStep("You chose: " + o.t.toLowerCase(), true);
          runFollow(f);
        });
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
            addSay(f.sreply, function () { setBusy(false); petAct("cheer"); });
          }, 700);
        }, 500);
      });
    }, 380);
  }

  function send(text) {
    if (st.busy) {
      st.q.push(text);
      drawQueue();
      toast("Queued — it'll read it next");
      return;
    }
    clearIdle();
    if (SEND) { st.started = true; SEND(text); return; }
    if (!st.started) firstRun(text);
    else followUp(text);
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
    queue.appendChild(lab("QUEUED " + st.q.length, 2, "#8E8E99"));
    queue.appendChild(el("span", "", st.q[0]));
  }

  /* ---------- чипы и ввод ---------- */
  function fillChips(list) {
    chips.textContent = "";
    list.forEach(function (c) {
      var b = el("button", "chip", c); b.type = "button";
      b.addEventListener("click", function () { send(c); });
      chips.appendChild(b);
    });
  }

  sendBtn.addEventListener("click", function () {
    var first = chips.querySelector(".chip");
    if (first) send(first.textContent);
  });

  /* ---------- пустой экран ---------- */
  var idle;
  function showIdle() {
    idle = el("div", "idle");
    var p = el("div", "idle__pet");
    E.pet(p, E.active, "idle", 4);
    idle.appendChild(p);
    idle.appendChild(lab("WHAT SHOULD IT DO?", 2, "#F2F2F5"));
    idle.appendChild(lab("NOTHING IS RUNNING", 2, "#5A5A66"));
    feed.appendChild(idle);
  }
  function clearIdle() { if (idle) { idle.remove(); idle = null; } }

  /* ---------- нижний лист ---------- */
  function openSheet(title, rows, onPick) {
    sheet.textContent = "";
    var k = el("div", "sheet__k");
    k.appendChild(lab(title, 2, "#8E8E99"));
    sheet.appendChild(k);
    rows.forEach(function (r) {
      var b = el("button", "row"); b.type = "button";
      if (r.brand) { var g = el("span", "row__g"); g.appendChild(E.brand(r.brand, 18)); b.appendChild(g); }
      var x = el("span", "row__x");
      x.appendChild(el("span", "row__t", r.t));
      if (r.d) x.appendChild(el("span", "row__d", r.d));
      b.appendChild(x);
      var g2 = el("span", "row__g");
      g2.appendChild(px(r.on ? "check" : "chev", 2, r.on ? "#5BD68F" : "#5A5A66"));
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

  var MENU = [
    { t: "Model", d: "who does the work", go: "model" },
    { t: "Sessions", d: "what you ran before", go: "sessions" },
    { t: "How much it asks you", d: "permission level", go: "perms" }
  ];

  burgerBtn.addEventListener("click", function () {
    openSheet("MENU", MENU, function (r) {
      setTimeout(function () {
        if (r.go === "model") {
          var rows = [];
          C.models.forEach(function (g) {
            g.items.forEach(function (m) {
              rows.push({ t: m.n, d: g.co + " · " + m.d, brand: g.brand, on: m.n === st.model, crew: g.crew });
            });
          });
          openSheet("MODEL", rows, function (m) {
            st.model = m.t;
            if (m.crew && E.SH[m.crew]) E.setCrew(m.crew);
            drawMark();
            toast("Now working: " + m.t);
          });
        } else if (r.go === "sessions") {
          openSheet("SESSIONS", C.sessions.map(function (s) {
            return { t: s.project + " · " + C.states[s.state].t, d: s.sum, brand: E.brandOfCrew(s.crew) };
          }), function () { toast("Picked it back up"); });
        } else {
          openSheet("HOW MUCH IT ASKS YOU", C.perms.items.map(function (p) {
            return { t: p.t, d: p.d, on: !!p.on };
          }), function (p) { C.perms.items.forEach(function (x) { x.on = x.t === p.t; }); toast(p.t); });
        }
      }, 160);
    });
  });

  /* ---------- питомец ---------- */
  var pet;
  function petAct(a) { if (pet) pet.act(a); }

  /* ---------- старт ---------- */
  E.boot();
  st.model = "Claude Opus 5";

  function drawMark() {
    mark.textContent = "";
    mark.appendChild(lab("POCKETCODE", 2, "#F2F2F5"));
  }
  drawMark();

  burgerBtn.appendChild(px("burger", 2, "#8E8E99"));
  menuBtn.appendChild(px("dots", 2, "#8E8E99"));

  menuBtn.addEventListener("click", function () {
    openSheet("THIS SESSION", [
      { t: "Undo a step", d: "roll the code back" },
      { t: "Stop it", d: "keeps everything it did" },
      { t: "What's the pet up to", d: "ask it directly" }
    ], function (r) {
      if (/pet/i.test(r.t)) { pet && pet.say("Right now: " + pet.doing() + ".", 3200); return; }
      if (/undo/i.test(r.t)) { toast("Rolled back one step"); petAct("wave"); return; }
      setBusy(false); setStrip("STOPPED", "wait", "pc-dots"); toast("Stopped — nothing lost");
    });
  });
  sendBtn.appendChild(px("send", 2, "#000000"));
  ph.appendChild(el("span", "", C.session.freshPlaceholder));
  ph.appendChild(ind("pc-caret"));
  fillChips(C.session.freshChips);
  showIdle();
  setStrip(null);

  pet = new E.Pet(stage, 3);

  window.PCUI = {
    addYou: addYou, addSay: addSay, addStep: addStep, addTool: addTool,
    addCard: addCard, planCard: planCard, askCard: askCard, button: button,
    setStrip: setStrip, setBusy: setBusy, toast: toast, scroll: scroll,
    clearIdle: clearIdle, fillChips: fillChips, petAct: petAct,
    lab: lab, px: px, el: el, ind: ind, feed: feed,
    startClock: function () { t0 = Date.now(); },
    toolDone: function (node, ok, out) {
      if (!node) return;
      if (node._out) node._out.textContent = out || "";
      if (node._glyph && node._glyph.parentNode) {
        node._glyph.parentNode.replaceChild(px(ok ? "check" : "cross", 2, ok ? "#5BD68F" : "#FF6B6B"), node._glyph);
      }
      scroll();
    },
    setSender: function (fn) { SEND = fn; },
    state: st
  };

  window.addEventListener("resize", function () { scroll(); });
})();
