---
id: SPEC-whisper-heist
companions:
  - thief-archetypes.md
  - memory-tokens.md
  - render-plan.md
  - vault-map.md
  - interfaces.md
sources:
  - ../../brainstorm/winning-concept.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# WHISPER HEIST

*The gang that remembers — and remembers wrong.*

## Why

A vision to realize, born of an autonomous BMAD design jam: a mini game where AI agents are not enemies with pathfinding but *characters with minds* — visible goals, personality-warped memories, and beliefs that mechanically drive their plans. The player never controls or fights the six thief-agents raiding their vault; they fight the thieves' *beliefs*, planting one false memory per debrief and watching the epistemic catastrophe unfold. It inverts the roguelike: the player is the dungeon, the AI is the run. It must prove agent-driven gameplay renders richer on canvas than any terminal, in one dependency-free HTML file a stranger can open and grasp in thirty seconds.

## Capabilities

- **CAP-1**
  - **intent:** Player experiences a complete five-night run — each night a ~60s RAID they watch and a DEBRIEF they act in — ending in the Chronicle.
  - **success:** A full run completes in ≤8 minutes (design target ~7) with no tutorial; night one plays to its outer-loot win with zero simulation-affecting input from the player.
- **CAP-2**
  - **intent:** Six thief characters (see `thief-archetypes.md`) emerge from one shared behavior model parameterized by personality weight vectors (greed/fear/loyalty/credulity) plus a declarative role-ability table — data, never code branches.
  - **success:** Policy-equivalence test: under uniform weights, identical ability sets, and a fixed seed, all six agents produce identical option scores for identical game states. With contract weights, a viewer can tell thieves apart by conduct alone within one raid.
- **CAP-3**
  - **intent:** Each thief holds a typed memory stream — tokens from a closed vocabulary carrying provenance, confidence, and age — inspectable via a hover ledger showing each token's lineage.
  - **success:** Hovering any thief shows their tokens (transient, no sim pause; click pins); firsthand memories render solid, secondhand render hollow; a pinned token's origin and gossip hops are readable with zero free text.
- **CAP-4**
  - **intent:** At debrief, memories transfer thief-to-thief as visible sliding tokens, re-weighted by receiver personality and mutated by the exaggeration table, never leaving the closed vocabulary.
  - **success:** Acceptance gate: a lie planted at debrief N appears in a second thief's stream (lineage-traced to the WHISPER origin) by the end of debrief N+1 and alters a night-N+1 plan-line. If this fails at the walking skeleton, tune gossip fidelity before adding anything else.
- **CAP-5**
  - **intent:** Player can plant one false memory token in one chosen thief per debrief — the game's only simulation-affecting verb — or explicitly skip ("hold your tongue"); the debrief waits for play or skip.
  - **success:** Auditing input handlers shows whisper + skip (plus passive inspection: hover/click ledgers) is the complete player verb set; the whisper UI enforces at most one play per debrief.
- **CAP-6**
  - **intent:** Thieves decide by scoring options against their own memory tokens, so wrong beliefs mechanically produce wrong plans.
  - **success:** With a lie planted about a safe hallway, thieves who hold the belief route around it and the gang's plan-lines visibly reroute (Ash may contractually defy danger per his weights); each thief shows its active goal icon overhead and performs the deliberation beat before committing.
- **CAP-7**
  - **intent:** Player reads the gap between truth and belief: pre-raid plan-lines on the vault floor (redrawn live on replans) plus a translucent belief-ink overlay of the gang's merged belief map (merge rule in `interfaces.md`).
  - **success:** A first-time viewer can point at a belief error (phantom trap, unknown room) within 5 seconds of the overlay diverging from truth.
- **CAP-8**
  - **intent:** A run closes with the Chronicle — an animated parchment retelling assembled from the thieves' actual memory streams and the run's event log, attributing blame via token lineage.
  - **success:** Every Chronicle line contains at least one run-specific logged token or event reference; two different runs produce materially different Chronicles.

## Constraints

- Single self-contained HTML file (`src/index.html`): inline JS/CSS, no external requests, no build step, playable offline from `file://`. (Repo-side test files per `interfaces.md` are separate and do not ship in the game file.)
- Vault is the fixed, spec-authored 24x16 grid in `vault-map.md`; pathfinding is 4-directional grid A*; all interactions are slot-based on grid cells.
- Thieves re-score options on ~2s ticks plus event-driven replans (alarm, trap sighted, teammate flees); deliberation pauses are sim-time; the beat queue is presentation-only and never blocks the sim (`interfaces.md`).
- Hazard consequences per the table in `vault-map.md`; the roster is always six thieves at every debrief — no permadeath.
- Memory vocabulary is closed (10 typed tokens, `memory-tokens.md`); no free-text agent dialogue; speech bubbles carry closed-vocabulary glyphs only.
- Trust displays as exactly three states — glow / neutral / grey — bucketed from token confidence at 0.66/0.33; there is no separate inter-thief trust variable.
- Beat scheduler governs drama: max one dramatic event per 1.5s, max two speech bubbles on screen.
- Zero numerals on screen during play; outcome is conveyed diegetically (Chronicle: moons = nights the gem survived, pips = delay inflicted, gem icon = final fate).
- Simulation and mutation rolls run on one seeded PRNG; sim core and gossip+mutation ship with deterministic tests over typed tokens (runner pattern in `interfaces.md`).
- Walking-skeleton gate: Vex/Nix/Moth + the 5 skeleton tokens + 1 whisper + 2 nights must run end-to-end before full content lands. If whisper-only agency fails there, fallback is SECOND STORY — the same skeleton where the player drags one trap per debrief instead of whispering — at zero sunk cost.
- Hard cap 2,000 lines for `src/index.html`; over cap, cut Should-tier items from `render-plan.md` in reverse listed order.

## Non-goals

- Trap-dragging or any second sim-affecting verb (unless the walking-skeleton gate formally triggers the SECOND STORY fallback).
- Free-text or LLM-generated dialogue at runtime.
- More than six thieves; guard NPCs.
- Save state, difficulty settings, multiplayer, backend/network anything.
- Procedural vault generation — the map is fixed contract.
- Any "phase 2" feature not in this contract.

## Success signal

- **Time-to-first-outsmart:** by night two, the player watches the gang's plan-lines reroute around a perfectly safe hallway because of a lie the player planted — visibly, and attributably via token lineage.
- A stranger opening the file reaches the Chronicle in ≤8 minutes with zero console errors, and the Chronicle quotes the run's actual false beliefs back at them.

## Assumptions

- Numerals ban applies to the play HUD; the Chronicle conveys outcome pictorially/narratively (source demanded both a score formula and "zero numerals" — resolved toward diegesis; moons/pips encode the source's score components).
- The 10-token vocabulary, vault map, bond pairs, seating order, and all tuning values marked in companions are spec-authored drafts; the source fixed structure, not these specifics.
- No guard NPCs: hazards are traps, pressure plates, alarms (source names no guards; "flashlight cones" are the thieves' own lights and double as the perception model).
- Four whispers per run (debriefs after nights 1–4; night 5 ends in the Chronicle).
- Night-1 guaranteed win = outer-loot success, produced by seeded outer-region SAFE_PATH/LOOT_AT beliefs and depth-gating locked doors; the gem sits deeper than night-1 reach.
- A run ends early if the gem is stolen; the Chronicle plays either way.
- Source's inter-thief trust display was folded into per-token confidence plus credulity/loyalty weighting — one trust surface, three states.
