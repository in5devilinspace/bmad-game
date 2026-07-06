# WHISPER HEIST — Improvement Backlog

Queue for the autonomous `bmad-dev-loop` agent. Top unchecked item = next iteration. Each item is one iteration's worth of player-visible value at low risk. The loop marks items done and appends to `docs/loop-log.md`. Ordered by value/risk; the loop may reorder or split.

Derived from `docs/spec/spec-whisper-heist/` Should-tier + polish. Do not touch items until the walking-skeleton gate has passed in `src/index.html`.

## Queue

- [x] Verify all six thieves (Vex, Silk, Brick, Nix, Ash, Moth) are distinguishable by conduct within one raid; if any read identical, widen their weight vectors. *(Verified distinguishable — no identical/same-trajectory pairs across seeds & nights. Hardened by fixing a decision-thrash deadlock: Moth ping-ponged survive↔protect-bond, re-tripping a plate ~14×/raid and arming the alarm; added goal hysteresis so conduct is now legible. See loop-log 2026-07-06.)*
- [ ] Full 10-token vocabulary present and each renders a distinct legible glyph (solid vs hollow).
- [ ] Deliberation beat (pause → eye-flick → wobbling intent arrow → commit) visible before every committed thief move.
- [ ] Three-state trust glow (glow/neutral/grey) applied to every rendered token; confirm no numerals leak on the play HUD.
- [ ] Debrief token-slide animation paced into exactly three readable beats by the beat scheduler.
- [ ] Chronicle: every line references a run-specific logged token/event; two runs produce visibly different Chronicles.
- [ ] Juice pass: slow-mo + screenshake on plate trip, alarm shockwave rings, banknote confetti on loot/gem grab — all governed by the one-event-per-1.5s beat queue.
- [ ] Belief-ink overlay readability: a first-time viewer can spot a truth/belief divergence within 5 seconds; tune stroke alpha/color per thief.
- [ ] Time-to-first-outsmart lands by night two: instrument a scripted run to confirm plan-lines reroute around a planted-safe hallway.
- [ ] Accessibility: keyboard-operable whisper UI, `prefers-reduced-motion` honored (no screenshake/parallax), focus-visible on all controls.
- [ ] Audio (optional, muted-by-default, single WebAudio oscillator kit): footstep ticks, alarm sting, confetti chime — no external assets.
- [ ] Balance: confirm night-1 outer-loot win is guaranteed and the gem is genuinely unreachable before night 3.
- [ ] Follow-up (from thief-distinguishability iteration): on nights 4–5 a thief (esp. Ash) can dither between two *same-goal* loot targets, re-crossing a plate ~4–5×. Goal hysteresis doesn't cover it (same goal, different target). Add lightweight target hysteresis / commit-to-nearest so the conduct reads as decisive greed, not indecision. Lower severity than the fixed Moth thrash; partly a probe artifact (harness omits Moth's ROUTE_PLAN options).
- [x] Test integrity: `build/sim.js` and `build/gossip.js` (what `tests/*.mjs` run against) have DRIFTED from the shipped `<script id="sim">` in `src/index.html` — e.g. build's `log()` lacks `ev.thief`/`ev.cell`, and build's `stepRaid` calls `activeState(game)` with no thief (no bond → no protect-bond option → it never reproduced the Moth thrash). Re-extract build artifacts from `src/index.html` (or add a `tests/run-tests.mjs` extractor per `interfaces.md`) so tests exercise shipped code. Confirm existing assertions still pass against the shipped block. *(Done 2026-07-06. Added `tests/extract-sim.mjs` — extracts the shipped `<script id="sim">` block from `src/index.html`, evals it in a Node VM, exposes `WH.sim`+`WH.gossip`; both `tests/*.mjs` now load through it. Added `tests/run-tests.mjs` (the entrypoint `interfaces.md` names) + `npm test`. All existing assertions pass unchanged against shipped code — no shipped bug found (`src/index.html` untouched). `build/*.js` frozen as historical scaffolding via `build/README.md` (single-source-of-truth = `src/index.html`), no re-mirroring, so drift can't recur. Proof the tests read shipped bytes: live `stepRaid`/`scoreOptions` source appears verbatim in `src/index.html`; shipped `stepRaid` lacks the bond-less `activeState(game)` drift marker that `build/sim.js` still has. See loop-log 2026-07-06.)*
