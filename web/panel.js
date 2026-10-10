/* ============================================================
   Выдвижная панель настроек. Открывается из точки касания,
   внутри — стопка страниц, которые уезжают вбок.
   ============================================================ */
(function () {
  "use strict";
  var E = window.PC, U = window.PCUI, S = window.PC_SET;
  if (!E || !U || !S) return;
  var el = U.el, ic = U.ic;

  var host = document.querySelector(".app");
  var scrim = el("div", "pnl-scrim");
  scrim.setAttribute("data-on", "false");
  var panel = el("aside", "pnl");
  panel.setAttribute("data-on", "false");
  var stack = el("div", "pnl__stack");
  panel.appendChild(stack);
  host.appendChild(scrim);
  host.appendChild(panel);

  var pages = [];

  function head(title, onBack) {
    var h = el("div", "pnl__h");
    if (onBack) {
      var b = el("button", "pnl__back"); b.type = "button";
      b.setAttribute("aria-label", "Back");
      b.appendChild(ic("right", 18, 2));
      b.addEventListener("click", onBack);
      h.appendChild(b);
    }
    h.appendChild(el("div", "pnl__t", title));
    return h;
  }

  function page(title, build, onBack) {
    var p = el("div", "pnl__p");
    p.appendChild(head(title, onBack));
    var body = el("div", "pnl__b");
    build(body);
    p.appendChild(body);
    return p;
  }

  function rowOf(o, onTap) {
    var r = el("button", "pnl__r fx-press"); r.type = "button";
    var x = el("span", "pnl__rx");
    x.appendChild(el("span", "pnl__rt", o.title));
    if (o.desc) x.appendChild(el("span", "pnl__rd", o.desc));
    r.appendChild(x);
    if (o.control === "toggle") {
      var sw = el("span", "pnl__sw");
      sw.setAttribute("data-on", String(!!o.value));
      sw.appendChild(el("i"));
      r.appendChild(sw);
      r.addEventListener("click", function () {
        o.value = !o.value;
        sw.setAttribute("data-on", String(o.value));
      });
      return r;
    }
    if (o.value !== undefined && o.value !== null) r.appendChild(el("span", "pnl__rv", String(o.value)));
    if (o.control !== "value") { var g = el("span", "pnl__rg"); g.appendChild(ic("right", 16, 2)); r.appendChild(g); }
    if (onTap) r.addEventListener("click", function () { onTap(o, r); });
    return r;
  }

  function push(p) {
    pages.push(p);
    stack.appendChild(p);
    requestAnimationFrame(function () {
      p.setAttribute("data-in", "true");
      if (window.FX) FX.stagger(p, ".pnl__r, .pnl__sec");
    });
  }

  function pop() {
    if (pages.length < 2) return;
    var p = pages.pop();
    p.setAttribute("data-in", "false");
    setTimeout(function () { if (p.parentNode) p.remove(); }, 240);
  }

  /* ---------- страницы ---------- */

  function pickList(title, items, current, onPick) {
    push(page(title, function (b) {
      items.forEach(function (it) {
        var r = rowOf({ title: it.title, desc: it.desc, control: "value" }, null);
        if (it.id === current) {
          var g = el("span", "pnl__rg");
          g.appendChild(ic("check", 17, 2.2, "var(--ok)"));
          r.appendChild(g);
        }
        r.addEventListener("click", function () { onPick(it); pop(); });
        b.appendChild(r);
      });
    }, pop));
  }

  function openEffort() {
    pickList("Thinking effort",
      S.effort.levels.map(function (l) { return { id: l.id, title: l.label, desc: l.effect }; }),
      state.effort,
      function (it) {
        state.effort = it.id;
        U.toast(S.microcopy && S.microcopy.effort_up ? S.microcopy.effort_up : ("Effort: " + it.title));
        refreshRoot();
      });
  }

  function openLanguage() {
    pickList("Language",
      S.languages.languages.map(function (l) {
        return { id: l.code, title: l.native || l.name, desc: l.name !== (l.native || l.name) ? l.name : null };
      }),
      state.lang,
      function (it) {
        state.lang = it.id;
        U.toast((S.microcopy && S.microcopy.language_switch) || ("Language: " + it.title));
        refreshRoot();
      });
  }

  function openTheme() {
    pickList("Theme", [
      { id: "light", title: "Light" },
      { id: "dark", title: "Dark" }
    ], document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
    function (it) {
      if (it.id === "dark") document.documentElement.setAttribute("data-theme", "dark");
      else document.documentElement.removeAttribute("data-theme");
      try { localStorage.setItem("pc-theme", it.id); } catch (e) {}
      refreshRoot();
    });
  }

  function openLimits() {
    close();
    setTimeout(function () { U.openLimits && U.openLimits(); }, 220);
  }

  var state = { effort: (S.effort && S.effort.default) || "balanced", lang: "en" };

  function labelFor(id) {
    if (id === "effort") {
      var l = S.effort.levels.filter(function (x) { return x.id === state.effort; })[0];
      return l ? l.label : null;
    }
    if (id === "language") {
      var g = S.languages.languages.filter(function (x) { return x.code === state.lang; })[0];
      return g ? (g.native || g.name) : null;
    }
    if (id === "theme") return document.documentElement.getAttribute("data-theme") === "dark" ? "Dark" : "Light";
    if (id === "model") return U.state ? U.state.model : null;
    return undefined;
  }

  function root() {
    return page(S.drawer.title || "Settings", function (b) {
      S.drawer.groups.forEach(function (g) {
        if (g.header) b.appendChild(el("div", "pnl__sec", g.header));
        g.rows.forEach(function (r0) {
          var r = Object.assign({}, r0);
          var lv = labelFor(r.id);
          if (lv !== undefined) r.value = lv;
          b.appendChild(rowOf(r, function (o) {
            if (o.id === "effort") return openEffort();
            if (o.id === "language") return openLanguage();
            if (o.id === "theme") return openTheme();
            if (o.id === "model") { close(); setTimeout(function () { U.openModels && U.openModels(); }, 220); return; }
            if (o.id === "usage" || o.id === "limits") return openLimits();
            if (o.id === "permissions") { close(); setTimeout(function () { U.openPerms && U.openPerms(); }, 220); return; }
            U.toast("Not wired yet: " + o.title);
          }));
        });
      });
    }, null);
  }

  function refreshRoot() {
    while (pages.length) { var p = pages.pop(); if (p.parentNode) p.remove(); }
    push(root());
  }

  /* ---------- открыть и закрыть ---------- */

  function open(x, y) {
    while (pages.length) { var p = pages.pop(); if (p.parentNode) p.remove(); }
    push(root());
    scrim.setAttribute("data-on", "true");
    panel.setAttribute("data-on", "true");
    if (window.FX) {
      FX.reveal(panel, x, y);
      /* как только вход отыгран — снимаем классы, дальше состоянием владеет CSS */
      clearTimeout(panel._fxt);
      panel._fxt = setTimeout(function () {
        panel.classList.remove("fx-reveal", "fx-from-left", "fx-from-right", "fx-side");
        panel.style.opacity = "";
      }, 420);
    }
  }

  function close() {
    scrim.setAttribute("data-on", "false");
    if (window.FX) FX.dismiss(panel, function () { panel.setAttribute("data-on", "false"); });
    else panel.setAttribute("data-on", "false");
  }

  scrim.addEventListener("click", close);
  window.PCPANEL = { open: open, close: close, state: state };
})();
