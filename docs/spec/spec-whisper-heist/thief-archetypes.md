# Thief Archetypes

One agent class, six weight vectors (CAP-2). Weights modulate utility scoring and gossip handling only — no archetype-specific code paths. Values are relative multipliers around 1.0; build agents tune the exact numbers, the *ordering* below is contract.

| Thief | Role | Greed | Fear | Loyalty | Credulity | Signature behavior the weights must produce |
|---|---|---|---|---|---|---|
| Vex | Scout | low | low | med | med | Ranges ahead, generates most firsthand tokens, first to spot truth-belief gaps |
| Silk | Lockpick | med | med | med | low | Methodical; double-checks gossip against own memories before rerouting |
| Brick | Muscle | med | low | **high** | high | Sticks with bonded teammate; believes friends over evidence |
| Nix | Coward | low | **high** | med | high | Danger memories land at ~2× confidence; first to flee, loudest gossip |
| Ash | Hothead | **high** | low | low | low | Discounts danger tokens; charges phantom-trap rooms others avoid |
| Moth | Planner | med | med | high | med | Builds next night's route from the shared belief map; the lie-amplifier |

Mechanics bound to weights:

- **Fear** multiplies confidence of danger-type tokens on receipt (Nix's doubling is a parameter, not an if-statement).
- **Credulity** scales confidence assigned to secondhand tokens at gossip transfer.
- **Loyalty** weights protect-teammate and stick-with-plan goals in the goal stack (reach gem → survive → follow plan → protect bond).
- **Greed** weights loot-seeking against risk in option scoring.

Personality must be legible from conduct within one raid (CAP-2 success test) — the weights exist to be *watched*, not just computed.
