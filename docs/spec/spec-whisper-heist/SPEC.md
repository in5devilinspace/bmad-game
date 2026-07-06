---
id: SPEC-whisper-heist
companions:
  - thief-archetypes.md
  - memory-tokens.md
  - render-plan.md
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
  - **intent:** Player experiences a complete five-night run — each night a ~60s RAID they watch and a ~20s DEBRIEF they act in — ending in the Chronicle.
  - **success:** A full run completes in ≤8 minutes with no tutorial; night one the gang succeeds at outer loot, and watching them teaches the whole game.
- **CAP-2**
  - **intent:** Six thief characters (Scout, Lockpick, Muscle, Coward, Hothead, Planner) emerge from one shared agent class parameterized only by weight vectors over greed/fear/loyalty/credulity.
  - **success:** Removing all six weight vectors and substituting uniform weights produces six identical behaviors; with them, a viewer can tell thieves apart by conduct alone. No per-archetype code branches.
- **CAP-3**
  - **intent:** Each thief holds a typed memory stream — tokens from a closed vocabulary carrying source, confidence, and age — inspectable via a hover ledger.
  - **success:** Hovering any thief shows their tokens; firsthand memories render solid, secondhand gossip renders hollow; epistemic status is readable with zero text.
- **CAP-4**
  - **intent:** At debrief, memories transfer thief-to-thief as visible sliding tokens, re-weighted by receiver personality and mutated by an exaggeration table that never leaves the closed vocabulary.
  - **success:** A planted lie visibly propagates to at least a second thief and alters a drawn plan-line within one debrief cycle (acceptance gate: tune gossip fidelity before adding anything else if this fails).
- **CAP-5**
  - **intent:** Player can plant exactly one false memory token in one chosen thief per debrief — the game's only simulation-affecting verb.
  - **success:** Auditing input handlers shows whisper (plus passive inspection: hover/click-to-view) is the complete player verb set; the whisper UI enforces one play per debrief.
- **CAP-6**
  - **intent:** Thieves decide by scoring options against their own memory tokens — re-scoring on ~2s ticks and on events (alarm, trap sighted, teammate flees) — so wrong beliefs mechanically produce wrong plans.
  - **success:** With a lie planted about a safe hallway, thieves observably route around that hallway; each thief shows its active goal icon overhead and performs the pause–glance–intent-arrow deliberation beat before committing.
- **CAP-7**
  - **intent:** Player reads the gap between truth and belief: pre-raid plan-lines drawn on the vault floor (redrawn live on replans) plus a translucent hand-drawn belief-ink overlay of the gang's collective map.
  - **success:** A first-time viewer can point at a belief error (phantom trap, unknown room) within 5 seconds of the overlay diverging from truth.
- **CAP-8**
  - **intent:** A run closes with the Chronicle — an animated parchment retelling assembled purely from the thieves' actual memory streams and event history, attributing blame and folly.
  - **success:** Every Chronicle line traces to a real logged token or event of that run (no canned narrative); two different runs produce materially different Chronicles.

## Constraints

- Single self-contained HTML file (`src/index.html`): inline JS/CSS, no external requests, no build step, playable offline from `file://`.
- Vault is one 24x16 grid; pathfinding is grid A*.
- Memory vocabulary is closed (~10 typed tokens, per `memory-tokens.md`); no free-text agent dialogue anywhere.
- Trust displays as exactly three states — glow / neutral / grey — never a numeric or continuous rendering.
- Beat scheduler governs drama: max one dramatic event per 1.5s, max two speech bubbles on screen.
- Zero numerals on screen during play; outcome is conveyed diegetically (Chronicle).
- Walking-skeleton gate: 3 thieves, 5 tokens, 1 whisper, 2 nights must run end-to-end before full content lands; if whisper-only agency fails there, fallback is the SECOND STORY chassis (same skeleton) at zero sunk cost.
- Budget discipline: target ~1,600 lines; scope per Must/Should split in `render-plan.md`.

## Non-goals

- Trap-dragging or any second sim-affecting verb.
- Free-text or LLM-generated dialogue at runtime.
- More than six thieves; guard NPCs.
- Save state, difficulty settings, multiplayer, backend/network anything.
- Any "phase 2" feature not in this contract.

## Success signal

- **Time-to-first-outsmart:** by night two, the player watches the gang avoid a perfectly safe hallway because of a lie the player planted — visibly, attributably.
- A stranger opening the file reaches the Chronicle in ≤8 minutes with zero console errors, and the Chronicle quotes the run's actual false beliefs back at them.

## Assumptions

- Numerals ban applies to the play HUD; the Chronicle conveys outcome pictorially/narratively (source demanded both a score formula and "zero numerals" — resolved toward diegesis).
- The exact 10-token vocabulary in `memory-tokens.md` is a spec-authored draft; the source fixed only its size, typedness, and closed-ness plus three worked examples.
- No guard NPCs: hazards are traps, pressure plates, alarms (source names no guards; "flashlight cones" are the thieves' own lights).
- Four whispers per run (debriefs after nights 1–4; night 5 ends in the Chronicle).
- Night-1 guaranteed win = outer-loot success; the gem sits deeper than night-1 reach.
- A run ends early if the gem is stolen; the Chronicle plays either way.
