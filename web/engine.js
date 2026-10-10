/* ============================================================
   PocketCode engine — спрайты, пиксельный шрифт, питомец.
   Выделено из app.js, общее для постера и минимального приложения.
   ============================================================ */
(function () {
  "use strict";

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; }
  function frag(html) { var t = document.createElement("template"); t.innerHTML = html; return t.content.firstElementChild; }

  /* ---------- спрайты ---------- */
  function Sheet(def) {
    this.def = def; this.w = def.w; this.h = def.h; this.cache = {}; this.anims = {};
    def.anims.forEach(function (a) { this.anims[a.name] = a; }, this);
  }
  Sheet.prototype.frameCanvas = function (anim, i) {
    var k = anim + i; if (this.cache[k]) return this.cache[k];
    var a = this.anims[anim] || this.def.anims[0];
    var rows = a.frames[i % a.frames.length];
    var c = document.createElement("canvas"); c.width = this.w; c.height = this.h;
    var ctx = c.getContext("2d"), img = ctx.createImageData(this.w, this.h), pal = this.def.pal;
    for (var y = 0; y < this.h; y++) {
      var r = rows[y] || "";
      for (var x = 0; x < this.w; x++) {
        var pi = parseInt(r.charAt(x), 36);
        if (!pi || isNaN(pi)) continue;
        var hex = pal[pi]; if (!hex || hex === "transparent") continue;
        var o = (y * this.w + x) * 4;
        img.data[o] = parseInt(hex.substr(1, 2), 16);
        img.data[o + 1] = parseInt(hex.substr(3, 2), 16);
        img.data[o + 2] = parseInt(hex.substr(5, 2), 16);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0); this.cache[k] = c; return c;
  };
  Sheet.prototype.n = function (a) { return (this.anims[a] || this.def.anims[0]).frames.length; };
  Sheet.prototype.fps = function (a) { return (this.anims[a] || this.def.anims[0]).fps || 6; };
  Sheet.prototype.blit = function (t, anim, i, s, flip) {
    if (!this.anims[anim]) anim = "idle";
    var src = this.frameCanvas(anim, i), ctx = t.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, t.width, t.height);
    ctx.save();
    if (flip) { ctx.translate(t.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src, 0, 0, this.w, this.h, 0, 0, this.w * s, this.h * s);
    ctx.restore();
  };

  var SH = {};

  function cnv(id, s) {
    var sh = SH[id], c = document.createElement("canvas");
    c.className = "px"; c.width = sh.w * s; c.height = sh.h * s;
    c.style.width = (sh.w * s) + "px"; c.style.height = (sh.h * s) + "px";
    return c;
  }

  /* ---------- общий rAF ---------- */
  var tickers = [], rafQueued = false, lastPump = 0;

  function tick(fn) { tickers.push(fn); schedule(); }

  function schedule() {
    if (rafQueued) return;          /* ровно одна цепочка кадров, никогда не больше */
    rafQueued = true;
    requestAnimationFrame(frame);
  }

  function frame(t) { rafQueued = false; pump(t); schedule(); }

  function pump(t) {
    lastPump = t;
    for (var i = 0; i < tickers.length; i++) {
      try { tickers[i](t); }
      catch (e) {
        /* один сбойный тикер не должен ронять всю анимацию страницы */
        (window.__tickErrors = window.__tickErrors || []).push(String(e && e.stack || e));
        tickers.splice(i--, 1);
      }
    }
  }

  /* если вкладка в фоне и кадры придушены — прокручиваем вручную, но без новой цепочки */
  setInterval(function () {
    var now = performance.now();
    if (tickers.length && now - lastPump > 400) pump(now);
  }, 250);

  function pet(host, id, anim, s, flip) {
    var sh = SH[id], c = cnv(id, s);
    host.appendChild(c);
    sh.blit(c, anim, 0, s, flip);
    if (REDUCED) return c;
    var n = sh.n(anim), fps = sh.fps(anim), i = 0, last = 0;
    tick(function (t) {
      if (!c.isConnected) return;
      if (t - last < 1000 / fps) return;
      last = t; i = (i + 1) % n;
      sh.blit(c, anim, i, s, flip);
    });
    return c;
  }

  /* ---------- пиксельный шрифт ---------- */
  var F = null;
  function fontInit() {
    if (F) return;
    F = { w: PC_FONT.w, h: PC_FONT.h, g: {} };
    PC_FONT.glyphs.forEach(function (g) { F.g[g.ch] = g.rows; });
  }
  function textPx(s, tr) {
    fontInit(); tr = tr === undefined ? 1 : tr;
    var out = [], cx = 0;
    for (var i = 0; i < s.length; i++) {
      var rows = F.g[s.charAt(i).toUpperCase()] || F.g[" "] || [];
      for (var y = 0; y < F.h; y++) {
        var r = rows[y] || "";
        for (var x = 0; x < F.w; x++) if (r.charAt(x) === "1") out.push({ x: cx + x, y: y });
      }
      cx += F.w + tr;
    }
    return { px: out, w: cx - tr };
  }
  function textCanvas(s, k, color, tr) {
    var m = textPx(s, tr);
    var c = document.createElement("canvas"); c.className = "px";
    c.width = m.w * k; c.height = F.h * k;
    c.style.width = (m.w * k) + "px"; c.style.height = (F.h * k) + "px";
    var ctx = c.getContext("2d"); ctx.fillStyle = color;
    m.px.forEach(function (p) { ctx.fillRect(p.x * k, p.y * k, k, k); });
    return c;
  }
  function assemble(host, s, k, color, tr) {
    var m = textPx(s, tr), pad = k * 2;
    var c = document.createElement("canvas"); c.className = "px";
    c.width = m.w * k + pad * 2; c.height = F.h * k + pad * 2;
    c.style.width = c.width + "px"; c.style.height = c.height + "px";
    host.appendChild(c);
    var ctx = c.getContext("2d");
    var pts = m.px.map(function (p, i) {
      var a = (i * 2.399) % 6.283, d = 30 + ((i * 37) % 80);
      return { tx: p.x * k + pad, ty: p.y * k + pad, sx: p.x * k + pad + Math.cos(a) * d, sy: p.y * k + pad + Math.sin(a) * d, d: (p.x / m.w) * 420 + ((i * 53) % 150) };
    });
    if (REDUCED) { ctx.fillStyle = color; pts.forEach(function (p) { ctx.fillRect(p.tx, p.ty, k, k); }); return c; }
    var t0 = null;
    tick(function (t) {
      if (!c.isConnected) return;
      if (t0 === null) t0 = t;
      var e = t - t0;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = color;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], q = Math.max(0, Math.min(1, (e - p.d) / 560));
        if (q <= 0) continue;
        var g = 1 - Math.pow(1 - q, 4);
        ctx.globalAlpha = Math.min(1, g * 1.7);
        ctx.fillRect(Math.round((p.sx + (p.tx - p.sx) * g) / k) * k, Math.round((p.sy + (p.ty - p.sy) * g) / k) * k, k, k);
      }
      ctx.globalAlpha = 1;
    });
    return c;
  }

  /* ---------- иконки ---------- */
  var D = {
    chev: "M9 6l6 6-6 6",
    down: "M12 5v14M6 13l6 6 6-6",
    plus: "M12 5v14M5 12h14",
    mic: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
    send: "M4 12 20 4l-4 16-4.5-6.5z",
    stop: "M8 8h8v8H8z",
    sound: "M4 9h4l5-4v14l-5-4H4zM19 8c1.5 1.6 1.5 6.4 0 8",
    tick: "M4 12.5 9.5 18 20 6.5",
    gear: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2h-4l-.4 2.6a7.6 7.6 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.4-1a7.6 7.6 0 0 0 2.6 1.5L10 22h4l.4-2.6a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.4z",
    bell: "M18 15v-5a6 6 0 1 0-12 0v5l-2 3h16zM10 21h4",
    bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
    clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
    remote: "M4 5h16v10H4zM9 19h6M12 15v4",
    crew: "M12 3 4 7v6c0 4.5 3.3 7.8 8 9 4.7-1.2 8-4.5 8-9V7z",
    folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
    brain: "M12 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V17a3 3 0 0 0 6 0V7a3 3 0 0 0-2-3z",
    shield: "M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6z",
    doc: "M7 3h7l4 4v14H7zM14 3v5h4",
    test: "M9 3v6l-5 9h16l-5-9V3M8 3h8",
    play: "M8 5v14l11-7z",
    push: "M12 20V6M6 12l6-6 6 6",
    spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18",
    back: "M15 6l-6 6 6 6",
    dots: "M12 5.5h.01M12 12h.01M12 18.5h.01",
    stop: "M7 7h10v10H7z",
    image: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 16l5-5 4 4 3-3 6 6M8.5 9.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z",
    camera: "M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    undo: "M4 10h10a5 5 0 0 1 0 10h-5M4 10l4-4M4 10l4 4"
  };
  function ic(n, s, w) {
    var ns = "http://www.w3.org/2000/svg", v = document.createElementNS(ns, "svg");
    v.setAttribute("viewBox", "0 0 24 24"); v.setAttribute("width", s || 20); v.setAttribute("height", s || 20);
    v.setAttribute("fill", "none"); v.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", D[n] || D.chev);
    if (n === "send" || n === "play" || n === "stop") p.setAttribute("fill", "currentColor");
    else {
      p.setAttribute("stroke", "currentColor");
      p.setAttribute("stroke-width", w || 1.7);
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
    }
    v.appendChild(p); return v;
  }

  /* ---------- марки провайдеров ---------- */
  var BRAND = {
    anthropic: { v: "0 0 24 24", p: ["M12 2.2v6.1M12 15.7v6.1M5.5 5.5l4.3 4.3M14.2 14.2l4.3 4.3M2.2 12h6.1M15.7 12h6.1M5.5 18.5l4.3-4.3M14.2 9.8l4.3-4.3"], stroke: 2.1 },
    openai:    { v: "0 0 24 24", p: ["M12 2.6 20.1 7.3v9.4L12 21.4 3.9 16.7V7.3z", "M12 7.1 16.2 9.5v4.9L12 16.8l-4.2-2.4V9.5z", "M12 2.6v4.5M20.1 7.3 16.2 9.5M20.1 16.7l-3.9-2.3M12 21.4v-4.6M3.9 16.7l3.9-2.3M3.9 7.3l3.9 2.2"], stroke: 1.5 },
    google:    { v: "0 0 24 24", f: ["M12 1.8c0 5.3 4.9 10.2 10.2 10.2C16.9 12 12 16.9 12 22.2 12 16.9 7.1 12 1.8 12 7.1 12 12 7.1 12 1.8z"] },
    xai:       { v: "0 0 24 24", f: ["M3.4 2.6h3.9l13.3 18.8h-3.9zM20.6 2.6 14 11.9l1.9 2.7 7-12zM3.4 21.4l6.6-9.3-1.9-2.7-7 12z"] },
    moonshot:  { v: "0 0 24 24", f: ["M14.8 2.4a9.6 9.6 0 1 0 6.8 10.9 7.6 7.6 0 0 1-6.8-10.9z"] },
    deepseek:  { v: "0 0 24 24", p: ["M3 13.5c3.2 0 5-2.4 7.6-2.4 2.3 0 3.4 1.6 5.6 1.6 1.9 0 3.3-1.1 4.8-3-.3 5.6-3.9 9.3-8.6 9.3-4.3 0-7.6-2.1-9.4-5.5z", "M10.6 11.1 8.2 6.3l4.6 2.6"], stroke: 1.6 },
    mistral:   { v: "0 0 24 24", f: ["M2.5 4h4v4h-4zM17.5 4h4v4h-4zM2.5 9h4v4h-4zM9.5 9h5v4h-5zM17.5 9h4v4h-4zM2.5 14h4v6h-4zM17.5 14h4v6h-4zM9.5 14h5v3h-5z"] },
    meta:      { v: "0 0 24 24", p: ["M3 13.8c0-3.6 1.9-6.6 4.4-6.6 3.6 0 5.3 9.8 9.2 9.8 2.5 0 4.4-2.1 4.4-4.8s-1.9-5-4.4-5c-3.9 0-5.6 9.8-9.2 9.8C4.9 17 3 15.9 3 13.8z"], stroke: 2 }
  };

  function brand(name, size) {
    var b = BRAND[name]; if (!b) return ic("spark", size);
    var ns = "http://www.w3.org/2000/svg", v = document.createElementNS(ns, "svg");
    v.setAttribute("viewBox", b.v); v.setAttribute("width", size || 20); v.setAttribute("height", size || 20);
    v.setAttribute("fill", "none"); v.setAttribute("aria-hidden", "true");
    (b.f || []).forEach(function (d) {
      var p = document.createElementNS(ns, "path");
      p.setAttribute("d", d); p.setAttribute("fill", "currentColor");
      v.appendChild(p);
    });
    (b.p || []).forEach(function (d) {
      var p = document.createElementNS(ns, "path");
      p.setAttribute("d", d);
      p.setAttribute("stroke", "currentColor");
      p.setAttribute("stroke-width", b.stroke || 1.7);
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      p.setAttribute("fill", "none");
      v.appendChild(p);
    });
    return v;
  }

  var CREW_BRAND = { claude: "anthropic", kimi: "moonshot", grok: "xai" };
  function brandOfCrew(id) { return CREW_BRAND[id] || "anthropic"; }

  function crewOfBrand(b) {
    var g = PC_CONTENT.models.filter(function (m) { return m.brand === b; })[0];
    return g && g.crew;
  }

  function ind(k) {
    var d = PC_IND[k] || PC_IND["pc-dots"];
    var n = frag(d.html) || el("span");
    n.setAttribute("aria-hidden", "true");
    return n;
  }

  /* ---------- акцент ---------- */
  var COLOR = {
    claude: { acc: "#FF6B3D", hi: "#FF9163", ink: "#180A04" },
    kimi:   { acc: "#4D8BFF", hi: "#8FB8FF", ink: "#04101F" },
    grok:   { acc: "#8FDCF2", hi: "#CFF1FF", ink: "#04131A" }
  };
  var active = "claude";

  /* акцент интерфейса один — белый. Цвет есть только у самих маскотов. */
  function applyAccent() {}

  function member(id) {
    return PC_CONTENT.crew.filter(function (c) { return c.id === id; })[0];
  }

  var listeners = [];
  function onCrew(fn) { listeners.push(fn); }
  function setCrew(id) {
    if (!SH[id]) return;
    active = id; applyAccent();
    listeners.forEach(function (f) { try { f(id); } catch (e) {} });
    $$("[data-crew]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.crew === id)); });
  }

  /* ============================================================
     ПИТОМЕЦ: гуляет по всему интерфейсу — по карточкам, по тексту,
     по любой вкладке. Занятие выбирается из каталога поведений.
     ============================================================ */

  /* базовые занятия. anim — кадры спрайта, остальное — характер */
  var ACTS = [
    { a: "idle",    n: "loafing",             ms: 2200, w: 2 },
    { a: "sit",     n: "sitting",             ms: 2800, w: 2 },
    { a: "sleep",   n: "napping",             ms: 3600, w: 1 },
    { a: "stretch", n: "stretching",          ms: 1800, w: 2 },
    { a: "blink",   n: "staring into space",  ms: 1800, w: 1 },
    { a: "look",    n: "looking around",      ms: 2200, w: 2 },
    { a: "work",    n: "hammering away",      ms: 2600, w: 2 },
    { a: "type",    n: "typing",              ms: 3000, w: 2 },
    { a: "read",    n: "reading",             ms: 3000, w: 2 },
    { a: "dig",     n: "digging",             ms: 2200, w: 2 },
    { a: "dance",   n: "dancing",             ms: 2600, w: 2 },
    { a: "cheer",   n: "celebrating",         ms: 2000, w: 1 },
    { a: "panic",   n: "freaking out",        ms: 1800, w: 1 },
    { a: "wave",    n: "waving",              ms: 1800, w: 1 },
    { a: "carry",   n: "hauling a box",       ms: 4600, w: 4, move: 1.1 },
    { a: "deliver", n: "wheeling a computer", ms: 5200, w: 4, move: .9 },
    { a: "walk",    n: "pacing",              ms: 3600, w: 6, move: 1 },
    { a: "walk",    n: "patrolling",          ms: 5200, w: 5, move: 1.5 },
    { a: "walk",    n: "wandering off",       ms: 3000, w: 5, move: .7 },
    { a: "walk",    n: "sprinting",           ms: 2000, w: 3, move: 2.6 },
    { a: "carry",   n: "moving house",        ms: 5600, w: 3, move: .8 },
    { a: "deliver", n: "making a delivery",   ms: 4600, w: 3, move: 1.3 }
  ];

  /* места, где он это делает — находятся в живом DOM */
  var PLACES = [
    { s: ".live, .now",        n: "on the status card" },
    { s: ".card",              n: "on a card" },
    { s: ".ses",               n: "on a session" },
    { s: ".row",               n: "on a list row" },
    { s: ".comp",              n: "on the composer" },
    { s: ".chips .chip",       n: "on a suggestion chip" },
    { s: ".toppill",           n: "on the model pill" },
    { s: ".plan__row",         n: "on a step of the plan" },
    { s: ".say, .mut",         n: "on top of the text" },
    { s: ".you",               n: "on your own message" },
    { s: ".flow__i",           n: "on the checklist" },
    { s: ".cta__p, .newses, .ask__b", n: "on the big button" },
    { s: ".diff, .ranout",     n: "on the code" },
    { s: ".queued",            n: "on the queue" },
    { s: "__floor",            n: "down on the floor" }
  ];

  var LEDGE_SEL = PLACES.map(function (p) { return p.s; })
    .filter(function (x) { return x !== "__floor"; }).join(", ");

  var BEHAVIOURS = [];
  (function () {
    for (var i = 0; i < ACTS.length; i++) {
      for (var j = 0; j < PLACES.length; j++) {
        BEHAVIOURS.push({ act: ACTS[i], place: PLACES[j], name: ACTS[i].n + " " + PLACES[j].n });
      }
    }
  })();

  function behaviourCount(sheet) {
    if (!sheet) return BEHAVIOURS.length;
    return BEHAVIOURS.filter(function (b) { return sheet.anims[b.act.a]; }).length;
  }

  /* ---------- сам питомец ---------- */
  function Pet(ui, scale) {
    var self = this;
    this.ui = ui;
    this.s = scale || 2;

    this.layer = el("div", "petlayer");
    this.host = $(".body", ui) || ui;   /* гуляет только по рабочей области */
    this.host.appendChild(this.layer);

    this.c = document.createElement("canvas");
    this.c.className = "px petsprite";
    this.c.tabIndex = 0;
    this.c.setAttribute("role", "button");
    this.c.setAttribute("aria-label", "Pet");
    this.layer.appendChild(this.c);

    this.bubble = el("div", "bubble");
    this.bubble.setAttribute("data-on", "false");
    this.layer.appendChild(this.bubble);

    this.x = 30; this.y = 0; this.dir = 1;
    this.state = "idle"; this.f = 0; this.last = 0; this.until = 0;
    this.speed = 26;
    this.plat = null;
    this.hop = null;

    this.set(active);
    this.c.addEventListener("click", function (e) { e.stopPropagation(); });
    this.c.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); self.menu(); }
    });
    this.mode = "live";
    this.sq = 0; this.sqAxis = 1; this.vx = 0; this.vy = 0; this.yPrev = 0;
    this.ledges = [];
    this.initDrag();
    onCrew(function (id) { self.set(id); self.force("wave", 1800); });
    tick(function (t) { self.step(t); });
  }

  Pet.prototype.set = function (id) {
    this.id = id;
    this.sh = SH[id];
    this.c.width = this.sh.w * this.s;
    this.c.height = this.sh.h * this.s;
    this.c.style.width = this.c.width + "px";
    this.c.style.height = this.c.height + "px";
    this.f = 0;
  };

  /* видимые поверхности, по которым можно ходить */
  Pet.prototype.surfaces = function (sel) {
    var r0 = this.host.getBoundingClientRect();
    var W = this.layer.clientWidth || 360, H = this.layer.clientHeight || 700;
    var k = r0.width ? W / r0.width : 1;   /* рамка может быть отмасштабирована */
    var out = [];
    if (sel && sel !== "__floor") {
      $$(sel, this.host).forEach(function (e) {
        if (!e.offsetParent) return;
        var r = e.getBoundingClientRect();
        if (r.width < 46) return;
        var y = (r.top - r0.top) * k;
        var x1 = (r.left - r0.left) * k + 2;
        var x2 = (r.right - r0.left) * k - 2;
        if (y < 48 || y > H - 14 || x2 - x1 < 40) return;
        out.push({ x1: x1, x2: x2, y: y });
      });
    }
    if (!out.length) out.push({ x1: 8, x2: W - 8, y: H - 10 });
    return out;
  };

  /* ---------- бросок и физика ---------- */
  Pet.prototype.initDrag = function () {
    var self = this, pts = [];

    function local(e) {
      var r = self.layer.getBoundingClientRect();
      var k = r.width ? (self.layer.clientWidth || r.width) / r.width : 1;
      return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
    }

    this.c.addEventListener("pointerdown", function (e) {
      e.preventDefault(); e.stopPropagation();
      self.closeMenu();
      self.mode = "drag";
      self.moved = 0;
      self.hop = null;
      self.sq = 0;
      var p = local(e);
      self.grab = { dx: p.x - self.x, dy: p.y - self.y };
      pts = [{ x: p.x, y: p.y, t: performance.now() }];
      self.c.setPointerCapture(e.pointerId);
      self.state = self.sh.anims.panic ? "panic" : "walk";
      self.f = 0;
    });

    this.c.addEventListener("pointermove", function (e) {
      if (self.mode !== "drag") return;
      e.preventDefault();
      var p = local(e);
      var nx = p.x - self.grab.dx, ny = p.y - self.grab.dy;
      self.moved += Math.abs(nx - self.x) + Math.abs(ny - self.y);
      self.x = nx; self.y = ny;
      pts.push({ x: p.x, y: p.y, t: performance.now() });
      if (pts.length > 5) pts.shift();
    });

    function release(e) {
      if (self.mode !== "drag") return;
      self.c.releasePointerCapture && self.c.releasePointerCapture(e.pointerId);
      var a = pts[0], b = pts[pts.length - 1];
      var dtm = Math.max(16, b.t - a.t);
      var vx = (b.x - a.x) / dtm * 1000;
      var vy = (b.y - a.y) / dtm * 1000;
      if (self.moved < 8) {           /* это был тап, а не бросок */
        self.mode = "live";
        self.plat = null;
        self.menu();
        return;
      }
      self.mode = "fly";
      self.flyT0 = performance.now();
      self.vx = Math.max(-1800, Math.min(1800, vx));
      self.vy = Math.max(-1800, Math.min(1800, vy));
      self.spin = 0;
      self.state = self.sh.anims.panic ? "panic" : "walk";
    }

    this.c.addEventListener("pointerup", release);
    this.c.addEventListener("pointercancel", release);
  };

  /* один шаг физики; возвращает true, если питомец ещё летит */
  Pet.prototype.physics = function (dt) {
    var W = this.layer.clientWidth, H = this.layer.clientHeight;
    var w = this.c.width, h = this.c.height;
    var floor = H - 4;

    this.vy += 2400 * dt;
    this.vx *= (1 - 1.1 * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    var hit = 0;

    if (this.x < 2) { this.x = 2; this.vx = -this.vx * .55; hit = 2; }
    if (this.x > W - w - 2) { this.x = W - w - 2; this.vx = -this.vx * .55; hit = 2; }
    if (this.y - h < 2 && this.vy < 0) { this.y = h + 2; this.vy = -this.vy * .4; hit = 1; }

    /* приземление на карточку, если пролетает сверху вниз через её край */
    if (this.vy > 0) {
      var land = null, best = 1e9;
      this.ledges.forEach(function (p) {
        if (this.x + w < p.x1 || this.x > p.x2) return;
        if (this.yPrev <= p.y + 2 && this.y >= p.y) {
          var d = Math.abs(p.y - this.y);
          if (d < best) { best = d; land = p; }
        }
      }, this);
      if (land) { this.y = land.y; this.vy = -this.vy * .35; hit = 1; this.landed = land; }
    }

    if (this.y > floor) { this.y = floor; this.vy = -this.vy * .3; this.vx *= .72; hit = 1; this.landed = null; }

    if (hit) {
      this.sq = Math.min(1, Math.abs(hit === 1 ? this.vy : this.vx) / 700 + .35);
      this.sqAxis = hit;
    }

    this.yPrev = this.y;

    var slow = Math.abs(this.vx) < 30 && Math.abs(this.vy) < 80;
    var onGround = this.y >= floor - 1 || this.landed;
    return !(slow && onGround);
  };

  Pet.prototype.settle = function (t) {
    this.mode = "live";
    var W = this.layer.clientWidth, H = this.layer.clientHeight;
    this.plat = this.landed || { x1: 8, x2: W - 8, y: H - 4 };
    this.landed = null;
    this.dest = { p: this.plat, x: this.x };
    this.beh = { act: { a: "stretch", n: "picking itself up", ms: 1600 }, place: { n: "where it landed" } };
    this.startAct(t);
    var m = member(this.id);
    if (m && Math.random() < .5) this.say(m.scared || "…", 1800);
  };

  Pet.prototype.pick = function (t) {
    var pool = BEHAVIOURS.filter(function (b) { return this.sh.anims[b.act.a]; }, this);
    var total = 0, i;
    for (i = 0; i < pool.length; i++) total += pool[i].act.w || 1;
    var r = Math.random() * total, b = pool[pool.length - 1];
    for (i = 0; i < pool.length; i++) { r -= pool[i].act.w || 1; if (r <= 0) { b = pool[i]; break; } }
    this.beh = b;

    /* остаться на месте ещё на пару занятий, чтобы не метаться */
    if (this.plat && this.stay > 0) {
      this.stay--;
      this.dest = { p: this.plat, x: this.x };
      this.startAct(t);
      return;
    }
    this.stay = Math.random() < .35 ? 1 : 0;

    var surf = this.surfaces(b.place.s);
    var self = this;
    surf.sort(function (a, c) {
      return (Math.abs(a.y - self.y) + Math.abs((a.x1 + a.x2) / 2 - self.x) * .4)
           - (Math.abs(c.y - self.y) + Math.abs((c.x1 + c.x2) / 2 - self.x) * .4);
    });
    var p = surf[Math.floor(Math.random() * Math.min(3, surf.length))];
    var w = this.c.width;
    var tx = p.x1 + Math.random() * Math.max(1, (p.x2 - p.x1) - w);

    if (!this.plat) {
      this.plat = p; this.x = tx; this.y = p.y;
      this.dest = { p: p, x: tx };
      this.startAct(t);
      return;
    }
    this.dest = { p: p, x: tx };
    this.phase = "travel";
    this.state = "walk";
    this.f = 0;
    this.until = t + 14000;
  };

  Pet.prototype.startAct = function (t) {
    var b = this.beh;
    this.phase = "act";
    this.plat = this.dest.p;
    this.state = b.act.a;
    this.move = b.act.move || 0;
    this.tx = this.x;
    this.f = 0;
    this.until = t + b.act.ms * (0.7 + Math.random() * 0.5);
  };

  Pet.prototype.force = function (a, ms) {
    var self = this;
    this.phase = "act";
    this.state = a; this.move = 0; this.f = 0;
    this.until = performance.now() + (ms || 2400);
    clearTimeout(this._ft);
    this._ft = setTimeout(function () { self.until = 0; }, ms || 2400);
  };

  Pet.prototype.step = function (t) {
    if (!this.c.isConnected) return;
    var dt = this.tPrev ? Math.min((t - this.tPrev) / 1000, .12) : 0;
    this.tPrev = t;
    if (!(dt > 0)) dt = 0;

    if (this.sq > 0) this.sq = Math.max(0, this.sq - dt * 4.2);

    /* края, на которые можно приземлиться — пересчитываем нечасто */
    if (!this._lt || t - this._lt > 700) {
      this._lt = t;
      this.ledges = this.surfaces(LEDGE_SEL);
    }

    if (this.mode === "drag") { this.draw(t, true); return; }

    if (this.mode === "fly") {
      var tooLong = t - (this.flyT0 || t) > 6000;
      if (!tooLong && this.physics(dt)) { this.draw(t); return; }
      this.settle(t);
    }

    if (!this.plat) this.pick(t);

    /* страховка: путешествие не должно зависать */
    if (this.phase === "travel" && !this.hop && t > this.until) { this.startAct(t); }

    if (this.hop) {
      var k = Math.min(1, (t - this.hop.t0) / this.hop.dur);
      this.x = this.hop.x0 + (this.hop.x1 - this.hop.x0) * k;
      this.y = this.hop.y0 + (this.hop.y1 - this.hop.y0) * k - Math.sin(k * Math.PI) * this.hop.h;
      this.state = "walk";
      if (k >= 1) {
        this.x = this.hop.x1; this.y = this.hop.y1; this.hop = null;
        this.startAct(t);
      }
    } else if (this.phase === "travel") {
      var d = this.dest;
      var sameRow = Math.abs(d.p.y - this.y) < 7;
      var hi = Math.max(this.plat.x1, this.plat.x2 - this.c.width);
      var wp = sameRow ? d.x : Math.max(this.plat.x1, Math.min(hi, d.x));
      var dx = wp - this.x;
      this.state = "walk";
      if (Math.abs(dx) > 2) {
        this.dir = dx > 0 ? 1 : -1;
        this.x += this.dir * this.speed * 1.55 * dt;
      } else if (!sameRow) {
        var dist = Math.abs(d.x - this.x) + Math.abs(d.p.y - this.y);
        this.dir = d.x >= this.x ? 1 : -1;
        this.hop = {
          x0: this.x, y0: this.y, x1: d.x, y1: d.p.y,
          t0: t, dur: Math.max(320, Math.min(900, 260 + dist * 1.6)),
          h: Math.min(34, 14 + dist * .12)
        };
      } else {
        this.startAct(t);
      }
    } else {
      if (this.move) {
        var dd = this.tx - this.x;
        if (Math.abs(dd) > 2) {
          this.dir = dd > 0 ? 1 : -1;
          this.x += this.dir * this.speed * this.move * dt;
        } else {
          this.tx = this.plat.x1 + Math.random() * Math.max(1, (this.plat.x2 - this.plat.x1) - this.c.width);
        }
      }
      if (this.plat) this.y = this.plat.y;
      if (t > this.until) this.pick(t);
    }

    this.draw(t);
  };

  Pet.prototype.draw = function (t, held) {
    var W = this.layer.clientWidth, H = this.layer.clientHeight;
    if (W > 20 && H > 20) {
      this.x = Math.max(2, Math.min(W - this.c.width - 2, this.x));
      this.y = Math.max(this.c.height + 2, Math.min(H - 2, this.y));
    }

    var a = this.state, fps = this.sh.fps(a), n = this.sh.n(a);
    if (REDUCED) this.sh.blit(this.c, a, 0, this.s, false);
    else if (t - this.last > 1000 / fps) {
      this.f = (this.f + 1) % n;
      this.last = t;
      this.sh.blit(this.c, a, this.f, this.s, this.dir < 0);
    }

    var sx = 1, sy = 1;
    if (held) { sx = .93; sy = 1.09; }
    else if (this.sq > 0) {
      if (this.sqAxis === 1) { sx = 1 + .42 * this.sq; sy = 1 - .36 * this.sq; }
      else { sx = 1 - .34 * this.sq; sy = 1 + .4 * this.sq; }
    }

    var px = Math.round(this.x), py = Math.round(this.y - this.c.height + 2);
    this.c.style.transform = "translate(" + px + "px," + py + "px) scale(" + sx.toFixed(3) + "," + sy.toFixed(3) + ")";
    if (this._on) this._bub();
    if (this._menu) this._place();
  };

  Pet.prototype._anchor = function (w) {
    var W = this.layer.clientWidth || 360;
    var half = (w || 90) / 2;
    var cx = this.x + this.c.width / 2;
    return {
      left: Math.round(Math.max(half + 8, Math.min(W - half - 8, cx))),
      top: Math.round(Math.max(this.c.height + 46, this.y - this.c.height - 6))
    };
  };

  Pet.prototype._bub = function () {
    /* сначала отпускаем к левому краю, чтобы измерить естественную ширину,
       иначе у правого края элемент зажимается и текст рвётся по словам */
    this.bubble.style.left = "0px";
    var a = this._anchor(this.bubble.offsetWidth);
    this.bubble.style.left = a.left + "px";
    this.bubble.style.top = a.top + "px";
  };

  Pet.prototype._place = function () {
    this._menu.style.left = "0px";
    var a = this._anchor(this._menu.offsetWidth);
    this._menu.style.left = a.left + "px";
    this._menu.style.top = a.top + "px";
  };

  Pet.prototype.say = function (txt, ms) {
    var self = this;
    this.bubble.textContent = txt;
    this.bubble.setAttribute("data-on", "true");
    this._on = true;
    this._bub();
    clearTimeout(this._b);
    this._b = setTimeout(function () {
      self.bubble.setAttribute("data-on", "false"); self._on = false;
    }, ms || 2800);
  };

  Pet.prototype.doing = function () {
    return this.beh ? this.beh.name : "loafing";
  };

  Pet.prototype.act = function (id, say) {
    var a = PETACTS.filter(function (x) { return x.id === id; })[0];
    var m = member(this.id);
    this.force(id, a ? a.ms : 2400);
    var line = a && a.line && m ? a.line(m) : null;
    if (say !== false && line) this.say(line, (a.ms || 2400) - 200);
  };

  var PETACTS = [
    { id: "wave",  t: "Say hi",     ms: 2200, line: function (m) { return m.hello; } },
    { id: "cheer", t: "Praise it",  ms: 2600, line: function (m) { return m.praised; } },
    { id: "read",  t: "What's up",  ms: 3400, line: null },
    { id: "dance", t: "Dance",      ms: 3600, line: function (m) { return m.danced || m.praised; } },
    { id: "sleep", t: "Sleep",      ms: 4600, line: function (m) { return m.sleepy; } },
    { id: "panic", t: "",           ms: 2000, line: function (m) { return m.scared; }, hidden: true }
  ];

  Pet.prototype.menu = function () {
    var self = this;
    if (this._menu && this._menu.isConnected) { this.closeMenu(); return; }
    var box = el("div", "acts");
    PETACTS.filter(function (a) { return !a.hidden && self.sh.anims[a.id]; }).forEach(function (a) {
      var b = el("button", "acts__b", a.t); b.type = "button";
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        self.closeMenu();
        if (a.id === "read") { self.force("read", 3400); self.say("Right now: " + self.doing() + ".", 3200); }
        else self.act(a.id);
      });
      box.appendChild(b);
    });
    this.layer.appendChild(box);
    this._menu = box;
    requestAnimationFrame(function () { box.setAttribute("data-on", "true"); self._place(); });
    clearTimeout(this._mt);
    this._mt = setTimeout(function () { self.closeMenu(); }, 6000);
  };

  Pet.prototype.closeMenu = function () {
    if (!this._menu) return;
    var m = this._menu; this._menu = null;
    m.setAttribute("data-on", "false");
    setTimeout(function () { if (m.parentNode) m.parentNode.removeChild(m); }, 220);
  };

  Pet.prototype.speak = function () { this.menu(); };



  window.PC = {
    Sheet: Sheet, SH: SH, pet: pet, cnv: cnv, tick: tick,
    textCanvas: textCanvas, assemble: assemble, textPx: textPx, fontInit: fontInit,
    ind: ind, brand: brand, brandOfCrew: brandOfCrew,
    Pet: Pet, COLOR: COLOR, onCrew: onCrew, setCrew: setCrew, member: member,
    behaviourCount: behaviourCount, applyAccent: applyAccent,
    el: el, frag: frag, $: $, $$: $$, REDUCED: REDUCED,
    get active() { return active; },
    boot: function () {
      Object.keys(PC_SPRITES).forEach(function (k) { SH[k] = new Sheet(PC_SPRITES[k]); });
      PC_CONTENT.crew = PC_CONTENT.crew.filter(function (c) { return SH[c.id]; });
      if (!SH[active]) active = PC_CONTENT.crew[0].id;
      fontInit();
      applyAccent();
    }
  };
})();
