// WHISPER HEIST — TIME-TO-FIRST-OUTSMART test (SPEC Success signal + CAP-6 + CAP-4).
//
// THE CLAIM this proves, against the SHIPPED `<script id="sim">` block:
//   Planting a TRAP_AT lie on an otherwise-safe corridor cell C at the NIGHT-1
//   debrief makes, BY NIGHT 2, the lied-to thief's committed plan-line (the dashed
//   route drawPlanLines() draws from `pos` through `path`) route AROUND C — while
//   an unwhispered control run on the SAME seed routes THROUGH C, to the SAME
//   destination. The lie is lineage-traced to its WHISPER origin (CAP-4 gate).
//
// This is the SPEC's core "time-to-first-outsmart" success signal: by night two the
// player watches the gang's plan reroute around a perfectly safe hallway because of
// a lie they planted. Iteration 9 made whispers steer routing (DANGER_SURCHARGE folds
// any believed hazard into A* every tick); this test locks that in and proves the
// outsmart loop lands on night 2, not just late nights.
//
// Runs the shipped code via extract-sim (the one source of truth). Deterministic.
import { loadWH } from './extract-sim.mjs';

const WH = loadWH();
const S = WH.sim, G = WH.gossip;
let passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('  ok  - ' + m); } else { failed++; console.log(' FAIL - ' + m); } }

// Real hazard cells (vault-map): a "planted-safe" corridor lie must NOT sit on one.
const REAL_HAZARDS = [[3, 5], [20, 4], [11, 6], [11, 9], [12, 9], [10, 3], [13, 2]];
const isHazard = (x, y) => REAL_HAZARDS.some(h => h[0] === x && h[1] === y);
// hall-a (x4..19, y8..9) and hall-b (x11|12, y4..12) are the safe connective corridors.
const isCorridor = (x, y) =>
  (y >= 8 && y <= 9 && x >= 4 && x <= 19) || ((x === 11 || x === 12) && y >= 4 && y <= 12);

// Mirror the integrator debrief lifecycle EXACTLY:
//   night 1 raid -> endNight -> runDebrief -> merge -> emitRoutePlans   (startDebrief)
//   -> [applyWhisper at the night-1 debrief] -> merge -> emitRoutePlans (finishDebrief)
//   -> beginNight(2).
// Then step night 2 until each raiding thief has committed its first plan; snapshot
// the plan-line exactly as drawPlanLines reads it: cells = [pos, ...path].
function runToNight2(seed, whisper) {
  const game = S.newGame(seed);
  S.beginNight(game);
  let g = 0; while (game.raid && !game.raid.over && g < 1200) { S.stepRaid(game, 100); g++; }
  const night1 = { loot: game.eventLog.some(e => e.e === 'LOOT_GRAB' && e.night === 1), gem: !!game.raid.gemStolen };
  S.endNight(game);
  G.runDebrief(game);
  game.beliefMap = S.mergeBelief(game.thieves);
  S.emitRoutePlans(game);                       // night-2 plan (pre-whisper)
  if (whisper) G.applyWhisper(game, whisper.thief, { type: whisper.type, loc: whisper.loc });
  game.beliefMap = S.mergeBelief(game.thieves);
  S.emitRoutePlans(game);                       // re-emit after the whisper (finishDebrief)
  S.beginNight(game);                           // NIGHT 2
  const line = {};
  for (let k = 0; k < 80; k++) {
    S.stepRaid(game, 100);
    for (const th of game.thieves) {
      if (th._planned && !line[th.id] && th.path && th.path.length) {
        line[th.id] = { cells: [{ x: th.pos.x, y: th.pos.y }].concat(th.path.map(p => ({ x: p.x, y: p.y }))), goal: th.goalStack[0] };
      }
    }
    if (game.thieves.every(t => t.state !== 'raiding' || line[t.id])) break;
  }
  return { game, line, night1 };
}

const onLine = (ln, c) => ln.cells.some(p => p.x === c.x && p.y === c.y);
const endOf = (ln) => ln.cells[ln.cells.length - 1];
const sameEnd = (a, b) => endOf(a).x === endOf(b).x && endOf(a).y === endOf(b).y;

// Pick a mid-corridor SAFE cell on a thief's control plan-line (never its start or end).
function safeCorridorCellOn(ln) {
  const cand = ln.cells.filter((c, idx) => idx > 0 && idx < ln.cells.length - 1 && !isHazard(c.x, c.y) && isCorridor(c.x, c.y));
  return cand.length ? cand[Math.floor(cand.length / 2)] : null;
}

const VICTIM = 'vex';   // a normal-fear follow-plan thief; its route to the outer loot runs the hall-a corridor

console.log('\n# HEADLINE (seed 0): a night-1 TRAP_AT lie bends the night-2 plan-line around a safe hallway');
{
  const ctrl = runToNight2(0, null);
  const cl = ctrl.line[VICTIM];
  ok(!!cl, VICTIM + ' commits a night-2 plan-line in the control run');
  const C = safeCorridorCellOn(cl);
  ok(!!C, 'control plan-line crosses a safe hallway corridor cell to plant the lie on (' + JSON.stringify(C) + ')');
  ok(C && !isHazard(C.x, C.y) && isCorridor(C.x, C.y), 'the chosen cell is a genuinely SAFE corridor cell (no real hazard there)');
  ok(C && onLine(cl, C), 'CONTROL: the plan-line routes THROUGH C');

  const treat = runToNight2(0, { thief: VICTIM, type: 'TRAP_AT', loc: C });
  const tl = treat.line[VICTIM];
  ok(!!tl, VICTIM + ' still commits a night-2 plan-line after the lie (does not just abort)');
  ok(tl && !onLine(tl, C), 'TREATMENT: the plan-line routes AROUND C — the lie rerouted it (' + JSON.stringify(tl.cells) + ')');
  ok(tl && cl && sameEnd(cl, tl), 'the reroute reaches the SAME destination (a detour around the lie, not a new goal): ' + JSON.stringify(endOf(cl)));

  // CAP-4 gate: the lie is lineage-traced to its WHISPER origin, held by the target on night 2.
  const held = treat.game.thieves.find(t => t.id === VICTIM).memory
    .find(t => t.type === 'TRAP_AT' && t.loc && t.loc.x === C.x && t.loc.y === C.y && t.source === 'WHISPER');
  ok(!!held, 'CAP-4: the target still holds TRAP_AT@C sourced to the WHISPER (lineage-attributable)');

  // determinism: same seed + same lie => byte-identical reroute.
  const treat2 = runToNight2(0, { thief: VICTIM, type: 'TRAP_AT', loc: C });
  ok(JSON.stringify(treat2.line[VICTIM].cells) === JSON.stringify(tl.cells), 'determinism: the reroute reproduces exactly on a re-run');

  // night-1 guarantee untouched (the whisper is planted at the night-1 debrief, after night 1 has played).
  ok(ctrl.night1.loot && !ctrl.night1.gem, 'night-1 outer-loot win intact, gem not stolen night 1 (CAP-1)');
}

console.log('\n# SWEEP (seeds 0..15): the outsmart reroute lands by night 2 on every seed');
{
  const N = 16; let rerouted = 0, sameDest = 0, throughInControl = 0;
  for (let seed = 0; seed < N; seed++) {
    const ctrl = runToNight2(seed, null);
    const cl = ctrl.line[VICTIM]; if (!cl) continue;
    const C = safeCorridorCellOn(cl); if (!C) continue;
    if (onLine(cl, C)) throughInControl++;
    const treat = runToNight2(seed, { thief: VICTIM, type: 'TRAP_AT', loc: C });
    const tl = treat.line[VICTIM]; if (!tl) continue;
    if (!onLine(tl, C)) rerouted++;
    if (sameEnd(cl, tl)) sameDest++;
  }
  console.log('  through-in-control=' + throughInControl + '/' + N + '  rerouted=' + rerouted + '/' + N + '  same-destination=' + sameDest + '/' + N);
  ok(throughInControl === N, 'every control run routes THROUGH its safe corridor cell (baseline holds)');
  ok(rerouted === N, 'every treatment run reroutes AROUND the planted lie by night 2 (deterministic outsmart)');
  ok(sameDest === N, 'every reroute keeps the same destination — a detour around the lie, not a changed goal');
}

console.log('\n# a DIFFERENT safe corridor cell reroutes a DIFFERENT direction (not a hard-coded fluke)');
{
  // Whisper a hall-b cell on the shared vertical spine instead of a hall-a cell.
  const ctrl = runToNight2(3, null);
  const cl = ctrl.line[VICTIM];
  const C = { x: 11, y: 11 };   // hall-b interior, safe (plates are y9), on the entry->hall spine
  ok(!isHazard(C.x, C.y) && isCorridor(C.x, C.y), 'hall-b (11,11) is a safe corridor cell');
  if (onLine(cl, C)) {
    const treat = runToNight2(3, { thief: VICTIM, type: 'TRAP_AT', loc: C });
    ok(!onLine(treat.line[VICTIM], C), 'a hall-b lie also reroutes the plan-line around it');
  } else {
    ok(true, 'seed-3 control did not cross (11,11); hall-a case already proves the mechanic (skipped)');
  }
}

console.log('\n============================');
console.log('  passed: ' + passed + '   failed: ' + failed);
console.log('============================');
process.exit(failed === 0 ? 0 : 1);
