// WHISPER HEIST — integrator bootstrap (state machine, input, loop).
// Wires WH.sim + WH.gossip + WH.render + WH.juice into a playable 5-night run.
(function () {
  var canvas = document.getElementById('c');
  var ctx = WH.render.init(canvas);
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  window.addEventListener('resize', resize); resize();

  var game = null, mode = 'title', seed = 0;
  var titleStart = performance.now(), chronStart = 0, last = performance.now();
  var debrief = null;
  var hoverThief = null, pinnedThief = null, mouse = { x: 0, y: 0 };

  var SEATING = WH.render.SEATING;
  function seatPositions() {
    var cx = canvas.width / 2, cy = canvas.height * 0.44, R = Math.min(canvas.width, canvas.height) * 0.32, out = {};
    for (var i = 0; i < SEATING.length; i++) { var a = -Math.PI / 2 + i / SEATING.length * Math.PI * 2; out[SEATING[i]] = { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R }; }
    return out;
  }
  function thiefByName(n) { for (var i = 0; i < game.thieves.length; i++) if (game.thieves[i].name === n) return game.thieves[i]; return null; }
  // pick the most-travelled token so the pinned ledger shows a real lineage (CAP-3)
  function lineageTok(t) {
    var best = null, m = (t && t.memory) || [];
    for (var i = 0; i < m.length; i++) {
      if (m[i].source === 'WHISPER') return m[i];
      if (m[i].hops && m[i].hops.length && (!best || m[i].hops.length > best.hops.length)) best = m[i];
    }
    return best || m[0] || null;
  }

  function newRun() {
    seed = (Math.random() * 1e9) >>> 0;
    game = WH.sim.newGame(seed);
    WH.juice.reset();
    WH.sim.beginNight(game);          // night 1 (seeded outer-loot win)
    pinnedThief = null; hoverThief = null;
    mode = 'raid';
  }

  // publish the sim-time deliberation pause as a render beat (layer 6)
  function syncBeats() {
    for (var i = 0; i < game.thieves.length; i++) {
      var t = game.thieves[i];
      if (t.delib > 0 && t.options && t.options.length) {
        var b = t.options[1] || t.options[0];
        t.beat = { a: t.options[0].target, b: b.target, t: 1 - (t.delib / 300), winner: null };
      } else t.beat = null;
    }
  }

  function endRaidNow() {
    var gemStolen = game.raid.gemStolen, night = game.night;
    WH.sim.endNight(game);            // logs NIGHT_END, seats thieves
    if (gemStolen || night >= 5) { mode = 'chronicle'; chronStart = performance.now(); }
    else startDebrief();
  }

  // run the gossip exchange, then turn the emitted GOSSIP events into slide anims
  function startDebrief() {
    var pre = game.eventLog.length;
    WH.gossip.runDebrief(game);
    game.beliefMap = WH.sim.mergeBelief(game.thieves);   // re-merge after memory mutated
    var slides = [], si = 0;
    for (var i = pre; i < game.eventLog.length; i++) {
      var e = game.eventLog[i];
      if (e.type === 'GOSSIP') {
        slides.push({ from: e.from, to: e.to, type: e.tokType || 'TRAP_AT', mutation: (e.mutation && e.mutation !== 'faithful') ? { type: e.tokType } : null, firsthand: false, t: 0, _start: si * 150 });
        si++;
      }
    }
    game.debrief = { slides: slides };
    debrief = { slides: slides, clock: 0, phase: 'anim', sub: 'pick-thief', chosenThief: null, chosenType: null, picker: null, mini: null };
  }

  function finishDebrief() {
    game.debrief = null; debrief = null;
    WH.sim.beginNight(game);          // next night
    mode = 'raid';
  }

  // ---- input --------------------------------------------------------------
  canvas.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (mode === 'raid') { hoverThief = WH.render.hitTestThief(game, mouse.x, mouse.y); }
    else if (mode === 'debrief' && debrief && debrief.phase === 'whisper' && debrief.sub === 'pick-type' && debrief.picker) {
      var W = WH.render.WHISPERABLE, pk = debrief.picker, hi = -1;
      for (var i = 0; i < W.length; i++) { var a = -Math.PI / 2 + i / W.length * Math.PI * 2, gx = pk.cx + Math.cos(a) * pk.radius, gy = pk.cy + Math.sin(a) * pk.radius; if (Math.hypot(mouse.x - gx, mouse.y - gy) < 26) hi = i; }
      pk.hoverIndex = hi;
    }
  });
  canvas.addEventListener('click', function (e) {
    var mx = e.clientX, my = e.clientY;
    if (mode === 'title') { newRun(); return; }
    if (mode === 'chronicle') { mode = 'title'; titleStart = performance.now(); return; }
    if (mode === 'raid') {
      var t = WH.render.hitTestThief(game, mx, my);
      pinnedThief = t ? (pinnedThief === t ? null : t) : null;   // click pins a ledger; empty clears
      return;
    }
    if (mode === 'debrief' && debrief) {
      if (debrief.phase === 'anim') { debrief.clock = 1e9; return; }   // click fast-forwards the exchange
      if (debrief.sub === 'pick-thief') {
        var seats = seatPositions(), R = Math.min(canvas.width, canvas.height) * 0.05;
        for (var i = 0; i < SEATING.length; i++) { var s = seats[SEATING[i]]; if (Math.hypot(mx - s.x, my - s.y) < R * 1.4) { debrief.chosenThief = thiefByName(SEATING[i]); debrief.sub = 'pick-type'; debrief.picker = { cx: canvas.width / 2, cy: canvas.height * 0.44, radius: Math.min(canvas.width, canvas.height) * 0.16, hoverIndex: -1, chosenType: null }; break; } }
        return;
      }
      if (debrief.sub === 'pick-type') {
        var hit = WH.render.whisperPickHit(debrief.picker, mx, my);
        if (hit === '__skip__') { finishDebrief(); return; }        // hold your tongue
        if (hit) { debrief.chosenType = hit; debrief.picker.chosenType = hit; debrief.sub = 'pick-loc'; var m = Math.min(canvas.width, canvas.height); debrief.mini = { x: canvas.width / 2 - m * 0.28, y: canvas.height * 0.62, w: m * 0.56, h: m * 0.373 }; }
        return;
      }
      if (debrief.sub === 'pick-loc') {
        var cell = WH.render.miniMapCellHit(debrief.mini, mx, my);
        if (cell && game.world.grid[cell.x] && game.world.grid[cell.x][cell.y] === 'floor') {
          WH.gossip.applyWhisper(game, debrief.chosenThief.id, { type: debrief.chosenType, loc: cell });
          game.beliefMap = WH.sim.mergeBelief(game.thieves);
          finishDebrief();
        }
        return;
      }
    }
  });
  window.addEventListener('keydown', function () {
    if (mode === 'title') newRun();
    else if (mode === 'debrief' && debrief && debrief.phase === 'whisper') finishDebrief();  // skip = hold your tongue
    else if (mode === 'chronicle') { mode = 'title'; titleStart = performance.now(); }
  });

  // ---- small diegetic helpers --------------------------------------------
  function drawHint(txt) {
    ctx.save(); ctx.fillStyle = 'rgba(231,237,245,0.82)'; ctx.font = '600 ' + Math.round(Math.min(canvas.width * 0.02, 19)) + 'px Georgia,serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(txt, canvas.width / 2, canvas.height - 22); ctx.restore();
  }
  function drawNightMoons() {   // night count as crescents (zero numerals)
    ctx.save();
    for (var i = 0; i < game.night; i++) { var x = 26 + i * 20, y = 26; ctx.fillStyle = 'rgba(201,185,133,0.92)'; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); ctx.fillStyle = '#05060a'; ctx.beginPath(); ctx.arc(x + 3, y - 1, 5.5, 0, 7); ctx.fill(); }
    ctx.restore();
  }

  // ---- main loop ----------------------------------------------------------
  function frame(now) {
    var dt = Math.min(50, now - last); last = now;
    if (mode === 'title') {
      WH.juice.titleScreen(ctx, now - titleStart);
      ctx.save(); ctx.fillStyle = 'rgba(231,237,245,' + (0.4 + 0.3 * Math.sin(now / 500)) + ')'; ctx.font = 'italic ' + Math.round(Math.min(canvas.width * 0.022, 20)) + 'px Georgia,serif'; ctx.textAlign = 'center';
      ctx.fillText('click to begin the first night', canvas.width / 2, canvas.height * 0.82); ctx.restore();
    } else if (mode === 'raid') {
      var scale = WH.juice.timeScale();
      WH.sim.stepRaid(game, dt * scale);
      syncBeats();
      WH.juice.sync(game);
      WH.juice.tick(dt);
      var cam = WH.render.defaultCam(canvas.width, canvas.height);
      game.view = { cell: cam.cell, ox: cam.ox, oy: cam.oy };   // align juice fx to render grid
      var shake = WH.juice.camera();
      ctx.save(); ctx.translate(shake.x, shake.y);
      WH.render.draw(ctx, game, cam);
      ctx.restore();
      WH.juice.drawFx(ctx, game);
      var show = pinnedThief || hoverThief;
      if (show) WH.render.ledger(ctx, show, pinnedThief ? lineageTok(pinnedThief) : null);
      drawNightMoons();
      if (game.raid.over) endRaidNow();
    } else if (mode === 'debrief') {
      debrief.clock += dt;
      var allDone = true;
      for (var i = 0; i < debrief.slides.length; i++) { var sl = debrief.slides[i]; sl.t = Math.max(0, Math.min(1, (debrief.clock - sl._start) / 650)); if (sl.t < 1) allDone = false; }
      if (debrief.phase === 'anim' && (allDone || debrief.clock >= 1e9) && debrief.clock > 500) debrief.phase = 'whisper';
      game.debrief.picker = (debrief.phase === 'whisper' && debrief.sub === 'pick-type') ? debrief.picker : null;
      game.debrief.mini = (debrief.phase === 'whisper' && debrief.sub === 'pick-loc') ? debrief.mini : null;
      WH.render.drawDebrief(ctx, game);
      if (debrief.phase === 'whisper') {
        if (debrief.sub === 'pick-thief') drawHint('whisper a lie — click a thief  (any key: hold your tongue)');
        else if (debrief.sub === 'pick-type') drawHint('choose a rumor to plant — center to hold your tongue');
        else if (debrief.sub === 'pick-loc') drawHint('tap where the lie lives');
      }
    } else if (mode === 'chronicle') {
      WH.juice.drawChronicle(ctx, game, now - chronStart);
      ctx.save(); ctx.fillStyle = 'rgba(231,237,245,' + (0.35 + 0.3 * Math.sin(now / 500)) + ')'; ctx.font = 'italic ' + Math.round(Math.min(canvas.width * 0.02, 18)) + 'px Georgia,serif'; ctx.textAlign = 'center';
      ctx.fillText('click for another job', canvas.width / 2, canvas.height - 26); ctx.restore();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
