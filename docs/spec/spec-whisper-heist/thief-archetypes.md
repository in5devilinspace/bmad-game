# Thief Archetypes

One shared behavior model, six personality weight vectors plus a **declarative role-ability table** — abilities are data consumed by the scorer, never per-thief code branches (CAP-2). Weight values are relative multipliers around 1.0; build agents tune exact numbers, the *ordering* below is contract. Policy-equivalence test: under uniform weights, identical ability sets, and a fixed seed, all six produce identical option scores for identical states.

| Thief | Role | Greed | Fear | Loyalty | Credulity | Abilities | Signature behavior the data must produce |
|---|---|---|---|---|---|---|---|
| Vex | Scout | low | low | med | med | `scout` | Ranges ahead, generates most firsthand tokens, first to spot truth-belief gaps |
| Silk | Lockpick | med | med | med | low | `lockpick` | Methodical; effectively double-checks gossip — emergent from low credulity, not a code path |
| Brick | Muscle | med | low | **high** | high | `carry2` | Sticks with bonded teammate; believes friends over evidence |
| Nix | Coward | low | **high** | med | high | — | Danger memories land at ~2× confidence (fear parameter); first to flee, loudest gossip |
| Ash | Hothead | **high** | low | low | low | — | Discounts danger tokens; charges phantom-trap rooms others avoid |
| Moth | Planner | med | med | high | med | `plan` | Builds next night's route from the merged BeliefMap; the lie-amplifier |

Ability semantics (data the scorer/sim reads):

- `scout` — +1 cone range (5 cells), +25% move speed.
- `lockpick` — can spend 10 in-raid seconds to open a locked door (`vault-map.md`); the only door-opening ability.
- `carry2` — can carry two loot pieces per night.
- `plan` — at debrief end, emits ROUTE_PLAN tokens from the merged BeliefMap that seed the gang's pre-raid committed paths.

Mechanics bound to weights:

- **Fear** multiplies confidence of danger-class tokens **exactly once — at the moment the token enters the thief's stream** (firsthand creation or gossip receipt), never compounded on re-gossip (Nix's doubling is a parameter, not an if-statement).
- **Credulity** scales confidence assigned to secondhand tokens at gossip transfer.
- **Loyalty** weights protect-bond and stick-with-plan goals in the goal stack (reach gem → survive → follow plan → protect bond).
- **Greed** weights loot-seeking against risk in option scoring.

**Bond pairs (fixed):** Brick↔Nix, Vex↔Silk, Ash↔Moth.

**Debrief seating (fixed ring, gossip adjacency):** Moth–Vex–Silk–Brick–Nix–Ash. Gossip+mutation owns seating; render draws the same order.

There is no separate inter-thief trust variable: trust surfaces only as per-token confidence (three-state display) shaped by credulity/loyalty weighting.

Personality must be legible from conduct within one raid (CAP-2 success test) — the weights exist to be *watched*, not just computed.
