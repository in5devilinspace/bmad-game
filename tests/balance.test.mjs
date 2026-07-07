// WHISPER HEIST — balance regression LOCK for the core-stakes bell curve.
//
// Two contract guarantees are pinned here so future AI tuning can't silently
// break the stakes (CAP-1 in SPEC.md; the depth-gating table in vault-map.md):
//
//   (A) NIGHT-1 GUARANTEED WIN. Every night-1 raid ends in an outer-loot win
//       ('outer-loot' outcome, >=1 LOOT_GRAB) with the gem NOT stolen, given
//       ZERO player input. This is the "guaranteed low-stakes win" the bell
//       curve opens on.
//   (B) GEM UNREACHABLE BEFORE NIGHT 3. Across a broad seed sweep, NO GEM_GRAB
//       event ever fires on night 1 or night 2 (the sanctum is depth-gated
//       behind locked doors D3+D4; the "legend of the star" GEM_AT that makes
//       the gem a real threat is only seeded when planning night 4+).
//
// This complements tests/gem-steal.test.mjs, which pins the OTHER end of the
// curve — that the gem IS stealable on some nights 4-5 (a challenge, not a
// giveaway) and that a whisper can lure the gang onto/off the sanctum. Together
// the two suites fence the stakes in from both sides.
//
// Empirically measured (300-seed sweep, iteration 13): night-1 outer-loot win
// 300/300 (100%); full-run gem theft 29/300 (9.7%), ALL on nights 4-5
// ({4:24, 5:5}); GEM_GRAB on nights 1-2 = 0. The sweeps below are shallow by
// design — part A runs night 1 only, part B runs nights 1-2 only — so the lock
// can cover a WIDE seed range fast (detecting an early steal never needs the
// deep nights). Exercises the SHIPPED `<script id="sim">` via extract-sim.
import { loadWH } from './extract-sim.mjs';

const WH = loadWH();
const S = WH.sim, G = WH.gossip;
let passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('  ok  - ' + m); } else { failed++; console.log(' FAIL - ' + m); } }

// Play one night to completion (autonomous — no whisper). Mutates `game`.
function playNight(game) {
  S.beginNight(game);
  let g = 0;
  while (game.raid && !game.raid.over && g < 1200) { S.stepRaid(game, 100); g++; }
  const raid = game.raid;
  S.endNight(game);
  return raid;
}
// Advance the between-night lifecycle exactly as the integrator's debrief does,
// so night N+1 plans against the same beliefs the shipped game would carry.
function betweenNights(game) {
  G.runDebrief(game);
  game.beliefMap = S.mergeBelief(game.thieves);
  S.emitRoutePlans(game);
}

const SEEDS_N1 = 100;    // night-1-only sweep (a night-1 regression is structural — 100 is broad)
const SEEDS_EARLY = 60;  // nights-1-2-only sweep; the (B2) gate lock below is the mechanism guard

// ---- (A) night-1 guaranteed outer-loot win, gem never stolen ----------------
console.log('\n# (A) night-1 guaranteed win (seeds 0..' + (SEEDS_N1 - 1) + ')');
let wins = 0, hadLoot = 0, gemStolenN1 = 0, gemGrabN1 = 0, nonWin = [];
for (let seed = 0; seed < SEEDS_N1; seed++) {
  const game = S.newGame(seed);
  const raid = playNight(game);
  if (raid.outcome === 'outer-loot' && raid.lootGrabbed > 0) wins++;
  else nonWin.push(seed + ':' + raid.outcome + '/loot' + raid.lootGrabbed);
  if (raid.lootGrabbed > 0) hadLoot++;
  if (raid.gemStolen) gemStolenN1++;
  if (game.eventLog.some(e => e.e === 'GEM_GRAB' && e.night === 1)) gemGrabN1++;
}
console.log('  outer-loot wins ' + wins + '/' + SEEDS_N1 + '  (' + (100 * wins / SEEDS_N1).toFixed(1) + '%)  gemStolen=' + gemStolenN1 + '  gemGrab@n1=' + gemGrabN1);
ok(wins === SEEDS_N1, 'every night-1 raid ends in an outer-loot win (' + wins + '/' + SEEDS_N1 + (nonWin.length ? '; misses=' + nonWin.slice(0, 5).join(',') : '') + ')');
ok(hadLoot === SEEDS_N1, 'every night-1 raid grabs >=1 outer loot (CAP-1 seeded win)');
ok(gemStolenN1 === 0, 'the gem is NEVER stolen on night 1 (raid.gemStolen false for all ' + SEEDS_N1 + ' seeds)');
ok(gemGrabN1 === 0, 'no GEM_GRAB event ever fires on night 1');

// ---- (B) gem unreachable before night 3 (zero GEM_GRAB on nights 1-2) -------
console.log('\n# (B) gem unreachable before night 3 (seeds 0..' + (SEEDS_EARLY - 1) + ', nights 1-2 only)');
let earlyGemGrabs = 0, earlyStolen = 0, offender = null;
for (let seed = 0; seed < SEEDS_EARLY; seed++) {
  const game = S.newGame(seed);
  for (let night = 1; night <= 2; night++) {
    const raid = playNight(game);
    if (raid.gemStolen) { earlyStolen++; if (offender == null) offender = seed + '@n' + night; break; }
    betweenNights(game);
  }
  const g12 = game.eventLog.filter(e => e.e === 'GEM_GRAB' && e.night <= 2).length;
  earlyGemGrabs += g12;
}
console.log('  GEM_GRAB on nights 1-2: ' + earlyGemGrabs + '   gem stolen on nights 1-2: ' + earlyStolen + (offender ? '  (first offender ' + offender + ')' : ''));
ok(earlyGemGrabs === 0, 'ZERO GEM_GRAB events on nights 1-2 across ' + SEEDS_EARLY + ' seeds (gem genuinely unreachable before night 3)');
ok(earlyStolen === 0, 'raid.gemStolen never set on nights 1-2 across ' + SEEDS_EARLY + ' seeds');

// The legend gate itself: emitRoutePlans must not inject the true-cell GEM_AT
// legend while planning nights <=3 (night index at debrief < 3). This is the
// mechanism that keeps (B) true; lock it directly so a re-tune of the gate is
// caught even if a sweep happens to miss the seed.
console.log('\n# (B2) legend-of-the-star gate: no true-gem-cell belief seeded before planning night 4');
{
  const game = S.newGame(7);
  const gem = game.world.gem;
  const atGem = () => game.thieves.some(th => th.memory.some(t => t.type === 'GEM_AT' && t.loc && t.loc.x === gem.x && t.loc.y === gem.y));
  playNight(game); betweenNights(game);   // after night 1 debrief (planning night 2): game.night===1
  ok(!atGem(), 'no true-cell GEM_AT legend after night-1 debrief (planning night 2)');
  playNight(game); betweenNights(game);   // after night 2 debrief (planning night 3): game.night===2
  ok(!atGem(), 'no true-cell GEM_AT legend after night-2 debrief (planning night 3)');
  playNight(game); betweenNights(game);   // after night 3 debrief (planning night 4): game.night===3
  ok(atGem(), 'the legend IS seeded once planning night 4 (game.night>=3) — the threat arrives on schedule');
}

console.log('\n============================');
console.log('  passed: ' + passed + '   failed: ' + failed);
console.log('============================');
process.exit(failed === 0 ? 0 : 1);
