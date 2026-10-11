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
            savePrefs({ effort: l.id }, function (ok) {
              U.toast(ok ? "Effort: " + l.label : "Saved here, the engine did not answer", ok ? "" : "bad");
            });
            pop(); refresh();
          }
        });
      });
    }, pop));
  }

  function languagePage() {
    push(page("Reply language", function (b) {
      b.appendChild(el("div", "pnl__note",
        "The language it writes back in. The app's own buttons stay English."));
      var c = group(b);
      S.languages.languages.forEach(function (l) {
        row(c, {
          title: l.native || l.name,
          desc: (l.name !== (l.native || l.name) ? l.name : null) + (l.rtl ? " · right to left" : ""),
          check: l.code === state.lang,
          onTap: function () {
            state.lang = l.code;
            savePrefs({ language: l.code, languageName: l.english || l.name }, function (ok) {
              U.toast(ok ? (l.native || l.name) : "Saved here, the engine did not answer", ok ? "" : "bad");
            });
            pop(); refresh();
          }
        });
      });
    }, pop));
  }

  function notesPage() {
    push(page("Custom instructions", function (b) {
      b.appendChild(el("div", "pnl__note",
        "Goes into every session as standing orders. Good for how you like code written, " +
        "what to never touch, what the project is."));

      var w = el("label", "pnl__f");
      w.appendChild(el("span", "pnl__fl", "Notes"));
      var ta = document.createElement("textarea");
      ta.className = "pnl__fi pnl__ta";
      ta.rows = 7;
      ta.placeholder = "Keep comments in Russian. Never touch the migrations folder.";
      ta.value = state.instructions || "";
      ta.setAttribute("autocapitalize", "sentences");
      ta.setAttribute("spellcheck", "false");
      w.appendChild(ta);
      b.appendChild(w);

      var acts = el("div", "pnl__acts");
      var save = el("button", "pnl__btn pnl__btn--go", "Save"); save.type = "button";
      save.addEventListener("click", function () {
        state.instructions = ta.value;
        save.disabled = true; save.textContent = "Saving…";
        savePrefs({ instructions: ta.value }, function (ok) {
          U.toast(ok ? "It will read this from now on" : "The engine did not answer", ok ? "" : "bad");
          pop(); refresh();
        });
      });
      acts.appendChild(save);

      if (state.instructions) {
        var clr = el("button", "pnl__btn", "Clear"); clr.type = "button";
        clr.addEventListener("click", function () {
          state.instructions = "";
          savePrefs({ instructions: "" }, function () { U.toast("Cleared"); pop(); refresh(); });
        });
        acts.appendChild(clr);
      }
      b.appendChild(acts);
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

  /* настройка имеет смысл только если доезжает до агента */
  function savePrefs(patch, done) {
    if (!window.PC_LIVE) { done && done(true); return; }
    fetch("/api/prefs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    }).then(function (r) { return r.json(); }).then(function (j) {
      done && done(!!j.ok);
    })["catch"](function () { done && done(false); });
  }
  function loadPrefs(cb) {
    if (!window.PC_LIVE) return cb && cb();
    fetch("/api/prefs").then(function (r) { return r.json(); }).then(function (j) {
      if (j.effort) state.effort = j.effort;
      if (j.language) state.lang = j.language;
      state.instructions = j.instructions || "";
      cb && cb();
    })["catch"](function () { cb && cb(); });
  }

  /* ---------- поиск ---------- */
  var searchState = { on: false, hint: "", endpoint: "", loaded: false };

  function loadSearch(cb) {
    if (!window.PC_LIVE) { searchState.loaded = true; return cb && cb(); }
    fetch("/api/search").then(function (r) { return r.json(); }).then(function (j) {
      searchState.on = !!j.on;
      searchState.hint = j.hint || "";
      searchState.endpoint = j.endpoint || "";
      searchState.loaded = true;
      cb && cb();
    })["catch"](function () { searchState.loaded = true; cb && cb(); });
  }

  function searchPage() {
    push(page("Web search", function (b) {
      var c = group(b, searchState.on ? "On" : "Off");
      row(c, {
        title: "Status",
        value: searchState.on ? "ready" + (searchState.hint ? " · " + searchState.hint : "") : "no key yet",
        flat: true
      });

      b.appendChild(el("div", "pnl__note",
        "Its own tool, not the built-in one — that goes through Anthropic and cannot reach your gateway. " +
        "A free key with 2500 searches comes from serper.dev."));

      var key = field(b, "Search key", {
        placeholder: searchState.on ? "already set — paste to replace" : "paste the key",
        type: "password"
      });

      var acts = el("div", "pnl__acts");
      var save = el("button", "pnl__btn pnl__btn--go", searchState.on ? "Replace the key" : "Turn it on");
      save.type = "button";
      save.addEventListener("click", function () {
        var v = key.value.trim();
        if (!v) { U.toast("Paste a key first", "bad"); return; }
        save.disabled = true; save.textContent = "Saving…";
        fetch("/api/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: v })
        }).then(function (r) { return r.json(); }).then(function (j) {
          searchState.on = !!j.on;
          U.toast(j.on ? "Web search is on" : "Could not turn it on", j.on ? "" : "bad");
          pop(); refresh();
        })["catch"](function () {
          save.disabled = false; save.textContent = "Turn it on";
          U.toast("The engine did not answer", "bad");
        });
      });
      acts.appendChild(save);

      if (searchState.on) {
        var off = el("button", "pnl__btn", "Turn it off");
        off.type = "button";
        off.addEventListener("click", function () {
          fetch("/api/search", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ key: "" })
          }).then(function () {
            searchState.on = false;
            U.toast("Web search is off");
            pop(); refresh();
          })["catch"](function () { U.toast("The engine did not answer", "bad"); });
        });
        acts.appendChild(off);
      }
      b.appendChild(acts);
    }, pop));
  }

  function modelPage() {
    push(page("Model", function (b) {
      var holder = el("div", "");
      b.appendChild(holder);
      holder.appendChild(el("div", "pnl__note", "Reading the catalogue…"));
      U.fetchModels(function (groups, err) {
        holder.textContent = "";
        if (err) holder.appendChild(el("div", "pnl__note", "Showing examples — " + err));
        groups.forEach(function (g) {
          var c = group(holder, g.co);
          g.items.forEach(function (m) {
            row(c, {
              title: m.n,
              check: U.state && U.state.model === m.n,
              onTap: function () {
                U.state.model = m.n;
                if (g.brand) U.state.brand = g.brand;
                if (g.crew && window.PC.SH[g.crew]) window.PC.setCrew(g.crew);
                if (window.__pcws) window.__pcws.send(JSON.stringify({ t: "model", model: m.n }));
                U.toast("Now working: " + m.n);
                U.syncModel && U.syncModel();
                pop(); refresh();
              }
            });
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
      row(c1, {
        title: "Web search",
        value: searchState.on ? "on" : "off",
        desc: "Lets it look things up and read pages",
        onTap: searchPage
      });

      var c2 = group(b, "Behaviour");
      row(c2, {
        title: "Ask before acting",
        value: (PC_CONTENT.perms.items.filter(function (p) { return p.on; })[0] || {}).t,
        onTap: function () { close(); setTimeout(function () { U.openPerms && U.openPerms(); }, 240); }
      });
      row(c2, {
        title: "Custom instructions",
        desc: "Standing notes it reads every session",
        value: state.instructions ? "set" : null,
        onTap: notesPage
      });

      var c3 = group(b, "App");
      row(c3, {
        title: "Reply language",
        desc: "What it answers in, not the app's own words",
        value: langLabel(),
        onTap: languagePage
      });
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
        value: (U.state && U.state.project) || (U.usage && U.usage() && U.usage().project) || null,
        onTap: function () { close(); setTimeout(function () { U.openProjects && U.openProjects(); }, 240); }
      });

      b.appendChild(el("div", "pnl__note", "PocketCode V1 · the engine runs in Termux"));
    }, null);
  }

  function refresh() { reset(); push(root()); }

  function open(x, y) {
    var draw = function () { reset(); push(root()); };
    loadSearch(function () { loadPrefs(function () { if (PR) PR.load(draw); else draw(); }); });
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
