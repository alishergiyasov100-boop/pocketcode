/* ============================================================
   Мост: питомец перестаёт бродить наугад и начинает двигаться
   только по событиям приложения. Решения принимает PETMIND,
   этот файл переводит их в координаты и анимации.
   ============================================================ */
(function () {
  "use strict";
  var E = window.PC, M = window.PETMIND;
  if (!E || !M || !E.Pet) return;

  var seq = 0;
  var KINDS = [
    [".input", "composer"],
    [".card", "card"],
    [".strip", "status"],
    [".bar", "header"],
    [".btn, .chip", "button"],
    [".you, .say, .step, .tool, .toolout", "row"]
  ];

  function born(e) {
    if (!e.dataset.pborn) e.dataset.pborn = String(Date.now());
    return +e.dataset.pborn;
  }

  /* что сейчас видно на экране и на что можно встать */
  E.Pet.prototype.scan = function () {
    var r0 = this.host.getBoundingClientRect();
    var W = this.layer.clientWidth || 360, H = this.layer.clientHeight || 700;
    var k = r0.width ? W / r0.width : 1;
    var now = Date.now();
    var list = [], map = {};

    KINDS.forEach(function (pair) {
      Array.prototype.forEach.call(this.host.querySelectorAll(pair[0]), function (e) {
        if (!e.offsetParent) return;
        var r = e.getBoundingClientRect();
        if (r.width < 44) return;
        var y = (r.top - r0.top) * k;
        var x1 = (r.left - r0.left) * k + 2;
        var x2 = (r.right - r0.left) * k - 2;
        var bottom = (r.bottom - r0.top) * k;
        if (bottom < 10 || y > H - 6) return;              /* за пределами видимого */
        if (!e.dataset.pid) e.dataset.pid = "s" + (++seq);
        var s = {
          id: e.dataset.pid, kind: pair[1], visible: true,
          age: now - born(e), width: x2 - x1,
          _x1: x1, _x2: x2, _top: Math.max(46, y), _bottom: bottom
        };
        list.push(s);
        map[s.id] = s;
      });
    }, this);

    this._surf = map;
    return list;
  };

  function ctxOf(pet, extra) {
    var c = {
      now: Date.now(),
      surfaces: pet.scan(),
      typing: !!pet._typing,
      lastSeenAt: pet._lastSeen || 0
    };
    if (extra) for (var k in extra) c[k] = extra[k];
    return c;
  }

  /* цель от PETMIND -> площадка в координатах слоя */
  E.Pet.prototype.resolve = function (g) {
    if (!g || !this._surf) return null;
    var s = this._surf[g.surface];
    if (!s) return null;
    var y = g.edge === "bottom" ? s._bottom : s._top;
    var a = g.align == null ? 0.5 : g.align;
    var w = this.c.width;
    var span = Math.max(1, (s._x2 - s._x1) - w);
    return { plat: { x1: s._x1, x2: s._x2, y: y }, x: s._x1 + span * a };
  };

  E.Pet.prototype.apply = function (ins, t) {
    if (!ins) return false;
    t = t || performance.now();
    var dest = this.resolve(ins.goto);

    this.beh = { act: { a: ins.anim, n: ins.anim, ms: Math.max(900, ins.hold || 1600) },
                 place: { n: ins.goto ? "where it is needed" : "where it stands" } };

    if (dest) {
      this.dest = { p: dest.plat, x: dest.x };
      this.phase = "travel";
      this.state = this.sh.anims.walk ? "walk" : ins.anim;
      this.pendingAnim = ins.anim;
      this.until = t + 14000;
    } else {
      this.phase = "act";
      this.state = this.sh.anims[ins.anim] ? ins.anim : "idle";
      this.move = 0;
      this.tx = this.x;
      this.until = t + Math.max(700, ins.hold || 1800);
    }
    if (ins.say) this.say(ins.say, Math.max(1600, ins.hold || 2000));
    return true;
  };

  /* вместо случайного выбора — спросить мозг */
  E.Pet.prototype.pick = function (t) {
    var ins = null;
    try { ins = M.tick(Date.now(), ctxOf(this)); } catch (e) {}
    if (ins && this.apply(ins, t)) return;

    /* мозг молчит — значит отдыхать там, где он стоит */
    this.phase = "act";
    this.move = 0;
    this.state = this.sh.anims.sit ? "sit" : "idle";
    this.beh = { act: { a: this.state, n: "resting", ms: 2600 }, place: { n: "where it settled" } };
    this.until = t + 1800 + Math.random() * 1600;
  };

  E.Pet.prototype.event = function (name, extra) {
    var ins = null;
    try { ins = M.onEvent(name, ctxOf(this, extra)); } catch (e) {}
    if (ins) this.apply(ins);
    if (name === "app_opened") this._lastSeen = Date.now();
  };

  E.Pet.prototype.typing = function (on) {
    if (this._typing === on) return;
    this._typing = on;
    if (on) this.event("user_typing");
  };

  /* по прибытии играем то, ради чего шли */
  var baseStart = E.Pet.prototype.startAct;
  E.Pet.prototype.startAct = function (t) {
    if (this.pendingAnim && this.sh.anims[this.pendingAnim]) {
      this.beh = this.beh || { act: {}, place: {} };
      this.beh.act = { a: this.pendingAnim, n: this.beh.act.n || this.pendingAnim, ms: 2000 };
      this.pendingAnim = null;
    }
    return baseStart.call(this, t);
  };

  window.PETWIRED = true;
})();
