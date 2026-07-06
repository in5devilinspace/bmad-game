# Interfaces

The integration contract for the four parallel workstreams. Canonical shapes, event vocabulary, ownership, perception, coupling, determinism. Any change here is a spec change, not a workstream decision.

## Canonical data shapes

```
Thief    { id, name, icon, weights: {greed, fear, loyalty, credulity},
           abilities: string[],            // from thief-archetypes.md role-ability table (data, not branches)
           bond: thiefId,                  // fixed pairs, thief-archetypes.md
           pos: {x, y}, path: Cell[],      // current committed path — THE plan-line render source
           goalStack: GoalId[],            // active goal = top; rendered as overhead icon
           memory: Token[], state: 'raiding'|'out'|'exfil'|'table' }

Token    { type,                           // one of the 10, memory-tokens.md
           loc,                            // per-type shape: cell {x,y} | regionId | {a:cell, b:cell} | null
           payload,                        // per-type semantics, memory-tokens.md
           source: thiefId | 'WHISPER',    // immediate teller (or self for firsthand)
           originId,                       // immutable lineage id minted at creation; survives gossip AND mutation
           hops: [{from, to, night, mutation?}],
           confidence,                     // 0..1, clamped
           age,                            // nights since creation
           firsthand: boolean }            // renders solid vs hollow

World    { grid[24][16]: 'wall'|'floor', regions, doors, hazards, loot, gem }   // built from vault-map.md tables

BeliefMap: merge of all six thieves' tokens — per (cellOrRegion, type) keep the max-confidence token;
           conflicting types on one cell coexist and are resolved at scoring time by confidence weighting.
           Consumed by BOTH Moth's pre-raid planner and the belief-ink overlay (per-thief color = tint of the
           max-confidence holder). One structure, sim-owned; render never re-derives it.

EventLog: append-only, the Chronicle's raw material. Closed vocabulary:
  NIGHT_START(n) | SPOTTED(thief, token) | TRAP_TRIP(thief, cell) | PLATE_TRIP(thief, cell)
  | ALARM_ARMED | ALARM_TRIPPED | DOOR_UNLOCK(thief, door) | LOOT_GRAB(thief, cell)
  | GEM_GRAB(thief) | FLEE(thief, cause) | EXIT(thief) | GOSSIP(tokenOriginId, from, to, mutation?)
  | WHISPER(tokenOriginId, target) | PLAN_SET(thief) | REPLAN(thief, cause) | NIGHT_END(n, outcome)
```

## Ownership

| Component | Workstream |
|---|---|
| World build, night lifecycle, perception, decision scoring, A*, goal stacks, BeliefMap, EventLog | **sim core** |
| Debrief exchange (seating, salience, top-2 per pair), mutation rolls, whisper application, receipt-merge | **gossip+mutation** |
| Canvas layers 1–6 (`render-plan.md`), hover/pinned ledger, plan-lines, belief ink, debrief table visuals, whisper UI input | **render+overlay** |
| Beat queue, fx layer 7, speech bubbles, Chronicle, title screen | **juice+Chronicle** |

## Perception model

The rendered flashlight cone **is** the sensor — render must draw exactly the sim's geometry. Cone: 90° arc, 4-cell range, blocked by walls (LOS); the thief's own cell and 4-neighbors are always sensed. Sensing a cell mints/refreshes firsthand tokens for its contents (TRAP_AT only on visible armed traps or a witnessed trip). Loud events (PLATE_TRIP, ALARM_TRIPPED, FLEE scream) are witnessed through walls within 6 cells. Mid-raid learning is exclusively firsthand — token transfer happens at debrief only.

## Coupling

Sim advances on fixed 100ms steps; option re-scoring every ~2s per thief plus event-driven replans. The deliberation beat (~300ms pause, eye-flick, intent arrow) is **sim-time** — the thief is genuinely paused; it is exempt from the beat budget. The beat queue sequences presentation only (fx, bubbles), caps one dramatic event per 1.5s and two bubbles, drops stale entries, and never blocks the sim.

## Determinism & tests

One seeded PRNG (e.g. mulberry32) threads through decision noise and mutation rolls; the seed is drawn once per run and logged to the EventLog. Sim core and gossip+mutation logic live in a dedicated `<script id="sim">` block containing no DOM references; `tests/run-tests.mjs` (repo-side, not shipped) extracts that block from `src/index.html`, evaluates it in Node, and runs deterministic assertions over typed tokens (mutation chains, receipt-merge, fear-once rule, policy-equivalence under uniform weights + fixed seed, CAP-4 propagation gate on a scripted two-night run).
