// WHISPER HEIST — Chronicle (CAP-8) deterministic tests (no deps).
// Run: node "tests/chronicle.test.mjs"
//
// Grades the SHIPPED chronicle builder (WH.juice.chronicle) extracted from
// src/index.html — both the sim block and the render/juice presentation block
// are eval'd in one browserless VM (see tests/extract-full.mjs), so this tests
// the bytes that ship. drawChronicle (needs a canvas) is never called; only the
// pure chronicle(game) builder + its exported placeName/word helpers are used.
//
// CAP-8 success criteria proven here:
//   (a) every Chronicle line references at least one run-specific logged
//       token/event (a logged thief's name, or a place-name of a logged cell /
//       memory-token loc) — verified NON-circularly: the test independently
//       derives the legal reference vocabulary from the run's own eventLog +
//       final memory streams and asserts each line's anchor is a member.
//   (b) two different seeds produce MATERIALLY different Chronicles.
//   + zero numerals in the prose; + no canned/authored sentence survives.

import { loadFullWH } from './extract-full.mjs';

const WH = loadFullWH();
const sim = WH.sim, gossip = WH.gossip, juice = WH.juice;
const placeName = juice.placeName;

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; console.log('  ok  - ' + msg); } else { failed++; console.log(' FAIL - ' + msg); } }

// Sentences that USED to be canned (identical in every run). None may survive.
const CANNED = [
  'Six went in under the dark, and the entrance swallowed them whole.',
  'Then the bells woke, and the job with them.',
  'The star kept its socket in the sanctum, night after night, and never knew our names.',
  'The gang split what little they had and swore the vault had cheated them.'
];

// Floor cells / types to plant successive lies on (all inside real regions, all floor).
const LIE_CELLS = [{ x: 11, y: 6 }, { x: 5, y: 12 }, { x: 18, y: 12 }, { x: 12, y: 10 }, { x: 11, y: 9 }, { x: 19, y: 8 }];
const LIE_TYPES = ['TRAP_AT', 'SAFE_PATH', 'LOOT_AT', 'ALARM_AT'];

// Drive a full run to the Chronicle, mirroring the integrator's night loop, and plant one WHISPER
// lie per debrief so the blame/lineage lines fire. The lie (target/type/cell) is derived from the
// seed, so the two test runs are genuinely DISTINCT playthroughs — as two real ones would be.
function runToChronicle(seed) {
  const game = sim.newGame(seed);
  sim.beginNight(game);                         // night 1 (seeded outer-loot win)
  let n = 0, guard = 0;
  for (;;) {
    let g2 = 0;
    while (!game.raid.over && g2++ < 5000) sim.stepRaid(game, 100);
    sim.endNight(game);                         // logs NIGHT_END, phase -> debrief
    if (game.raid.gemStolen || game.night >= 5) break;
    gossip.runDebrief(game);                     // thief<->thief gossip (emits GOSSIP)
    sim.emitRoutePlans(game);
    const cell = LIE_CELLS[(n + seed) % LIE_CELLS.length];
    const type = LIE_TYPES[(n + seed) % LIE_TYPES.length];
    const target = game.thieves[(n + seed) % game.thieves.length];
    gossip.applyWhisper(game, target.id, { type: type, loc: { x: cell.x, y: cell.y } });
    game.beliefMap = sim.mergeBelief(game.thieves);
    sim.beginNight(game);                        // next night
    n++;
    if (guard++ > 12) break;                     // safety
  }
  return { game, ch: juice.chronicle(game) };
}

// Independently derive the run's legal reference vocabulary from its OWN data.
function refVocab(game) {
  const names = new Set(), places = new Set();
  for (const t of game.thieves) {
    names.add(t.name);
    for (const tok of (t.memory || [])) if (tok && tok.loc != null) places.add(placeName(tok.loc));
  }
  for (const ev of (game.eventLog || [])) if (ev && ev.cell != null) places.add(placeName(ev.cell));
  return { names, places };
}

function auditRun(label, seed) {
  console.log('\n# run ' + label + ' (seed ' + seed + ')');
  const { game, ch } = runToChronicle(seed);
  ok(ch && Array.isArray(ch.lines), 'chronicle produced lines');
  ok(ch.lines.length >= 5 && ch.lines.length <= 8, 'line count in [5,8] (' + ch.lines.length + ')');
  ok(Array.isArray(ch.refs) && ch.refs.length === ch.lines.length, 'refs parallel to lines (' + ch.refs.length + ')');

  const vocab = refVocab(game);
  let allAnchored = true, allInVocab = true, anyDigit = false, anyCanned = false, placeRefs = 0;
  for (let i = 0; i < ch.lines.length; i++) {
    const line = ch.lines[i], ref = ch.refs[i];
    if (!ref || line.indexOf(ref) < 0) { allAnchored = false; console.log('     line NOT anchored on its ref: [' + ref + '] !in "' + line + '"'); }
    const inVocab = vocab.names.has(ref) || vocab.places.has(ref);
    if (!inVocab) { allInVocab = false; console.log('     ref NOT in run vocabulary: [' + ref + '] "' + line + '"'); }
    if (vocab.places.has(ref)) placeRefs++;
    if (/\d/.test(line)) { anyDigit = true; console.log('     DIGIT leaked: "' + line + '"'); }
    if (CANNED.indexOf(line) >= 0) { anyCanned = true; console.log('     CANNED line survived: "' + line + '"'); }
  }
  ok(allAnchored, '(a) every line contains its declared run-specific ref substring');
  ok(allInVocab, '(a) every line ref is derived from THIS run\'s log/memory (non-circular)');
  ok(placeRefs >= 1, 'at least one line anchors on a concrete run place-name (' + placeRefs + ')');
  ok(!anyDigit, 'zero numerals in the Chronicle prose');
  ok(!anyCanned, 'no formerly-canned sentence survives');
  ok(ch.lines.some(l => /still poor\.$/.test(l)), 'blame line (planted lie, via token lineage) is present');
  return ch;
}

const A = auditRun('A', 1234);
const B = auditRun('B', 99999);

// ---------------------------------------------------------------------------
console.log('\n# (b) two runs differ materially');
const joinA = A.lines.join('\n'), joinB = B.lines.join('\n');
ok(joinA !== joinB, 'the two Chronicles are not identical');
let diff = Math.abs(A.lines.length - B.lines.length);
for (let i = 0; i < Math.min(A.lines.length, B.lines.length); i++) if (A.lines[i] !== B.lines[i]) diff++;
ok(diff >= 3, 'at least three lines differ between the two runs (' + diff + ')');
// the concrete place-name anchors themselves differ (run-specific content, not just word order)
const placesA = A.refs.filter(r => /the |hall/.test(r)).join('|');
const placesB = B.refs.filter(r => /the |hall/.test(r)).join('|');
ok(placesA !== placesB || A.moons !== B.moons || A.pips !== B.pips,
  'run-specific anchors/outcome differ (placesA="' + placesA + '" placesB="' + placesB + '")');

// ---------------------------------------------------------------------------
console.log('\n============================');
console.log('  passed: ' + passed + '   failed: ' + failed);
console.log('============================');
process.exit(failed === 0 ? 0 : 1);
