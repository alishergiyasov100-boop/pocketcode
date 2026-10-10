/* ==========================================================================
   ACCOUNT USAGE AND LIMITS  ->  window.PCUSAGE
     renderAccountStrip(data, h) -> HTMLElement   (Piece 1)
     renderLimitsSheet(data, h)  -> HTMLElement   (Piece 2)

   h = { el(tag, cls, text), ic(name, size, width, color), fmt }
   Icons used: chevron-right, clock, info, arrow-up-right.
   No globals beyond window.PCUSAGE. h.fmt is honoured when present, otherwise
   the local fmt* helpers below are used.

   Events (bubbling CustomEvents, so the host can wire either way):
     strip -> "pcusage:open"
     sheet -> "pcusage:primary" | "pcusage:secondary" | "pcusage:close"
   Callbacks data.onOpen / onPrimary / onSecondary / onClose are also called.
   ========================================================================== */
(function (root) {
  'use strict';

  var DASH = '—'; /* em dash = "unknown". Never NaN, never a silent 0. */

  /* ---------------------------------------------------------------- numbers */
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* first finite candidate, else null — this is what makes null mean unknown */
  function pick() {
    for (var i = 0; i < arguments.length; i++) if (isNum(arguments[i])) return arguments[i];
    return null;
  }
  function clampPct(p) { return Math.max(0, Math.min(100, p)); }

  /* 1 decimal under 100 (so 12.4B does not collapse to 12B), none above;
     a trailing ".0" is dropped */
  function brief(n) {
    var s = Math.abs(n) < 100 ? n.toFixed(1) : String(Math.round(n));
    return s.replace(/\.0$/, '');
  }
  function group(n, dp) {
    try {
      return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    } catch (e) {
      return n.toFixed(dp);
    }
  }

  /* "47" / "<1" / "112" / "—"  — the % sign is a separate span so it can be
     typeset smaller in the headline. */
  function fmtPctNum(p) {
    if (!isNum(p)) return DASH;
    if (p > 0 && p < 1) return '<1';
    return String(Math.round(p));
  }
  function fmtPct(p) { return isNum(p) ? fmtPctNum(p) + '%' : DASH; }

  /* full money, for the sheet: $4.82 / $1,284 / $8,412,900 */
  function fmtMoney(n) {
    if (!isNum(n)) return DASH;
    return '$' + group(n, Math.abs(n) < 1000 ? 2 : 0);
  }
  /* short money, for the strip: never wider than ~7 chars */
  function fmtMoneyShort(n) {
    if (!isNum(n)) return DASH;
    var a = Math.abs(n);
    if (a < 1000) return '$' + n.toFixed(2);
    if (a < 1e6) return '$' + brief(n / 1e3) + 'K';
    if (a < 1e9) return '$' + brief(n / 1e6) + 'M';
    return '$' + brief(n / 1e9) + 'B';
  }
  /* tokens: 940 / 218K / 4.1M / 12.4B */
  function fmtTokens(n) {
    if (!isNum(n)) return DASH;
    var a = Math.abs(n);
    if (a < 1000) return String(Math.round(n));
    if (a < 1e6) return brief(n / 1e3) + 'K';
    if (a < 1e9) return brief(n / 1e6) + 'M';
    return brief(n / 1e9) + 'B';
  }

  /* seconds until reset, from resetsInSec or resetsAt (ISO) */
  function resetSecs(d) {
    if (isNum(d.resetsInSec)) return d.resetsInSec;
    if (d.resetsAt) {
      var t = Date.parse(d.resetsAt);
      if (!isNaN(t)) return Math.round((t - Date.now()) / 1000);
    }
    return null;
  }
  /* "2d 4h" / "4h 12m" / "9m" / "now" / "—" */
  function fmtDur(s) {
    if (!isNum(s)) return DASH;
    if (s <= 0) return 'now';
    var m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d >= 1) return d + 'd ' + (h % 24) + 'h';
    if (h >= 1) return h + 'h ' + (m % 60) + 'm';
    if (m >= 1) return m + 'm';
    return '<1m';
  }
  /* "Fri 09:00" — absolute reset stamp, omitted entirely when unknown */
  function fmtClock(iso) {
    if (!iso) return null;
    var t = Date.parse(iso);
    if (isNaN(t)) return null;
    try {
      return new Date(t).toLocaleString(undefined, {
        weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
      }).replace(',', '');
    } catch (e) { return null; }
  }

  var FMT = {
    pct: fmtPct, pctNum: fmtPctNum, money: fmtMoney, moneyShort: fmtMoneyShort,
    tokens: fmtTokens, dur: fmtDur, clock: fmtClock
  };

  /* --------------------------------------------------------------- the rule */
  /* METER / STATUS TONE — the single source of truth for colour.
       pct not finite (null, undefined, NaN) -> 'unknown'  track only, no fill
       pct >  95                             -> 'bad'      var(--bad)
       pct >  80                             -> 'warn'     var(--warn)
       otherwise                             -> 'ink'      var(--ink)
     Boundaries are EXCLUSIVE: exactly 80 is still 'ink', exactly 95 is 'warn'.
     The CSS reads this off [data-tone]; nothing else may set a fill colour. */
  function tone(p) {
    if (!isNum(p)) return 'unknown';
    if (p > 95) return 'bad';
    if (p > 80) return 'warn';
    return 'ink';
  }

  /* ------------------------------------------------------------ dom helpers */
  function mk(h) {
    /* local wrappers so a partial `h` cannot throw */
    return {
      el: function (tag, cls, text) {
        var n = h && typeof h.el === 'function'
          ? h.el(tag, cls, text)
          : document.createElement(tag);
        if (!(h && typeof h.el === 'function')) {
          if (cls) n.className = cls;
          if (text != null) n.textContent = String(text);
        }
        return n;
      },
      ic: function (name, size, width, color) {
        if (h && typeof h.ic === 'function') return h.ic(name, size, width, color);
        var s = document.createElement('span');
        s.style.width = s.style.height = (size || 16) + 'px';
        s.style.display = 'inline-block';
        return s;
      },
      fmt: (h && h.fmt) ? Object.assign({}, FMT, h.fmt) : FMT
    };
  }
  function num(H, cls, text) {
    return H.el('span', 'pc-num' + (cls ? ' ' + cls : ''), text);
  }
  /* hairline track + solid fill; tone and aria come from the one rule above */
  function meter(H, pct, big, tag) {
    var t = tone(pct);
    /* tag defaults to div; the strip passes 'span' so the markup stays valid
       phrasing content inside its <button> */
    var w = H.el(tag || 'div', 'pc-meter' + (big ? ' pc-meter--lg' : ''));
    w.setAttribute('data-tone', t);
    w.setAttribute('role', 'img');
    w.setAttribute('aria-label', isNum(pct)
      ? H.fmt.pctNum(pct) + '% used'
      : 'usage unknown');
    var f = H.el('i');
    f.style.setProperty('--pc-pct', isNum(pct) ? (clampPct(pct) / 100).toFixed(4) : '0');
    w.appendChild(f);
    return w;
  }
  function fire(node, name, detail, cb) {
    node.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail || null }));
    if (typeof cb === 'function') cb(detail || null);
  }

  /* ======================================================================
     PIECE 1 — ACCOUNT STRIP
     who am I on / how much have I used / when does it reset.  <=110px.
     ====================================================================== */
  function renderAccountStrip(data, h) {
    var H = mk(h), d = data || {};
    var week = d.week || {}, sess = d.session || {};
    var pct = pick(d.weeklyPct, week.pct);
    var secs = resetSecs(d);

    var root = H.el('button', 'pc-strip');
    root.type = 'button';
    root.setAttribute('aria-haspopup', 'dialog');
    root.setAttribute('aria-label',
      (d.plan || 'Account') + '. ' +
      (isNum(pct) ? H.fmt.pctNum(pct) + '% of the weekly allowance used' : 'weekly usage unknown') +
      '. Resets in ' + H.fmt.dur(secs) + '. Open limits.');

    /* --- row 1: plan + active model, weekly figure on the right --- */
    var head = H.el('span', 'pc-strip-head');
    head.appendChild(H.el('span', 'pc-strip-plan', d.plan || 'Account'));
    if (d.activeModel) head.appendChild(H.el('span', 'pc-strip-model', d.activeModel));

    var right = H.el('span', 'pc-strip-right');
    right.appendChild(H.el('span', 'pc-strip-lab', 'weekly'));
    right.appendChild(num(H, 'pc-strip-pct', isNum(pct) ? H.fmt.pctNum(pct) + '%' : DASH));
    head.appendChild(right);

    var go = H.el('span', 'pc-strip-go');
    go.appendChild(H.ic('chevron-right', 16, 1.75, 'currentColor'));
    head.appendChild(go);
    root.appendChild(head);

    /* --- row 2: the one meter --- */
    root.appendChild(meter(H, pct, false, 'span'));

    /* --- row 3: session spend + tokens, reset on the right --- */
    var foot = H.el('span', 'pc-strip-foot');
    var use = H.el('span', 'pc-strip-use');
    use.appendChild(num(H, null, H.fmt.moneyShort(pick(sess.cost, d.sessionCost))));
    use.appendChild(H.el('span', 'pc-strip-dot', '·'));
    var tk = pick(sess.tokens, d.sessionTokens);
    use.appendChild(num(H, null, H.fmt.tokens(tk)));
    use.appendChild(H.el('span', null, 'tokens'));
    foot.appendChild(use);

    var rst = H.el('span', 'pc-strip-reset');
    rst.appendChild(H.ic('clock', 12.5, 1.6, 'currentColor'));
    rst.appendChild(H.el('span', null, 'resets in'));
    rst.appendChild(num(H, null, H.fmt.dur(secs)));
    foot.appendChild(rst);
    root.appendChild(foot);

    root.addEventListener('click', function () {
      fire(root, 'pcusage:open', { source: 'strip' }, d.onOpen);
    });
    return root;
  }

  /* ======================================================================
     PIECE 2 — LIMITS SHEET
     ====================================================================== */
  function windowsOf(d) {
    if (Array.isArray(d.windows) && d.windows.length) return d.windows;
    return [
      { label: 'This session', data: d.session },
      { label: 'Today', data: d.today },
      { label: 'This week', data: d.week }
    ].map(function (w) {
      var s = w.data || {};
      return { label: w.label, cost: pick(s.cost), pct: pick(s.pct), tokens: pick(s.tokens) };
    });
  }

  function noteLines(d, secs) {
    if (typeof d.limitNote === 'string') return [d.limitNote];
    if (Array.isArray(d.limitNote)) return d.limitNote;
    var when = isNum(secs) ? (secs <= 0 ? 'now' : 'in ' + fmtDur(secs)) : 'when the window rolls over';
    return [
      'When the allowance runs out, sending pauses until the window resets — ' +
      when + '. Nothing is lost: this conversation, your files and anything queued stay exactly as they are.',
      'You can keep reading and editing while it is paused, and sending resumes on its own.'
    ];
  }

  function renderLimitsSheet(data, h) {
    var H = mk(h), d = data || {};
    var week = d.week || {};
    var pct = pick(d.weeklyPct, week.pct);
    var secs = resetSecs(d);
    var t = tone(pct);

    var root = H.el('div', 'pc-sheet-root');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Usage and limits');

    var scrim = H.el('div', 'pc-sheet-scrim');
    root.appendChild(scrim);

    var sheet = H.el('section', 'pc-sheet');
    var hold = H.el('div', 'pc-sheet-hold');
    hold.appendChild(H.el('div', 'pc-sheet-grab'));
    sheet.appendChild(hold);

    var body = H.el('div', 'pc-sheet-body');

    /* --- headline: % used, reset underneath --- */
    var hero = H.el('div', 'pc-hero');
    var hrow = H.el('div', 'pc-hero-row');
    var fig = H.el('div', 'pc-hero-fig pc-num');
    fig.appendChild(H.el('span', null, isNum(pct) ? H.fmt.pctNum(pct) : DASH));
    if (isNum(pct)) fig.appendChild(H.el('span', 'pc-hero-unit', '%'));
    hrow.appendChild(fig);
    hrow.appendChild(H.el('div', 'pc-hero-of', (d.allowanceLabel || 'of weekly allowance')));
    hero.appendChild(hrow);

    var sub = H.el('div', 'pc-hero-sub');
    if (!isNum(secs)) {
      /* unknown reset: say so in words — "resets in —" reads like a bug */
      sub.appendChild(H.el('span', null, 'reset time unknown'));
    } else if (secs <= 0) {
      sub.appendChild(H.el('span', null, 'resetting now'));
    } else {
      sub.appendChild(H.el('span', null, 'resets in'));
      sub.appendChild(num(H, null, H.fmt.dur(secs)));
    }
    var stamp = H.fmt.clock(d.resetsAt);
    if (stamp) {
      sub.appendChild(H.el('span', 'pc-hero-at', '·'));
      sub.appendChild(num(H, null, stamp));
    }
    /* status flag only above the warn threshold — same rule as the meter */
    if (t === 'warn' || t === 'bad') {
      var flag = H.el('span', 'pc-flag', t === 'bad' ? 'at limit soon' : 'running low');
      flag.setAttribute('data-tone', t);
      sub.appendChild(flag);
    }
    hero.appendChild(sub);
    hero.appendChild(meter(H, pct, true));
    body.appendChild(hero);

    /* --- by window --- */
    var sWin = H.el('div', 'pc-sec');
    sWin.appendChild(H.el('div', 'pc-lab', 'By window'));
    windowsOf(d).forEach(function (w) {
      var row = H.el('div', 'pc-win');
      var top = H.el('div', 'pc-win-top');
      top.appendChild(H.el('span', 'pc-win-name', w.label || DASH));
      var nums = H.el('div', 'pc-win-nums');
      nums.appendChild(num(H, 'pc-win-cost', H.fmt.money(pick(w.cost))));
      nums.appendChild(num(H, 'pc-win-pct', isNum(w.pct) ? H.fmt.pctNum(w.pct) + '%' : DASH));
      top.appendChild(nums);
      row.appendChild(top);
      row.appendChild(meter(H, pick(w.pct)));
      sWin.appendChild(row);
    });
    body.appendChild(sWin);

    /* --- by model --- */
    var sMod = H.el('div', 'pc-sec');
    sMod.appendChild(H.el('div', 'pc-lab', 'By model'));
    var models = Array.isArray(d.models) ? d.models : [];
    if (!models.length) {
      sMod.appendChild(H.el('div', 'pc-empty', 'No model usage recorded yet.'));
    } else {
      models.forEach(function (m) {
        m = m || {};
        var row = H.el('div', 'pc-mod');
        row.appendChild(H.el('span', 'pc-mod-name', m.name || DASH));
        var nums = H.el('div', 'pc-mod-nums');
        nums.appendChild(num(H, 'pc-mod-tok', isNum(m.tokens) ? H.fmt.tokens(m.tokens) + ' tok' : DASH));
        nums.appendChild(num(H, 'pc-mod-cost', H.fmt.money(pick(m.cost))));
        row.appendChild(nums);
        sMod.appendChild(row);
      });
    }
    body.appendChild(sMod);

    /* --- what happens at the limit --- */
    var sNote = H.el('div', 'pc-sec');
    sNote.appendChild(H.el('div', 'pc-lab', 'At the limit'));
    var note = H.el('div', 'pc-note');
    var nic = H.el('span', 'pc-note-ic');
    nic.appendChild(H.ic('info', 15, 1.6, 'currentColor'));
    note.appendChild(nic);
    var ntx = H.el('div', 'pc-note-txt');
    noteLines(d, secs).forEach(function (line) { ntx.appendChild(H.el('p', null, line)); });
    note.appendChild(ntx);
    sNote.appendChild(note);
    body.appendChild(sNote);

    sheet.appendChild(body);

    /* --- actions --- */
    var foot = H.el('div', 'pc-sheet-foot');
    var pri = d.primary || {};
    var sec = d.secondary || {};

    var b1 = H.el('button', 'pc-btn pc-btn--solid');
    b1.type = 'button';
    b1.appendChild(H.el('span', null, pri.label || 'Manage plan'));
    b1.appendChild(H.ic('arrow-up-right', 15, 1.9, 'currentColor'));
    b1.addEventListener('click', function () {
      fire(b1, 'pcusage:primary', { action: pri.action || 'manage-plan' }, d.onPrimary || pri.onTap);
    });

    var b2 = H.el('button', 'pc-btn pc-btn--quiet');
    b2.type = 'button';
    b2.appendChild(H.el('span', null, sec.label || 'Not now'));
    b2.addEventListener('click', function () {
      fire(b2, 'pcusage:secondary', { action: sec.action || 'dismiss' }, d.onSecondary || sec.onTap);
      fire(b2, 'pcusage:close', { via: 'secondary' }, d.onClose);
    });

    foot.appendChild(b1);
    foot.appendChild(b2);
    sheet.appendChild(foot);
    root.appendChild(sheet);

    scrim.addEventListener('click', function () {
      fire(scrim, 'pcusage:close', { via: 'scrim' }, d.onClose);
    });
    return root;
  }

  root.PCUSAGE = { renderAccountStrip: renderAccountStrip, renderLimitsSheet: renderLimitsSheet };
})(typeof window !== 'undefined' ? window : this);
