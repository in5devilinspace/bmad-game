// WH.juice — JUICE + CHRONICLE + TITLE  (render-plan layers 7-9 + beat scheduler)
// Presentation-only. Consumes the canonical EventLog / Thief / Token shapes from
// interfaces.md. NEVER blocks the sim; NEVER mutates game state.
//
// Public API (root.WH.juice):
//   push(event)            queue one EventLog entry as beats (drama and/or bubble)
//   sync(game)             convenience: push every not-yet-seen game.eventLog entry
//   tick(dtMs)             advance pacing/fx; caps 1 dramatic event / 1.5s, <=2 bubbles,
//                          drops stale beats
//   drawFx(ctx, game)      layer 7: screenshake, alarm shockwave rings, banknote confetti,
//                          closed-vocabulary speech bubbles
//   camera()               {x,y} shake offset the integrator may apply to layers 1-6
//   timeScale()            0..1 sim-time multiplier for slow-mo (1 = normal)
//   bubbleCount()          bubbles currently on screen
//   reset()                clear all queues/fx (call on new run)
//   chronicle(game)        -> {lines:string[](5-8), moons, pips, fate}  templated from
//                          eventLog + final memory streams, blame via token lineage
//   drawChronicle(ctx,game,t)  layer 9: parchment scroll, diegetic outcome, zero numerals
//   titleScreen(ctx, t)    noir title screen
//
// Coordinate convention (integration): reads game.view = {cell, ox, oy} if present,
// else derives a centered 24x16 grid from ctx.canvas. See interfaces.md perception geometry.
(function (root) {
  root.WH = root.WH || {};

  var GAP = 1500;        // min ms between dramatic beats (spec constraint)
  var MAX_BUB = 2;       // max speech bubbles on screen (spec constraint)
  var STALE = 2600;      // pending beat older than this is dropped
  var BUB_TTL = 1900;
  var SLOWMO_MS = 650;

  var GEM_CELL = { x: 11, y: 0 };
  var CENTER = { x: 11, y: 8 };

  // region bounds for place-name lookup (vault-map.md, canonical)
  var REGIONS = [
    ['entry', 'the entrance', 9, 14, 13, 15],
    ['hall-b', 'hall B', 11, 12, 4, 12],
    ['hall-a', 'hall A', 4, 19, 8, 9],
    ['west-store', 'the west storeroom', 1, 6, 10, 14],
    ['east-store', 'the east storeroom', 17, 22, 10, 14],
    ['west-gallery', 'the west gallery', 1, 6, 3, 7],
    ['east-gallery', 'the east gallery', 17, 22, 3, 7],
    ['antechamber', 'the antechamber', 9, 14, 2, 3],
    ['sanctum', 'the sanctum', 10, 13, 0, 1]
  ];
  var WINGS = {
    central: 'the central hall', 'west wing': 'the west wing', 'east wing': 'the east wing',
    inner: 'the inner rooms', south: 'the south way', 'the whole vault': 'the whole vault'
  };

  // ---- state -------------------------------------------------------------
  var Q = null;
  function fresh() {
    return {
      clock: 0, lastDrama: -1e9, lastDramaAt: -1e9,
      pending: [], pendBub: [], bubbles: [],
      rings: [], confetti: [], shake: 0, slowmo: 0,
      cursor: 0, chron: null
    };
  }
  Q = fresh();

  // ---- helpers -----------------------------------------------------------
  function rnd() {
    return (root.WH.sim && typeof root.WH.sim.rng === 'function') ? root.WH.sim.rng() : Math.random();
  }
  function view(game, ctx) {
    if (game && game.view && game.view.cell) return game.view;
    var c = ctx.canvas, cell = Math.min(c.width / 24, c.height / 16);
    return { cell: cell, ox: (c.width - cell * 24) / 2, oy: (c.height - cell * 16) / 2 };
  }
  function px(v, x) { return v.ox + (x + 0.5) * v.cell; }
  function py(v, y) { return v.oy + (y + 0.5) * v.cell; }
  function idOf(t) { return (t && typeof t === 'object') ? t.id : t; }
  function thiefById(game, id) {
    var a = (game && game.thieves) || [], i;
    for (i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }
  function nameOf(game, id) { var t = thiefById(game, idOf(id)); return t ? t.name : String(idOf(id) || 'someone'); }
  function posOf(game, id) { var t = thiefById(game, idOf(id)); return (t && t.pos) ? t.pos : null; }
  function evts(game) { return (game && game.eventLog) || []; }

  function cellRegion(x, y) {
    for (var i = 0; i < REGIONS.length; i++) {
      var r = REGIONS[i];
      if (x >= r[2] && x <= r[3] && y >= r[4] && y <= r[5]) return r;
    }
    return null;
  }
  function placeName(loc) {
    if (loc == null) return 'the vault';
    if (typeof loc === 'string') {
      for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i][0] === loc) return REGIONS[i][1];
      if (WINGS[loc]) return WINGS[loc];
      return 'the vault';
    }
    if (loc.a && loc.b) return 'the crawlway';
    if (typeof loc.x === 'number') { var r = cellRegion(loc.x, loc.y); return r ? r[1] : 'the dark'; }
    return 'the vault';
  }
  var WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  function word(n) { n = Math.max(0, Math.round(n)); return WORDS[n] || 'many'; }

  // ---- beat intake -------------------------------------------------------
  function drama(fx, cell) { Q.pending.push({ fx: fx, cell: cell || CENTER, born: Q.clock }); }
  function bubble(glyph, cell, mutate) { Q.pendBub.push({ glyph: glyph, cell: cell, mutate: !!mutate, born: Q.clock }); }

  // map one EventLog entry -> beats. Closed EventLog vocabulary (interfaces.md).
  function push(ev) {
    if (!ev || !ev.type) return;
    var c = ev.cell || null, at = ev.at || c;           // at: bubble anchor (sync sets from thief pos)
    switch (ev.type) {
      case 'TRAP_TRIP':
        drama('trap', c); bubble('TRAP_AT', at, false); break;
      case 'PLATE_TRIP':
        drama('plate', c); break;                       // slow-mo + shake
      case 'ALARM_ARMED':
        drama('armed', c); break;
      case 'ALARM_TRIPPED':
        drama('alarm', c || ev.at || CENTER); break;    // shockwave rings
      case 'LOOT_GRAB':
        drama('loot', c); break;                        // banknote confetti
      case 'GEM_GRAB':
        drama('gem', GEM_CELL); break;
      case 'FLEE':
        bubble('flee', at, false); break;
      case 'SPOTTED':
        var tk = ev.token; if (tk && isDanger(tk.type)) bubble(tk.type, at, false); break;
      case 'GOSSIP':
        if (ev.mutation) bubble(mutatedGlyph(ev), ev.at || null, true); break;
      default: break;                                   // non-juiced events ignored
    }
  }
  function isDanger(t) { return t === 'TRAP_AT' || t === 'ALARM_AT' || t === 'PLATE_AT'; }
  function mutatedGlyph(ev) {
    var m = ev.mutation, to = ev.toType || (ev.token && ev.token.type);
    if (m === 'type-slip' && to) return to;
    return to || 'TRAP_AT';
  }

  function sync(game) {
    var log = evts(game), i;
    for (i = Q.cursor; i < log.length; i++) push(withThiefPos(game, log[i]));
    Q.cursor = log.length;
  }
  // resolve a bubble anchor from the event's thief position at intake time
  function withThiefPos(game, ev) {
    if (ev && ev.thief != null && !ev.at) {
      var p = posOf(game, ev.thief);
      if (p) { var e2 = {}; for (var k in ev) e2[k] = ev[k]; e2.at = p; return e2; }
    }
    return ev;
  }

  // ---- pacing tick -------------------------------------------------------
  function dropStale(list) {
    for (var i = list.length - 1; i >= 0; i--) if (Q.clock - list[i].born > STALE) list.splice(i, 1);
  }
  function tick(dt) {
    dt = dt || 0; Q.clock += dt;
    dropStale(Q.pending); dropStale(Q.pendBub);
    // promote at most one dramatic beat per GAP
    if (Q.pending.length && Q.clock - Q.lastDramaAt >= GAP) { activate(Q.pending.shift()); Q.lastDramaAt = Q.clock; }
    // fill bubble slots
    while (Q.bubbles.length < MAX_BUB && Q.pendBub.length) {
      var b = Q.pendBub.shift(); b.ttl = BUB_TTL; b.t = 0; Q.bubbles.push(b);
    }
    // decay
    Q.shake *= Math.pow(0.0025, dt / 1000); if (Q.shake < 0.4) Q.shake = 0;
    if (Q.slowmo > 0) Q.slowmo -= dt;
    // rings
    for (var i = Q.rings.length - 1; i >= 0; i--) {
      var r = Q.rings[i]; r.age += dt; if (r.age >= r.life) Q.rings.splice(i, 1);
    }
    // confetti
    for (var j = Q.confetti.length - 1; j >= 0; j--) {
      var p = Q.confetti[j]; p.age += dt;
      p.vy += 0.00075 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.age >= p.life) Q.confetti.splice(j, 1);
    }
    // bubbles
    for (var b2 = Q.bubbles.length - 1; b2 >= 0; b2--) {
      var bb = Q.bubbles[b2]; bb.t += dt; bb.ttl -= dt; if (bb.ttl <= 0) Q.bubbles.splice(b2, 1);
    }
  }
  function activate(beat) {
    var c = beat.cell || CENTER;
    switch (beat.fx) {
      case 'plate': Q.slowmo = SLOWMO_MS; Q.shake = Math.max(Q.shake, 15); spawnRings(c, 1, '#8fd0ff'); break;
      case 'trap': Q.shake = Math.max(Q.shake, 9); break;
      case 'armed': spawnRings(c, 1, '#ffcf6b'); break;
      case 'alarm': Q.shake = Math.max(Q.shake, 11); spawnRings(c, 3, '#ff5b5b'); break;
      case 'loot': spawnConfetti(c, 20); break;
      case 'gem': Q.shake = Math.max(Q.shake, 7); spawnConfetti(c, 46); break;
    }
  }
  function spawnRings(c, n, color) {
    for (var i = 0; i < n; i++) Q.rings.push({ x: c.x, y: c.y, age: -i * 160, life: 1100, color: color });
  }
  function spawnConfetti(c, n) {
    for (var i = 0; i < n; i++) {
      var a = rnd() * Math.PI * 2, sp = 0.02 + rnd() * 0.06;
      Q.confetti.push({
        x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.05,
        rot: rnd() * 6.28, vr: (rnd() - 0.5) * 0.02, age: 0, life: 1400 + rnd() * 700,
        hue: rnd() < 0.5 ? '#c9e6b0' : '#e8d9a0'
      });
    }
  }

  // ---- draw: layer 7 fx --------------------------------------------------
  function camera() {
    if (Q.shake <= 0) return { x: 0, y: 0 };
    return { x: (rnd() - 0.5) * Q.shake, y: (rnd() - 0.5) * Q.shake };
  }
  function timeScale() { return Q.slowmo > 0 ? 0.35 : 1; }
  function bubbleCount() { return Q.bubbles.length; }

  function drawFx(ctx, game) {
    var v = view(game, ctx), cam = camera();
    ctx.save();
    ctx.translate(cam.x, cam.y);
    // shockwave rings
    for (var i = 0; i < Q.rings.length; i++) {
      var r = Q.rings[i]; if (r.age < 0) continue;
      var k = r.age / r.life, rad = v.cell * (0.5 + k * 6);
      ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = r.color; ctx.lineWidth = Math.max(1.5, v.cell * 0.18 * (1 - k));
      ctx.beginPath(); ctx.arc(px(v, r.x), py(v, r.y), rad, 0, 6.2832); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // banknote confetti
    for (var j = 0; j < Q.confetti.length; j++) {
      var p = Q.confetti[j], k2 = p.age / p.life, w = v.cell * 0.34, h = v.cell * 0.18;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - k2);
      ctx.translate(px(v, p.x), py(v, p.y)); ctx.rotate(p.rot);
      ctx.fillStyle = p.hue; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = 'rgba(40,60,30,.5)'; ctx.lineWidth = 1; ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // speech bubbles (closed-vocabulary glyphs only)
    for (var b = 0; b < Q.bubbles.length; b++) drawBubble(ctx, game, v, Q.bubbles[b], cam);
  }

  function drawBubble(ctx, game, v, b, cam) {
    var cell = b.at || b.cell || CENTER;
    var x = px(v, cell.x) + cam.x, y = py(v, cell.y) - v.cell * 1.1 + cam.y;
    var pop = Math.min(1, b.t / 140), fade = Math.min(1, b.ttl / 300);
    var R = v.cell * 0.62 * pop;
    ctx.save(); ctx.globalAlpha = fade;
    ctx.fillStyle = '#f4f0e6'; ctx.strokeStyle = '#20242e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, R, 0, 6.2832); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - R * 0.3, y + R * 0.7); ctx.lineTo(x, y + R * 1.35); ctx.lineTo(x + R * 0.35, y + R * 0.7);
    ctx.closePath(); ctx.fill();
    drawGlyph(ctx, b.glyph, x, y, R * 0.62, b.mutate);
    ctx.restore();
  }

  // closed-vocabulary glyphs — canvas vector, no free text
  function drawGlyph(ctx, kind, x, y, r, mutate) {
    ctx.save(); ctx.translate(x, y); ctx.lineWidth = 2; ctx.lineJoin = 'round';
    var danger = (kind === 'TRAP_AT' || kind === 'ALARM_AT' || kind === 'PLATE_AT');
    ctx.strokeStyle = danger ? '#b22' : '#334'; ctx.fillStyle = danger ? '#c33' : '#445';
    if (kind === 'TRAP_AT') {                         // spikes
      ctx.beginPath();
      for (var i = -1; i <= 1; i++) { ctx.moveTo(i * r * 0.5, r * 0.6); ctx.lineTo(i * r * 0.5 + r * 0.25, -r * 0.6); ctx.lineTo(i * r * 0.5 + r * 0.5, r * 0.6); }
      ctx.stroke();
    } else if (kind === 'ALARM_AT') {                 // bell
      ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.55, Math.PI, 0); ctx.lineTo(r * 0.55, r * 0.35); ctx.lineTo(-r * 0.55, r * 0.35); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(0, r * 0.5, r * 0.14, 0, 6.28); ctx.fill();
    } else if (kind === 'PLATE_AT') {                 // plate
      ctx.strokeRect(-r * 0.55, -r * 0.35, r * 1.1, r * 0.7); ctx.beginPath(); ctx.moveTo(-r * 0.3, 0); ctx.lineTo(r * 0.3, 0); ctx.stroke();
    } else if (kind === 'LOOT_AT') {                  // coin
      ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, 6.28); ctx.fillStyle = '#d8b24a'; ctx.fill(); ctx.stroke();
    } else if (kind === 'GEM_AT') {                   // gem
      ctx.beginPath(); ctx.moveTo(0, -r * 0.6); ctx.lineTo(r * 0.55, -r * 0.1); ctx.lineTo(0, r * 0.6); ctx.lineTo(-r * 0.55, -r * 0.1); ctx.closePath(); ctx.fillStyle = '#7fe0d0'; ctx.fill(); ctx.stroke();
    } else if (kind === 'flee') {                      // bent arrow out
      ctx.strokeStyle = '#334'; ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.4); ctx.lineTo(r * 0.2, r * 0.4); ctx.lineTo(r * 0.2, -r * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.6); ctx.lineTo(r * 0.5, -r * 0.2); ctx.lineTo(-r * 0.1, -r * 0.2); ctx.closePath(); ctx.fillStyle = '#334'; ctx.fill();
    } else {                                          // generic mark
      ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, 6.28); ctx.stroke();
    }
    if (mutate) {                                     // mutation swirl overlay
      ctx.strokeStyle = '#a05bd0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r * 0.55, -r * 0.55, r * 0.32, 0.4, 5.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.82, -r * 0.62); ctx.lineTo(r * 0.9, -r * 0.3); ctx.lineTo(r * 0.6, -r * 0.42); ctx.closePath(); ctx.fillStyle = '#a05bd0'; ctx.fill();
    }
    ctx.restore();
  }

  // ---- Chronicle (layer 9) ----------------------------------------------
  function first(log, type) { for (var i = 0; i < log.length; i++) if (log[i].type === type) return log[i]; return null; }
  function count(log, type) { var n = 0; for (var i = 0; i < log.length; i++) if (log[i].type === type) n++; return n; }
  function epithetFor(tk) {
    if (tk && tk.hops) for (var i = tk.hops.length - 1; i >= 0; i--) {
      var m = tk.hops[i].mutation;
      if (typeof m === 'string' && /^[A-Z]/.test(m) && m.length > 3 && m !== 'Faithful') return m.toLowerCase();
    }
    return 'a deathtrap';
  }
  // find a token descended from a WHISPER (the planted lie) still held at run's end
  function lieToken(game) {
    var log = evts(game), whispers = {}, i, t, k, tk;
    for (i = 0; i < log.length; i++) if (log[i].type === 'WHISPER') whispers[log[i].tokenOriginId] = log[i];
    var thieves = (game && game.thieves) || [];
    for (t = 0; t < thieves.length; t++) {
      var mem = thieves[t].memory || [];
      for (k = 0; k < mem.length; k++) {
        tk = mem[k];
        if (tk.source === 'WHISPER' || whispers[tk.originId]) return { tok: tk, holder: thieves[t] };
      }
    }
    return null;
  }

  function chronicle(game) {
    if (Q.chron && Q.chron._for === game) return Q.chron;
    var log = evts(game), lines = [], e;

    e = first(log, 'NIGHT_START');
    if (e) lines.push('Six went in under the dark, and the entrance swallowed them whole.');

    e = first(log, 'LOOT_GRAB');
    if (e) lines.push(nameOf(game, e.thief) + ' came away heavy from ' + placeName(e.cell) + '.');

    e = first(log, 'TRAP_TRIP');
    if (e) lines.push(nameOf(game, e.thief) + ' found the spikes of ' + placeName(e.cell) + ' the hard way, and limped for the door.');

    e = first(log, 'PLATE_TRIP');
    if (e) lines.push('A loose plate in ' + placeName(e.cell) + ' spoke ' + nameOf(game, e.thief) + '\'s name to the whole house.');

    if (count(log, 'ALARM_TRIPPED')) lines.push('Then the bells woke, and the job with them.');

    // blame line via token lineage (the planted lie)
    var lie = lieToken(game);
    if (lie) {
      lines.push(lie.holder.name + ' swore ' + placeName(lie.tok.loc) + ' was ' +
        epithetFor(lie.tok) + '. It was bare stone. That whisper is why we are still poor.');
      // propagation line: did the lie reach a second stream?
      var g = null;
      for (var i = 0; i < log.length; i++) if (log[i].type === 'GOSSIP' && log[i].tokenOriginId === lie.tok.originId) { g = log[i]; break; }
      if (g) lines.push('By the next dark ' + nameOf(game, g.to) + ' believed it too — ' + nameOf(game, g.from) + ' had passed the word along.');
    }

    e = first(log, 'GEM_GRAB');
    if (e) lines.push('And in the end ' + nameOf(game, e.thief) + ' lifted the star clean out of the sanctum.');
    else lines.push('The star kept its socket in the sanctum, night after night, and never knew our names.');

    // pad from final memory streams (still run-specific token references)
    var thieves = (game && game.thieves) || [];
    for (var t = 0; lines.length < 5 && t < thieves.length; t++) {
      var mem = thieves[t].memory || [];
      if (mem.length) lines.push(thieves[t].name + ' still swears there is something waiting in ' + placeName(mem[0].loc) + '.');
    }
    if (lines.length < 5) lines.push('The gang split what little they had and swore the vault had cheated them.');
    lines = lines.slice(0, 8);

    // diegetic outcome (zero numerals)
    var gem = first(log, 'GEM_GRAB');
    var nights = Math.max(count(log, 'NIGHT_END'), count(log, 'NIGHT_START'));
    var stolenNight = gem ? (gem.night || nights) : 0;
    var moons = gem ? Math.max(0, stolenNight - 1) : nights;
    var pips = count(log, 'TRAP_TRIP') + count(log, 'PLATE_TRIP') + count(log, 'ALARM_TRIPPED') + count(log, 'FLEE');
    var fate = gem ? 'stolen' : 'safe';

    Q.chron = { _for: game, lines: lines, moons: moons, pips: pips, fate: fate };
    return Q.chron;
  }

  function drawChronicle(ctx, game, t) {
    var c = ctx.canvas, ch = chronicle(game), i;
    var W = Math.min(c.width * 0.82, 760), H = Math.min(c.height * 0.86, 620);
    var x0 = (c.width - W) / 2, unroll = Math.min(1, t / 900);
    ctx.save();
    ctx.fillStyle = 'rgba(6,7,10,.86)'; ctx.fillRect(0, 0, c.width, c.height);
    var y0 = (c.height - H) / 2, hh = H * unroll;
    // parchment
    var g = ctx.createLinearGradient(0, y0, 0, y0 + hh);
    g.addColorStop(0, '#e9dcbf'); g.addColorStop(1, '#d3c29a');
    ctx.fillStyle = g; ctx.strokeStyle = '#7a6a45'; ctx.lineWidth = 3;
    ctx.fillRect(x0, y0, W, hh); ctx.strokeRect(x0, y0, W, hh);
    // scroll rods
    ctx.fillStyle = '#5a4a2c'; ctx.fillRect(x0 - 8, y0 - 6, W + 16, 12); ctx.fillRect(x0 - 8, y0 + hh - 6, W + 16, 12);
    ctx.beginPath(); ctx.rect(x0, y0, W, hh); ctx.clip();
    // title
    ctx.fillStyle = '#3a2f1a'; ctx.textAlign = 'center';
    ctx.font = 'small-caps 700 ' + Math.round(W * 0.05) + 'px Georgia, serif';
    ctx.fillText('The Chronicle', c.width / 2, y0 + H * 0.11);
    // lines revealed over time
    ctx.textAlign = 'left'; ctx.font = 'italic ' + Math.round(W * 0.032) + 'px Georgia, serif';
    var reveal = Math.max(0, (t - 700) / 520), ly = y0 + H * 0.2, lh = (H * 0.62) / Math.max(6, ch.lines.length);
    for (i = 0; i < ch.lines.length; i++) {
      if (i > reveal) break;
      ctx.globalAlpha = Math.min(1, reveal - i + 1);
      wrap(ctx, ch.lines[i], x0 + W * 0.08, ly + i * lh, W * 0.84, lh * 0.42);
    }
    ctx.globalAlpha = 1;
    // outcome row (diegetic, zero numerals): moons | pips | gem
    if (reveal > ch.lines.length) {
      var oy = y0 + H * 0.88, cx = x0 + W * 0.5;
      for (i = 0; i < ch.moons; i++) drawMoon(ctx, x0 + W * 0.1 + i * W * 0.05, oy, W * 0.017);
      for (i = 0; i < Math.min(ch.pips, 12); i++) { ctx.fillStyle = '#5a4a2c'; ctx.fillRect(cx - W * 0.06 + i * W * 0.012, oy - 2, W * 0.006, W * 0.03); }
      drawGemFate(ctx, x0 + W * 0.88, oy, W * 0.03, ch.fate);
    }
    ctx.restore();
  }
  function wrap(ctx, text, x, y, maxW, lineH) {
    var words = text.split(' '), line = '', yy = y, i;
    for (i = 0; i < words.length; i++) {
      var test = line + words[i] + ' ';
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = words[i] + ' '; yy += lineH; }
      else line = test;
    }
    ctx.fillText(line, x, yy);
  }
  function drawMoon(ctx, x, y, r) {
    ctx.save(); ctx.fillStyle = '#c9b985'; ctx.strokeStyle = '#5a4a2c'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d3c29a'; ctx.beginPath(); ctx.arc(x + r * 0.5, y - r * 0.2, r * 0.9, 0, 6.28); ctx.fill();
    ctx.restore();
  }
  function drawGemFate(ctx, x, y, r, fate) {
    ctx.save(); ctx.translate(x, y); ctx.lineWidth = 2; ctx.strokeStyle = '#3a2f1a';
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.85, -r * 0.15); ctx.lineTo(0, r); ctx.lineTo(-r * 0.85, -r * 0.15); ctx.closePath();
    if (fate === 'stolen') { ctx.setLineDash([4, 4]); ctx.stroke(); }   // empty socket
    else { ctx.fillStyle = '#5fd0bf'; ctx.fill(); ctx.stroke(); }        // whole gem
    ctx.restore();
  }

  // ---- Title screen ------------------------------------------------------
  function titleScreen(ctx, t) {
    var c = ctx.canvas, cx = c.width / 2, cy = c.height / 2;
    var bg = ctx.createRadialGradient(cx, cy * 0.8, 40, cx, cy, Math.max(c.width, c.height) * 0.8);
    bg.addColorStop(0, '#161a22'); bg.addColorStop(1, '#05060a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
    // flickering key-light gem
    var flick = 0.72 + 0.28 * Math.sin(t / 140) * (rnd() * 0.5 + 0.5);
    ctx.save(); ctx.translate(cx, cy - c.height * 0.16); ctx.globalAlpha = flick;
    var r = Math.min(c.width, c.height) * 0.06;
    ctx.fillStyle = '#5fd0bf'; ctx.strokeStyle = '#0c1a18'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.85, -r * 0.15); ctx.lineTo(0, r); ctx.lineTo(-r * 0.85, -r * 0.15); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // title
    ctx.textAlign = 'center';
    var appear = Math.min(1, t / 800);
    ctx.globalAlpha = appear;
    ctx.fillStyle = '#f2ede2';
    ctx.font = '700 ' + Math.round(Math.min(c.width * 0.11, 96)) + 'px Georgia, "Times New Roman", serif';
    ctx.shadowColor = 'rgba(95,208,191,.45)'; ctx.shadowBlur = 24;
    ctx.fillText('WHISPER HEIST', cx, cy + c.height * 0.04);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#9aa0ad';
    ctx.font = 'italic ' + Math.round(Math.min(c.width * 0.028, 24)) + 'px Georgia, serif';
    ctx.globalAlpha = appear * (0.6 + 0.4 * Math.sin(t / 600));
    ctx.fillText('the gang that remembers — and remembers wrong', cx, cy + c.height * 0.13);
    ctx.globalAlpha = 1;
  }

  function reset() { Q = fresh(); }

  root.WH.juice = {
    push: push, sync: sync, tick: tick, drawFx: drawFx,
    camera: camera, timeScale: timeScale, bubbleCount: bubbleCount, reset: reset,
    chronicle: chronicle, drawChronicle: drawChronicle, titleScreen: titleScreen,
    // exposed for tests / debugging
    _state: function () { return Q; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
