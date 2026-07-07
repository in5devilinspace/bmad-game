// WHISPER HEIST — core-stakes test: the gem is genuinely stealable by nights 4-5
// on SOME seeds (challenge, not giveaway), NEVER lost on night 1, and the player's
// whisper can lure the gang onto/off the sanctum route. Exercises the SHIPPED
// `<script id="sim">` block via extract-sim (the one source of truth).
//
// Root cause this guards against (regression): before the fix, GEM_GRAB fired 0
// times in a 1500-raid sweep — no belief ever pointed at the true gem cell, the
// danger-poisoned corridor made the reach-gem option unwinnable, and stale-goal
// inertia kept the lockpick from committing a deep route. The player had nothing
// real to defend.
import { loadWH } from './extract-sim.mjs';

const WH = loadWH();
const S = WH.sim, G = WH.gossip;
let passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('  ok  - ' + m); } else { failed++; console.log(' FAIL - ' + m); } }

// One autonomous 5-night run (no whisper), mirroring the integrator lifecycle.
// Returns the night the gem was stolen (0 = survived the run).
function runAuto(seed) {
  const game = S.newGame(seed);
  for (let night = 1; night <= 5; night++) {
    S.beginNight(game);
    let g = 0;
    while (game.raid && !game.raid.over && g < 1200) { S.stepRaid(game, 100); g++; }
    if (game.raid && game.raid.gemStolen) return night;
    S.endNight(game);
    G.runDebrief(game);
    game.beliefMap = S.mergeBelief(game.thieves);
    S.emitRoutePlans(game);
  }
  return 0;
}

console.log('\n# autonomous sweep (seeds 0..23): stealable late, safe early, not-all');
const SEEDS = 24;
let steals = 0, n1 = 0, early = 0, late = 0, night5 = 0;
const byNight = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
for (let seed = 0; seed < SEEDS; seed++) {
  const n = runAuto(seed);
  if (n > 0) { steals++; byNight[n]++; if (n === 1) n1++; if (n <= 3) early++; if (n >= 4) late++; if (n === 5) night5++; }
}
console.log('  gem stolen ' + steals + '/' + SEEDS + '  byNight=' + JSON.stringify(byNight));
ok(n1 === 0, 'night 1 NEVER loses the gem (CAP-1 outer-loot win intact)');
ok(early === 0, 'gem unreachable before night 4 (no steal on nights 1-3; sanctum falls 4-5)');
ok(late >= 1, 'gem IS stealable in the late window (nights 4-5) for at least some seed');
ok(night5 >= 1, 'the gem can be lost as late as night 5 (full-run loss path fires)');
ok(steals < SEEDS, 'NOT all seeds steal — it is a challenge, not a giveaway (' + steals + '/' + SEEDS + ')');
ok(steals >= 2, 'more than a fluke — several seeds steal (' + steals + ')');

console.log('\n# determinism: same seed => same gem outcome');
ok(runAuto(0) === runAuto(0), 'seed 0 reproduces its steal-night exactly');
ok(runAuto(6) === runAuto(6), 'seed 6 reproduces its steal-night exactly');

console.log('\n# night-1 outer-loot win still holds under the new flight rule');
{
  const game = S.newGame(2026);
  S.beginNight(game);
  let g = 0; while (!game.raid.over && g++ < 1000) S.stepRaid(game, 100);
  ok(game.eventLog.some(e => e.e === 'LOOT_GRAB' && e.night === 1), 'night 1 still grabs outer loot');
  ok(!game.raid.gemStolen, 'night 1 gem not stolen');
}

// ---- whisper lure: the player's lie steers Moth's route onto/off the gem -----
// Mirror finishDebrief: applyWhisper -> merge -> emitRoutePlans, then read the plan.
function planTargetOf(game) {
  for (const th of game.thieves) for (const t of th.memory) if (t.type === 'ROUTE_PLAN' && t.payload && t.payload.length) return t.payload[t.payload.length - 1];
  return null;
}
function advanceToDebrief(seed, upto) { // returns game sitting after night `upto`'s runDebrief (pre-emit)
  const game = S.newGame(seed);
  for (let night = 1; night <= upto; night++) {
    S.beginNight(game);
    let g = 0; while (game.raid && !game.raid.over && g < 1200) { S.stepRaid(game, 100); g++; }
    S.endNight(game); G.runDebrief(game);
    if (night === upto) return game;
    game.beliefMap = S.mergeBelief(game.thieves); S.emitRoutePlans(game);
  }
  return game;
}

console.log('\n# whisper lure: a planted lie steers the gang onto / off the gem (vs the no-whisper baseline)');
{
  const SEED = 3, isGem = p => p && p.x === 11 && p.y === 0;
  // Lure ONTO: at the night-2 debrief (planning night 3, BEFORE the autonomous legend), the plan does
  // NOT target the gem. Whispering GEM_AT(sanctum) flips it — proving the whisper alone put them on the gem.
  const base3 = (() => { const g = advanceToDebrief(SEED, 2); g.beliefMap = S.mergeBelief(g.thieves); S.emitRoutePlans(g); return planTargetOf(g); })();
  const on = (() => { const g = advanceToDebrief(SEED, 2); G.applyWhisper(g, 'silk', { type: 'GEM_AT', loc: { x: 11, y: 0 } }); g.beliefMap = S.mergeBelief(g.thieves); S.emitRoutePlans(g); return planTargetOf(g); })();
  ok(!isGem(base3), 'baseline night-3 plan does NOT target the gem (' + JSON.stringify(base3) + ')');
  ok(isGem(on), 'whispered GEM_AT(sanctum) lures the plan ONTO the gem (' + JSON.stringify(on) + ')');

  // Lure OFF: at the night-4 debrief the autonomous legend targets the gem. Whispering a decoy GEM_AT at
  // an outer cell (a lie the gang does not already hold) pulls the plan off the sanctum onto the decoy.
  const base5 = (() => { const g = advanceToDebrief(SEED, 4); g.beliefMap = S.mergeBelief(g.thieves); S.emitRoutePlans(g); return planTargetOf(g); })();
  const off = (() => { const g = advanceToDebrief(SEED, 4); G.applyWhisper(g, 'moth', { type: 'GEM_AT', loc: { x: 21, y: 12 } }); g.beliefMap = S.mergeBelief(g.thieves); S.emitRoutePlans(g); return planTargetOf(g); })();
  ok(isGem(base5), 'baseline night-5 plan DOES target the gem (the autonomous threat: ' + JSON.stringify(base5) + ')');
  ok(off && off.x === 21 && off.y === 12, 'whispered decoy lures the plan OFF the gem onto the decoy (' + JSON.stringify(off) + ')');
  ok(!isGem(off), 'the decoy whisper genuinely pulled the plan away from the sanctum');
}

console.log('\n============================');
console.log('  passed: ' + passed + '   failed: ' + failed);
console.log('============================');
process.exit(failed === 0 ? 0 : 1);
