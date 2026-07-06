// WH.gossip — GOSSIP + MUTATION workstream (see docs/spec/spec-whisper-heist/interfaces.md)
//
// Owns: debrief exchange (fixed-ring seating, salience, top-2 per pair), mutation
// rolls, whisper application, receipt-merge. Consumes sim's seeded PRNG.
//
// Public API (all on WH.gossip):
//   seating            : string[]  fixed ring order (thief-archetypes.md)
//   ringPairs(ring)    -> [ [idA,idB], ... ] adjacent pairs incl. wrap
//   DANGER_TYPES       : Set-like of danger-class token types
//   isDanger(type)     -> boolean
//   salience(token)    -> number   confidence x 1/(1+age) x (1.5 if danger)
//   fearMult(thief)    -> number   danger-token fear multiplier (weights.fear)
//   credulityOf(thief) -> number   secondhand credulity factor (weights.credulity)
//   receiptConfidence(inConf, receiver, isDanger) -> number  clamp01(inConf x cred [x fear-once])
//   rollMutation(r)    -> 'faithful'|'exaggerate'|'drift'|'type-slip'
//   applyMutation(tok, label, rngFn) -> label (mutates tok in place; may downgrade type-slip->faithful)
//   growLoc(loc) / driftLoc(loc,rngFn) / regionOf(cell) / wingOf(regionId)
//   receiptMerge(stream, token) -> stream   (coexist; same type+loc => max confidence, stronger lineage kept)
//   deliver(game, fromId, toId, tokens)     send + receipt + mutate + log GOSSIP
//   runDebrief(game)   -> game   each ring pair exchanges top-2 salience tokens (simultaneous snapshot)
//   applyWhisper(game, thiefId, token) -> planted token (source WHISPER, conf 0.9, hollow)
//
// Determinism: never Math.random. Uses game.rng() if present else WH.sim.rng().
// Fear multiplier applies exactly ONCE, at receipt entry (never on send / re-gossip).
(function (root) {
  root.WH = root.WH || {};
  var WH = root.WH;

  // ---- tunables (spec-authored drafts) ----
  var FAITHFUL_DECAY = 0.9;   // faithful copy: confidence decays
  var EXAG_BOOST = 1.25;      // exaggerate: confidence up (clamped)

  // ---- fixed contract data (thief-archetypes.md) ----
  var SEATING = ['Moth', 'Vex', 'Silk', 'Brick', 'Nix', 'Ash'];

  // ---- vault hierarchy (vault-map.md): cell -> region -> wing -> whole vault ----
  // Priority order resolves the hall-a/hall-b overlap (inner/narrow first).
  var REGIONS = [
    { id: 'sanctum',      x0: 10, x1: 13, y0: 0,  y1: 1,  wing: 'inner' },
    { id: 'antechamber',  x0: 9,  x1: 14, y0: 2,  y1: 3,  wing: 'inner' },
    { id: 'west-gallery', x0: 1,  x1: 6,  y0: 3,  y1: 7,  wing: 'west wing' },
    { id: 'east-gallery', x0: 17, x1: 22, y0: 3,  y1: 7,  wing: 'east wing' },
    { id: 'west-store',   x0: 1,  x1: 6,  y0: 10, y1: 14, wing: 'west wing' },
    { id: 'east-store',   x0: 17, x1: 22, y0: 10, y1: 14, wing: 'east wing' },
    { id: 'hall-b',       x0: 11, x1: 12, y0: 4,  y1: 12, wing: 'central' },
    { id: 'hall-a',       x0: 4,  x1: 19, y0: 8,  y1: 9,  wing: 'central' },
    { id: 'entry',        x0: 9,  x1: 14, y0: 13, y1: 15, wing: 'south' }
  ];
  var WINGS = ['inner', 'central', 'west wing', 'east wing', 'south'];
  var REGION_ADJ = {
    'entry': ['hall-b'], 'hall-b': ['hall-a', 'antechamber', 'entry'],
    'hall-a': ['hall-b', 'west-store', 'east-store'],
    'west-store': ['hall-a', 'west-gallery'], 'east-store': ['hall-a', 'east-gallery'],
    'west-gallery': ['west-store'], 'east-gallery': ['east-store'],
    'antechamber': ['hall-b', 'sanctum'], 'sanctum': ['antechamber']
  };

  var DANGER_TYPES = { TRAP_AT: 1, ALARM_AT: 1, PLATE_AT: 1 };
  // Exhaustive closed type-slip list (memory-tokens.md).
  var TYPE_SLIP = { PLATE_AT: 'TRAP_AT', LOOT_AT: 'GEM_AT', SAFE_PATH: 'SHORTCUT' };
  var EPITHETS = ['DEATHTRAP', 'RIGGED', 'CURSED'];

  var _idc = 0;
  function mintId(p) { _idc += 1; return (p || 't') + '#' + _idc; }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function clampi(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // Resolve the one seeded PRNG. Prefer per-run game.rng, else WH.sim.rng.
  function rngOf(game) {
    if (game && typeof game.rng === 'function') return game.rng;
    if (WH.sim && typeof WH.sim.rng === 'function') return WH.sim.rng;
    throw new Error('WH.gossip: no seeded PRNG (need game.rng or WH.sim.rng)');
  }

  function isDanger(type) { return !!DANGER_TYPES[type]; }

  function regionOf(cell) {
    if (!cell || typeof cell !== 'object' || !('x' in cell)) return null;
    for (var i = 0; i < REGIONS.length; i++) {
      var r = REGIONS[i];
      if (cell.x >= r.x0 && cell.x <= r.x1 && cell.y >= r.y0 && cell.y <= r.y1) return r.id;
    }
    return null;
  }
  function regionById(id) {
    for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i];
    return null;
  }
  function wingOf(regionId) { var r = regionById(regionId); return r ? r.wing : null; }

  // Grow a location one hierarchy level: cell -> region -> wing -> whole vault.
  function growLoc(loc) {
    if (loc && typeof loc === 'object' && 'x' in loc) {
      var r = regionOf(loc); return r ? r : loc;
    }
    if (typeof loc === 'string') {
      var reg = regionById(loc);
      if (reg) return reg.wing;                 // region -> wing
      if (WINGS.indexOf(loc) >= 0) return 'the whole vault'; // wing -> vault
      return 'the whole vault';
    }
    return loc; // {a,b} / null cannot grow
  }

  function driftLoc(loc, rng) {
    if (loc && typeof loc === 'object' && 'x' in loc) {
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      var d = dirs[Math.floor(rng() * 4) % 4];
      return { x: clampi(loc.x + d[0], 0, 23), y: clampi(loc.y + d[1], 0, 15) };
    }
    if (typeof loc === 'string') {
      var adj = REGION_ADJ[loc];
      if (adj && adj.length) return adj[Math.floor(rng() * adj.length) % adj.length];
      return loc;
    }
    return loc;
  }

  function slipLoc(fromType, toType, loc) {
    if (fromType === 'SAFE_PATH' && toType === 'SHORTCUT') {
      var r = regionById(loc);
      if (r) return { a: { x: r.x0, y: r.y0 }, b: { x: r.x1, y: r.y1 } };
      return { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } };
    }
    return loc; // PLATE_AT->TRAP_AT, LOOT_AT->GEM_AT keep the cell
  }

  function cloneLoc(loc) {
    if (loc == null) return null;
    if (typeof loc === 'string') return loc;
    if ('x' in loc) return { x: loc.x, y: loc.y };
    if ('a' in loc) return { a: cloneLoc(loc.a), b: cloneLoc(loc.b) };
    return loc;
  }
  function locEqual(a, b) {
    if (a == null || b == null) return a === b;
    if (typeof a === 'string' || typeof b === 'string') return a === b;
    if ('x' in a && 'x' in b) return a.x === b.x && a.y === b.y;
    if ('a' in a && 'a' in b) return locEqual(a.a, b.a) && locEqual(a.b, b.b);
    return false;
  }
  function cloneToken(t) {
    return {
      type: t.type, loc: cloneLoc(t.loc), payload: t.payload,
      source: t.source, originId: t.originId, hops: (t.hops || []).slice(),
      confidence: t.confidence, age: t.age || 0, firsthand: !!t.firsthand
    };
  }

  // ---- salience & personality factors ----
  function salience(t) {
    var age = t.age || 0;
    return (t.confidence || 0) * (1 / (1 + age)) * (isDanger(t.type) ? 1.5 : 1);
  }
  function fearMult(thief) {
    var w = thief && thief.weights; var f = w && typeof w.fear === 'number' ? w.fear : 1;
    return f;
  }
  function credulityOf(thief) {
    var w = thief && thief.weights; var c = w && typeof w.credulity === 'number' ? w.credulity : 1;
    return c;
  }
  // Fear multiplier applied EXACTLY ONCE here, at entry; never on send / re-gossip.
  function receiptConfidence(inConf, receiver, danger) {
    var c = inConf * credulityOf(receiver);
    if (danger) c *= fearMult(receiver);
    return clamp01(c);
  }

  // ---- mutation table (seeded) ----
  function rollMutation(r) {
    if (r < 0.60) return 'faithful';
    if (r < 0.80) return 'exaggerate';
    if (r < 0.90) return 'drift';
    return 'type-slip';
  }
  // Mutates tok in place. Returns the effective label (type-slip with no valid
  // target downgrades to 'faithful' so we never leave the closed vocabulary).
  function applyMutation(tok, label, rng) {
    if (label === 'faithful') {
      tok.confidence = clamp01(tok.confidence * FAITHFUL_DECAY);
    } else if (label === 'exaggerate') {
      tok.loc = growLoc(tok.loc);
      tok.confidence = clamp01(tok.confidence * EXAG_BOOST);
    } else if (label === 'drift') {
      tok.loc = driftLoc(tok.loc, rng);
    } else if (label === 'type-slip') {
      var to = TYPE_SLIP[tok.type];
      if (to) { tok.loc = slipLoc(tok.type, to, tok.loc); tok.type = to; }
      else { tok.confidence = clamp01(tok.confidence * FAITHFUL_DECAY); label = 'faithful'; }
    }
    return label;
  }

  // ---- receipt-merge policy ----
  // Coexist in the stream; same type+loc duplicates merge to max confidence
  // (stronger lineage survives); contradictions on a cell both persist.
  function receiptMerge(stream, tok) {
    for (var i = 0; i < stream.length; i++) {
      var e = stream[i];
      if (e.type === tok.type && locEqual(e.loc, tok.loc)) {
        if (tok.confidence > e.confidence) stream[i] = tok;
        else e.confidence = Math.max(e.confidence, tok.confidence);
        return stream;
      }
    }
    stream.push(tok);
    return stream;
  }

  // ---- game/thief helpers ----
  function thieves(game) {
    if (!game) return [];
    if (Array.isArray(game.thieves)) return game.thieves;
    if (game.thieves && typeof game.thieves === 'object') {
      return Object.keys(game.thieves).map(function (k) { return game.thieves[k]; });
    }
    return [];
  }
  function getThief(game, id) {
    var list = thieves(game), i;
    for (i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    for (i = 0; i < list.length; i++) if (list[i].name === id) return list[i];
    return null;
  }
  function logEvent(game, evt) {
    if (!game) return;
    if (typeof game.pushEvent === 'function') { game.pushEvent(evt); return; }
    game.eventLog = game.eventLog || [];
    game.eventLog.push(evt);
  }

  function top2(memory) {
    return (memory || []).slice().sort(function (a, b) {
      return salience(b) - salience(a);
    }).slice(0, 2);
  }

  function ringPairs(ring) {
    var pairs = [];
    for (var i = 0; i < ring.length; i++) pairs.push([ring[i], ring[(i + 1) % ring.length]]);
    return pairs;
  }

  // ---- transfer one bundle of tokens from -> to, applying receipt + mutation ----
  function deliver(game, fromId, toId, tokens) {
    var to = getThief(game, toId);
    if (!to) return;
    to.memory = to.memory || [];
    var rng = rngOf(game);
    var night = (game && typeof game.night === 'number') ? game.night : 0;
    tokens.forEach(function (orig) {
      var danger = isDanger(orig.type);
      var copy = cloneToken(orig);
      copy.source = fromId;
      copy.firsthand = false;      // secondhand => hollow render
      copy.age = 0;                // freshly learned belief instance
      copy.originId = orig.originId || mintId('t');
      // receipt: credulity x fear-once, clamp, THEN mutation roll
      copy.confidence = receiptConfidence(orig.confidence, to, danger);
      var label = applyMutation(copy, rollMutation(rng()), rng);
      var hop = { from: fromId, to: toId, night: night, mutation: label };
      if (label === 'exaggerate' && isDanger(copy.type)) {
        hop.epithet = EPITHETS[Math.floor(rng() * EPITHETS.length) % EPITHETS.length];
      }
      copy.hops = (orig.hops || []).slice();
      copy.hops.push(hop);
      receiptMerge(to.memory, copy);
      logEvent(game, { type: 'GOSSIP', originId: copy.originId, from: fromId, to: toId, mutation: label });
    });
  }

  // ---- one debrief: every ring-adjacent pair swaps top-2 salience tokens ----
  // Snapshot outgoing bundles from PRE-debrief streams so freshly received
  // tokens do not re-propagate within the same debrief.
  function runDebrief(game) {
    var ring = SEATING, snap = {}, i;
    for (i = 0; i < ring.length; i++) {
      var th = getThief(game, ring[i]);
      snap[ring[i]] = th ? top2(th.memory) : [];
    }
    var pairs = ringPairs(ring);
    for (i = 0; i < pairs.length; i++) {
      var a = pairs[i][0], b = pairs[i][1];
      deliver(game, a, b, snap[a]);
      deliver(game, b, a, snap[b]);
    }
    return game;
  }

  // ---- whisper: plant a WHISPER-sourced lie; obeys identical downstream rules ----
  function applyWhisper(game, thiefId, token) {
    var th = getThief(game, thiefId);
    if (!th) return null;
    th.memory = th.memory || [];
    var tok = cloneToken(token);
    tok.source = 'WHISPER';
    tok.confidence = 0.9;
    tok.firsthand = false;                 // hollow
    tok.age = 0;
    tok.originId = token.originId || mintId('w'); // lineage id for CAP-4 gate + Chronicle
    tok.hops = (token.hops || []).slice();
    receiptMerge(th.memory, tok);
    logEvent(game, { type: 'WHISPER', originId: tok.originId, target: thiefId });
    return tok;
  }

  WH.gossip = {
    seating: SEATING,
    ringPairs: ringPairs,
    DANGER_TYPES: DANGER_TYPES,
    isDanger: isDanger,
    salience: salience,
    fearMult: fearMult,
    credulityOf: credulityOf,
    receiptConfidence: receiptConfidence,
    rollMutation: rollMutation,
    applyMutation: applyMutation,
    growLoc: growLoc,
    driftLoc: driftLoc,
    regionOf: regionOf,
    wingOf: wingOf,
    receiptMerge: receiptMerge,
    top2: top2,
    deliver: deliver,
    runDebrief: runDebrief,
    applyWhisper: applyWhisper,
    TYPE_SLIP: TYPE_SLIP
  };
})(typeof window !== 'undefined' ? window : globalThis);
