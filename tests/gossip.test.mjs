// Deterministic node test for WH.gossip (no deps).
// Evals build/sim.js (if present) then build/gossip.js in this global scope,
// then asserts CAP-4 propagation, exaggerate hierarchy-growth, fear-once,
// and confidence clamping.
//
// Run: node "tests/gossip.test.mjs"
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SIM = join(root, 'build', 'sim.js');
const GOSSIP = join(root, 'build', 'gossip.js');

// One shared global sandbox so WH persists across evals.
const g = globalThis;
g.window = undefined; // force gossip's IIFE onto globalThis branch

// mulberry32 — a deterministic seeded PRNG, mirrors interfaces.md.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

if (existsSync(SIM)) {
  vm.runInThisContext(readFileSync(SIM, 'utf8'), { filename: 'build/sim.js' });
}
vm.runInThisContext(readFileSync(GOSSIP, 'utf8'), { filename: 'build/gossip.js' });

const WH = g.WH;
if (!WH || !WH.gossip) throw new Error('WH.gossip not loaded');
// Ensure a PRNG exists even if sim.js is not built yet.
WH.sim = WH.sim || {};
if (typeof WH.sim.rng !== 'function') WH.sim.rng = mulberry32(0xC0FFEE);

const G = WH.gossip;

let passed = 0;
function ok(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; throw new Error('assertion failed: ' + msg); }
  passed += 1; console.log('  ok -', msg);
}
function approx(a, b, eps = 1e-9) { return Math.abs(a - b) <= eps; }

// ---- fixtures: six thieves seated on the fixed ring, numeric weights ----
function mkThief(id, greed, fear, loyalty, credulity) {
  return { id, name: id, weights: { greed, fear, loyalty, credulity }, memory: [] };
}
function newGame(seed) {
  return {
    night: 1,
    rng: mulberry32(seed),
    eventLog: [],
    thieves: [
      mkThief('Moth', 0.5, 1.0, 0.9, 0.9),
      mkThief('Vex', 0.4, 0.8, 0.6, 0.9),
      mkThief('Silk', 0.5, 1.0, 0.6, 0.5),
      mkThief('Brick', 0.5, 0.8, 0.9, 1.0),
      mkThief('Nix', 0.4, 2.0, 0.6, 1.0),
      mkThief('Ash', 0.9, 0.6, 0.4, 0.6)
    ]
  };
}
const byId = (game, id) => game.thieves.find(t => t.id === id);

console.log('TEST 1: planted TRAP_AT lie propagates with lineage traceable to originId within one debrief');
{
  const game = newGame(12345);
  const lie = { type: 'TRAP_AT', loc: { x: 5, y: 12 }, payload: null }; // west-store cell
  const planted = G.applyWhisper(game, 'Moth', lie);
  ok(planted.source === 'WHISPER', 'whisper source is WHISPER');
  ok(planted.confidence === 0.9, 'whisper confidence is 0.9');
  ok(planted.firsthand === false, 'whisper renders hollow (firsthand false)');
  ok(typeof planted.originId === 'string' && planted.originId.length > 0, 'whisper minted an originId');
  const oid = planted.originId;

  G.runDebrief(game);

  // Moth's ring neighbors are Vex and Ash. The danger lie (salience 0.9*1.5)
  // is Moth's top token, so it is sent to both neighbors.
  const found = game.thieves
    .filter(t => t.id !== 'Moth')
    .map(t => (t.memory || []).find(m => m.originId === oid))
    .filter(Boolean);
  ok(found.length >= 1, 'lie reached at least one other thief in one debrief');
  const propagated = found[0];
  ok(propagated.originId === oid, 'propagated token preserves originId lineage');
  ok(propagated.firsthand === false, 'propagated token is hollow (secondhand)');
  ok(propagated.hops.length >= 1, 'propagated token carries a gossip hop');
  const lastHop = propagated.hops[propagated.hops.length - 1];
  ok(lastHop.from === 'Moth', 'lineage hop records teller = Moth');
  // A GOSSIP event was logged referencing the origin id.
  const logged = game.eventLog.some(e => e.type === 'GOSSIP' && e.originId === oid);
  ok(logged, 'GOSSIP event logged with the origin id');
}

console.log('TEST 2: exaggerate grows a danger loc one hierarchy level (cell -> region)');
{
  const tok = { type: 'TRAP_AT', loc: { x: 11, y: 6 }, confidence: 0.5, hops: [] }; // hall-b cell
  const rng = mulberry32(7);
  const label = G.applyMutation(tok, 'exaggerate', rng);
  ok(label === 'exaggerate', 'label stays exaggerate');
  ok(tok.loc === 'hall-b', 'cell {11,6} grew to region "hall-b", got: ' + JSON.stringify(tok.loc));
  ok(tok.confidence > 0.5 && tok.confidence <= 1, 'exaggerate raised confidence within [0,1]');
  // second exaggerate: region -> wing
  G.applyMutation(tok, 'exaggerate', rng);
  ok(tok.loc === 'central', 'region "hall-b" grew to wing "central", got: ' + JSON.stringify(tok.loc));
}

console.log('TEST 3: fear-once is applied exactly once at entry, not compounded on re-gossip');
{
  const game = newGame(99);
  const nix = byId(game, 'Nix');   // fear 2.0, credulity 1.0
  const ash = byId(game, 'Ash');   // fear 0.6, credulity 0.6
  const inConf = 0.3;
  // Entry into Nix's stream: fear applied ONCE => 0.3 * 1.0 * 2.0 = 0.6 (not 1.2).
  const c1 = G.receiptConfidence(inConf, nix, true);
  ok(approx(c1, 0.6), 'single fear application: 0.3*cred*fear = 0.6, got ' + c1);
  ok(!approx(c1, Math.min(1, 0.3 * 1.0 * 2.0 * 2.0)), 'fear not compounded (would be clamp(1.2)=1.0)');
  // Re-gossip Nix -> Ash: Nix does NOT re-apply its own fear on send; Ash applies
  // its own fear once. Result uses only Ash's factors on the incoming c1.
  const c2 = G.receiptConfidence(c1, ash, true);
  ok(approx(c2, 0.6 * 0.6 * 0.6), 're-gossip applies only receiver Ash fear once, got ' + c2);
  ok(c2 < c1, 'no runaway compounding: danger confidence did not inflate on re-gossip');
  // Non-danger tokens never take the fear factor.
  const cn = G.receiptConfidence(0.5, nix, false);
  ok(approx(cn, 0.5), 'non-danger token ignores fear (0.5*cred=0.5), got ' + cn);
}

console.log('TEST 4: confidence stays within [0,1] across a full debrief and heavy exaggeration');
{
  const game = newGame(2024);
  // seed some high-confidence danger tokens across thieves
  byId(game, 'Vex').memory.push({ type: 'TRAP_AT', loc: { x: 3, y: 5 }, confidence: 0.95, hops: [], firsthand: true, age: 0 });
  byId(game, 'Nix').memory.push({ type: 'ALARM_AT', loc: { x: 10, y: 3 }, confidence: 0.9, hops: [], firsthand: true, age: 0 });
  G.applyWhisper(game, 'Silk', { type: 'PLATE_AT', loc: { x: 12, y: 9 } });
  G.runDebrief(game);
  let count = 0;
  for (const t of game.thieves) {
    for (const m of (t.memory || [])) {
      count += 1;
      ok(m.confidence >= 0 && m.confidence <= 1, t.id + ' token ' + m.type + ' confidence in [0,1]: ' + m.confidence);
    }
  }
  ok(count > 0, 'debrief produced tokens to check (' + count + ')');

  // Repeated exaggeration on a max-confidence token must clamp, never exceed 1.
  const et = { type: 'TRAP_AT', loc: { x: 3, y: 5 }, confidence: 1.0, hops: [] };
  const rng = mulberry32(5);
  for (let i = 0; i < 6; i++) {
    G.applyMutation(et, 'exaggerate', rng);
    ok(et.confidence <= 1 && et.confidence >= 0, 'exaggerate iter ' + i + ' clamped: ' + et.confidence);
  }
}

console.log('\\nALL PASSED (' + passed + ' assertions)');
