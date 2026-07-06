// WHISPER HEIST — SIM CORE (owns: world build, night lifecycle, perception,
// decision scoring, A*, goal stacks, BeliefMap, EventLog). See interfaces.md.
//
// PUBLIC API (WH.sim):
//   rng                       mulberry32 factory; rng(seed)->fn, rng.create(seed), rng.live (instance)
//   ARCHETYPES                declarative six-thief weight+ability table (CAP-2 data, no branches)
//   ABILITY_TABLE             declarative ability semantics consumed by scorer/sim
//   createWorld()             -> World {grid[24][16], regions, doors, hazards, loot, gem, ...} from vault-map.md
//   createThief(archetype)    -> Thief (archetype = ARCHETYPES entry or its id)
//   newGame(seed)             -> game {world,thieves,beliefMap,eventLog,night,phase,rng,seed,...}
//   beginNight(game)          advance to next night's raid (night-1 seeds the outer-loot win)
//   stepRaid(game, dtMs)      advance the raid in fixed 100ms substeps; sets game.raid.over/outcome
//   endNight(game, outcome)   close the raid, enter debrief
//   scoreOptions(world,thief,rng,state) -> options[] (weight-dot + ability table; NO archetype branches)
//   astar(world,start,goal,ctx)         -> Cell[] | null  (4-dir grid, locked-door aware)
//   senseCone(world,thief)              -> Cell[]  (THE perception geometry render must draw)
//   mergeBelief(thieves)                -> BeliefMap (per cell+type keep max-confidence; conflicts coexist)
//
// Determinism: one seeded PRNG threads decision noise. Same seed => same option
// scores under uniform weights. No DOM references anywhere in this block.
(function (root) {
  root.WH = root.WH || {};

  // ---- PRNG: mulberry32 -----------------------------------------------------
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rng = mulberry32;          // factory
  rng.create = mulberry32;
  rng.mulberry32 = mulberry32;
  rng.live = mulberry32(0xC0FFEE);   // a live instance

  // ---- helpers --------------------------------------------------------------
  var W = 24, H = 16;
  function inb(x, y) { return x >= 0 && x < W && y >= 0 && y < H; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var DANGER = { TRAP_AT: 1, ALARM_AT: 1, PLATE_AT: 1 };

  // ---- canonical tables (vault-map.md) --------------------------------------
  // order matters: hall-b before hall-a so the overlap column resolves to hall-b
  var REGIONS = [
    { id: 'entry',        name: 'the entrance',     wing: 'south',   tier: 0, x0: 9,  x1: 14, y0: 13, y1: 15 },
    { id: 'hall-b',       name: 'hall B',           wing: 'central', tier: 0, x0: 11, x1: 12, y0: 4,  y1: 12 },
    { id: 'hall-a',       name: 'hall A',           wing: 'central', tier: 0, x0: 4,  x1: 19, y0: 8,  y1: 9 },
    { id: 'west-store',   name: 'the west storeroom', wing: 'west wing', tier: 0, x0: 1, x1: 6, y0: 10, y1: 14 },
    { id: 'east-store',   name: 'the east storeroom', wing: 'east wing', tier: 0, x0: 17, x1: 22, y0: 10, y1: 14 },
    { id: 'west-gallery', name: 'the west gallery', wing: 'west wing', tier: 1, x0: 1,  x1: 6,  y0: 3,  y1: 7 },
    { id: 'east-gallery', name: 'the east gallery', wing: 'east wing', tier: 1, x0: 17, x1: 22, y0: 3,  y1: 7 },
    { id: 'antechamber',  name: 'the antechamber',  wing: 'inner',   tier: 2, x0: 9,  x1: 14, y0: 2,  y1: 3 },
    { id: 'sanctum',      name: 'the sanctum',      wing: 'inner',   tier: 3, x0: 10, x1: 13, y0: 0,  y1: 1 }
  ];
  // region-pair connectivity. Absent pair => impassable (stray rectangle touch).
  // NOTE: geometry places the gallery locks on the hall-a boundary (the galleries
  // are not rectangle-adjacent to the storerooms); the depth-gating FUNCTION of
  // vault-map.md doors D1/D2 is preserved. D3/D4 gate the inner wing.
  var CONN = {
    'entry|hall-b': 'open',
    'hall-a|hall-b': 'open',
    'hall-a|west-store': 'open',
    'east-store|hall-a': 'open',
    'hall-a|west-gallery': { door: 'D1' },
    'east-gallery|hall-a': { door: 'D2' },
    'antechamber|hall-b': { door: 'D3' },
    'antechamber|sanctum': { door: 'D4' }
  };
  var HAZARDS = [
    { type: 'trap', x: 3, y: 5 }, { type: 'trap', x: 20, y: 4 }, { type: 'trap', x: 11, y: 6 },
    { type: 'plate', x: 11, y: 9 }, { type: 'plate', x: 12, y: 9 },
    { type: 'alarm', x: 10, y: 3 }, { type: 'alarm', x: 13, y: 2 }
  ];
  var LOOT = [
    { x: 2, y: 12, tier: 0 }, { x: 21, y: 12, tier: 0 },
    { x: 2, y: 4, tier: 1 }, { x: 21, y: 5, tier: 1 },
    { x: 10, y: 2, tier: 2 }, { x: 13, y: 3, tier: 2 }
  ];
  var GEM = { x: 11, y: 0 };

  function connKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  // ---- world build ----------------------------------------------------------
  function createWorld() {
    var grid = [], regionOf = [], x, y, r;
    for (x = 0; x < W; x++) { grid[x] = []; regionOf[x] = []; for (y = 0; y < H; y++) { grid[x][y] = 'wall'; regionOf[x][y] = null; } }
    for (x = 0; x < W; x++) for (y = 0; y < H; y++) {
      for (var i = 0; i < REGIONS.length; i++) {
        r = REGIONS[i];
        if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) { grid[x][y] = 'floor'; regionOf[x][y] = r.id; break; }
      }
    }
    // derive door boundary cells for rendering (both sides of each locked pass)
    var doorMap = {};
    for (x = 0; x < W; x++) for (y = 0; y < H; y++) {
      if (grid[x][y] !== 'floor') continue;
      for (var d = 0; d < 4; d++) {
        var nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (!inb(nx, ny) || grid[nx][ny] !== 'floor') continue;
        var ra = regionOf[x][y], rb = regionOf[nx][ny];
        if (ra === rb) continue;
        var c = CONN[connKey(ra, rb)];
        if (c && c.door) {
          (doorMap[c.door] = doorMap[c.door] || { id: c.door, a: ra, b: rb, locked: true, ability: 'lockpick', cells: [] })
            .cells.push({ x: x, y: y });
        }
      }
    }
    var doors = [];
    for (var k in doorMap) if (doorMap.hasOwnProperty(k)) doors.push(doorMap[k]);
    doors.sort(function (p, q) { return p.id < q.id ? -1 : 1; });
    return {
      grid: grid, regionOf: regionOf, regions: REGIONS.slice(), connections: CONN,
      doors: doors, hazards: HAZARDS.map(function (h) { return { type: h.type, x: h.x, y: h.y, armed: h.type === 'trap' }; }),
      loot: LOOT.map(function (l) { return { x: l.x, y: l.y, tier: l.tier }; }), gem: { x: GEM.x, y: GEM.y },
      exit: { x: 11, y: 14 }
    };
  }
  function regionAt(world, x, y) { return inb(x, y) ? world.regionOf[x][y] : null; }
  function regionMeta(id) { for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i]; return null; }

  // ---- A* (4-dir, locked-door aware) ---------------------------------------
  // ctx: { unlocked:{doorId:true}, canUnlock:bool }
  function stepCost(world, x, y, nx, ny, ctx) {
    if (world.grid[nx][ny] !== 'floor') return Infinity;
    var ra = world.regionOf[x][y], rb = world.regionOf[nx][ny];
    if (ra === rb) return 1;
    var c = CONN[connKey(ra, rb)];
    if (!c) return Infinity;
    if (c === 'open') return 1;
    if (ctx && ctx.unlocked && ctx.unlocked[c.door]) return 1;
    if (ctx && ctx.canUnlock) return 100;   // lockpick will spend time at the door
    return Infinity;
  }
  function astar(world, start, goal, ctx) {
    if (!inb(start.x, start.y) || !inb(goal.x, goal.y)) return null;
    if (world.grid[goal.x][goal.y] !== 'floor') return null;
    ctx = ctx || {};
    var key = function (x, y) { return x + ',' + y; };
    var open = [{ x: start.x, y: start.y, g: 0, f: 0 }];
    var came = {}, gsc = {}; gsc[key(start.x, start.y)] = 0;
    var hh = function (x, y) { return Math.abs(x - goal.x) + Math.abs(y - goal.y); };
    while (open.length) {
      var bi = 0; for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      var cur = open.splice(bi, 1)[0];
      if (cur.x === goal.x && cur.y === goal.y) {
        var path = [{ x: cur.x, y: cur.y }], ck = key(cur.x, cur.y);
        while (came[ck]) { var p = came[ck]; path.unshift({ x: p.x, y: p.y }); ck = key(p.x, p.y); }
        return path;
      }
      for (var d = 0; d < 4; d++) {
        var nx = cur.x + DIRS[d][0], ny = cur.y + DIRS[d][1];
        if (!inb(nx, ny)) continue;
        var sc = stepCost(world, cur.x, cur.y, nx, ny, ctx);
        if (sc === Infinity) continue;
        var ng = cur.g + sc, nk = key(nx, ny);
        if (gsc[nk] === undefined || ng < gsc[nk]) {
          gsc[nk] = ng; came[nk] = { x: cur.x, y: cur.y };
          open.push({ x: nx, y: ny, g: ng, f: ng + hh(nx, ny) });
        }
      }
    }
    return null;
  }

  // ---- archetypes (CAP-2 declarative data) ----------------------------------
  var ABILITY_TABLE = {
    scout:    { coneRange: 5, speedMul: 1.25, exploreBonus: 0.15 },
    lockpick: { canUnlock: true, unlockSecs: 10, doorBonus: 0.4 },
    carry2:   { maxCarry: 2 },
    plan:     { emitsRoutePlan: true }
  };
  var ARCHETYPES = [
    { id: 'vex',   name: 'Vex',   icon: 'scout',  role: 'Scout',    weights: { greed: 0.8, fear: 0.7, loyalty: 1.0, credulity: 1.0 }, abilities: ['scout'],    bond: 'silk' },
    { id: 'silk',  name: 'Silk',  icon: 'pick',   role: 'Lockpick', weights: { greed: 1.0, fear: 1.0, loyalty: 1.0, credulity: 0.6 }, abilities: ['lockpick'], bond: 'vex' },
    { id: 'brick', name: 'Brick', icon: 'muscle', role: 'Muscle',   weights: { greed: 1.0, fear: 0.7, loyalty: 1.6, credulity: 1.4 }, abilities: ['carry2'],   bond: 'nix' },
    { id: 'nix',   name: 'Nix',   icon: 'coward', role: 'Coward',   weights: { greed: 0.8, fear: 2.0, loyalty: 1.0, credulity: 1.4 }, abilities: [],           bond: 'brick' },
    { id: 'ash',   name: 'Ash',   icon: 'flame',  role: 'Hothead',  weights: { greed: 1.7, fear: 0.4, loyalty: 0.6, credulity: 0.6 }, abilities: [],           bond: 'moth' },
    { id: 'moth',  name: 'Moth',  icon: 'planner',role: 'Planner',  weights: { greed: 1.0, fear: 1.0, loyalty: 1.5, credulity: 1.0 }, abilities: ['plan'],     bond: 'ash' }
  ];
  var STARTS = [[11, 14], [12, 14], [10, 14], [13, 14], [9, 14], [14, 14]];

  function abilityInfo(abilities) {
    var info = { coneRange: 4, speedMul: 1, canUnlock: false, maxCarry: 1, doorBonus: 0, exploreBonus: 0, emitsRoutePlan: false };
    for (var i = 0; i < abilities.length; i++) {
      var a = ABILITY_TABLE[abilities[i]]; if (!a) continue;
      for (var kk in a) if (a.hasOwnProperty(kk)) info[kk] = a[kk];
    }
    return info;
  }

  function createThief(archetype) {
    if (typeof archetype === 'string') { for (var i = 0; i < ARCHETYPES.length; i++) if (ARCHETYPES[i].id === archetype) { archetype = ARCHETYPES[i]; break; } }
    return {
      id: archetype.id, name: archetype.name, icon: archetype.icon,
      weights: { greed: archetype.weights.greed, fear: archetype.weights.fear, loyalty: archetype.weights.loyalty, credulity: archetype.weights.credulity },
      abilities: archetype.abilities.slice(), bond: archetype.bond,
      pos: { x: 0, y: 0 }, path: [], goalStack: ['reach-gem', 'survive', 'follow-plan', 'protect-bond'],
      memory: [], state: 'raiding',
      facing: { x: 0, y: -1 }, progress: 0, delib: 0, rescore: 0, carry: 0, options: [], pending: null, replanFlag: false
    };
  }

  // ---- tokens ---------------------------------------------------------------
  function locKey(t) {
    var l = t.loc;
    if (l == null) return 'null';
    if (typeof l === 'string') return 'r:' + l;
    if (l.a && l.b) return 'p:' + l.a.x + ',' + l.a.y + '|' + l.b.x + ',' + l.b.y;
    return 'c:' + l.x + ',' + l.y;
  }
  function tokKey(t) { return t.type + '@' + locKey(t); }
  function mkToken(game, type, loc, o) {
    o = o || {};
    return {
      type: type, loc: loc, payload: o.payload == null ? null : o.payload,
      source: o.source || 'self', originId: o.originId || ('o' + (++game.tokenSeq)),
      hops: o.hops || [], confidence: clamp01(o.confidence == null ? 1 : o.confidence),
      age: o.age || 0, firsthand: o.firsthand !== false
    };
  }
  // fear multiplies danger-class confidence exactly once, at stream entry
  function addToken(game, thief, tok) {
    if (DANGER[tok.type] && !tok._fearApplied) { tok.confidence = clamp01(tok.confidence * thief.weights.fear); tok._fearApplied = true; }
    var kk = tokKey(tok);
    for (var i = 0; i < thief.memory.length; i++) {
      var e = thief.memory[i];
      if (tokKey(e) === kk) {
        if (tok.confidence > e.confidence) e.confidence = tok.confidence;
        e.firsthand = e.firsthand || tok.firsthand;
        return e;
      }
    }
    thief.memory.push(tok); return tok;
  }

  // ---- BeliefMap merge (per cell+type keep max-confidence; conflicts coexist)
  function mergeBelief(thieves) {
    var byKey = {}, tokens = [];
    for (var i = 0; i < thieves.length; i++) {
      var m = thieves[i].memory;
      for (var j = 0; j < m.length; j++) {
        var t = m[j]; if (t.confidence < 0.15) continue;
        var kk = tokKey(t);          // type+loc: conflicting TYPES on a cell get distinct keys => coexist
        var cur = byKey[kk];
        if (!cur || t.confidence > cur.token.confidence) byKey[kk] = { token: t, holder: thieves[i].id };
      }
    }
    for (var k in byKey) if (byKey.hasOwnProperty(k)) tokens.push(byKey[k]);
    return { byKey: byKey, tokens: tokens };
  }

  // ---- perception (flashlight cone = the sensor) ----------------------------
  function los(world, x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0, steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps === 0) return true;
    for (var s = 1; s < steps; s++) {
      var cx = Math.round(x0 + dx * s / steps), cy = Math.round(y0 + dy * s / steps);
      if (!inb(cx, cy) || world.grid[cx][cy] !== 'floor') return false;
    }
    return true;
  }
  function senseCone(world, thief) {
    var cells = [], seen = {}, x = thief.pos.x, y = thief.pos.y;
    function push(cx, cy) { if (inb(cx, cy) && world.grid[cx][cy] === 'floor') { var k = cx + ',' + cy; if (!seen[k]) { seen[k] = 1; cells.push({ x: cx, y: cy }); } } }
    push(x, y); push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    var info = abilityInfo(thief.abilities), range = info.coneRange, f = thief.facing || { x: 0, y: -1 };
    for (var dx = -range; dx <= range; dx++) for (var dy = -range; dy <= range; dy++) {
      var man = Math.abs(dx) + Math.abs(dy); if (man === 0 || man > range) continue;
      var mag = Math.sqrt(dx * dx + dy * dy), cos = (dx * f.x + dy * f.y) / mag;   // f is a unit axis vector
      if (cos < 0.70) continue;                                                    // ~90° arc (±45°)
      if (los(world, x, y, x + dx, y + dy)) push(x + dx, y + dy);
    }
    return cells;
  }
  function perceive(game, thief) {
    var cells = senseCone(game.world, thief);
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i], mint = null;
      for (var h = 0; h < game.world.hazards.length; h++) {
        var hz = game.world.hazards[h];
        if (hz.x === c.x && hz.y === c.y) {
          if (hz.type === 'trap') mint = mkToken(game, 'TRAP_AT', { x: c.x, y: c.y }, { confidence: 1 });
          else if (hz.type === 'plate') mint = mkToken(game, 'PLATE_AT', { x: c.x, y: c.y }, { confidence: 1 });
          else mint = mkToken(game, 'ALARM_AT', { x: c.x, y: c.y }, { confidence: 1 });
        }
      }
      if (mint) { var was = thief.memory.length; var e = addToken(game, thief, mint); if (thief.memory.length > was) log(game, 'SPOTTED', thief.id, e.type); }
      for (var L = 0; L < game.world.loot.length; L++) if (game.world.loot[L].x === c.x && game.world.loot[L].y === c.y) addToken(game, thief, mkToken(game, 'LOOT_AT', { x: c.x, y: c.y }, { confidence: 0.9 }));
      if (game.world.gem.x === c.x && game.world.gem.y === c.y) addToken(game, thief, mkToken(game, 'GEM_AT', { x: c.x, y: c.y }, { confidence: 1 }));
    }
  }

  // ---- decision scoring (weight dot-product + ability table; NO branches) ---
  function dangerMap(thief) {
    var m = {};
    for (var i = 0; i < thief.memory.length; i++) {
      var t = thief.memory[i];
      if (DANGER[t.type] && t.loc && typeof t.loc === 'object' && t.loc.x != null && t.confidence >= 0.15) {
        var k = t.loc.x + ',' + t.loc.y; if (!m[k] || t.confidence > m[k]) m[k] = t.confidence;
      }
    }
    return m;
  }
  function dangerOnPath(dm, path) { var s = 0; for (var i = 0; i < path.length; i++) { var v = dm[path[i].x + ',' + path[i].y]; if (v) s += v; } return s; }
  function dangerNear(dm, pos) {
    var s = 0, ns = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < ns.length; i++) { var v = dm[(pos.x + ns[i][0]) + ',' + (pos.y + ns[i][1])]; if (v) s += v; }
    return s;
  }
  function scoreOptions(world, thief, prng, state) {
    state = state || {}; prng = prng || function () { return 0; };
    var w = thief.weights, info = abilityInfo(thief.abilities), ctx = { unlocked: state.unlocked || {}, canUnlock: info.canUnlock };
    var dm = dangerMap(thief), opts = [], i;
    // loot & gem options — one per believed LOOT_AT / GEM_AT token (fixed order)
    for (i = 0; i < thief.memory.length; i++) {
      var t = thief.memory[i];
      if (t.confidence < 0.15) continue;
      if (t.type === 'LOOT_AT' || t.type === 'GEM_AT') {
        var cell = t.loc; if (!cell || cell.x == null) continue;
        var path = astar(world, thief.pos, cell, ctx); if (!path) continue;
        var reach = 1 / (1 + path.length), gemMul = t.type === 'GEM_AT' ? 2 : 1, dgr = dangerOnPath(dm, path);
        opts.push({
          goal: t.type === 'GEM_AT' ? 'reach-gem' : 'loot', target: { x: cell.x, y: cell.y }, path: path, originId: t.originId,
          features: { greed: t.confidence * gemMul + reach, fear: -dgr, loyalty: 0, credulity: t.firsthand ? 0 : t.confidence }
        });
      }
    }
    // survive / exit
    var ep = astar(world, thief.pos, world.exit, ctx) || [{ x: thief.pos.x, y: thief.pos.y }];
    opts.push({ goal: 'survive', target: { x: world.exit.x, y: world.exit.y }, path: ep, originId: null,
      features: { greed: 0, fear: 0.6 + dangerNear(dm, thief.pos), loyalty: 0, credulity: 0 } });
    // follow-plan — from ROUTE_PLAN tokens (Moth's seeds)
    for (i = 0; i < thief.memory.length; i++) {
      var rp = thief.memory[i];
      if (rp.type === 'ROUTE_PLAN' && rp.payload && rp.payload.length) {
        var end = rp.payload[rp.payload.length - 1], pp = astar(world, thief.pos, end, ctx); if (!pp) continue;
        opts.push({ goal: 'follow-plan', target: { x: end.x, y: end.y }, path: pp, originId: rp.originId,
          features: { greed: 0, fear: 0, loyalty: rp.confidence, credulity: 0 } });
      }
    }
    // protect-bond
    if (state.bondPos) {
      var bp = astar(world, thief.pos, state.bondPos, ctx);
      if (bp) opts.push({ goal: 'protect-bond', target: { x: state.bondPos.x, y: state.bondPos.y }, path: bp, originId: null,
        features: { greed: 0, fear: 0, loyalty: 0.5, credulity: 0 } });
    }
    for (i = 0; i < opts.length; i++) {
      var f = opts[i].features;
      var ab = (opts[i].goal === 'loot' || opts[i].goal === 'reach-gem') ? info.exploreBonus : 0;
      opts[i].score = w.greed * f.greed + w.fear * f.fear + w.loyalty * f.loyalty + w.credulity * f.credulity + ab + prng() * 0.001;
    }
    opts.sort(function (a, b) { return b.score - a.score; });
    return opts;
  }

  // ---- event log ------------------------------------------------------------
  function log(game) { var a = Array.prototype.slice.call(arguments, 1); game.eventLog.push({ e: a[0], args: a.slice(1), night: game.night, t: game.raid ? game.raid.timeMs : 0 }); }

  // ---- game lifecycle -------------------------------------------------------
  function newGame(seed) {
    seed = (seed == null ? 1 : seed) >>> 0;
    var game = { world: createWorld(), thieves: [], beliefMap: null, eventLog: [], night: 0, phase: 'menu', seed: seed, rng: mulberry32(seed), tokenSeq: 0, raid: null };
    for (var i = 0; i < ARCHETYPES.length; i++) { var th = createThief(ARCHETYPES[i]); th.pos = { x: STARTS[i][0], y: STARTS[i][1] }; game.thieves.push(th); }
    game.beliefMap = mergeBelief(game.thieves);
    return game;
  }

  function ageTokens(game, thief) {
    var keep = [];
    for (var i = 0; i < thief.memory.length; i++) { var t = thief.memory[i]; t.confidence = clamp01(t.confidence * 0.9); t.age++; if (t.confidence >= 0.15) keep.push(t); }
    thief.memory = keep;
  }
  // night-1 "they cased the joint" seeding => guarantees the outer-loot win
  function seedNight1(game) {
    var outer = [{ x: 2, y: 12 }, { x: 21, y: 12 }], safe = ['entry', 'hall-b', 'hall-a'];
    for (var i = 0; i < game.thieves.length; i++) {
      var th = game.thieves[i];
      for (var s = 0; s < safe.length; s++) addToken(game, th, mkToken(game, 'SAFE_PATH', safe[s], { confidence: 0.9 }));
      for (var l = 0; l < outer.length; l++) addToken(game, th, mkToken(game, 'LOOT_AT', { x: outer[l].x, y: outer[l].y }, { confidence: 0.9 }));
    }
  }

  function beginNight(game) {
    game.night++;
    var i;
    for (i = 0; i < game.thieves.length; i++) {
      var th = game.thieves[i];
      if (game.night > 1) ageTokens(game, th);
      th.pos = { x: STARTS[i][0], y: STARTS[i][1] };
      th.state = 'raiding'; th.path = []; th.progress = 0; th.delib = 0; th.rescore = 0; th.carry = 0;
      th.facing = { x: 0, y: -1 }; th.options = []; th.pending = null; th.replanFlag = false;
    }
    if (game.night === 1) seedNight1(game);
    game.raid = { timeMs: 0, durMs: 60000, alarmLevel: 0, alarmArmed: false, alarmTripped: false, alarmCountdown: 0, over: false, outcome: null, lootGrabbed: 0, gemStolen: false };
    game.phase = 'raid';
    log(game, 'NIGHT_START', game.night);
    if (game.night === 1) log(game, 'PLAN_SET', 'seed');
    game.beliefMap = mergeBelief(game.thieves);
    return game;
  }

  function endNight(game, outcome) {
    if (game.raid) outcome = outcome || game.raid.outcome;
    for (var i = 0; i < game.thieves.length; i++) game.thieves[i].state = 'table';
    game.phase = 'debrief';
    log(game, 'NIGHT_END', game.night, outcome || 'unknown');
    game.beliefMap = mergeBelief(game.thieves);
    return game;
  }

  // ---- raid step ------------------------------------------------------------
  // Commitment inertia: on a re-score, a thief keeps its current goal unless a
  // DIFFERENT goal beats it by this margin. Stops utility-AI thrash (a thief
  // ping-ponging survive<->protect-bond across a plate, re-arming the alarm).
  var GOAL_HYSTERESIS = 0.25;
  function activeState(game) {
    return { unlocked: game.raid.unlocked || {}, bondPos: null };
  }
  function commitPlan(game, thief) {
    var p = thief.pending; if (!p) return;
    thief.path = p.path && p.path.length > 1 ? p.path.slice(1) : [];
    thief.goalStack = [p.goal].concat(thief.goalStack.filter(function (g) { return g !== p.goal; }));
    thief.progress = 0;
    log(game, thief._planned ? 'REPLAN' : 'PLAN_SET', thief.id, thief._planned ? (p.goal) : undefined);
    thief._planned = true;
  }
  function onEnter(game, thief) {
    perceive(game, thief);
    var raid = game.raid, x = thief.pos.x, y = thief.pos.y, w = game.world, i;
    // hazards
    for (i = 0; i < w.hazards.length; i++) {
      var hz = w.hazards[i]; if (hz.x !== x || hz.y !== y) continue;
      if (hz.type === 'trap' && hz.armed) {
        log(game, 'TRAP_TRIP', thief.id, { x: x, y: y }); thief.state = 'out'; thief.path = [];
        for (var t2 = 0; t2 < game.thieves.length; t2++) { var o = game.thieves[t2]; if (o === thief) continue; if (Math.abs(o.pos.x - x) + Math.abs(o.pos.y - y) <= 4) addToken(game, o, mkToken(game, 'TRAP_AT', { x: x, y: y }, { confidence: 1 })); }
        log(game, 'EXIT', thief.id); return;
      }
      if (hz.type === 'plate') {
        log(game, 'PLATE_TRIP', thief.id, { x: x, y: y }); raid.alarmLevel++;
        for (var t3 = 0; t3 < game.thieves.length; t3++) { var o3 = game.thieves[t3]; if (Math.abs(o3.pos.x - x) + Math.abs(o3.pos.y - y) <= 6) addToken(game, o3, mkToken(game, 'PLATE_AT', { x: x, y: y }, { confidence: 1 })); }
        if (raid.alarmLevel >= 2 && !raid.alarmArmed) { raid.alarmArmed = true; log(game, 'ALARM_ARMED'); }
      }
      if (hz.type === 'alarm' && raid.alarmArmed && !raid.alarmTripped) { raid.alarmTripped = true; raid.alarmCountdown = 8000; log(game, 'ALARM_TRIPPED'); }
    }
    // gem
    if (w.gem.x === x && w.gem.y === y) { log(game, 'GEM_GRAB', thief.id); raid.gemStolen = true; endRaid(game, 'gem-stolen'); return; }
    // loot
    for (i = 0; i < w.loot.length; i++) {
      var lt = w.loot[i];
      if (lt.x === x && lt.y === y && !lt._taken && thief.pending && (thief.pending.goal === 'loot')) {
        lt._taken = true; thief.carry++; raid.lootGrabbed++;
        log(game, 'LOOT_GRAB', thief.id, { x: x, y: y });
        var info = abilityInfo(thief.abilities);
        if (thief.carry >= info.maxCarry) { thief.pending = { goal: 'survive', target: w.exit }; thief.rescore = 0; thief.path = []; }
        else thief.rescore = 0;
      }
    }
  }
  function advanceMove(game, thief, dt) {
    if (!thief.path.length) { thief.rescore = 0; return; }
    var info = abilityInfo(thief.abilities), speed = 0.004 * info.speedMul; // cells/ms
    thief.progress += speed * dt;
    while (thief.progress >= 1 && thief.path.length) {
      var nx = thief.path.shift();
      thief.facing = { x: (nx.x - thief.pos.x) || thief.facing.x, y: (nx.y - thief.pos.y) || thief.facing.y };
      if (thief.facing.x && thief.facing.y) thief.facing = { x: thief.facing.x, y: 0 };
      thief.pos = { x: nx.x, y: nx.y };
      thief.progress -= 1;
      onEnter(game, thief);
      if (thief.state !== 'raiding' || game.raid.over) return;
    }
  }
  function endRaid(game, outcome) {
    var raid = game.raid; if (raid.over) return;
    raid.over = true;
    if (!outcome) outcome = raid.gemStolen ? 'gem-stolen' : (raid.lootGrabbed > 0 ? (game.night === 1 ? 'outer-loot' : 'loot') : 'timeout');
    raid.outcome = outcome;
    for (var i = 0; i < game.thieves.length; i++) { var th = game.thieves[i]; if (th.state === 'raiding') { th.state = 'exfil'; log(game, 'EXIT', th.id); } }
  }
  function stepRaid(game, dtMs) {
    if (!game.raid || game.raid.over) return game;
    var raid = game.raid, sub = 100, remain = dtMs;
    while (remain > 0 && !raid.over) {
      var dt = remain < sub ? remain : sub; remain -= dt;
      raid.timeMs += dt;
      if (raid.alarmTripped) { raid.alarmCountdown -= dt; if (raid.alarmCountdown <= 0) { endRaid(game, 'alarm'); break; } }
      var anyActive = false;
      for (var i = 0; i < game.thieves.length; i++) {
        var th = game.thieves[i];
        if (th.state !== 'raiding') continue;
        anyActive = true;
        if (th.delib > 0) { th.delib -= dt; if (th.delib <= 0) commitPlan(game, th); continue; } // sim-time pause
        th.rescore -= dt;
        if (th.rescore <= 0 || th.replanFlag) {
          var opts = scoreOptions(game.world, th, game.rng, activeState(game));
          th.options = opts;
          var pick = opts[0] || null;
          if (pick && th._planned) {
            var curGoal = th.goalStack[0], curOpt = null;
            for (var oi = 0; oi < opts.length; oi++) if (opts[oi].goal === curGoal) { curOpt = opts[oi]; break; }
            if (curOpt && pick.goal !== curGoal && pick.score - curOpt.score < GOAL_HYSTERESIS) pick = curOpt;
          }
          th.pending = pick; th.delib = 300; th.rescore = 2000; th.replanFlag = false;
          continue;
        }
        advanceMove(game, th, dt);
      }
      if (!anyActive) { endRaid(game); break; }
      if (raid.timeMs >= raid.durMs) { endRaid(game); break; }
    }
    return game;
  }

  root.WH.sim = {
    rng: rng, ARCHETYPES: ARCHETYPES, ABILITY_TABLE: ABILITY_TABLE,
    createWorld: createWorld, regionAt: regionAt, regionMeta: regionMeta,
    createThief: createThief, newGame: newGame,
    beginNight: beginNight, endNight: endNight, stepRaid: stepRaid,
    scoreOptions: scoreOptions, astar: astar, senseCone: senseCone,
    mergeBelief: mergeBelief, mkToken: mkToken, addToken: addToken, tokKey: tokKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
