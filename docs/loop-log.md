# Autonomous Dev-Loop Log

Append-only record of the no-human-in-the-loop improvement cycle. One entry per `bmad-dev-loop` iteration: date, backlog item, what changed, verification evidence, commit. Newest at the bottom.

---

## 2026-07-06 — Thief distinguishability (verify + harden)

**Item:** "Verify all six thieves (Vex, Silk, Brick, Nix, Ash, Moth) are distinguishable by conduct within one raid; if any read identical, widen their weight vectors."

**Finding:** Verify holds — a scripted-raid probe over multiple seeds & nights found NO identical-conduct and NO same-trajectory pairs; the weight vectors already differentiate all six. But the probe exposed a believability defect that made one thief's conduct *illegible*: Moth deterministically ping-ponged between the `survive` and `protect-bond` goals every re-score tick, re-tripping a pressure plate ~14×/raid (40/40 seeds), which armed the alarm every night and forced the whole gang to flee (only 1 loot grabbed). Moth read as a vibrating/broken agent, not a "Planner" — failing the item's own success criterion (thief-archetypes.md: "personality must be legible from conduct").

**Change (smallest correct fix — decision, not weights):** Added *commitment inertia* to the thief decision loop in `stepRaid` (`GOAL_HYSTERESIS = 0.25`). On each re-score a thief keeps its current goal unless a *different* goal beats it by the margin; a still-valid current goal keeps its freshly-scored path so danger reroutes (and the fear-driven flip *to* survive, which clears the margin) still apply. `scoreOptions` is untouched, so policy-equivalence/determinism are unaffected. Mirrored identically into `build/sim.js` (the test artifact). Files: `src/index.html` (`<script id="sim">`), `build/sim.js`. Line count 1946 → 1960 (< 2000 cap).

**Verification evidence:**
- `node --check` on the extracted shipped `<script id="sim">` block: OK. `node --check build/sim.js`: OK.
- `node tests/sim.test.mjs`: 31 passed / 0 failed. `node tests/gossip.test.mjs`: 35 assertions passed.
- Scripted-raid probe (patched shipped sim): Moth's max plate-trips 14 → **1** across 40/40 night-1 seeds; night-1 outer-loot win preserved 40/40 (gem never stolen); still zero identical/same-trajectory thief pairs; 60 full 5-night runs all terminate with no stuck-raiding thieves.
- `game-verifier` (Chromium, ~130s across 2 nights): PASS — 0 console errors / 0 uncaught exceptions / 0 failed requests; canvas renders; thieves move every frame (~60fps); night 1 → whisper debrief → night 2 (two moons) progression; end-of-night-1 `PLATE_TRIP` tally `{vex:1, moth:1, ash:1}` (Moth once, not ~14).

**Follow-ups filed:** (1) residual same-goal loot-*target* dithering (esp. Ash, nights 4–5, ~4–5 plate crossings — needs target-level hysteresis, lower severity, partly a probe artifact); (2) `build/sim.js`/`build/gossip.js` have drifted from the shipped inline blocks (stale `log()`, no bond in `activeState`) so tests don't exercise shipped code — re-extract or add a `tests/run-tests.mjs` extractor.

**Commit:** COMMIT_HASH_PLACEHOLDER
