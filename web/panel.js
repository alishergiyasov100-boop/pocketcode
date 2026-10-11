/* ============================================================
   Настройки. Панель разворачивается из точки касания,
   внутри — стопка страниц, карточные группы, свои провайдеры.
   ============================================================ */
(function () {
  "use strict";
  var E = window.PC, U = window.PCUI, S = window.PC_SET, PR = window.PCPROV;
  if (!E || !U || !S) return;
  var el = U.el, ic = U.ic;

  var app = document.querySelector(".app");
  var scrim = el("div", "pnl-scrim"); scrim.setAttribute("data-on", "false");
  var panel = el("aside", "pnl"); panel.setAttribute("data-on", "false");
  var stack = el("div", "pnl__stack");
  panel.appendChild(stack);
  app.appendChild(scrim);
  app.appendChild(panel);

  var pages = [];
  var state = {
    effort: (S.effort && S.effort.default) || "balanced",
    lang: "en",
    pet: true
  };

  /* ---------- кирпичи ---------- */

  function page(title, build, back) {
    var p = el("div", "pnl__p");
    var h = el("div", "pnl__h");
    if (back) {
      var b = el("button", "pnl__back"); b.type = "button";
      b.setAttribute("aria-label", "Back");
      b.appendChild(ic("right", 18, 2));
      b.addEventListener("click", back);
      h.appendChild(b);
    }
    h.appendChild(el("div", "pnl__t", title));
    p.appendChild(h);
    var body = el("div", "pnl__b");
    build(body);
    p.appendChild(body);
    return p;
  }

  function group(body, header) {
    if (header) body.appendChild(el("div", "pnl__sec", header));
    var c = el("div", "pnl__card");
    body.appendChild(c);
    return c;
  }

  function row(card, o) {
    var r = el("button", "pnl__r fx-press fx-press-sm"); r.type = "button";
    var x = el("span", "pnl__rx");
    x.appendChild(el("span", "pnl__rt", o.title));
    if (o.desc) x.appendChild(el("span", "pnl__rd", o.desc));
    r.appendChild(x);

    if (o.toggle) {
      var sw = el("span", "pnl__sw");
      sw.setAttribute("data-on", String(!!o.value));
      sw.appendChild(el("i"));
      r.appendChild(sw);
      r.addEventListener("click", function () {
        var v = sw.getAttribute("data-on") !== "true";
        sw.setAttribute("data-on", String(v));
        o.onToggle && o.onToggle(v);
      });
      card.appendChild(r);
      return r;
    }
    if (o.value != null) r.appendChild(el("span", "pnl__rv", String(o.value)));
    if (o.check) { var k = el("span", "pnl__rg"); k.appendChild(ic("check", 17, 2.2, "var(--ok)")); r.appendChild(k); }
    else if (!o.flat) { var g = el("span", "pnl__rg"); g.appendChild(ic("right", 16, 2)); r.appendChild(g); }
    if (o.onTap) r.addEventListener("click", function () { o.onTap(r); });
    card.appendChild(r);
    return r;
  }

  function field(body, label, opts) {
    var w = el("label", "pnl__f");
    w.appendChild(el("span", "pnl__fl", label));
    var i = document.createElement("input");
    i.className = "pnl__fi";
    i.type = opts.type || "text";
    i.placeholder = opts.placeholder || "";
    i.value = opts.value || "";
    i.setAttribute("autocapitalize", "off");
    i.setAttribute("autocomplete", "off");
    i.setAttribute("spellcheck", "false");
    w.appendChild(i);
    if (opts.hint) w.appendChild(el("span", "pnl__fh", opts.hint));
    body.appendChild(w);
    return i;
  }

  function push(p) {
    pages.push(p);
    stack.appendChild(p);
    requestAnimationFrame(function () {
      p.setAttribute("data-in", "true");
      if (window.FX) FX.stagger(p, ".pnl__card, .pnl__sec, .pnl__f, .pnl__note");
    });
  }
  function pop() {
    if (pages.length < 2) return;
    var p = pages.pop();
    p.setAttribute("data-in", "false");
    setTimeout(function () { if (p.parentNode) p.remove(); }, 260);
  }
  function reset() { while (pages.length) { var p = pages.pop(); if (p.parentNode) p.remove(); } }

  /* ---------- страницы ---------- */

  function effortPage() {
    push(page("Thinking effort", function (b) {
      b.appendChild(el("div", "pnl__note", "Higher is slower and costs more. It is not always better."));
      var c = group(b);
      S.effort.levels.forEach(function (l) {
        row(c, {
          title: l.label, desc: l.effect,
          check: l.id === state.effort,
          onTap: function () {
            state.effort = l.id;
            U.toast("Effort: " + l.label);
            pop(); refresh();
          }
        });
      });
    }, pop));
  }

  function languagePage() {
    push(page("Language", function (b) {
      var c = group(b);
      S.languages.languages.forEach(function (l) {
        row(c, {
          title: l.native || l.name,
          desc: (l.name !== (l.native || l.name) ? l.name : null) + (l.rtl ? " · right to left" : ""),
          check: l.code === state.lang,
          onTap: function () { state.lang = l.code; U.toast(l.native || l.name); pop(); refresh(); }
        });
      });
    }, pop));
  }

  function themePage() {
    var cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    push(page("Theme", function (b) {
      var c = group(b);
      [["light", "Light"], ["dark", "Dark"]].forEach(function (t) {
        row(c, {
          title: t[1], check: cur === t[0],
          onTap: function () {
            if (t[0] === "dark") document.documentElement.setAttribute("data-theme", "dark");
            else document.documentElement.removeAttribute("data-theme");
            try { localStorage.setItem("pc-theme", t[0]); } catch (e) {}
            pop(); refresh();
          }
        });
      });
    }, pop));
  }

  function modelPage() {
    push(page("Model", function (b) {
      (PR ? PR.all() : []).forEach(function (p) {
        if (!p.models || !p.models.length) return;
        var c = group(b, p.name + (p.builtin ? "" : " · yours"));
        p.models.forEach(function (m) {
          row(c, {
            title: m,
            check: U.state && U.state.model === m,
            onTap: function () {
              U.state.model = m;
              if (p.brand) U.state.brand = p.brand;
              if (!p.builtin && PR) { PR.store.active = p.id; p.model = m; PR.save(); }
              U.toast("Now working: " + m);
              U.syncModel && U.syncModel();
              pop(); refresh();
            }
          });
        });
      });
    }, pop));
  }

  /* ---------- свои провайдеры ---------- */

  function providerForm(existing) {
    push(page(existing ? "Edit provider" : "Add provider", function (b) {
      b.appendChild(el("div", "pnl__note",
        "Anything that answers the Anthropic shape at /v1/messages — your own gateway, a proxy, a self-hosted model."));

      var name = field(b, "Name", { placeholder: "My gateway", value: existing ? existing.name : "" });
      var url = field(b, "Base URL", { placeholder: "https://…", value: existing ? existing.baseUrl : "", hint: "without /v1" });
      var key = field(b, "Key", { type: "password", placeholder: "optional", value: existing ? existing.token : "" });

      var result = el("div", "pnl__res");
      b.appendChild(result);

      var found = existing && existing.models ? existing.models.slice() : null;

      var acts = el("div", "pnl__acts");
      var testBtn = el("button", "pnl__btn", "Test connection"); testBtn.type = "button";
      var saveBtn = el("button", "pnl__btn pnl__btn--p", "Save"); saveBtn.type = "button";
      acts.appendChild(testBtn); acts.appendChild(saveBtn);
      b.appendChild(acts);

      if (existing) {
        var del = el("button", "pnl__btn pnl__btn--d", "Remove this provider"); del.type = "button";
        del.addEventListener("click", function () {
          if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "Tap again to remove"; return; }
          PR.remove(existing.id); PR.save();
          U.toast("Removed"); pop(); refresh();
        });
        b.appendChild(del);
      }

      testBtn.addEventListener("click", function () {
        var u = url.value.trim();
        if (!u) { result.className = "pnl__res is-bad"; result.textContent = "Put a URL in first."; return; }
        result.className = "pnl__res is-wait";
        result.textContent = "Asking it what it serves…";
        testBtn.disabled = true;
        PR.test(u, key.value.trim(), function (r) {
          testBtn.disabled = false;
          if (r.ok) {
            found = r.models;
            result.className = "pnl__res is-ok";
            result.textContent = "Answered in " + r.ms + "ms · " + r.models.length + " models";
          } else {
            result.className = "pnl__res is-bad";
            result.textContent = r.error || "No answer.";
          }
        });
      });

      saveBtn.addEventListener("click", function () {
        var u = url.value.trim();
        if (!u) { result.className = "pnl__res is-bad"; result.textContent = "A base URL is required."; return; }
        var p = PR.add({
          id: existing ? existing.id : null,
          name: name.value.trim() || "My gateway",
          baseUrl: u,
          token: key.value.trim(),
          models: found || (existing && existing.models) || []
        });
        PR.store.active = p.id;
        PR.save(function (j) {
          U.toast(j && j.ok === false ? "Saved on this device only" : "Provider saved");
        });
        pop(); refresh();
      });
    }, pop));
  }

  function providersPage() {
    push(page("Providers", function (b) {
      var mine = PR ? PR.store.list : [];
      if (mine.length) {
        var c = group(b, "Yours");
        mine.forEach(function (p) {
          row(c, {
            title: p.name,
            desc: p.baseUrl,
            value: p.models && p.models.length ? p.models.length + " models" : null,
            onTap: function () { providerForm(p); }
          });
        });
      }
      var add = group(b, mine.length ? null : "Yours");
      row(add, { title: "Add a provider", desc: "Your own gateway or proxy", onTap: function () { providerForm(null); } });

      var c2 = group(b, "Built in");
      (PR ? PR.builtin() : []).forEach(function (p) {
        row(c2, { title: p.name, value: p.models.length + " models", flat: true });
      });

      if (PR && !PR.live) {
        b.appendChild(el("div", "pnl__note", "Testing a provider needs the engine running in Termux."));
      }
    }, pop));
  }

  /* ---------- корень ---------- */

  function accountCard(body) {
    var c = el("button", "pnl__acct fx-press"); c.type = "button";
    var av = el("span", "pnl__av", (S.drawer && S.drawer.user ? S.drawer.user[0] : "A"));
    c.appendChild(av);
    var x = el("span", "pnl__ax");
    x.appendChild(el("span", "pnl__an", "Alisher Giyasov"));
    var u = (U.usage && U.usage()) || null;
    x.appendChild(el("span", "pnl__ap", u && u.plan ? u.plan : "Your own key"));
    c.appendChild(x);
    var g = el("span", "pnl__rg"); g.appendChild(ic("right", 16, 2)); c.appendChild(g);
    c.addEventListener("click", function () { close(); setTimeout(function () { U.openLimits && U.openLimits(); }, 240); });
    body.appendChild(c);
  }

  function effortLabel() {
    var l = S.effort.levels.filter(function (x) { return x.id === state.effort; })[0];
    return l ? l.label : null;
  }
  function langLabel() {
    var g = S.languages.languages.filter(function (x) { return x.code === state.lang; })[0];
    return g ? (g.native || g.name) : null;
  }

  function root() {
    return page("Settings", function (b) {
      accountCard(b);

      var c1 = group(b, "Engine");
      row(c1, { title: "Model", value: U.state ? U.state.model : null, onTap: modelPage });
      row(c1, { title: "Thinking effort", value: effortLabel(), onTap: effortPage });
      row(c1, {
        title: "Providers",
        value: PR ? String(PR.store.list.length || "built in") : null,
        desc: "Point it at your own gateway",
        onTap: providersPage
      });

      var c2 = group(b, "Behaviour");
      row(c2, {
        title: "Ask before acting",
        value: (PC_CONTENT.perms.items.filter(function (p) { return p.on; })[0] || {}).t,
        onTap: function () { close(); setTimeout(function () { U.openPerms && U.openPerms(); }, 240); }
      });
      row(c2, { title: "Custom instructions", desc: "Standing notes it reads every session", onTap: function () { U.toast("Not wired yet"); } });

      var c3 = group(b, "App");
      row(c3, { title: "Language", value: langLabel(), onTap: languagePage });
      row(c3, { title: "Theme", value: document.documentElement.getAttribute("data-theme") === "dark" ? "Dark" : "Light", onTap: themePage });
      row(c3, {
        title: "Show the pet", toggle: true, value: state.pet,
        onToggle: function (v) {
          state.pet = v;
          var l = document.querySelector(".petlayer");
          if (l) l.style.display = v ? "" : "none";
        }
      });

      var c4 = group(b, "Session");
      row(c4, { title: "New session", desc: "Start from a blank page", onTap: function () { close(); setTimeout(function () { U.newSession && U.newSession(); }, 240); } });
      row(c4, { title: "Past sessions", onTap: function () { close(); setTimeout(function () { U.openSessions && U.openSessions(); }, 240); } });
      row(c4, { title: "Usage and limits", onTap: function () { close(); setTimeout(function () { U.openLimits && U.openLimits(); }, 240); } });
      row(c4, {
        title: "Project folder",
        desc: "Where the agent actually works",
        value: (U.usage && U.usage() && U.usage().project) || null,
        onTap: function () { close(); setTimeout(function () { U.openProjects && U.openProjects(); }, 240); }
      });

      b.appendChild(el("div", "pnl__note", "PocketCode V1 · the engine runs in Termux"));
    }, null);
  }

  function refresh() { reset(); push(root()); }

  function open(x, y) {
    if (PR) PR.load(function () { reset(); push(root()); });
    else { reset(); push(root()); }
    scrim.setAttribute("data-on", "true");
    panel.setAttribute("data-on", "true");
    if (window.FX) {
      FX.reveal(panel, x, y);
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
