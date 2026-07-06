// WHISPER HEIST — sim core deterministic tests (no deps).
// Run: node "tests/sim.test.mjs"
// Exercises the SHIPPED `<script id="sim">` block extracted from src/index.html
// (the one source of truth) — never a build/*.js copy. See tests/extract-sim.mjs.
import { loadWH } from './extract-sim.mjs';

const WH = loadWH();
const sim = WH.sim;

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; console.log('  ok  - ' + msg); } else { failed++; console.log(' FAIL - ' + msg); } }
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + a + ', want ' + b + ')'); }

// ---------------------------------------------------------------------------
console.log('\n# world builds');
const world = sim.createWorld();
eq(world.grid.length, 24, 'grid width 24');
eq(world.grid[0].length, 16, 'grid height 16');
ok(world.grid[11][0] === 'floor', 'gem cell (11,0) is floor (sanctum)');
ok(world.grid[0][0] === 'wall', 'corner (0,0) is wall');
eq(world.regions.length, 9, '9 regions');
eq(world.loot.length, 6, '6 loot placements');
eq(world.gem.x + ',' + world.gem.y, '11,0', 'gem at (11,0)');
eq(world.hazards.filter(h => h.type === 'trap').length, 3, '3 traps');
eq(world.hazards.filter(h => h.type === 'plate').length, 2, '2 pressure plates');
eq(world.hazards.filter(h => h.type === 'alarm').length, 2, '2 alarm triggers');
eq(world.doors.length, 4, '4 locked doors (D1-D4)');
ok(world.doors.every(d => d.locked && d.ability === 'lockpick'), 'all doors locked, need lockpick');

// ---------------------------------------------------------------------------
console.log('\n# A* finds a path entry -> west-store');
const path = sim.astar(world, { x: 11, y: 14 }, { x: 2, y: 12 });
ok(!!path, 'path exists');
ok(path && path[0].x === 11 && path[0].y === 14, 'path starts at entry');
ok(path && path[path.length - 1].x === 2 && path[path.length - 1].y === 12, 'path ends at west-store loot');
// every step is 4-connected and lands on floor
let contiguous = !!path;
for (let i = 1; path && i < path.length; i++) {
  const d = Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
  if (d !== 1 || world.grid[path[i].x][path[i].y] !== 'floor') contiguous = false;
}
ok(contiguous, 'path is 4-connected over floor cells');
// depth gating: without lockpick you cannot reach the sanctum gem
ok(sim.astar(world, { x: 11, y: 14 }, world.gem) === null, 'gem unreachable through locked doors (no lockpick)');
ok(!!sim.astar(world, { x: 11, y: 14 }, world.gem, { canUnlock: true }), 'gem reachable with lockpick ability');

// ---------------------------------------------------------------------------
console.log('\n# policy-equivalence under uniform weights + fixed seed');
{
  const game = sim.newGame(1234);
  sim.beginNight(game); // night 1 seeds identical "cased the joint" tokens for all six
  // Force uniform weights, identical abilities, identical position & memory.
  const refMem = game.thieves[0].memory;
  const scores = game.thieves.map(t => {
    t.weights = { greed: 1, fear: 1, loyalty: 1, credulity: 1 };
    t.abilities = [];
    t.pos = { x: 11, y: 14 };
    t.memory = refMem.map(tok => Object.assign({}, tok)); // same tokens, own copies
    // fresh rng seeded identically per thief so decision noise matches
    const prng = sim.rng.create(777);
    return sim.scoreOptions(game.world, t, prng, {}).map(o => o.goal + ':' + o.score.toFixed(9));
  });
  let equal = true;
  for (let i = 1; i < scores.length; i++) if (JSON.stringify(scores[i]) !== JSON.stringify(scores[0])) equal = false;
  ok(equal, 'all six thieves produce identical option scores under uniform weights');
  ok(scores[0].length > 0, 'at least one scored option exists');
}

// ---------------------------------------------------------------------------
console.log('\n# determinism: same seed => same scores');
{
  const g1 = sim.newGame(42); sim.beginNight(g1);
  const g2 = sim.newGame(42); sim.beginNight(g2);
  const s1 = sim.scoreOptions(g1.world, g1.thieves[0], g1.rng, {}).map(o => o.score.toFixed(9));
  const s2 = sim.scoreOptions(g2.world, g2.thieves[0], g2.rng, {}).map(o => o.score.toFixed(9));
  ok(JSON.stringify(s1) === JSON.stringify(s2), 'identical seed yields identical option scores');
}

// ---------------------------------------------------------------------------
console.log('\n# night-1 seeding reaches the outer loot (guaranteed win)');
{
  const game = sim.newGame(2026);
  sim.beginNight(game);
  eq(game.night, 1, 'night is 1');
  // every thief seeded with the outer LOOT_AT belief
  ok(game.thieves.every(t => t.memory.some(k => k.type === 'LOOT_AT')), 'all thieves hold a LOOT_AT belief');
  let guard = 0;
  while (!game.raid.over && guard++ < 1000) sim.stepRaid(game, 100);
  ok(game.raid.over, 'raid ended');
  const grabs = game.eventLog.filter(e => e.e === 'LOOT_GRAB');
  ok(grabs.length > 0, 'at least one LOOT_GRAB occurred (' + grabs.length + ')');
  // the grabbed loot is an OUTER (tier-0) piece
  const outerGrab = grabs.some(e => {
    const c = e.args[1];
    const l = game.world.loot.find(x => x.x === c.x && x.y === c.y);
    return l && l.tier === 0;
  });
  ok(outerGrab, 'an outer (tier-0) loot piece was grabbed');
  ok(!game.raid.gemStolen, 'the gem was NOT stolen on night 1');
  sim.endNight(game);
  eq(game.phase, 'debrief', 'game advances to debrief after night 1');
  ok(game.eventLog.some(e => e.e === 'NIGHT_END'), 'NIGHT_END logged');
}

// ---------------------------------------------------------------------------
console.log('\n# BeliefMap merge: per cell+type keep max-confidence; conflicts coexist');
{
  const game = sim.newGame(9);
  const a = game.thieves[0], b = game.thieves[1];
  sim.addToken(game, a, sim.mkToken(game, 'TRAP_AT', { x: 5, y: 5 }, { confidence: 0.4 }));
  sim.addToken(game, b, sim.mkToken(game, 'TRAP_AT', { x: 5, y: 5 }, { confidence: 0.8 }));
  sim.addToken(game, b, sim.mkToken(game, 'SAFE_PATH', 'hall-a', { confidence: 0.7 }));
  // conflicting type on same cell: SAFE_PATH cell-level vs TRAP_AT — use a cell both cover
  sim.addToken(game, a, sim.mkToken(game, 'SAFE_PATH', { x: 5, y: 5 }, { confidence: 0.6 }));
  const bm = sim.mergeBelief(game.thieves);
  const trap = bm.byKey['TRAP_AT@c:5,5'];
  ok(trap && Math.abs(trap.token.confidence - 0.8) < 1e-9, 'TRAP_AT@(5,5) kept at max confidence 0.8');
  const safe = bm.byKey['SAFE_PATH@c:5,5'];
  ok(!!safe, 'conflicting SAFE_PATH@(5,5) coexists with TRAP_AT (distinct keys)');
}

// ---------------------------------------------------------------------------
console.log('\n============================');
console.log('  passed: ' + passed + '   failed: ' + failed);
console.log('============================');
process.exit(failed === 0 ? 0 : 1);
