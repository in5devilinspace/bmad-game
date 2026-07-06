// WH.render — RENDER + OVERLAY workstream for WHISPER HEIST.
// Owns render-plan.md scene layers 1-6 + flashlight cones (perception geometry),
// the debrief table scene, the hover/pinned token ledger, and whisper-UI input helpers.
//
// COORDINATE CONVENTION (return this to the integrator):
//   Canvas pixels: (0,0) top-left, +x east, +y south — matches vault-map (x:0..23, y:0..15).
//   A `cam` is {ox, oy, cell}: ox/oy = pixel position of grid corner (cell 0,0 top-left),
//   cell = pixel size of one grid cell. Pass cam=null to draw() to auto-fit & center.
//   Grid cell (cx,cy) center  -> px = cam.ox+(cx+0.5)*cam.cell , py = cam.oy+(cy+0.5)*cam.cell.
//   Pixel (px,py) -> cell = floor((px-cam.ox)/cell), floor((py-cam.oy)/cell).
//   Helpers WH.render.cellToPx(cam,cx,cy) / pxToCell(cam,px,py) are exported for input wiring.
//   draw() stores the cam it used as WH.render.lastCam; hitTestThief/ledger reuse it.
//
// PUBLIC API (signatures the integrator wires):
//   init(canvas)                    -> ctx        (stores canvas, returns its 2d context)
//   draw(ctx, game, cam)                          (paints layers 1-6 + cones, in order)
//   drawDebrief(ctx, game)                        (fixed seating ring + sliding mutating tokens)
//   hitTestThief(game, mx, my)      -> thief|null (uses lastCam)
//   ledger(ctx, thief, pinned)                    (token card; pinned Token => draws lineage)
//   drawWhisperPicker(ctx, picker)                (radial glyph menu over WHISPERABLE types)
//   whisperPickHit(picker, mx, my)  -> type|null  (radial hit-test for input)
//   drawMiniMap(ctx, mini, game, chosenType)      (location-tap mini vault)
//   miniMapCellHit(mini, mx, my)    -> {x,y}|null (mini-map -> grid cell)
//   drawGlyph(ctx, type, cx, cy, r, opts)         (one closed-vocabulary token glyph)
//   cellToPx / pxToCell / thiefColor / defaultCam / sensedCells (utility exports)
//
// GAME SHAPE CONSUMED (canonical per interfaces.md; see integration notes in the summary):
//   game.world {grid[24][16]:'wall'|'floor', regions, hazards:[{type,cell}], loot:[cell], gem:cell}
//   game.thieves: Thief[]  (pos, path, goalStack, memory, abilities, state, [facing],[sensed],[beat])
//   game.beliefMap: Array<{type, loc, confidence, holderId}>  (sim-owned merged map; render never re-derives)
//   game.debrief {slides:[{type,from,to,t,mutation,firsthand}], picker?, mini?}
// Zero numerals are ever drawn. Everything is grid-based on the fixed 24x16 vault.
(function (root) {
  root.WH = root.WH || {};

  // ---- palette (noir) --------------------------------------------------------
  var C = {
    bg: '#080a0f', wall: '#04050a', floor: '#151822', floorEdge: 'rgba(120,140,170,0.045)',
    ink: '#e7edf5', dim: 'rgba(231,237,245,0.35)',
    trap: '#e0533d', plate: '#e2b23a', alarm: '#e23a6b', loot: '#d9b25a', gem: '#8fe0ff',
    lit: '255,238,196'
  };
  // fixed thief accents (six known); fallback hashes any other id.
  var THIEF_COL = { Vex: '#4fd6c6', Silk: '#b48cff', Brick: '#e0a24a', Nix: '#6fe08a', Ash: '#ff7a4d', Moth: '#5aa9ff' };
  var WHISPERABLE = ['TRAP_AT', 'SAFE_PATH', 'LOOT_AT', 'GEM_AT', 'ALARM_AT', 'PLATE_AT', 'LOCKED_DOOR'];
  var SEATING = ['Moth', 'Vex', 'Silk', 'Brick', 'Nix', 'Ash']; // fixed ring (gossip adjacency)
  // region bounds from vault-map.md (self-sufficient region-loc rendering) [x0,x1,y0,y1]
  var RB = {
    entry: [9, 14, 13, 15], 'hall-b': [11, 12, 4, 12], 'hall-a': [4, 19, 8, 9],
    'west-store': [1, 6, 10, 14], 'east-store': [17, 22, 10, 14],
    'west-gallery': [1, 6, 3, 7], 'east-gallery': [17, 22, 3, 7],
    antechamber: [9, 14, 2, 3], sanctum: [10, 13, 0, 1]
  };

  var S = { canvas: null, lastCam: null };

  // ---- geometry helpers ------------------------------------------------------
  function defaultCam(W, H) {
    var pad = Math.min(W, H) * 0.04;
    var cell = Math.floor(Math.min((W - 2 * pad) / 24, (H - 2 * pad) / 16));
    if (cell < 1) cell = 1;
    return { ox: Math.round((W - cell * 24) / 2), oy: Math.round((H - cell * 16) / 2), cell: cell };
  }
  function cellToPx(cam, cx, cy) { return { x: cam.ox + (cx + 0.5) * cam.cell, y: cam.oy + (cy + 0.5) * cam.cell }; }
  function pxToCell(cam, px, py) { return { x: Math.floor((px - cam.ox) / cam.cell), y: Math.floor((py - cam.oy) / cam.cell) }; }
  function thiefColor(t) {
    if (t && THIEF_COL[t.name]) return THIEF_COL[t.name];
    var id = (t && (t.name || t.id)) || '' + t, h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 255;
    return 'hsl(' + (h * 137 % 360) + ',60%,62%)';
  }
  function isFloor(world, x, y) {
    if (x < 0 || x > 23 || y < 0 || y > 15) return false;
    if (world && world.grid && world.grid[x]) return world.grid[x][y] === 'floor';
    for (var k in RB) { var b = RB[k]; if (x >= b[0] && x <= b[1] && y >= b[2] && y <= b[3]) return true; }
    return false;
  }
  // resolve any token loc to a set of cells (cell | region-id | {a,b} | Cell[] | null)
  function locCells(loc) {
    if (loc == null) return [];
    if (typeof loc === 'string') { var b = RB[loc]; if (!b) return []; var out = []; for (var x = b[0]; x <= b[1]; x++) for (var y = b[2]; y <= b[3]; y++) out.push({ x: x, y: y }); return out; }
    if (Array.isArray(loc)) return loc;
    if (loc.a && loc.b) return [loc.a, loc.b];
    if (loc.region) return locCells(loc.region);
    if (loc.x != null && loc.y != null) return [{ x: loc.x, y: loc.y }];
    return [];
  }

  // ---- perception: EXACTLY the sim's cone geometry ---------------------------
  function facingAngle(t) {
    if (t.path && t.path.length) { for (var i = 0; i < t.path.length; i++) { var dx = t.path[i].x - t.pos.x, dy = t.path[i].y - t.pos.y; if (dx || dy) return Math.atan2(dy, dx); } }
    if (typeof t.facing === 'number') return t.facing;
    var dm = { N: -Math.PI / 2, S: Math.PI / 2, E: 0, W: Math.PI };
    if (t.facing && dm[t.facing] != null) return dm[t.facing];
    return -Math.PI / 2; // default: face north (toward the gem)
  }
  function losClear(world, x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0, steps = Math.max(Math.abs(dx), Math.abs(dy)); if (!steps) return true;
    for (var s = 1; s < steps; s++) { var cx = Math.round(x0 + dx * s / steps), cy = Math.round(y0 + dy * s / steps); if (!isFloor(world, cx, cy)) return false; }
    return true;
  }
  function sensedCells(world, t) {
    if (t.sensed) return t.sensed; // sim-published set wins — draw exactly what it sensed
    var range = (t.abilities && t.abilities.indexOf('scout') >= 0) ? 5 : 4;
    var fa = facingAngle(t), px = Math.round(t.pos.x), py = Math.round(t.pos.y), seen = {}, out = [];
    function add(x, y) { var k = x + ',' + y; if (!seen[k] && isFloor(world, x, y)) { seen[k] = 1; out.push({ x: x, y: y }); } }
    add(px, py); add(px + 1, py); add(px - 1, py); add(px, py + 1); add(px, py - 1); // own + 4-neighbors always
    for (var x = px - range; x <= px + range; x++) for (var y = py - range; y <= py + range; y++) {
      var dx = x - px, dy = y - py, d = Math.sqrt(dx * dx + dy * dy); if (d < 0.5 || d > range) continue;
      var da = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - fa), Math.cos(Math.atan2(dy, dx) - fa)));
      if (da > Math.PI / 4) continue;                       // 90-degree arc (+-45)
      if (!losClear(world, px, py, x, y)) continue;          // walls block LOS
      add(x, y);
    }
    return out;
  }

  // ---- init ------------------------------------------------------------------
  function init(canvas) { S.canvas = canvas; return canvas.getContext('2d'); }

  // ---- LAYER 1: floor + walls + vignette ------------------------------------
  function drawFloor(ctx, world, cam) {
    ctx.fillStyle = C.wall; ctx.fillRect(cam.ox, cam.oy, cam.cell * 24, cam.cell * 16);
    for (var x = 0; x < 24; x++) for (var y = 0; y < 16; y++) {
      if (!isFloor(world, x, y)) continue;
      ctx.fillStyle = C.floor; ctx.fillRect(cam.ox + x * cam.cell, cam.oy + y * cam.cell, cam.cell, cam.cell);
      ctx.strokeStyle = C.floorEdge; ctx.lineWidth = 1; ctx.strokeRect(cam.ox + x * cam.cell + .5, cam.oy + y * cam.cell + .5, cam.cell - 1, cam.cell - 1);
    }
    var W = ctx.canvas.width, H = ctx.canvas.height, g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .2, W / 2, H / 2, Math.max(W, H) * .72);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // ---- cones (perception) ----------------------------------------------------
  function drawCones(ctx, game, cam) {
    var ts = game.thieves || [];
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i]; if (t.state === 'out' || t.state === 'table') continue;
      var cells = sensedCells(game.world, t), r = (t.abilities && t.abilities.indexOf('scout') >= 0) ? 5 : 4;
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j], d = Math.hypot(c.x - t.pos.x, c.y - t.pos.y), a = (1 - d / (r + 1)) * 0.20;
        ctx.fillStyle = 'rgba(' + C.lit + ',' + a.toFixed(3) + ')';
        ctx.fillRect(cam.ox + c.x * cam.cell, cam.oy + c.y * cam.cell, cam.cell, cam.cell);
      }
      var p = cellToPx(cam, t.pos.x, t.pos.y), fa = facingAngle(t); // faint sector outline
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, r * cam.cell, fa - Math.PI / 4, fa + Math.PI / 4); ctx.closePath();
      ctx.strokeStyle = 'rgba(' + C.lit + ',0.10)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  // ---- LAYER 2: belief-ink overlay ------------------------------------------
  function beliefEntries(game) {
    var b = game.beliefMap; if (!b) return [];
    if (Array.isArray(b)) return b; if (b.entries) return b.entries;
    var out = []; for (var k in b) out.push(b[k]); return out; // Map-ish fallback
  }
  function drawBeliefInk(ctx, game, cam) {
    var es = beliefEntries(game), thieves = game.thieves || [];
    function holder(id) { for (var i = 0; i < thieves.length; i++) if (thieves[i].id === id || thieves[i].name === id) return thieves[i]; return null; }
    for (var i = 0; i < es.length; i++) {
      var e = es[i], tok = e.token || e, col = thiefColor(holder(e.holderId != null ? e.holderId : tok.source) || {}), cells = locCells(tok.loc);
      var conf = tok.confidence == null ? 0.6 : tok.confidence, a = 0.10 + 0.22 * conf;
      ctx.save(); ctx.fillStyle = hexA(col, a * 0.5); ctx.strokeStyle = hexA(col, a);
      for (var j = 0; j < cells.length; j++) { var c = cells[j]; sketchFill(ctx, cam.ox + c.x * cam.cell, cam.oy + c.y * cam.cell, cam.cell); }
      var mid = cells[Math.floor(cells.length / 2)]; if (mid) { var p = cellToPx(cam, mid.x, mid.y); drawGlyph(ctx, tok.type, p.x, p.y, cam.cell * 0.33, { solid: false, color: col, alpha: 0.5 + 0.5 * conf }); }
      ctx.restore();
    }
  }
  function sketchFill(ctx, x, y, s) { ctx.beginPath(); ctx.moveTo(x + s * .1, y + s * .15); ctx.lineTo(x + s * .9, y + s * .1); ctx.lineTo(x + s * .85, y + s * .9); ctx.lineTo(x + s * .12, y + s * .82); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  function hexA(hex, a) {
    if (hex[0] !== '#') return hex; var n = parseInt(hex.slice(1), 16); if (hex.length === 4) { var r = (n >> 8 & 15) * 17, g = (n >> 4 & 15) * 17, b = (n & 15) * 17; return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // ---- LAYER 3: plan-lines ---------------------------------------------------
  function drawPlanLines(ctx, game, cam) {
    var ts = game.thieves || [];
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i], path = t.path; if (!path || !path.length) continue;
      var col = thiefColor(t); ctx.save(); ctx.strokeStyle = hexA(col, 0.7); ctx.lineWidth = Math.max(2, cam.cell * 0.12);
      ctx.setLineDash([cam.cell * 0.3, cam.cell * 0.24]); ctx.lineCap = 'round'; ctx.beginPath();
      var p0 = cellToPx(cam, t.pos.x, t.pos.y); ctx.moveTo(p0.x, p0.y);
      for (var j = 0; j < path.length; j++) { var p = cellToPx(cam, path[j].x, path[j].y); ctx.lineTo(p.x, p.y); }
      ctx.stroke(); ctx.setLineDash([]);
      var end = path[path.length - 1], pe = cellToPx(cam, end.x, end.y); ctx.fillStyle = hexA(col, 0.8);
      ctx.beginPath(); ctx.arc(pe.x, pe.y, cam.cell * 0.14, 0, 7); ctx.fill(); ctx.restore();
    }
  }

  // ---- LAYER 4: truth (traps/plates/alarms/loot/gem) ------------------------
  function drawTruth(ctx, game, cam) {
    var w = game.world || {}, r = cam.cell * 0.34;
    (w.hazards || []).forEach(function (h) { var c = h.cell || h, p = cellToPx(cam, c.x, c.y); var ty = h.type === 'plate' ? 'PLATE_AT' : h.type === 'alarm' ? 'ALARM_AT' : 'TRAP_AT'; drawGlyph(ctx, ty, p.x, p.y, r, { solid: true, color: h.type === 'plate' ? C.plate : h.type === 'alarm' ? C.alarm : C.trap, alpha: 1 }); });
    (w.loot || []).forEach(function (c) { var p = cellToPx(cam, c.x, c.y); drawGlyph(ctx, 'LOOT_AT', p.x, p.y, r, { solid: true, color: C.loot, alpha: 1 }); });
    if (w.gem) { var p = cellToPx(cam, w.gem.x, w.gem.y); drawGlyph(ctx, 'GEM_AT', p.x, p.y, r * 1.2, { solid: true, color: C.gem, alpha: 1 }); }
    (w.doors || []).forEach(function (d) { if (d.locked && d.cell) { var p = cellToPx(cam, d.cell.x, d.cell.y); drawGlyph(ctx, 'LOCKED_DOOR', p.x, p.y, r * 0.9, { solid: true, color: C.dim, alpha: 0.8 }); } });
  }

  // ---- LAYER 5: thieves + LAYER 6: deliberation beat ------------------------
  var GOAL_GLYPH = { gem: 'GEM_AT', reachGem: 'GEM_AT', loot: 'LOOT_AT', survive: 'shield', flee: 'flee', plan: 'ROUTE_PLAN', follow: 'ROUTE_PLAN', bond: 'bond', protect: 'bond', door: 'LOCKED_DOOR', exit: 'exit' };
  function drawThieves(ctx, game, cam) {
    var ts = game.thieves || [];
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i], p = cellToPx(cam, t.pos.x, t.pos.y), col = thiefColor(t), out = (t.state === 'out'), rad = cam.cell * 0.34;
      ctx.save(); ctx.globalAlpha = out ? 0.4 : 1;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + rad * 0.7, rad * 0.9, rad * 0.35, 0, 0, 7); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(); // shadow
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 7); ctx.fillStyle = '#0c0e14'; ctx.fill(); ctx.lineWidth = Math.max(2, cam.cell * 0.1); ctx.strokeStyle = col; ctx.stroke(); // silhouette
      var fa = facingAngle(t); ctx.beginPath(); ctx.arc(p.x + Math.cos(fa) * rad * 0.5, p.y + Math.sin(fa) * rad * 0.5, rad * 0.22, 0, 7); ctx.fillStyle = col; ctx.fill(); // facing pip
      ctx.fillStyle = C.ink; ctx.font = 'bold ' + Math.round(cam.cell * 0.4) + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((t.name || 'T')[0], p.x, p.y); // initial (a letter — not a numeral)
      var g = t.goalStack && t.goalStack[t.goalStack.length - 1]; if (g && !out) drawGlyph(ctx, GOAL_GLYPH[g] || 'eye', p.x, p.y - rad * 1.7, rad * 0.5, { solid: false, color: col, alpha: 0.95 }); // overhead active-goal
      ctx.restore();
      if (t.beat || t.deliberating) drawBeat(ctx, t, p, cam, col); // LAYER 6
    }
  }
  function drawBeat(ctx, t, p, cam, col) {
    var b = t.beat || {}, tt = b.t == null ? 0.5 : b.t, R = cam.cell * 1.1; ctx.save();
    ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, 7); ctx.strokeStyle = hexA(col, 0.4); ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]); // pause ring
    var aa = b.a ? Math.atan2(b.a.y - t.pos.y, b.a.x - t.pos.x) : -Math.PI / 2, ab = b.b ? Math.atan2(b.b.y - t.pos.y, b.b.x - t.pos.x) : Math.PI / 2;
    var wob = Math.sin(tt * Math.PI * 6) * 0.5 + 0.5, ang = aa + (ab - aa) * wob; if (b.winner === 'a') ang = aa; else if (b.winner === 'b') ang = ab; // eye-flick / wobbling intent arrow
    ctx.globalAlpha = 0.9; ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, cam.cell * 0.09); ctx.beginPath(); ctx.moveTo(p.x, p.y);
    var ex = p.x + Math.cos(ang) * R, ey = p.y + Math.sin(ang) * R; ctx.lineTo(ex, ey);
    ctx.lineTo(ex - Math.cos(ang - 0.4) * cam.cell * 0.3, ey - Math.sin(ang - 0.4) * cam.cell * 0.3); ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(ang + 0.4) * cam.cell * 0.3, ey - Math.sin(ang + 0.4) * cam.cell * 0.3); ctx.stroke();
    ctx.fillStyle = C.ink; // eye-flick dots between the two options
    [aa, ab].forEach(function (a2) { ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(p.x + Math.cos(a2) * R * 0.5, p.y + Math.sin(a2) * R * 0.5, cam.cell * 0.06, 0, 7); ctx.fill(); });
    ctx.restore();
  }

  // ---- main draw (layers 1-6 + cones) ---------------------------------------
  function draw(ctx, game, cam) {
    var W = ctx.canvas.width, H = ctx.canvas.height; cam = cam || defaultCam(W, H); S.lastCam = cam;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    drawFloor(ctx, game.world, cam);   // 1
    drawCones(ctx, game, cam);         // perception light (fx layer 7, but geometry owned here)
    drawBeliefInk(ctx, game, cam);     // 2
    drawPlanLines(ctx, game, cam);     // 3
    drawTruth(ctx, game, cam);         // 4
    drawThieves(ctx, game, cam);       // 5 + 6
  }

  // ---- token glyphs (closed vocabulary) -------------------------------------
  function drawGlyph(ctx, type, x, y, r, o) {
    o = o || {}; var col = o.color || C.ink, a = o.alpha == null ? 1 : o.alpha, solid = o.solid !== false;
    ctx.save(); ctx.globalAlpha = a; ctx.lineWidth = Math.max(1.5, r * 0.22); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function fs() { if (solid) ctx.fill(); else ctx.stroke(); }
    switch (type) {
      case 'TRAP_AT': ctx.beginPath(); for (var k = 0; k < 8; k++) { var an = k / 8 * Math.PI * 2, rr = k % 2 ? r * 0.4 : r; ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(an) * rr, y + Math.sin(an) * rr); } ctx.closePath(); fs(); break; // spike star
      case 'SAFE_PATH': ctx.setLineDash([r * 0.4, r * 0.35]); ctx.beginPath(); ctx.moveTo(x - r, y + r * 0.4); ctx.lineTo(x + r, y - r * 0.4); ctx.stroke(); ctx.setLineDash([]); break; // dotted line
      case 'LOOT_AT': ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, 7); fs(); if (!solid) { ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 7); ctx.stroke(); } break; // coin
      case 'GEM_AT': ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.8, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.8, y); ctx.closePath(); fs(); break; // gem
      case 'ALARM_AT': ctx.beginPath(); ctx.arc(x, y - r * 0.1, r * 0.75, Math.PI, 0); ctx.lineTo(x + r * 0.7, y + r * 0.5); ctx.lineTo(x - r * 0.7, y + r * 0.5); ctx.closePath(); fs(); ctx.beginPath(); ctx.arc(x, y + r * 0.6, r * 0.16, 0, 7); ctx.fill(); break; // bell
      case 'PLATE_AT': ctx.beginPath(); ctx.rect(x - r * 0.8, y - r * 0.55, r * 1.6, r * 1.1); fs(); ctx.strokeRect(x - r * 0.5, y - r * 0.3, r, r * 0.6); break; // plate
      case 'LOCKED_DOOR': ctx.beginPath(); ctx.rect(x - r * 0.6, y - r * 0.1, r * 1.2, r * 0.9); fs(); ctx.beginPath(); ctx.arc(x, y - r * 0.1, r * 0.42, Math.PI, 0); ctx.stroke(); break; // padlock
      case 'SHORTCUT': ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r * 0.4, y); ctx.moveTo(x, y - r * 0.5); ctx.lineTo(x + r * 0.5, y); ctx.lineTo(x, y + r * 0.5); ctx.stroke(); break; // arrow
      case 'ROUTE_PLAN': ctx.beginPath(); ctx.rect(x - r * 0.7, y - r * 0.8, r * 1.4, r * 1.6); fs(); ctx.beginPath(); for (var m = -1; m <= 1; m++) { ctx.moveTo(x - r * 0.45, y + m * r * 0.4); ctx.lineTo(x + r * 0.45, y + m * r * 0.4); } ctx.stroke(); break; // scroll
      case 'VAULT_STYLE': case 'eye': ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, 7); fs(); ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, 7); ctx.fillStyle = C.bg; ctx.fill(); break; // eye
      case 'shield': ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.7, y - r * 0.5); ctx.lineTo(x + r * 0.5, y + r * 0.8); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.5, y + r * 0.8); ctx.lineTo(x - r * 0.7, y - r * 0.5); ctx.closePath(); fs(); break;
      case 'flee': ctx.beginPath(); ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y - r); ctx.moveTo(x + r * 0.2, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x + r, y - r * 0.2); ctx.stroke(); break;
      case 'bond': ctx.beginPath(); ctx.arc(x - r * 0.4, y, r * 0.5, 0, 7); ctx.arc(x + r * 0.4, y, r * 0.5, 0, 7); ctx.stroke(); break;
      case 'exit': ctx.beginPath(); ctx.rect(x - r * 0.7, y - r, r * 1.4, r * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - r * 0.1, y); ctx.lineTo(x + r * 0.5, y); ctx.lineTo(x + r * 0.2, y - r * 0.3); ctx.moveTo(x + r * 0.5, y); ctx.lineTo(x + r * 0.2, y + r * 0.3); ctx.stroke(); break;
      default: ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, 7); fs();
    }
    ctx.restore();
  }

  // ---- ledger (hover/pinned) ------------------------------------------------
  function trustState(conf) { return conf >= 0.66 ? 'glow' : conf >= 0.33 ? 'neutral' : 'grey'; }
  function ledger(ctx, thief, pinned, cam) {
    cam = cam || S.lastCam || defaultCam(ctx.canvas.width, ctx.canvas.height);
    var toks = (thief && thief.memory) || [], rows = toks.length + (pinned ? 3 : 0);
    var pad = 12, rh = Math.max(22, cam.cell * 0.9), w = cam.cell * 4.2, h = pad * 2 + rows * rh + rh;
    var anchor = thief && thief.pos ? cellToPx(cam, thief.pos.x, thief.pos.y) : { x: ctx.canvas.width - w, y: pad };
    var bx = Math.min(anchor.x + cam.cell, ctx.canvas.width - w - pad), by = Math.min(Math.max(pad, anchor.y - h / 2), ctx.canvas.height - h - pad);
    ctx.save(); ctx.fillStyle = 'rgba(10,12,18,0.94)'; ctx.strokeStyle = hexA(thiefColor(thief), 0.6); ctx.lineWidth = 2;
    roundRect(ctx, bx, by, w, h, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = thiefColor(thief); ctx.font = 'bold ' + Math.round(rh * 0.5) + 'px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText((thief && thief.name) || '', bx + pad, by + rh * 0.7);
    var gy = by + rh * 1.3;
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i], gx = bx + pad + rh * 0.5, cy = gy + rh * 0.5, st = trustState(tk.confidence == null ? 0.5 : tk.confidence);
      if (st === 'glow') { ctx.shadowColor = thiefColor(thief); ctx.shadowBlur = 14; } else ctx.shadowBlur = 0;
      var gcol = st === 'grey' ? 'rgba(150,160,175,0.5)' : thiefColor(thief);
      drawGlyph(ctx, tk.type, gx, cy, rh * 0.35, { solid: !!tk.firsthand, color: gcol, alpha: st === 'grey' ? 0.55 : 1 }); // solid=firsthand, hollow=secondhand
      ctx.shadowBlur = 0;
      ctx.strokeStyle = st === 'grey' ? 'rgba(150,160,175,0.35)' : st === 'neutral' ? hexA(thiefColor(thief), 0.5) : thiefColor(thief);
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(gx, cy, rh * 0.46, 0, 7); ctx.stroke(); // three-state trust ring
      ctx.fillStyle = tk.firsthand ? C.ink : C.dim; ctx.font = Math.round(rh * 0.34) + 'px system-ui';
      ctx.fillText(tk.type.replace('_', ' ').toLowerCase() + (tk.firsthand ? '' : ' (heard)'), gx + rh * 0.7, cy); // letters only, no numerals
      gy += rh;
    }
    if (pinned) { // lineage of the pinned token: origin -> hops (mutation marks)
      gy += rh * 0.2; ctx.strokeStyle = C.dim; ctx.beginPath(); ctx.moveTo(bx + pad, gy); ctx.lineTo(bx + w - pad, gy); ctx.stroke(); gy += rh * 0.6;
      ctx.fillStyle = C.dim; ctx.font = Math.round(rh * 0.32) + 'px system-ui'; ctx.fillText('lineage', bx + pad, gy); gy += rh * 0.8;
      var lx = bx + pad + rh * 0.4, ly = gy, seq = [{ from: pinned.source === 'WHISPER' ? 'WHISPER' : 'origin' }].concat(pinned.hops || []);
      for (var j = 0; j < seq.length; j++) {
        drawGlyph(ctx, pinned.type, lx, ly, rh * 0.3, { solid: j === 0 && pinned.firsthand, color: seq[j].mutation ? C.alarm : thiefColor(thief), alpha: 1 });
        if (seq[j].mutation) { ctx.fillStyle = C.alarm; ctx.font = Math.round(rh * 0.5) + 'px system-ui'; ctx.fillText('*', lx + rh * 0.35, ly - rh * 0.3); } // mutation mark (glyph, not text detail)
        if (j < seq.length - 1) { ctx.strokeStyle = C.dim; ctx.beginPath(); ctx.moveTo(lx + rh * 0.5, ly); ctx.lineTo(lx + rh * 1.0, ly); ctx.stroke(); }
        lx += rh * 1.0; if (lx > bx + w - rh) { lx = bx + pad + rh * 0.4; ly += rh * 0.9; }
      }
    }
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // ---- hit-test thief --------------------------------------------------------
  function hitTestThief(game, mx, my) {
    var cam = S.lastCam; if (!cam) return null; var ts = game.thieves || [], best = null, bd = 1e9;
    for (var i = 0; i < ts.length; i++) { var p = cellToPx(cam, ts[i].pos.x, ts[i].pos.y), d = Math.hypot(mx - p.x, my - p.y); if (d < cam.cell * 0.5 && d < bd) { bd = d; best = ts[i]; } }
    return best;
  }

  // ---- debrief scene ---------------------------------------------------------
  function seatPositions(ctx) {
    var cx = ctx.canvas.width / 2, cy = ctx.canvas.height * 0.44, R = Math.min(ctx.canvas.width, ctx.canvas.height) * 0.32, out = {};
    for (var i = 0; i < SEATING.length; i++) { var a = -Math.PI / 2 + i / SEATING.length * Math.PI * 2; out[SEATING[i]] = { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, a: a }; }
    out._center = { x: cx, y: cy, R: R }; return out;
  }
  function drawDebrief(ctx, game) {
    var W = ctx.canvas.width, H = ctx.canvas.height; ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    var g = ctx.createRadialGradient(W / 2, H * 0.44, 20, W / 2, H * 0.44, W * 0.6); g.addColorStop(0, '#171a24'); g.addColorStop(1, C.bg); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var seats = seatPositions(ctx), r = Math.min(W, H) * 0.05;
    ctx.beginPath(); ctx.arc(seats._center.x, seats._center.y, seats._center.R * 0.5, 0, 7); ctx.fillStyle = '#101219'; ctx.fill(); ctx.strokeStyle = C.dim; ctx.stroke(); // table
    var byName = {}; (game.thieves || []).forEach(function (t) { byName[t.name] = t; });
    for (var i = 0; i < SEATING.length; i++) {
      var s = seats[SEATING[i]], t = byName[SEATING[i]] || { name: SEATING[i] }, col = thiefColor(t);
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 7); ctx.fillStyle = '#0c0e14'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
      ctx.fillStyle = C.ink; ctx.font = 'bold ' + Math.round(r * 0.7) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((t.name || '?')[0], s.x, s.y);
    }
    var slides = (game.debrief && game.debrief.slides) || [];
    for (var k = 0; k < slides.length; k++) {
      var sl = slides[k], a = seats[seatName(sl.from)] || seats._center, b = seats[seatName(sl.to)] || seats._center, tt = sl.t == null ? 0 : sl.t;
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.hypot(b.x - a.x, b.y - a.y) * 0.25; // arc
      var px = qb(a.x, mx, b.x, tt), py = qb(a.y, my, b.y, tt), mutated = sl.mutation && tt > 0.5;
      var scol = mutated ? C.alarm : thiefColor(byName[seatName(sl.from)] || {});
      drawGlyph(ctx, mutated && sl.mutation.type ? sl.mutation.type : sl.type, px, py, r * 0.5, { solid: !!sl.firsthand && tt < 0.5, color: scol, alpha: 1 }); // hollow copy buds; glyph/hue shifts mid-slide
      if (mutated) { ctx.fillStyle = C.alarm; ctx.font = Math.round(r * 0.6) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText('*', px + r * 0.45, py - r * 0.4); }
    }
    if (game.debrief && game.debrief.picker) drawWhisperPicker(ctx, game.debrief.picker);
    if (game.debrief && game.debrief.mini) drawMiniMap(ctx, game.debrief.mini, game, game.debrief.picker && game.debrief.picker.chosenType);
  }
  function seatName(x) { if (typeof x === 'number') return SEATING[x % 6]; return x; }
  function qb(a, b, c, t) { var u = 1 - t; return u * u * a + 2 * u * t * b + t * t * c; }

  // ---- whisper UI: radial type picker ---------------------------------------
  function drawWhisperPicker(ctx, pk) {
    var cx = pk.cx, cy = pk.cy, R = pk.radius || 90, n = WHISPERABLE.length;
    ctx.save(); ctx.fillStyle = 'rgba(8,10,15,0.85)'; ctx.beginPath(); ctx.arc(cx, cy, R + 34, 0, 7); ctx.fill();
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + i / n * Math.PI * 2, gx = cx + Math.cos(a) * R, gy = cy + Math.sin(a) * R;
      var on = (pk.hoverIndex === i) || (pk.chosenType === WHISPERABLE[i]);
      ctx.beginPath(); ctx.arc(gx, gy, 24, 0, 7); ctx.fillStyle = on ? 'rgba(90,169,255,0.25)' : 'rgba(20,24,34,0.9)'; ctx.fill();
      ctx.strokeStyle = on ? C.gem : C.dim; ctx.lineWidth = on ? 3 : 1.5; ctx.stroke();
      drawGlyph(ctx, WHISPERABLE[i], gx, gy, 13, { solid: false, color: on ? C.gem : C.ink, alpha: 1 });
    }
    ctx.fillStyle = C.dim; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, 7); ctx.stroke(); // center = "hold your tongue" skip target
    drawGlyph(ctx, 'flee', cx, cy, 11, { solid: false, color: C.dim, alpha: 0.9 });
    ctx.restore();
  }
  function whisperPickHit(pk, mx, my) {
    var cx = pk.cx, cy = pk.cy, R = pk.radius || 90, n = WHISPERABLE.length;
    if (Math.hypot(mx - cx, my - cy) < 24) return '__skip__'; // center hit = hold your tongue
    for (var i = 0; i < n; i++) { var a = -Math.PI / 2 + i / n * Math.PI * 2, gx = cx + Math.cos(a) * R, gy = cy + Math.sin(a) * R; if (Math.hypot(mx - gx, my - gy) < 26) return WHISPERABLE[i]; }
    return null;
  }

  // ---- whisper UI: location mini-map ----------------------------------------
  function drawMiniMap(ctx, mini, game, chosenType) {
    var cell = Math.min(mini.w / 24, mini.h / 16), ox = mini.x, oy = mini.y;
    ctx.save(); ctx.fillStyle = 'rgba(8,10,15,0.9)'; roundRect(ctx, ox - 6, oy - 6, cell * 24 + 12, cell * 16 + 12, 6); ctx.fill(); ctx.strokeStyle = C.dim; ctx.stroke();
    for (var x = 0; x < 24; x++) for (var y = 0; y < 16; y++) { if (isFloor(game.world, x, y)) { ctx.fillStyle = C.floor; ctx.fillRect(ox + x * cell, oy + y * cell, cell - 0.5, cell - 0.5); } }
    if (chosenType) { ctx.fillStyle = C.gem; ctx.font = Math.round(cell * 2) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; }
    mini._cell = cell; ctx.restore();
  }
  function miniMapCellHit(mini, mx, my) {
    var cell = mini._cell || Math.min(mini.w / 24, mini.h / 16); var x = Math.floor((mx - mini.x) / cell), y = Math.floor((my - mini.y) / cell);
    if (x < 0 || x > 23 || y < 0 || y > 15) return null; return { x: x, y: y };
  }

  root.WH.render = {
    init: init, draw: draw, drawDebrief: drawDebrief, hitTestThief: hitTestThief,
    ledger: function (ctx, thief, pinned) { return ledger(ctx, thief, pinned); },
    drawWhisperPicker: drawWhisperPicker, whisperPickHit: whisperPickHit,
    drawMiniMap: drawMiniMap, miniMapCellHit: miniMapCellHit, drawGlyph: drawGlyph,
    cellToPx: cellToPx, pxToCell: pxToCell, thiefColor: thiefColor, defaultCam: defaultCam,
    sensedCells: sensedCells, trustState: trustState,
    WHISPERABLE: WHISPERABLE, SEATING: SEATING,
    get lastCam() { return S.lastCam; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
