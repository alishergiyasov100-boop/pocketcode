/* ============================================================
   Свои провайдеры: хранение, проверка, выбор.
   В живом режиме всё уходит в демон, в демо — в localStorage.
   ============================================================ */
(function () {
  "use strict";
  var LIVE = !!window.PC_LIVE;
  var KEY = "pc-providers";

  var store = { list: [], active: null };

  function builtin() {
    var out = [];
    if (window.PC_CONTENT && PC_CONTENT.models) {
      PC_CONTENT.models.forEach(function (g) {
        out.push({
          id: "b:" + g.brand, name: g.co, brand: g.brand, builtin: true,
          models: g.items.map(function (m) { return m.n; })
        });
      });
    }
    return out;
  }

  function load(done) {
    if (!LIVE) {
      try { store = JSON.parse(localStorage.getItem(KEY)) || store; } catch (e) {}
      return done && done(store);
    }
    fetch("/api/providers").then(function (r) { return r.json(); }).then(function (j) {
      store.list = j.providers || [];
      store.active = j.active || null;
      done && done(store);
    })["catch"](function () { done && done(store); });
  }

  function save(done) {
    if (!LIVE) {
      try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
      return done && done({ ok: true });
    }
    fetch("/api/providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providers: store.list, active: store.active })
    }).then(function (r) { return r.json(); }).then(function (j) { done && done(j); })
      ["catch"](function (e) { done && done({ ok: false, error: String(e) }); });
  }

  /* проверку всегда делает демон: чужой шлюз не отдаёт CORS */
  function test(baseUrl, token, done) {
    if (!LIVE) {
      return done({ ok: false, error: "start the engine in Termux to test a provider" });
    }
    fetch("/api/providers/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseUrl: baseUrl, token: token })
    }).then(function (r) { return r.json(); }).then(done)
      ["catch"](function (e) { done({ ok: false, error: String(e) }); });
  }

  function add(p) {
    p.id = p.id || ("c:" + Date.now().toString(36));
    var i = store.list.findIndex(function (x) { return x.id === p.id; });
    if (i >= 0) store.list[i] = p; else store.list.push(p);
    return p;
  }

  function remove(id) {
    store.list = store.list.filter(function (x) { return x.id !== id; });
    if (store.active === id) store.active = null;
  }

  window.PCPROV = {
    live: LIVE,
    store: store,
    builtin: builtin,
    load: load, save: save, test: test, add: add, remove: remove,
    all: function () { return builtin().concat(store.list); }
  };
})();
