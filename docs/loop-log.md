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

**Commit:** 4c98af1

---

## 2026-07-06 — Test integrity: tests now exercise shipped code, not a stale mirror

**Item:** "Test integrity: `build/sim.js` and `build/gossip.js` (what `tests/*.mjs` run against) have DRIFTED from the shipped `<script id="sim">` in `src/index.html` … Re-extract build artifacts from `src/index.html` (or add a `tests/run-tests.mjs` extractor per `interfaces.md`) so tests exercise shipped code."

**Why first (leverage, not queue order):** the suite ran against `build/*.js`, which had drifted from the shipped block, so every green run was a false safety net for every future iteration. Fixing the harness makes all subsequent loop verification trustworthy.

**Change (test harness only — `src/index.html` NOT touched):**
- Added `tests/extract-sim.mjs` — the extractor `interfaces.md` (Determinism & tests) specifies: reads `src/index.html`, slices the `<script id="sim">…</script>` body, evals it in a browserless Node `vm` context (no `window` ⇒ the two IIFEs bind `WH.sim`+`WH.gossip` to the context global), returns `WH`. Throws loudly if the block is missing or doesn't publish both namespaces.
- Rewired `tests/sim.test.mjs` and `tests/gossip.test.mjs` to `import { loadWH } from './extract-sim.mjs'` instead of reading `build/*.js`. All existing assertions kept verbatim.
- Added `tests/run-tests.mjs` (the entrypoint `interfaces.md` names) — runs both suites and aggregates exit codes; wired `npm test` → it in `package.json`.
- Decided the fate of `build/*.js`: **frozen as historical scaffolding**, not re-mirrored (avoids re-drift). Documented in new `build/README.md`: `src/index.html` is the single source of truth; `build/*.js` are not built-from, imported, or under test.

**Reconciliation:** none needed. Every existing assertion passed unchanged against the shipped block — no stale-encoded assumption and **no shipped bug** surfaced, so `src/index.html` was left byte-for-byte untouched (`git status --porcelain src/index.html` empty).

**Verification evidence:**
- `node tests/sim.test.mjs`: **31 passed / 0 failed**. `node tests/gossip.test.mjs`: **35 assertions passed**. `node tests/run-tests.mjs`: both suites pass — `ALL SUITES PASSED — shipped <script id="sim"> verified`.
- `node --check` on the extracted shipped block: **OK**.
- Proof the tests read shipped bytes (not the mirror): live `WH.sim.stepRaid` and `WH.sim.scoreOptions` `.toString()` appear verbatim in `src/index.html`; the shipped `stepRaid` does **not** contain the bond-less `activeState(game)` drift marker that `build/sim.js` still carries; extracted block 45,899 B vs `build/sim.js` 28,433 B (not identical).
- `game-verifier` (Playwright/Chromium, `file://`): **PASS** — 0 console errors, 0 uncaught exceptions, 0 failed requests; canvas 1280×800 renders every phase; reached raid playing state with 6 thieves in genuine motion (two frames 2.2s apart differ); night 1 (`outer-loot`) → debrief (24 gossips) → night 2. Regression gate holds (game file unchanged).

**Follow-ups filed:** none new. The pre-existing target-hysteresis follow-up (Ash nights 4–5 same-goal loot dithering) remains open.

**Commit:** 3679ad6

---

## 2026-07-06 — Token glyphs: every token now reads firsthand(solid) vs secondhand(hollow)

**Item:** "Full 10-token vocabulary present and each renders a distinct legible glyph (solid vs hollow)."

**Audit:** The exported ledger renderer `drawGlyph` (`src/index.html` ~L1160) already has a distinct case for all 10 vocabulary tokens (TRAP_AT star, SAFE_PATH line, LOOT_AT coin, GEM_AT diamond, ALARM_AT bell, PLATE_AT plate, LOCKED_DOOR padlock, SHORTCUT arrow, ROUTE_PLAN scroll, VAULT_STYLE eye) — no '?'/generic fallback is reachable for the vocabulary, and no two are the same shape. But two of them were **stroke-only** and ignored the `solid` flag that carries the CAP-3 firsthand/secondhand epistemic: **SAFE_PATH** (always a dashed line) and **SHORTCUT** (always an open stroked arrow). So a firsthand (should be solid) and a secondhand (should be hollow) instance of those two rendered pixel-identical. SAFE_PATH is the live case: it is minted firsthand (thief-verified clear region, L453) *and* arrives secondhand via gossip copy (L869), and both forms coexist in a thief's hover ledger — the ledger's own "(heard)" text label was the only firsthand/secondhand cue, the glyph gave none. The other 8 tokens already branch on `fs()` (fill when solid / stroke when hollow) and were correct.

**Change (render-only — 2 case branches in `drawGlyph`, no line-count change, sim/gossip/vocabulary untouched):**
- **SAFE_PATH** (L1166): firsthand now draws a **solid continuous** diagonal line; secondhand keeps the **dashed** line (`if (!solid) setLineDash(...)`). Thematically exact: a path you walked = solid/verified, a path you were told is clear = dashed/tentative. The belief-ink overlay (L1082, `solid:false`) and whisper picker (L1272, `solid:false`) stay dashed, correct for "heard/about-to-plant."
- **SHORTCUT** (L1172): shaft still a stroke; the arrowhead is now a closed triangle drawn through `fs()` — **filled** firsthand, **open outline** secondhand. Also reads as an arrow more clearly than the old open V. (SHORTCUT only arises today via the SAFE_PATH→SHORTCUT type-slip, i.e. always secondhand, but the branch is now contract-complete for any firsthand SHORTCUT.)

**Verification evidence:**
- `node tests/run-tests.mjs`: **ALL SUITES PASSED — shipped `<script id="sim">` verified** (sim 31 passed/0 failed; gossip 35 assertions). No sim/gossip regression (change is outside the sim block).
- `node --check` on the extracted sim block (evaluates, publishes `WH.sim`+`WH.gossip`) and on the extracted render block (L949–1761): **both OK**.
- Line count 1960 → **1960** (< 2000 cap). No numerals added to any glyph; three-state trust ring (L1204) unchanged.
- `game-verifier` (Playwright/Chromium, `file://`): **PASS** — 0 console errors, 0 uncaught exceptions, 0 failed requests; canvas 1280×800 renders full vault; 6 thieves raiding, 5/6 changed grid cells across two frames ~2.6s apart; night 1 → **debrief** reached with `throws: []` (round-table gossip scene with token glyphs, incl. a mutation-marked token, renders). Direct pixel test of the two changed branches via exported `WH.render.drawGlyph`: **SAFE_PATH solid 1095px vs hollow 820px**, **SHORTCUT solid 1077px vs hollow 1538px** — both differ, no error, proving solid≠hollow at render level. Live hover ledger surfaced (Vex, 8 tokens incl. 3 firsthand SAFE_PATH drawn solid); only firsthand tokens present that early (no gossip propagated yet), so the live hollow case is covered by the direct pixel test rather than an in-ledger secondhand token.

**Follow-ups filed:** none new. Noted but not fixed (out of scope, no live impact): the *separate* in-play bubble FX renderer (`drawGlyph` at L1552, distinct IIFE) only special-cases TRAP/ALARM/PLATE/LOOT/GEM/flee and falls back to a generic circle for the other tokens — but bubbles are only ever emitted for danger tokens + flee + mutations during the raid, so the line-token cases are unreachable there. The pre-existing target-hysteresis follow-up (Ash nights 4–5) remains open.

**Commit:** __PENDING__
