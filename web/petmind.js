/* PETMIND v1 — causal behaviour core for the pixel pet.
   Pure logic: no DOM, no timers, no deps. The host calls onEvent/tick and
   renders the returned instruction { anim, goto, say, hold }.

   goto : null = stay exactly where you are
          { surface:<id>, edge:'top'|'left'|'right'|'bottom', align:0..1, slide:bool }
          align 0 = start of that edge, 1 = end. slide:true means "same surface,
          walk along the edge" (cheap, never counts against the travel budget).
   hold : ms the host should let the animation play before asking the mind again.
*/
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ tuning */
  var T = {
    settleAt:   8000,    // idle -> walk to rest anchor, sit down
    stretchAt:  45000,   // one stretch, then sit again
    dozeAt:     120000,  // head down, slow blinks
    sleepAt:    300000,  // asleep
    minRest:    6000,    // minimum stillness between two journeys
    windowMs:   60000,   // journey budget window
    maxJourney: 4,       // journeys per window (priority >= 4 bypasses)
    wanderTick: 30000,   // how often an aimless-walk roll happens
    wanderP:    0.12,    // chance per roll
    wanderGap:  120000,  // never two wanders closer than this
    wanderMax:  2,       // per idle episode
    wanderHold: [1200, 2500],
    nudgeAt:    [0, 12000, 32000, 75000], // attention ladder offsets
    nudgeMax:   4,
    runMarks:   [60000, 150000, 300000],  // long-run self-markers
    limitGap:   30000, limitSays: 2,
    tapGap:     2500, tapSpam: 3, tapSpamWin: 10000,
    sayGap:     9000,    // no two spoken lines closer than this
    blinkGap:   [3000, 7000] // a blink is a beat, not a nervous tic
  };

  /* ------------------------------------------------- deterministic character */
  function hash32(s) {
    var h = 2166136261 >>> 0; s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var S = null;

  function makeTraits(seed) {
    var r = rng(hash32(seed));
    return {
      tempo:      0.85 + r() * 0.30,  // <1 quicker to settle, >1 lazier
      boldness:   r(),                // wander appetite, cheer size
      tidiness:   r(),                // >0.5 prefers the composer corner
      chattiness: 0.30 + r() * 0.55,  // chance of speaking an optional line
      side:       r() < 0.5 ? 0.08 : 0.92 // which end of an edge it likes
    };
  }

  function init(ctx) {
    ctx = ctx || {};
    S = {
      traits: makeTraits(ctx.seed != null ? ctx.seed : 'pet'),
      drift: 0.3819660113,            // golden-ratio low-discrepancy sequence
      pos: null, anim: 'idle', prio: 0, holdUntil: 0,
      queue: [],
      lastJourneyAt: -1e9, journeys: [],
      lastEventAt: ctx.now || 0, idleSince: ctx.now || 0,
      stage: 'awake', ladder: null, stretched: false,
      wanders: 0, lastWanderAt: -1e9, lastWanderRoll: ctx.now || 0,
      nudge: null,                    // { kind, n, nextAt, anchor }
      limit: { n: 0, nextAt: 0, until: 0 },
      run: { active: false, startAt: 0, mark: 0 },
      online: true,
      taps: [], lastTapAt: -1e9, tapIdx: 0,
      saidAt: -1e9, recent: [], lastBlinkAt: -1e9, blinkGap: 3200
    };
    return S;
  }
  function st(ctx) { return S || init(ctx); }

  // next value of the drift sequence: even spread, never two neighbours alike
  function d() { S.drift = (S.drift + 0.6180339887) % 1; return S.drift; }
  function k(ms) { return Math.round(ms * S.traits.tempo); }               // stable scale
  function jit(ms, amp) { return Math.round(k(ms) * (1 + (d() - 0.5) * 2 * (amp == null ? 0.18 : amp))); }

  /* ----------------------------------------------------------------- surfaces */
  function surfaces(ctx) {
    var a = (ctx && ctx.surfaces) || [];
    var out = [];
    for (var i = 0; i < a.length; i++) {
      var s = a[i];
      if (!s || !s.id) continue;
      if (s.visible === false) continue;
      if ((s.perchWidth != null ? s.perchWidth : s.width || 0) < 40) continue;
      out.push(s);
    }
    return out;
  }
  function find(ctx, pred) {
    var all = surfaces(ctx);
    for (var i = 0; i < all.length; i++) if (pred(all[i])) return all[i];
    return null;
  }
  function byId(ctx, id) { return id ? find(ctx, function (s) { return s.id === id; }) : null; }
  function byKind(ctx, kind) { return find(ctx, function (s) { return s.kind === kind; }); }
  function newestCard(ctx) {
    var best = null, all = surfaces(ctx);
    for (var i = 0; i < all.length; i++) {
      var s = all[i];
      if (s.kind !== 'card') continue;
      if (!best || (s.age || 0) < (best.age || 0)) best = s;
    }
    return best;
  }
  function anchor(s, edge, align, slide) {
    if (!s) return null;
    return { surface: s.id, edge: edge || 'top', align: align == null ? S.traits.side : align, slide: !!slide };
  }
  function sameSurface(g) { return g && S.pos && g.surface === S.pos.surface; }

  /* ---------------------------------------------------------------- resting */
  /* Scoring, highest wins. A rest spot must be (a) visible, (b) wide enough to
     perch on, (c) not an element the user is about to press, (d) near where the
     pet already is, so settling is never a trek. */
  function pickRest(surfs, ctx) {
    ctx = ctx || {}; st(ctx);
    var list = surfs && surfs.length ? surfs : surfaces(ctx);
    var tr = S.traits, best = null, bestScore = -1e9;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s || s.visible === false) continue;
      if ((s.perchWidth != null ? s.perchWidth : s.width || 0) < 40) continue;
      var sc = 0, edge = 'top', align = tr.side;

      if (s.kind === 'composer')      { sc = 100; edge = 'top'; align = tr.tidiness > 0.5 ? 0.94 : 0.06; }
      else if (s.kind === 'card')     { sc = 86 - Math.min(26, (s.age || 0) / 1000 / 6); edge = 'top'; }
      else if (s.kind === 'status')   { sc = 72; edge = 'right'; align = 0.5; }
      else if (s.kind === 'row')      { sc = 58; }
      else if (s.kind === 'header')   { sc = 44; edge = 'bottom'; align = 0.9; }
      else if (s.kind === 'button')   { sc = 20; }          // standing on a button looks wrong
      else                            { sc = 30; }

      if (s.pending) sc += 120;                              // sentinel duty outranks comfort
      if (s.kind === 'composer' && ctx.typing) sc -= 35;     // don't loom over the caret
      if (s.kind === 'status' && (S.run.active || !S.online)) sc += 24;
      if (s.scrolling || ctx.scrolling) sc -= 40;
      if (S.pos && s.id === S.pos.surface) sc += 18;         // staying put is cheapest
      sc -= 0.04 * dist(ctx, s);
      sc += 6 * (tr.tidiness - 0.5) * (s.kind === 'composer' ? 1 : -1);

      if (sc > bestScore) { bestScore = sc; best = anchor(s, edge, align); }
    }
    return best || anchor(byKind(ctx, 'composer') || list[0], 'top', tr.side);
  }
  function dist(ctx, s) {
    if (!S.pos || !ctx) return 0;
    var cur = byId(ctx, S.pos.surface);
    if (!cur) return 0;
    var dx = (s.left || 0) - (cur.left || 0), dy = (s.top || 0) - (cur.top || 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* ------------------------------------------------------- travel budgeting */
  function canTravel(now, prio) {
    if (prio >= 4) return true;                              // user is blocked: always go
    S.journeys = S.journeys.filter(function (t) { return now - t < T.windowMs; });
    if (S.journeys.length >= T.maxJourney) return false;
    return (now - S.lastJourneyAt) >= k(T.minRest);
  }
  function noteTravel(now, g) {
    if (!g || g.slide || sameSurface(g)) return;
    S.lastJourneyAt = now; S.journeys.push(now);
  }

  /* ----------------------------------------------------------------- speech */
  var LINES = {
    hello:   ['back.', 'hey.', 'still here.'],
    sent:    ['on it.', 'taking this up.'],
    tool:    ['poking at it.', 'reading.'],
    broke:   ['that one broke.', 'tool failed.'],
    plan:    ['plan is ready.', 'needs your yes.'],
    ask:     ['it is asking you.', 'question for you.'],
    done:    ['done.', 'finished.'],
    stopped: ['stopped.', 'ok, dropped it.'],
    limit:   ['rate limit. waiting.', 'throttled.'],
    offline: ['no connection.', 'signal gone.'],
    online:  ['back online.'],
    longrun: ['still going.', 'long one.'],
    tapped:  ['hi.', 'mm?', 'yes?'],
    annoyed: ['ok ok.']
  };
  function say(now, key, force) {
    var pool = LINES[key]; if (!pool) return null;
    if (!force && d() > S.traits.chattiness) return null;
    if (now - S.saidAt < k(T.sayGap) && !force) return null;
    var pick = null;
    for (var i = 0; i < pool.length; i++) {
      var cand = pool[Math.floor(d() * pool.length) % pool.length];
      if (S.recent.indexOf(cand) < 0) { pick = cand; break; }
    }
    if (!pick) pick = pool[0];
    S.recent.push(pick); if (S.recent.length > 3) S.recent.shift();
    S.saidAt = now;
    return pick;
  }

  /* ------------------------------------------------------------ instruction */
  function emit(now, prio, anim, goto_, line, hold) {
    if (now < S.holdUntil && prio < S.prio) return null;     // current beat wins
    if (prio >= 3) S.queue = S.queue.filter(function (q) { return q.prio >= prio; });
    if (goto_ && !canTravel(now, prio)) goto_ = null;        // keep the animation, drop the trip
    noteTravel(now, goto_);
    if (goto_) S.pos = goto_;
    S.anim = anim; S.prio = prio; S.holdUntil = now + (hold || 0);
    return { anim: anim, goto: goto_ || null, say: line || null, hold: hold || 0 };
  }
  function queue(now, delay, prio, anim, goto_, line, hold) {
    S.queue.push({ at: now + delay, prio: prio, anim: anim, goto: goto_, say: line, hold: hold || 0 });
  }
  function wake(now) {
    S.lastEventAt = now; S.idleSince = now; S.ladder = null;
    S.stage = 'awake'; S.stretched = false; S.wanders = 0;
  }

  /* --------------------------------------------------------------- idleness */
  function ladder(now) {
    if (!S.ladder) S.ladder = {
      settle:  S.idleSince + jit(T.settleAt, 0.25),
      stretch: S.idleSince + jit(T.stretchAt, 0.20),
      doze:    S.idleSince + jit(T.dozeAt, 0.15),
      sleep:   S.idleSince + jit(T.sleepAt, 0.12)
    };
    return S.ladder;
  }

  /* ============================================================== onEvent */
  function onEvent(name, ctx) {
    ctx = ctx || {}; var s = st(ctx);
    var now = ctx.now || 0;
    var comp = byKind(ctx, 'composer'), status = byKind(ctx, 'status') || comp;
    var card = newestCard(ctx);
    var tool = byId(ctx, ctx.toolId) || byKind(ctx, 'row');
    var P = ctx.pendingSurface ? byId(ctx, ctx.pendingSurface) : null;

    switch (name) {

      case 'app_opened': {
        wake(now);
        var rest = pickRest(null, ctx);
        if (now - (ctx.lastSeenAt || 0) < 120000) {          // quick return: no fuss
          return emit(now, 2, 'wave', rest, say(now, 'hello'), 700);
        }
        queue(now, 900, 1, 'sit', null, null, 0);
        return emit(now, 2, 'stretch', rest, say(now, 'hello'), 900);
      }

      case 'user_typing': {
        wake(now);
        if (s.stage === 'asleep' || s.stage === 'dozing') {
          queue(now, 500, 1, 'idle', null, null, 0);
          return emit(now, 2, 'blink', null, null, 500);
        }
        // tuck out of the caret's way along the same edge; that is a slide, free
        var away = comp ? anchor(comp, 'top', s.traits.tidiness > 0.5 ? 0.96 : 0.04, sameSurface({ surface: comp.id })) : null;
        return emit(now, 1, 'look', away, null, 600);
      }

      case 'message_sent': {
        wake(now); s.run.active = true; s.run.startAt = now; s.run.mark = 0;
        var dst = card ? anchor(card, 'top', 0.5) : status && anchor(status, 'right', 0.5);
        queue(now, 900, 2, 'deliver', null, null, 600);
        return emit(now, 2, 'carry', dst, say(now, 'sent'), 900);
      }

      case 'agent_thinking': {
        wake(now); s.run.active = true; if (!s.run.startAt) s.run.startAt = now;
        return emit(now, 2, 'work', status ? anchor(status, 'right', 0.5) : null, null, 0);
      }

      case 'tool_started':
        wake(now);
        return emit(now, 2, 'read', tool ? anchor(tool, 'left', 0.12) : null, say(now, 'tool'), 0);

      case 'tool_finished_ok':
        wake(now);
        queue(now, 700, 2, s.run.active ? 'work' : 'sit', null, null, 0);
        return emit(now, 2, 'cheer', null, null, 700);

      case 'tool_failed':
        wake(now);
        queue(now, 900, 3, 'sit', null, null, 0);
        return emit(now, 3, 'panic', tool ? anchor(tool, 'left', 0.12) : null, say(now, 'broke', true), 900);

      case 'plan_pending':
      case 'question_pending': {
        wake(now);
        var kind = name === 'plan_pending' ? 'plan' : 'ask';
        var a = P ? anchor(P, 'left', 0.12) : (card ? anchor(card, 'left', 0.12) : null);
        s.nudge = { kind: kind, n: 1, nextAt: now + jit(T.nudgeAt[1], 0.2), anchor: a };
        queue(now, 1000, 4, 'sit', null, null, 0);          // then it just waits there
        return emit(now, 4, kind === 'plan' ? 'look' : 'wave', a, say(now, kind, true), 1000);
      }

      case 'agent_finished': {
        wake(now); s.run.active = false; s.run.mark = 0;
        var at = card ? anchor(card, 'top', 0.5) : null;
        queue(now, 1000, 1, 'sit', null, null, 0);
        return emit(now, 2, 'cheer', at, say(now, 'done'), 1000);
      }

      case 'agent_stopped':
        wake(now); s.run.active = false;
        return emit(now, 3, 'sit', null, say(now, 'stopped'), 600);   // no travel: it just sits down

      case 'rate_limit': {
        wake(now);
        s.limit = { n: 1, nextAt: now + k(T.limitGap), until: now + (ctx.retryMs || 0) };
        queue(now, 800, 4, 'sit', null, null, 0);
        var line = 'rate limit' + (ctx.retryMs ? ' — ' + Math.ceil(ctx.retryMs / 1000) + 's' : '. waiting.');
        return emit(now, 4, 'panic', status ? anchor(status, 'right', 0.5) : null, line, 800);
      }

      case 'connection_lost':
        wake(now); s.online = false;
        queue(now, 1000, 5, 'dig', null, null, 0);          // digs for signal until it is back
        return emit(now, 5, 'panic', status ? anchor(status, 'right', 0.5) : null, say(now, 'offline', true), 1000);

      case 'connection_restored':
        wake(now); s.online = true;
        queue(now, 800, 1, 'walk', pickRest(null, ctx), null, 0);
        return emit(now, 3, 'cheer', null, say(now, 'online', true), 800);

      case 'long_run_minute': {
        var m = s.run.mark;
        if (m >= T.runMarks.length) return null;
        s.run.mark = m + 1;
        if (m === 0) return emit(now, 1, 'stretch', null, null, 900);
        if (m === 1) return emit(now, 1, 'sit', null, say(now, 'longrun'), 600);
        return emit(now, 1, 'sleep', null, null, 0);        // naps through the long haul
      }

      case 'user_idle':
        return tick(now, ctx);

      case 'pet_tapped': {
        if (now - s.lastTapAt < k(T.tapGap)) return null;
        s.lastTapAt = now;
        s.taps = s.taps.filter(function (t) { return now - t < T.tapSpamWin; });
        s.taps.push(now);
        if (s.taps.length >= T.tapSpam) {                    // being poked: one justified retreat
          s.taps = [];
          var away2 = pickRest(null, ctx);
          queue(now, 1200, 2, 'sit', away2, null, 0);
          return emit(now, 3, 'panic', null, say(now, 'annoyed', true), 1200);
        }
        if (s.nudge) return emit(now, 4, 'wave', s.nudge.anchor, say(now, s.nudge.kind, true), 900);
        if (s.stage === 'asleep' || s.stage === 'dozing') {
          wake(now);
          queue(now, 1200, 1, 'sit', null, null, 0);
          return emit(now, 2, 'stretch', null, say(now, 'tapped'), 1200);
        }
        wake(now);
        var cycle = ['wave', 'cheer', 'dance', 'stretch'];
        var a2 = cycle[(s.tapIdx + Math.floor(d() * 2)) % cycle.length]; s.tapIdx++;
        return emit(now, 2, a2, null, say(now, 'tapped'), a2 === 'dance' ? 1600 : 900);
      }
    }
    return null;
  }

  /* ================================================================= tick */
  function tick(now, ctx) {
    ctx = ctx || {}; var s = st(ctx); now = now || ctx.now || 0;

    // 1. queued follow-up beats (the second half of a reaction)
    if (s.queue.length && now >= s.queue[0].at) {
      var q = s.queue.shift();
      return emit(now, q.prio, q.anim, q.goto || null, q.say || null, q.hold);
    }
    if (now < s.holdUntil) return null;

    // 2. offline: keep digging, nothing else matters
    if (!s.online) {
      s.queue = s.queue.filter(function (q) { return q.prio >= 5; });
      if (s.anim !== 'dig' && !s.queue.length) return emit(now, 5, 'dig', null, null, 0);
      return null;
    }

    // 3. attention ladder for things that block the user
    if (s.nudge) {
      if (ctx.pendingSurface === undefined ? false : !ctx.pendingSurface) { s.nudge = null; }
      else if (now >= s.nudge.nextAt) {
        var n = s.nudge.n;
        if (n >= T.nudgeMax) { s.nudge.nextAt = Infinity; return emit(now, 4, 'sit', s.nudge.anchor, null, 0); }
        s.nudge.n = n + 1;
        s.nudge.nextAt = now + jit(T.nudgeAt[Math.min(n + 1, T.nudgeAt.length - 1)] - T.nudgeAt[n], 0.2);
        var anims = ['wave', 'look', 'stretch', 'sit'];
        return emit(now, 4, anims[Math.min(n, 3)], s.nudge.anchor, n === 1 ? say(now, s.nudge.kind, true) : null, 900);
      }
    }

    // 4. rate-limit reminders, twice at most
    if (s.limit.n > 0 && s.limit.n <= T.limitSays && now >= s.limit.nextAt) {
      s.limit.n++; s.limit.nextAt = now + k(T.limitGap);
      var left = s.limit.until > now ? Math.ceil((s.limit.until - now) / 1000) + 's left' : null;
      return emit(now, 3, 'look', null, left || say(now, 'limit', true) || 'still throttled.', 700);
    }

    // 5. a pending plan/question outranks everything below: stay on the card
    if (s.nudge) return null;

    // 6. long-run self markers while the agent works
    if (s.run.active && s.run.startAt) {
      var m = s.run.mark;
      if (m < T.runMarks.length && now - s.run.startAt >= k(T.runMarks[m])) return onEvent('long_run_minute', mergeNow(ctx, now));
      return null;                                           // working: stay on the status strip
    }

    // 7. idleness ladder — settle, sit, stretch, doze, sleep
    var L = ladder(now), idle = now - s.idleSince;

    if (s.stage === 'awake' && now >= L.settle) {
      var rest = pickRest(null, ctx);
      s.stage = 'settled';
      var needWalk = !s.pos || !rest || rest.surface !== s.pos.surface;
      queue(now, needWalk ? 900 : 200, 1, 'sit', null, null, 0);
      return emit(now, 1, needWalk ? 'walk' : 'sit', rest, null, needWalk ? 900 : 200);
    }
    if (s.stage === 'settled' && now >= L.stretch && !s.stretched) {
      s.stretched = true;
      queue(now, 1000, 1, 'sit', null, null, 0);
      return emit(now, 1, 'stretch', null, null, 1000);
    }
    if (s.stage !== 'dozing' && s.stage !== 'asleep' && now >= L.doze) {
      s.stage = 'dozing'; s.blinkGap = k(9000);              // head down: blinks go slow
      var spot = pickRest(null, ctx);
      return emit(now, 1, 'sit', spot && spot.surface !== (s.pos && s.pos.surface) ? spot : null, null, 0);
    }
    if (s.stage === 'dozing' && now >= L.sleep) { s.stage = 'asleep'; return emit(now, 1, 'sleep', null, null, 0); }
    if (s.stage === 'dozing' && now - s.lastBlinkAt >= s.blinkGap) {
      s.lastBlinkAt = now; s.blinkGap = k(9000 + d() * 6000);
      return emit(now, 0, 'blink', null, null, 320);
    }

    // 8. aimless walking — the only uncaused motion, and it is rationed
    if ((s.stage === 'awake' || s.stage === 'settled') && idle > k(T.settleAt)) {
      if (now - s.lastWanderRoll >= k(T.wanderTick)) {
        s.lastWanderRoll = now;
        var p = T.wanderP * (0.5 + s.traits.boldness);
        if (s.wanders < T.wanderMax && now - s.lastWanderAt >= k(T.wanderGap) && d() < p && canTravel(now, 1)) {
          s.wanders++; s.lastWanderAt = now;
          var hold = Math.round(T.wanderHold[0] + d() * (T.wanderHold[1] - T.wanderHold[0]));
          var here = s.pos ? { surface: s.pos.surface, edge: s.pos.edge, align: clamp01((s.pos.align || 0.5) + (d() - 0.5) * 0.5), slide: true } : null;
          queue(now, hold, 1, 'sit', null, null, 0);
          return emit(now, 1, 'walk', here, null, hold);     // a few steps along the same edge
        }
      }
      if (s.anim !== 'idle' && s.anim !== 'sit' && s.anim !== 'blink') return emit(now, 0, s.stage === 'settled' ? 'sit' : 'idle', null, null, 0);
      if (now - s.lastBlinkAt >= s.blinkGap) {               // one blink every 3-7s, drifting
        s.lastBlinkAt = now;
        s.blinkGap = Math.round(k(T.blinkGap[0] + d() * (T.blinkGap[1] - T.blinkGap[0])));
        return emit(now, 0, 'blink', null, null, 260);
      }
    }
    return null;
  }
  function clamp01(v) { return v < 0.04 ? 0.04 : v > 0.96 ? 0.96 : v; }
  function mergeNow(ctx, now) { var o = {}; for (var k2 in ctx) o[k2] = ctx[k2]; o.now = now; return o; }

  root.PETMIND = {
    onEvent: onEvent,
    pickRest: pickRest,
    tick: tick,
    _init: init, _tuning: T,
    _state: function () { return S; }
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
