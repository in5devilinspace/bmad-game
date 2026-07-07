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

**Commit:** 9f68cb1

---

## 2026-07-06 — Deliberation beat: the intent arrow now snaps to the move the thief actually commits

**Item:** "Deliberation beat (pause → eye-flick → wobbling intent arrow → commit) visible before every committed thief move."

**Finding (partially wired, not absent):** The sim already delivers the sim-time pause per the contract (`render-plan.md` CAP-6, `interfaces.md` coupling): on each rescore `stepRaid` sets `th.delib = 300` and `th.rescore = 2000` (src/index.html L611), decrements `delib` on the fixed 100ms sub-steps, and runs `commitPlan` when it hits 0 (L589). It exposes the scored options (`th.options`, sorted best-first, L601) and the committed pick (`th.pending`) — the top-two exposure the item wants, already present in shipped code, **not** routed through the presentation beat queue (it's sim-time, budget-exempt, correct). Render already drew a dashed pause ring, two eye-flick dots, and a wobbling intent arrow (`drawBeat` L1133), fed by `syncBeats` (L1806). **The gap:** `syncBeats` hardcoded `winner: null`, so `drawBeat`'s snap branch never fired — the arrow wobbled for the full 300ms and simply vanished at commit, so the contract's closing beat ("snaps to winner → move") was invisible. Worse, the second option shown was `options[1]`, ignoring `th.pending`; under the commitment-inertia mechanic (a prior iteration) the committed goal can differ from the top-scored one, so even a snap could have pointed at the wrong option.

**Change (render-only — both edited functions live OUTSIDE `<script id="sim">`, so no sim/gossip/determinism surface touched):**
- `syncBeats` (L1806): compute `winner` from `th.pending` (a reference into `th.options`). `a` = top-scored option; `b` = the committed pick when inertia keeps a different-goal option, else the runner-up (`options[1]`). `winner` = `'a'` when `pending === options[0]`, else `'b'`. So the two flicked options are the ones the thief is genuinely torn between (greedy-best vs. what it commits), and the snap tracks the real decision.
- `drawBeat` (L1133): for `tt >= 0.66` (final third of the pause) ease the intent arrow from its wobble onto the winner angle, reaching it exactly at commit; brighten + enlarge the winning eye-flick dot as it snaps. Wobble/eye-flick unchanged for the first two-thirds.
- No numerals added; closed vocabulary + zero-numeral HUD honored (beat is pure geometry: ring, dots, arrow). Line count 1960 → **1966** (< 2000 cap).

**Verification evidence:**
- `node tests/run-tests.mjs`: **ALL SUITES PASSED — shipped `<script id="sim">` verified** (sim 31 passed/0 failed; gossip 35 assertions). No sim/gossip regression — the change is outside the sim block, so determinism/policy-equivalence are untouched.
- `node --check` on all three extracted inline `<script>` blocks (sim, render, main loop): **all OK**.
- `game-verifier` (Playwright/Chromium, `file://`, live running game — `game` captured via a `WH.render.draw` wrapper, no files touched): **PASS** on all checks. 0 console errors / 0 uncaught exceptions / 0 failed requests; canvas 1280×800 renders full vault; click → raid, 5/6 thieves moved over ~2.1s (Nix held at entry in `survive` — correct coward behavior). Beat probe over 352 rendered raid frames / 1189 `delib>0` thief-samples: **100%** had non-empty `options` + non-null `pending` before commit (a); `winnerNull=0` (winnerA=1018, winnerB=171), `beat.t` climbed monotonically 0 → 0.944 as `delib` fell 300 → 16.8 (b); committed-winner consistency **0 violations** — `cCheckA_ok=1018/bad=0`, `cCheckB_ok=171/bad=0`, and the commitment-inertia `'b'` case genuinely fired 171× (c); mid-raid screenshot `/tmp/wh_beat.png` caught a pause ring + intent arrow + eye-flick dots on Moth and Ash (d).

**Follow-ups filed:** none new. Pre-existing target-hysteresis follow-up (Ash nights 4–5 same-goal loot dithering) remains open.

**Commit:** 00c000b (loop-log hash finalized in the immediately following doc-only commit)

---

## 2026-07-06 — Three-state trust glow now covers the in-world belief-ink overlay; play HUD confirmed numeral-free

**Item:** "Three-state trust glow (glow/neutral/grey) applied to every rendered token; confirm no numerals leak on the play HUD."

**Token-render audit (all 8 sites where a glyph can depict a belief token):** The canonical trust display — the hover/pinned ledger (`trustState` L1187; ring+shadow+grey-tint L1200-1206) — was already exactly three-state and correct. Seven of the eight sites are either correct or legitimately exempt: the truth layer (traps/plates/alarms/loot/gem/doors from `game.world`, ground truth with no confidence), the overhead active-goal glyph (a goal indicator, not a token), the pinned lineage hop-chain (one token's mutation history, `*`-marked — not a multi-token trust display), the debrief token slide (a transfer/mutation animation whose epistemic is firsthand-solid→hollow-bud + mutation hue), the whisper radial picker (a type-selection menu, not instantiated tokens), and the transient in-play FX bubbles. **One genuine defect:** the in-world **belief-ink overlay** (`drawBeliefInk`, L1074-1085) rendered token confidence as a **continuous** ramp — ink alpha `0.10 + 0.22*conf` and glyph alpha `0.5 + 0.5*conf` — i.e. a continuous trust state, the exact thing the item flags. It matched "any in-world token drawing" and was the only live confidence display in the game not bucketed to three states.

**Change (render-only — inside the render IIFE, OUTSIDE `<script id="sim">`, so no sim/gossip/determinism surface touched):**
- `drawBeliefInk` (L1074-1085): confidence now flows through the **shared** `trustState(conf)` (buckets at 0.66/0.33). Three discrete ink densities (glow 0.30 / neutral 0.19 / grey 0.10) replace the continuous ramp; glyph alpha becomes three discrete levels (1 / 0.8 / 0.5); the grey state tints to `#96a0af` (the same neutral grey the ledger uses); the glow state gets a `shadowBlur` halo — the same "glow" cue the ledger ring uses. Every confidence display in the game is now EXACTLY three states, keyed off one function.
- No numerals added; closed vocabulary honored (pure geometry + alpha buckets). Line count 1966 → **1972** (< 2000 cap).

**Numeral audit of the entire play HUD (title/raid/debrief; Chronicle excluded by contract):** Exhaustively enumerated all 13 `fillText`/`strokeText` call sites — every one draws letters (thief initials V/S/B/N/A/M, token-type labels like "loot at"/"trap at (heard)", the word "lineage"), a `*` mutation mark, or fixed prose (title/subtitle/hints). **No site emits a numeric variable as digits.** The night indicator is `drawNightMoons` (crescent `ctx.arc` fills, zero digits); no score/timer/loot-count text call site exists on the raid HUD; the Chronicle outcome row is pictorial (moons via `drawMoon`, pips as rects, gem-fate icon). Confirmed at runtime by wrapping `fillText`/`strokeText` and driving title→raid→debrief: `DIGIT_LEAKS = []`.

**Verification evidence:**
- `node tests/run-tests.mjs`: **ALL SUITES PASSED — shipped `<script id="sim">` verified** (sim 31 passed/0 failed; gossip 35 assertions). No sim/gossip regression — the change is outside the sim block.
- `node` syntax check (`new vm.Script`) on all 3 inline `<script>` blocks (928 / 823 / 198 lines): **all SYNTAX OK** (edited render block is in the 823-line block).
- `game-verifier` (Playwright/Chromium `chromium-1228`, `file://`): **PASS** on all 3 sections. (1) 0 console errors / 0 uncaught exceptions / 0 failed requests; 6 thieves move (6/6 changed cells over ~2s); title→raid→whisper-debrief reached. (2) `WH.render.trustState` at 0.8/0.66/0.5/0.33/0.2 → **['glow','glow','neutral','neutral','grey']** (exact); `drawGlyph` three-state pixel test **glow 2210 lit px (alphaSum 218,415) vs neutral 655 (109,736) vs grey 621 (68,853)** — all three visibly distinct; live belief-ink overlay renders the three-state densities + glow halo; hover/pinned ledger draws a trust ring per token. (3) **`DIGIT_LEAKS = []`** across title/raid/debrief — complete drawn-string set is letters/labels/`*`/prose only; night = crescent arcs, no numeric night string; no raid score/timer/loot digit.

**Follow-ups filed:** none new. Noted but intentionally not changed this iteration (documented as exempt above): the debrief token slide does not carry a three-state glow — it is a transfer/mutation animation, not a resting trust surface, and plumbing per-slide confidence would touch the sim-tested gossip block; if a future iteration wants trust-tinted slides it should add `conf` to the GOSSIP log event (L882) render-side only. Pre-existing target-hysteresis follow-up (Ash nights 4–5 same-goal loot dithering) remains open.

**Commit:** a142f94 (loop-log hash finalized in the immediately following doc-only commit)

---

## 2026-07-06 — Debrief token-slide now reads as three scheduler-paced beats, not a per-index trickle

**Item:** "Debrief token-slide animation paced into exactly three readable beats by the beat scheduler."

**Finding (a raw timer, not the scheduler):** `startDebrief` built one slide per emitted GOSSIP event and staggered each by `_start: si * 150` ms; the per-frame update advanced `sl.t = clamp((clock - _start)/650)`. With ~24 gossips a full debrief this meant 24 tokens starting 150ms apart and each traveling 650ms — a continuous ~4.2s smear with no rhythm, the opposite of the render-plan Debrief stage contract ("The beat scheduler paces the exchange into **three readable beats**"). The pacing was a private per-index timer that never touched, or obeyed the cadence of, the beat scheduler (`GAP = 1500`, one dramatic event per 1.5s; interfaces.md, presentation-only).

**Change (presentation-only — all three edits live OUTSIDE `<script id="sim">`, so no sim/gossip/determinism/vocabulary surface touched; the GOSSIP log event was NOT modified):**
- **Export the scheduler's GAP** from the juice module (`root.WH.juice = { … GAP: GAP, … }`) so the debrief's beat cadence is sourced from the actual beat-scheduler constant, not a duplicated magic number.
- **`startDebrief`:** each slide now carries a `beat` field (0/1/2) instead of `_start`. After collecting the GOSSIP slides in arrival order, partition into exactly three contiguous waves: `per = max(1, ceil(N/3))`, `beat = min(2, floor(s/per))`. GOSSIP events arrive grouped by ring-adjacent pair (`runDebrief` delivers a→b then b→a per pair, in ring order), so each contiguous third is a coherent "these neighbors are trading now" wave a viewer can follow. Stashed `debrief.beatGap = WH.juice.GAP || 1500`.
- **Per-frame update:** a slide launches when its beat is released — effective start `= sl.beat * BG` (BG = the scheduler GAP), travel unchanged at ~650ms. Three beats therefore fire at 0 / 1500 / 3000 ms, each wave landing (~700ms) inside the ~850ms quiet gap before the next launches — three legible pulses. `_start`/`si*150` removed. The `allDone`/`clock>500` whisper-transition and the click fast-forward (`clock = 1e9`) still work (huge clock ⇒ all `t→1`).
- Whisper UI flow after the slides and the debrief→next-night progression are untouched. No numerals added. Line count 1972 → **1976** (< 2000 cap).

**Scope decision (trust-tint deliberately deferred):** the filed follow-up to add `conf` to the GOSSIP log event (~L882) and trust-tint the sliding tokens was left out. It touches the sim-tested gossip log line (higher risk, must re-verify tested code) and is orthogonal to the pacing item; the prior iteration already ruled the debrief slide a "transfer/mutation animation, not a resting trust surface" — so omitting it keeps this iteration to one low-risk, presentation-only change. Follow-up remains open for a future iteration if trust-tinted slides are wanted.

**Verification evidence:**
- `node tests/run-tests.mjs`: **ALL SUITES PASSED — shipped `<script id="sim">` verified** (sim 31 passed/0 failed; gossip 35 assertions). No sim/gossip regression — the GOSSIP event and the whole sim block are byte-unchanged.
- `node --check` (via `new vm.Script`) on all 3 extracted inline `<script>` blocks (sim+gossip 927 / render+juice 822 / integrator 201 lines): **all SYNTAX OK** (the two edited blocks are render+juice and integrator).
- Standalone partition probe: N∈{24,20,18,12,7,3} → exactly **3** beats at distinct starts **{0,1500,3000}ms**, balanced counts (24→8/8/8); sparse N<3 degrades gracefully to fewer waves (harmless, real debriefs emit ~9–24 gossips).
- `game-verifier` (real Google Chrome via `playwright-core`, `file://`): **PASS** on all checks. 0 console errors / 0 uncaught exceptions / 0 failed requests; canvas renders every phase; click→raid with 6 thieves in genuine motion (all 6 moved over a 2.1s natural-pace sample). Reached debrief (`outer-loot`, 24 slides). **Three-beat structure:** every slide `beat ∈ {0,1,2}`, `distinctBeats=[0,1,2]`, **24 = 8/8/8**, no `_start` key. **Three temporal waves** (polled `game.debrief.slides[].t` every ~170ms, no clicks): onsets **beat0 @ 2ms, beat1 @ 1567ms, beat2 @ 3116ms** → gaps **~1.565s / ~1.549s ≈ GAP**, non-overlapping (each beat reaches t=1 before the next begins). Mid-debrief screenshot shows tokens in flight between seats on the ring. **Flow preserved:** whisper phase reached with hint; "hold your tongue" (Space) → night 1→2; full cycle repeats to night 3 (24 slides / 8-8-8 again). Screenshots `/tmp/wh_0{1..4}_*.png`.

**Follow-ups filed:** none new. Still open: trust-tinted debrief slides via `conf` on the GOSSIP event (deferred above); pre-existing target-hysteresis follow-up (Ash nights 4–5 same-goal loot dithering).

**Commit:** 6daffce (loop-log hash finalized in the immediately following doc-only commit)

---

## 2026-07-06 — Chronicle: every line cites run-specific log/memory; two runs differ materially (CAP-8)

**Item:** "Chronicle: every line references a run-specific logged token/event; two runs produce visibly different Chronicles."

**Audit (concrete, per line):** `chronicle()` (juice IIFE, src/index.html) built its 5–8 lines from `first(log, TYPE)` events + `lieToken` lineage + memory-stream padding. Nine of the lines already carried run-specific slots (thief names, `placeName(cell)`), but **four were CANNED** — the text was byte-identical in every run, gated on a real event but citing no run datum: (1) the opener `'Six went in under the dark, and the entrance swallowed them whole.'`; (2) the alarm line `'Then the bells woke, and the job with them.'`; (3) the gem-survived closer `'The star kept its socket in the sanctum, night after night, and never knew our names.'` (the most-common run's final line); (4) the split-loot fallback `'The gang split what little they had…'`. Also a **live bug**: the opener's first-actor scan grabbed the `PLAN_SET 'seed'` marker (whose `thief` field is the string `'seed'`), so night-1 chronicles literally read *"seed led all six in…"*. And a structural gap surfaced under test: because night-1 is identically seeded across seeds and `lieToken` collapses to a stable early holder, two different seeds produced Chronicles differing by only **1 line** — failing "materially different".

**Change (render-only — all edits inside the juice IIFE, OUTSIDE `<script id="sim">`; sim/gossip/determinism untouched):**
- Every line is now emitted via `add(line, ref)`, where `ref` is the exact run-specific datum the line is anchored on (a logged thief name, the `placeName` of a logged cell, or a final-memory-token loc). `refs[]` ships on the chronicle result (drawn nowhere; used to machine-prove the property).
- The 4 canned lines now cite run data: opener → the run's **first real thief actor** (bug fixed: `firstActor()` skips ids that don't resolve to a thief, dropping the `'seed'` marker); alarm → the **last plate-tripper** who armed the bells; gem-survived → a thief holding a **GEM_AT** belief (where they still swear it sleeps) else the last thief by name over `word(nights)` nights; fallback → loot-grab count as a word.
- **Blame attribution strengthened via lineage:** the planted lie is found by `lieToken` and traced by **shared token `originId`** across streams; the propagation line now counts how many of six carried it to the last night (`word(believers)`).
- **Run-variance guaranteed:** two ALWAYS-present closing lines are drawn from the **final memory streams** — the farthest-travelled rumor (max gossip hops) and the gang's divergent top beliefs ("X swears by …, Y by …, and no two recall the same vault") — kept ahead of the >8 overflow trim so they can never be dropped. These differ run-to-run even when the seeded night-1 events don't. Zero numerals throughout (spelled words + the pictorial moons/pips/gem outcome row, unchanged).
- Exposed `placeName`/`word` on `WH.juice` for the test's non-circular vocabulary derivation. Line count **1976 → 1997** (< 2000 cap).

**Test added (the two-runs-differ property, per interfaces.md extractor pattern):**
- `tests/extract-full.mjs` — extends the shipped-block extractor to load BOTH the `<script id="sim">` block AND the id-less render/juice presentation block into one browserless VM (the presentation block has no DOM refs at module-init, so `chronicle`/`placeName`/`word` eval cleanly; `drawChronicle` is never called). Grades the SHIPPED chronicle builder, no drift.
- `tests/chronicle.test.mjs` — drives two seeds through a full 5-night run to the Chronicle (mirroring the integrator loop; plants one seed-derived WHISPER lie per debrief so the blame/lineage lines fire), then asserts **(a)** 5–8 lines, every line contains its declared `ref` AND that `ref` is **independently re-derivable from THAT run's own eventLog + memory** (non-circular: the test rebuilds the name/place vocabulary itself), zero digits in the prose, no formerly-canned sentence survives, blame line present; **(b)** the two Chronicles differ by **≥3 lines**. Wired into `tests/run-tests.mjs`.

**Verification evidence:**
- `node tests/run-tests.mjs`: **ALL SUITES PASSED** — sim 31/0, gossip 35 assertions, **chronicle 21/0** (both seeds: 8 lines, refs anchored + in-vocab, zero digits, no canned line, blame present; two runs differ by 3 lines).
- `node --check` (via `new vm.Script`) on all 3 extracted inline blocks (sim, render/juice, integrator): **all OK**.
- 44-seed robustness sweep (11 runs plant NO whisper; includes gem-stolen early-exit paths): **0 throws, 0 lines out of [5,8], 0 unanchored lines, 0 refs outside the run vocabulary, 0 digit leaks, 44/44 distinct Chronicles.**
- `game-verifier` (real Chromium via Playwright, `file://`): **PASS** — 0 console errors / 0 uncaught exceptions / 0 failed requests; title→click→raid with 6 thieves moving (3 distinct canvas frames over 10s). Chronicle rendered by driving the in-page `WH` modules to completion and calling `WH.juice.drawChronicle` onto the real canvas: both seeds 8 lines, `digitsInProse=[]` for both, `linesDiffer=3`, run-specific prose ("Vex swore hall B was a deathtrap…", "…swears by the whole vault, Silk by hall B…"); screenshot confirms the parchment scroll — small-caps "The Chronicle", 8 italic lines, and the pictorial outcome row (5 crescent moons | pips tally | whole teal gem for fate `safe`).

**Follow-ups filed:** none new. Lines 1–4/6 of the Chronicle (night-1 events + the collapsed lie holder) are low-variance across *seed only* — run-variance is carried by the lie the player plants + the two memory-stream closing lines; acceptable and honest, but a future polish could vary the narrative core by later-night events. Pre-existing target-hysteresis follow-up (Ash nights 4–5) and the deferred trust-tinted debrief slides remain open.

**Commit:** 2c91165 (loop-log hash finalized in the immediately following doc-only commit)

## 2026-07-06 — Juice pass (slow-mo / shake / rings / confetti) — salvaged after agent hang

**Item:** "Juice pass: slow-mo + screenshake on plate trip, alarm shockwave rings, banknote confetti on loot/gem grab — all governed by the one-event-per-1.5s beat queue."

**Process note:** the loop agent completed the edit (node-check clean) but HUNG in its own `game-verifier` step (~80min, no commit, orphan Playwright procs, no completion notification). The orchestrator diagnosed the hang, stopped the agent (`TaskStop`), confirmed the working-tree edit was complete + syntactically valid + render-only (sim block byte-identical), then verified it independently and committed. No work lost.

**Change (render-only, juice IIFE):**
- Screenshake is now resolved ONCE per frame into `Q.cam` inside `tick()`. `camera()` previously re-randomized on every call, so the vault scene (`ctx.translate(shake)`) and the fx layer (`drawFx`) shook by *different* vectors — fx detached from the vault. Now `camera()` returns the cached `Q.cam` and everything shakes in lockstep.
- Gem grab (`case 'gem'`) now also sets `Q.slowmo = SLOWMO_MS` (heist climax) on top of shake + a bigger confetti burst.
- Gem "coda": a gem grab ends the raid the same frame it fires, so its confetti/slow-mo would never draw. The main loop now holds the frozen scene ~1400ms (`GEM_CODA_MS`), still ticking the fx layer, before the Chronicle.

**Verification evidence:**
- `node tests/run-tests.mjs` → ALL SUITES PASSED (sim 31, gossip 35, chronicle 21); sim block byte-unchanged.
- `node --check` on all 3 extracted inline scripts → OK.
- `game-verifier` (real headless Chromium, served over localhost) → **PASS**: 0 page errors / 0 uncaught exceptions across a full ~5.5min 5-night run to the Chronicle; thieves move (screenshot hashes differ); `camera()` returns the single cached `Q.cam` every frame (13/13 distinct cam vectors while shaking); fx fire from real events (maxShake 11.4, rings on plate trip, confetti 20 on loot grab); beat queue activations at 1333/2836/4338/5855ms → gaps [1502,1502,1517] all ≥ GAP(1500); gem fx injection → slow-mo 530 + confetti 46, no throw.
- Line count 1997 → 2003 (< 2400 cap).

**Finding filed (HIGH):** the same verifier sweep (300 seeds × 5 nights = 1500 raids) logged **GEM_GRAB: 0** — the gem is effectively unstealable in autonomous play, so the player never has anything real to defend. Filed as the new top-priority backlog item (core-stakes sim/design issue, independent of this render-only juice pass).

**Commit:** (this commit)

---

## 2026-07-06 — Core stakes: the gem is now genuinely stealable on nights 4–5 (GEM_GRAB 0% → ~13%)

**Item:** "HIGH — Core stakes: the gem is effectively unstealable, so the player never has anything real to defend." (300-seed × 5-night verifier sweep = 1500 raids logged **GEM_GRAB: 0**.)

**Root cause (found by sim probes, not guessed — a THREE-part depth-gating deadlock):**
1. **No belief ever pointed at the true gem cell (11,0).** `perceive` mints GEM_AT only when a thief stands on the gem — circular behind the locked doors — and the sole other source, the `LOOT_AT→GEM_AT` type-slip, *keeps the loot cell*, so every "gem belief" was a phantom at an outer storeroom (probe: 162/300 seeds formed a GEM_AT belief; **all** at outer cells, none in the inner wing). Consequence: `D3/D4 unlocked 0/300`, deepest tier reached 0/300, min y ever = 9 — **no thief ever crossed the plate row**, and Moth's ROUTE_PLAN always targeted outer loot.
2. **Even given a gem belief, `reach-gem` was unwinnable.** By nights 4–5, exaggerated region/wing danger *rumors* (`PLATE_AT@hall-b`, `TRAP_AT@central`) expand in `dangerMap` to poison the ENTIRE hall-b corridor — the only route to the sanctum — so `reach-gem` scored ≈ −4 (fear feature −4.16) and always lost to the danger-immune `follow-plan`/`survive`.
3. **The lockpick never committed a deep route.** `beginNight` reset neither `_planned` nor `goalStack`, so Silk entered each night carrying the prior night's `survive` goal; commitment inertia (0.25) kept it because the danger-immune follow-plan beat survive by only 0.03. And when Silk *did* start up, tripping the mandatory plate at y9 spiked `survive` (danger) and it fled before reaching D3.

**Change (sim/design; all inside `<script id="sim">` except the debrief re-emit):**
- **"The legend of the star"** (`emitRoutePlans`, `game.night>=3`): the gang now carries a firsthand-less `GEM_AT(11,0)` belief at the true sanctum cell (conf `GEM_LEGEND=0.95`) once planning night 4+. It shows in the hover ledger + belief ink (the player SEES the threat and the plan-line climbing to the sanctum), and — weighted ×2 in Moth's route selection — beats the outer-loot/phantom beliefs on SOME late seeds, so his **danger-immune** ROUTE_PLAN commits Silk to the deep route. Gated `<night 3` so nights 1–3 stay gem-safe.
- **Flight is now firsthand-only.** New `FLEE_DANGER = {TRAP_AT, ALARM_AT}` + `dangerMap(thief, types, firsthandOnly)`: the survive/flee test uses a map of only the *lethal* danger a thief has *seen itself*. Pressure plates (loud, not lethal — vault-map hazard table) and second-hand rumors no longer abort a run; they still shape cautious *routing* (`dm` unchanged). So a committed heister braves the plate row while the gang still bends around believed traps.
- **Fresh plan each night** (`beginNight` resets `_planned=false` + `goalStack` to default) — no stale `survive` carried onto a new deep route.
- **Whisper override** (`emitRoutePlans` scans raw memory for a `source==='WHISPER'` route target) + **re-emit after the whisper** (`finishDebrief`): the player's planted lie decisively steers Moth's plan, luring the gang ONTO the gem or OFF it onto a decoy — the defend-the-gem verb the SPEC promises.
- **Chronicle guard:** the "no two recall the same vault" divergent-belief line now skips the uniformly-shared legend (it isn't a *divergent* memory), restoring two-runs-differ ≥ 3.

**Preserved invariants:** night-1 outer-loot win still guaranteed + gem never stolen night 1; determinism (same seed → same steal-night); policy-equivalence under uniform weights (all six identical `fm` from identical memory); gem still unreachable without lockpick and before night 4.

**Verification evidence:**
- `node tests/run-tests.mjs` → **ALL SUITES PASSED**: sim **31/0**, gossip **35**, chronicle **21/0** (two-runs-differ back to 3), new **gem-steal 15/0**.
- `node --check` (via `new vm.Script`) on all 3 extracted inline scripts → OK.
- **Before/after GEM_GRAB rate** (shipped node seed-sweep to night 5, no whisper): **before 0/1500 (0%)** → **after 6/48 (13%)**, byNight `{4:5, 5:1}`, **night-1 steals 0**. `tests/gem-steal.test.mjs` asserts (seeds 0–23): 5/24 steal, all nights 4–5, 0 early, determinism holds, and the whisper lures the plan ONTO the gem (before the legend) and OFF it onto a decoy (against the legend).
- `game-verifier` (real headless Chromium 1228, playwright-core, `file://`) → **PASS**: **0 console errors / 0 uncaught pageerrors / 0 failed network requests**; canvas 1280×800 renders the full vault (cyan gem in the locked sanctum, gold loot, star/bell tokens, plan-lines, six labelled thieves, night-moon); 6/6 thieves move each frame (sampled fanning out from the entry); flow title→raid→debrief(gossip)→whisper UI→**night 2** captured; screenshots all distinct/non-blank. Independent node seed-sweep (seeds 0–40) of the shipped sim: **gem stolen 6/41 (14.6%)**, byNight `{4:5, 5:1}`, **night-1 steals 0**, determinism reproduced; whisper lures the plan onto the gem and a decoy pulls it off. `node tests/run-tests.mjs` → ALL SUITES PASSED (sim 31, gossip 35, chronicle 21, gem-steal 15, 0 failures).
- Line count 2003 → **2053** (< 2400 cap).

**Follow-ups filed:** none new. The autonomous gem plan usually wins the late-night route (~80% of nights 4–5); the ~13% steal rate is gated downstream by the lockpick threading the upper-hall-b trap and cracking both doors inside 60s (timeout filters the rest) — a legible challenge. Pre-existing target-hysteresis follow-up (Ash nights 4–5) and trust-tinted debrief slides remain open.

**Commit:** (this commit)

---

## 2026-07-06 — Time-to-first-outsmart: proof the planted lie bends a night-2 plan-line (SPEC Success signal / CAP-6 / CAP-4)

**Item:** "Time-to-first-outsmart lands by night two: instrument a scripted run to confirm plan-lines reroute around a planted-safe hallway."

**Outcome: ALREADY WORKED — added the proof. No sim change; `src/index.html` is byte-unchanged (test-only iteration).**

**The testable claim (now locked in):** planting a `TRAP_AT` lie on an otherwise-safe corridor cell C at the NIGHT-1 debrief makes, by NIGHT 2, the lied-to thief's committed plan-line — the dashed route `drawPlanLines` draws from `pos` through `path`, i.e. cells `[pos, ...th.path]` — route AROUND C, whereas the unwhispered control run on the same seed routes THROUGH C, to the SAME destination. The lie is lineage-traced to its WHISPER origin (CAP-4 gate: a lie planted at debrief N alters a night-N+1 plan-line).

**Why it already works (no tuning needed):** iteration 9 folded believed hazards into A* every tick — `DANGER_SURCHARGE = 8` in `stepCost` adds `dm[cell]*8*fear` to entering a believed-danger cell, and `scoreOptions` builds every option's path with that danger-aware ctx (even `follow-plan` recomputes its own path around the thief's own beliefs). This is night-agnostic, so a planted lie bends routing from night 1 onward — the late-night "legend of the star" work was only about the gem being *stolen*, orthogonal to rerouting. A pre-implementation probe over seeds 0–7 confirmed the reroute fires every seed for Vex/Silk/Brick/Moth, to the same destination.

**What changed (tests only):**
- Added `tests/outsmart.test.mjs` (extractor-based, exercises the shipped `<script id="sim">` via `extract-sim.mjs`). It mirrors the integrator debrief lifecycle exactly — night-1 raid → `endNight` → `runDebrief` → merge → `emitRoutePlans` (startDebrief) → `applyWhisper` at the night-1 debrief → merge → `emitRoutePlans` (finishDebrief) → `beginNight(2)` — then steps night 2 until the target commits and snapshots its plan-line as `[pos, ...path]` (exactly what the renderer draws). Asserts: (a) HEADLINE seed 0, Vex, C picked as a mid-corridor SAFE hall cell ON the control line — control routes THROUGH C, treatment routes AROUND C, SAME destination; (b) CAP-4 — the target still holds `TRAP_AT@C` with `source:'WHISPER'`; (c) determinism — the reroute reproduces byte-identically; (d) night-1 outer-loot win intact / gem not stolen night 1; (e) SWEEP seeds 0..15 → **16/16 control-through, 16/16 rerouted, 16/16 same-destination**; (f) a second SAFE cell (hall-b (11,11)) also reroutes — not a hard-coded fluke.
- Wired `outsmart.test.mjs` into `tests/run-tests.mjs`.
- Headline detail: C=(8,9) (hall-a). Control climbs hall-b then runs west along y9 through (8,9); treatment detours the ENTIRE western stretch up to y8 — `…(9,9),(9,8),(8,8),(7,8),(6,8),(5,8),(4,8),(4,9)…` — a full-row bend (very legible), still ending at the outer loot (2,12).

**Player-visibility (already present, confirmed — no render nudge added):** the planted lie renders as a glowing phantom-trap glyph via the belief-ink overlay (`drawBeliefInk`: whisper conf 0.9 → `glow` state with a shadow halo + TRAP_AT star), and each thief's dashed plan-line (`drawPlanLines`, colored per thief) bends around it, against a truth layer (`drawTruth`) that shows NO real trap there — exactly the CAP-7 "read the gap between truth and belief" + CAP-6 reroute. Because the reroute is a full-row detour (not a one-cell hump) it is clearly visible; a render nudge would add risk for no legibility gain, so none was made.

**Verification evidence:**
- `node tests/run-tests.mjs` → **ALL SUITES PASSED**: sim **31/0**, gossip **35** assertions, chronicle **21/0**, **gem-steal 15/0 (iteration-9 gem balance intact)**, new **outsmart 15/0**.
- `node --check` (via `new vm.Script`) on all 3 extracted inline `<script>` blocks (967 / 850 / 213 lines): **all SYNTAX OK**.
- Pre-implementation probe (throwaway, deleted): seeds 0–7 all reroute; kept only the real test.
- `game-verifier` (real Chromium 1228, playwright-core, `file://`) → **PASS**: 0 console errors / 0 uncaught exceptions / 0 failed requests; canvas renders the vault; click → raid with 6 thieves in genuine motion (pixel-hash changes over 2.2s; Vex/Moth relocate); flow title→raid→debrief→**night 2** (night-moon 1→2 crescents). Live in-page reroute probe via `window.WH.sim`/`WH.gossip`, seed 0, C=(8,9): **has(ctrl)=true** (control through `…(9,9),(8,9),(7,9)…`), **has(treat)=false** (treatment detours to y8 `…(9,8),(8,8),(7,8)…`), `ctrlLast=treatLast={x:2,y:12}` — the planted lie bent a plan-line by night 2 in the running game. Night-2 dashed-plan-line screenshot captured (`/tmp/wh_flow_final.png`).
- Line count **2053 → 2053** (src unchanged; hard cap 2400).

**Dirty working tree noted:** the repo already had uncommitted spec-doc edits (`docs/spec/spec-whisper-heist/*` modified + `interfaces.md`/`vault-map.md` untracked) and a deleted `.claude/scheduled_tasks.lock` at iteration start — none of that is this iteration's work. This commit touches ONLY this iteration's files (`tests/outsmart.test.mjs`, `tests/run-tests.mjs`, `BACKLOG.md`, `docs/loop-log.md`); the pre-existing dirt was left untouched.

**Follow-ups filed:** none new. Open: belief-ink first-time-viewer readability tuning (next up); accessibility (keyboard whisper UI + `prefers-reduced-motion`); optional muted audio kit; pre-existing target-hysteresis (Ash nights 4–5) and trust-tinted debrief slides.

**Commit:** (this commit)

---

## 2026-07-06 — Belief-ink readability: a divergence now wears a "ghost ring" the truth layer never draws (CAP-7)

**Item:** "Belief-ink overlay readability: a first-time viewer can spot a truth/belief divergence within 5 seconds; tune stroke alpha/color per thief."

**Readability assessment (the gap):** `drawBeliefInk` (src/index.html L1129) rendered EVERY belief the same way regardless of whether it matched ground truth. A planted `TRAP_AT` lie on a safe corridor drew the exact same faint sketch-ink + hollow star as a real, correctly-known trap; the trust-state buckets (glow/neutral/grey, added iteration 5) encode *how much the gang believes it*, not *whether it is true*. So the only way a viewer could tell a phantom from a real belief was to cross-reference the belief layer against the solid truth-layer glyphs cell-by-cell — not a 5-second spot. That fails the item's own success criterion and CAP-7 ("point at a belief error — phantom trap, unknown room — within 5 seconds"), and it directly gated iteration 10's planted-lie reroute: the reroute is only as legible as the phantom trap the plan-line bends around. Per-thief colors were already 6 distinct hues (`THIEF_COL`); the real miss was the divergence axis being invisible.

**Change (render-only — all edits inside the render IIFE, OUTSIDE `<script id="sim">`; sim/gossip/determinism/vocabulary untouched):**
- **`truthIndex(world)`** (new): builds a `cell -> {category:1}` index of ground-truth point features from `world.hazards` (trap/plate/alarm), `world.loot`, `world.gem`, and locked `world.doors` (both boundary cells indexed so a door belief on either side reads as true). Built once per `drawBeliefInk` call — O(features), no per-thief blowup.
- **`isPhantom(truth, tok, cells)`** (new): a single-cell feature belief (`TRAP_AT/PLATE_AT/ALARM_AT/LOOT_AT/GEM_AT/LOCKED_DOOR` via `BELIEF_TRUTH_CAT`) whose cell has NO matching real feature is a phantom (a planted lie, gossip type-slip, or stale rumor). Multi-cell region locs and non-feature tokens (`SAFE_PATH/SHORTCUT/ROUTE_PLAN/VAULT_STYLE`) are never flagged.
- **`drawBeliefInk`:** computes `phantom` per entry and, when true, calls **`drawPhantomRing`** — a dashed broken "ghost ring" (`arc`, `setLineDash`) at r≈0.46·cell around the glyph, in the holder's provenance color, at an alpha keyed to trust (glow 0.62 / neutral 0.5 / grey 0.4). The ring is the ONE thing on screen the truth layer never draws, so a phantom pops against both the faint true-belief ink (0.10–0.30α) and the solid truth glyphs (which have no ring). Trust encoding is 100% untouched (ink density + glyph alpha unchanged); the ring is an orthogonal binary divergence cue. No numerals, no new vocabulary glyph.
- Exposed `truthIndex`/`isPhantom` on `WH.render` for probing. The true "legend of the star" `GEM_AT(11,0)` (iteration 11) is at the real gem cell so it correctly does NOT ring; the phantom outer-storeroom gem beliefs DO.
- Line count 2053 → **2080** (< 2400 cap).

**Verification evidence:**
- `node tests/run-tests.mjs` → **ALL SUITES PASSED — shipped `<script id="sim">` verified**: sim **31/0**, gossip **35** assertions, chronicle **21/0**, gem-steal **15/0**, outsmart **15/0**. No sim regression (change is outside the sim block).
- `node --check` (via `new vm.Script`) on all 3 inline `<script>` blocks (967 / 877 / 213 lines): **all SYNTAX OK**.
- Node divergence probe (throwaway, deleted; `WH.render.truthIndex`/`isPhantom` against the real seed-0 vault): real trap (3,5) → **not phantom**; planted safe-cell `TRAP_AT`(10,0) → **phantom**; true gem legend (11,0) → **not phantom**; fake gem at safe cell → **phantom**; real loot → **not phantom**; multi-cell region rumor → **not phantom (skipped)**. All six exact → "divergence detection is exact".
- `game-verifier` (real Chromium 1228, Playwright, `file://`) → **PASS**. (1) Regression gate: **0 console errors / 0 uncaught pageerrors / 0 failed network requests**; canvas renders the full vault; raid playing with 6 thieves, **5/6 moved** over 2.1s (6th in a deliberation pause), frames differ; flow title → raid → debrief (24 gossip slides) → **night 2**. (2) Divergence logic in the LIVE game (captured `game` via a `WH.render.draw` wrapper): real trap (3,5) `isPhantom=false`; planted `TRAP_AT` at isolated safe cell (17,9) `isPhantom=true`; a truthful belief re-planted at (3,5) `isPhantom=false`. (3) Screenshot `/tmp/wh_04_phantom.png` + pixel probe (cam.cell=46): the dashed ghost ring lights **28/48** ring-samples at the phantom vs **12/48** around a real trap (no ring); belief-ink present at the planted cell (**1681/3136 px lit**) vs empty control cell (17,10) (**29/3136**). The phantom shows the ring with NO solid truth glyph beneath it; the real trap shows a solid glyph with no ring.

**Follow-ups filed:** none new. Noted (not done, out of scope): (a) the inverse divergence — a `SAFE_PATH` belief over a cell that actually holds a hazard ("they think it's clear but it's rigged") — is not yet cued; it needs line/region-loc reasoning, lower value than the phantom-hazard case the player creates by whispering. (b) Per-thief palette is left as-is; `Brick` (#e0a24a amber) sits close to loot/plate gold in the ink layer, but retinting `THIEF_COL` touches many render sites + tests for marginal gain. Pre-existing target-hysteresis (Ash nights 4–5) and trust-tinted debrief slides remain open.

**Commit:** (this commit)

---

## 2026-07-06 — Accessibility: keyboard-operable whisper UI, prefers-reduced-motion honored, focus-visible canvas

**Item:** "Accessibility: keyboard-operable whisper UI, `prefers-reduced-motion` honored (no screenshake/parallax), focus-visible on all controls."

**Outcome: DONE. Render/integrator only — `<script id="sim">` is byte-IDENTICAL to HEAD (verified by diff).**

**Audit (all three gaps were real):**
- (a) **No keyboard whisper path.** The `keydown` handler did exactly one thing during the whisper phase: `finishDebrief()` ("hold your tongue"). There was NO way to select a thief, pick a token type, or place a location with the keyboard — the whole flow (click thief → radial token menu → mini-map cell) was mouse-only.
- (b) **`prefers-reduced-motion` not honored.** No `matchMedia` anywhere. Screenshake (`Q.shake` → `camera()`) and slow-mo (`Q.slowmo` → `timeScale()`) always fired on plate/trap/alarm/gem beats.
- (c) **No visible focus.** Canvas had no `tabindex`, no `:focus-visible`, and there was no on-canvas keyboard-selection indicator.

**What changed (`src/index.html`):**
- **Keyboard whisper flow.** Rewrote the `window` `keydown` handler into a real cursor over the three whisper sub-steps: Arrow keys / Tab (Shift+Tab reverses) move an on-canvas selection cursor among the six thieves → the seven rumor types (radial) → the mini-map floor cells; **Enter/Space** commits each step; **Esc/Backspace** "holds your tongue". In `pick-loc`, arrows step in-direction skipping walls to the next floor cell (`moveCellFocus`), starting from the nearest floor cell to the entry (`nearestFloor`). Any key during the gossip `anim` phase fast-forwards it (parity with click).
- **Shared transitions.** Extracted `pickThief` / `pickType` / `placeLie` used by BOTH mouse and keyboard so the two input paths can't drift; the mouse pick now seeds the keyboard cursor (`kThief`/`kType`/`kCell`) and vice-versa. `placeLie` re-checks the target is floor (same guard the click path had).
- **Visible focus (`drawWhisperFocus`).** Dashed teal ring around the focused seat (pick-thief); the radial picker's existing hover-highlight is driven by the keyboard `kType` (pick-type); a teal focus box on the mini-map cell (pick-loc). Canvas got `tabindex="0"`, an `aria-label`, a `#c:focus-visible { outline: 3px solid #5fd0bf }` rule, and `canvas.focus()` on load so keys work immediately (mouse clicks never paint the outline — `:focus-visible`, not `:focus`).
- **Reduced motion (juice module).** Added `reduced()` = `matchMedia('(prefers-reduced-motion: reduce)').matches` (read LIVE; `typeof matchMedia` guard keeps the Node test VM safe → always false there). `activate()` skips `Q.shake`/`Q.slowmo` under reduce but KEEPS the conveyance: plate/alarm keep their shockwave rings, **trap falls back to a ring** so the shake-only beat isn't silent, gem keeps its confetti. `camera()` and `timeScale()` are also gated at the read chokepoint, so even an in-flight shake is pinned to `{0,0}` / no time dilation the instant the OS pref flips — no reload. There is no true parallax layer to gate (confirmed; the title gem/flicker are in place, not translating).
- **Discoverable help (zero numerals).** The three debrief hints now name arrows/enter/esc; title & chronicle advertise "press a key".
- **`WH._debug`** read-only handle added (never wired to input, no gameplay effect; `endRaid()` only trips the same raid-over path `stepRaid` would) so the browser verifier can drive/inspect the flow without idling a full night.
- Line count **2080 → 2190** (< 2400 cap).

**Verification evidence:**
- `node tests/run-tests.mjs` → **ALL SUITES PASSED** (sim **31/0**, gossip **35** assertions, chronicle **21/0**, gem-steal **15/0**, outsmart **15/0**) — no sim regression (sim block byte-unchanged).
- `node --check` via `new vm.Script` on all 3 inline blocks (967 / 886 / 311 lines): **all SYNTAX OK**.
- Headless node probe (throwaway, deleted; mock `matchMedia`, drives the real `push`→`tick`→`activate` pipeline) **16/16**: motion-ON PLATE_TRIP → shake 13.3 + slow-mo 630 + 1 ring + `camera()` {-6.37,2.21} + `timeScale()` 0.35; motion-OFF PLATE_TRIP → shake 0 + slow-mo 0 + `camera()` {0,0} + `timeScale()` 1 but ring STILL spawned; motion-OFF TRAP falls back to a ring; motion-OFF GEM keeps 46 confetti; a **live** mid-shake pref flip pins `camera()` to {0,0}.
- **game-verifier** (real headless Chromium 1228, Playwright; reduced-motion emulation live, not a fallback) → **PASS on all four gates**: (1) regression — 0 console errors / 0 pageerrors, title + vault render, night-1 raid with 6 thieves moving; (2) **keyboard-ONLY whisper completed end-to-end** — `endRaid()` → debrief, Enter fast-forwards anim → `pick-thief`, ArrowRight×3 moved `kThief` (dashed focus ring visible), Enter → `pick-type` (`chosen.thief="Brick"`), ArrowRight×2 moved `kType` 0→2 (radial highlight), Enter → `pick-loc`, arrows moved `kCell` (11,13)→(11,11) (teal focus box), Enter → **mode back to raid, night 1→2, whisperCount 0→1**; `Escape` on a fresh debrief returned to raid with **whisperCount unchanged**; (3) reduced-motion — default `{cam:{x:-5.977,y:5.389}, ts:0.35, reduced:false}` vs `emulateMedia reduce` `{cam:{x:0,y:0}, ts:1, reduced:true}`; (4) canvas focusable — `document.activeElement.id==='c'` (tabindex 0, focus-visible ring in every screenshot). Screenshots `/tmp/wh_1_title.png` … `/tmp/wh_7_reduced_context.png`.

**Dirty working tree:** clean at commit time (only `src/index.html` was modified by the prior state; the pre-existing spec-doc dirt from earlier snapshots had already been resolved by commit `a4155a4`). This commit touches ONLY this iteration's files: `src/index.html`, `BACKLOG.md`, `docs/loop-log.md`.

**Follow-ups filed:** none new. Noted for a later accessibility pass (out of scope here): the RAID-mode ledger is still hover/click-only (no keyboard way to cycle the pinned thief ledger); low value vs. the whisper flow the player acts through, but the natural next accessibility slice. Pre-existing open items unchanged: optional muted audio kit; night-1/gem balance confirmation; target-hysteresis (Ash nights 4–5); trust-tinted debrief slides.

**Commit:** (this commit)

---

## 2026-07-06 — Balance LOCK: night-1 win guaranteed + gem unreachable before night 3, pinned by a regression test (CAP-1)

**Item:** "Balance: confirm night-1 outer-loot win is guaranteed and the gem is genuinely unreachable before night 3."

**Outcome: DONE as a proof/lock — `src/index.html` is BYTE-UNCHANGED vs HEAD (verified `git diff --quiet`). The guarantee was already true (seeded night-1 win + the iteration-9 depth-gating fix); this iteration LOCKS it so future AI tuning can't silently break the core stakes.**

**Empirical confirmation (broad node seed sweep, seeds 0..299, via the shipped-`<script id="sim">` extractor — throwaway probe, deleted):**
- **NIGHT 1 (300 seeds):** outer-loot win **300/300 (100.0%)**; gem stolen **0/300**; timeouts **0/300**; outcomes exclusively `{"outer-loot":300}`; every run logged a night-1 `LOOT_GRAB` and NO `GEM_GRAB`. The night-1 guaranteed low-stakes win holds with zero player input (CAP-1 success signal).
- **FULL 5-NIGHT AUTONOMOUS RUNS (300 seeds):** gem stolen **29/300 (9.7%)** — a challenge, not a giveaway; steal-by-night `{4:24, 5:5}` — **ALL on nights 4-5**; `GEM_GRAB` by night `{4:24, 5:5}`; **GEM_GRAB on nights 1-2 = 0** (and 0 on nights 1-3). The sanctum is genuinely unreachable before night 3, exactly as the depth-gating table (vault-map.md) and iteration-9 intend. No violation found → no sim fix needed.

**What changed (test-only; sim untouched):**
- **Added `tests/balance.test.mjs`** — a regression LOCK on the opening guarantee, exercising the shipped sim block via `extract-sim.mjs`. Three parts, 9 assertions:
  - **(A) night-1 guaranteed win** — 100-seed sweep (night 1 only): asserts every raid ends with `outcome==='outer-loot'` AND `lootGrabbed>0`, `gemStolen===false`, and no night-1 `GEM_GRAB` event. Result 100/100.
  - **(B) gem unreachable before night 3** — 60-seed sweep (nights 1-2 only, breaks on any steal): asserts **zero `GEM_GRAB` events on nights 1-2** and `raid.gemStolen` never set on nights 1-2. Result 0 / 0.
  - **(B2) legend-of-the-star gate (mechanism lock)** — drives one seed through debriefs and asserts the true-gem-cell `GEM_AT` legend is NOT present in any thief's memory while planning nights <=3 (`game.night` 1 and 2 at debrief) and IS present once planning night 4 (`game.night>=3`). This directly guards the `emitRoutePlans` gate that keeps (B) true, so a re-tune of the gate is caught even if a shallow sweep misses the seed.
  - Sweeps are **shallow-by-design** (part A = night 1; part B = nights 1-2) so the lock covers a broad seed range without paying for the deep nights; detecting an early steal never needs nights 3-5. `dt=100` kept, matching gem-steal/outsmart, for fidelity + determinism with the rest of the suite. Header documents the 300-seed empirical basis.
  - This is the mirror of `tests/gem-steal.test.mjs` (which pins the OTHER end: gem IS stealable on some nights 4-5, whisper lures onto/off the sanctum). The two suites now fence the stakes bell-curve in from both sides.
- **Wired `balance.test.mjs` into `tests/run-tests.mjs`** (between gem-steal and outsmart).

**Verification evidence:**
- `node tests/run-tests.mjs` → **ALL SUITES PASSED — shipped `<script id="sim">` verified**: sim, gossip, chronicle, gem-steal, **balance 9/9**, outsmart 15/0. Full suite ~57s.
- `node --check tests/balance.test.mjs` and `tests/run-tests.mjs` → **SYNTAX OK**; `new vm.Script` on the extracted `<script id="sim">` block (967 lines) → **SYNTAX OK**.
- `git diff --quiet -- src/index.html` → **src/index.html BYTE-UNCHANGED** vs HEAD (test-only lock). No `game-verifier` browser pass needed — there is no runtime/render change; the node sweep + extracted-block syntax check is the proof.
- Line count **2190 → 2190** (unchanged; well under the 2400 cap).

**Dirty working tree:** the conversation-start snapshot showed pre-existing spec-doc dirt + a deleted `.claude/scheduled_tasks.lock`; by working time the tree was already clean (resolved upstream). This commit touches ONLY this iteration's files: `tests/balance.test.mjs`, `tests/run-tests.mjs`, `BACKLOG.md`, `docs/loop-log.md`.

**Follow-ups filed:** none new. Remaining backlog items are all optional/minor: the muted single-oscillator WebAudio kit (footstep ticks / alarm sting / confetti chime, no external assets) is the most player-visible next slice; plus target-hysteresis for Ash's nights 4-5 same-goal dither (conduct legibility) and the raid-mode keyboard ledger (accessibility follow-up).

**Commit:** (this commit)
