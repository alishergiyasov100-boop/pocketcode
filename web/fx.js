/* ============================================================================
   FX — the 5-function helper behind fx.css. No dependencies, no build step.
   window.FX.reveal / dismiss / stagger / count / bar
   ========================================================================== */
(function (w, d) {
  'use strict';

  var ENTER = ['fx-reveal', 'fx-from-left', 'fx-from-right'];
  var EXIT  = ['fx-dismiss', 'fx-to-left', 'fx-to-right'];

  function reduced() {
    return !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function drop(el, list) { for (var i = 0; i < list.length; i++) el.classList.remove(list[i]); }
  function reflow(el) { void el.offsetWidth; }   /* restart a finished animation */

  /* --- 1 + 2 : grow out of the tap point, side-slide when the panel is tall */
  function reveal(el, x, y) {
    if (!el) return el;
    drop(el, EXIT);
    drop(el, ENTER);
    el.hidden = false;

    var r = el.getBoundingClientRect();
    var ox = r.width  ? clamp(((x - r.left) / r.width)  * 100, 0, 100) : 50;
    var oy = r.height ? clamp(((y - r.top)  / r.height) * 100, 0, 100) : 0;
    if (typeof x !== 'number') ox = 50;
    if (typeof y !== 'number') oy = 0;
    el.style.setProperty('--fx-ox', ox.toFixed(2) + '%');
    el.style.setProperty('--fx-oy', oy.toFixed(2) + '%');

    var tall = r.height > Math.min(w.innerHeight * 0.55, 520);
    var side = '';
    if (tall || el.classList.contains('fx-side')) {
      var cx = typeof x === 'number' ? x : w.innerWidth / 2;
      side = cx < w.innerWidth / 2 ? 'fx-from-left' : 'fx-from-right';
    }

    reflow(el);
    el.classList.add('fx-reveal');
    if (side) el.classList.add(side);
    el.dataset.fxSide = side;
    return el;
  }

  /* --- 6 : reverse, faster, eased in; done() fires once, always */
  function dismiss(el, done) {
    if (!el) { if (done) done(el); return el; }
    drop(el, ENTER);
    drop(el, EXIT);
    reflow(el);
    el.classList.add('fx-dismiss');
    if (el.dataset.fxSide === 'fx-from-left')  el.classList.add('fx-to-left');
    if (el.dataset.fxSide === 'fx-from-right') el.classList.add('fx-to-right');

    var fired = false;
    function end(e) {
      if (e && (e.target !== el || e.animationName !== 'fx-dismiss-scale')) return;
      if (fired) return;
      fired = true;
      clearTimeout(timer);
      el.removeEventListener('animationend', end);
      if (done) done(el);
    }
    var timer = w.setTimeout(end, 500);        /* safety net if the tab was hidden */
    el.addEventListener('animationend', end);
    return el;
  }

  /* --- 3 : hand each row its index, CSS does the timing */
  function stagger(container, selector) {
    if (!container) return [];
    var rows = selector
      ? container.querySelectorAll(selector)
      : container.children;
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var el = rows[i];
      el.classList.remove('fx-stagger-item');
      el.style.setProperty('--i', i);
      out.push(el);
    }
    if (rows.length) reflow(rows[0]);
    for (var j = 0; j < rows.length; j++) rows[j].classList.add('fx-stagger-item');
    return out;
  }

  /* --- 7 : count up to a value */
  function count(el, to, opts) {
    if (!el) return;
    opts = opts || {};
    var from = typeof opts.from === 'number'
      ? opts.from
      : (parseFloat(String(el.textContent).replace(/[^0-9.\-]/g, '')) || 0);
    var dec    = opts.decimals != null ? opts.decimals : 0;
    var pre    = opts.prefix || '';
    var suf    = opts.suffix || '';
    var group  = opts.group !== false;
    var dur    = opts.duration != null ? opts.duration : 650;
    var fmt    = opts.format || function (v) {
      var n = group ? v.toLocaleString(undefined, {
        minimumFractionDigits: dec, maximumFractionDigits: dec
      }) : v.toFixed(dec);
      return pre + n + suf;
    };

    if (reduced() || dur <= 0 || from === to) {
      el.textContent = fmt(to);
      if (opts.done) opts.done();
      return;
    }

    if (el.dataset.fxRaf) w.cancelAnimationFrame(Number(el.dataset.fxRaf));
    var t0 = 0;
    function tick(ts) {
      if (!t0) t0 = ts;
      var p = clamp((ts - t0) / dur, 0, 1);
      var e = 1 - Math.pow(1 - p, 3);                 /* ease-out cubic */
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) el.dataset.fxRaf = w.requestAnimationFrame(tick);
      else { delete el.dataset.fxRaf; el.textContent = fmt(to); if (opts.done) opts.done(); }
    }
    el.dataset.fxRaf = w.requestAnimationFrame(tick);
  }

  /* --- 8 : fill a meter from 0 on first paint */
  function bar(el, pct) {
    if (!el) return;
    var fill = el.classList.contains('fx-bar-fill')
      ? el
      : el.querySelector('.fx-bar-fill');
    if (!fill) return;
    var p = clamp(Number(pct) || 0, 0, 100) / 100;
    var track = fill.parentElement;
    if (track && track.classList.contains('fx-bar')) {
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    }
    if (reduced()) { fill.style.setProperty('--fx-pct', p); return; }
    if (!fill.dataset.fxArmed) {
      fill.dataset.fxArmed = '1';
      fill.style.setProperty('--fx-pct', 0);
      reflow(fill);
    }
    w.requestAnimationFrame(function () { fill.style.setProperty('--fx-pct', p); });
  }

  w.FX = { reveal: reveal, dismiss: dismiss, stagger: stagger, count: count, bar: bar };
})(window, document);
