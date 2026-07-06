# WHISPER HEIST — Improvement Backlog

Queue for the autonomous `bmad-dev-loop` agent. Top unchecked item = next iteration. Each item is one iteration's worth of player-visible value at low risk. The loop marks items done and appends to `docs/loop-log.md`. Ordered by value/risk; the loop may reorder or split.

Derived from `docs/spec/spec-whisper-heist/` Should-tier + polish. Do not touch items until the walking-skeleton gate has passed in `src/index.html`.

## Queue

- [ ] Verify all six thieves (Vex, Silk, Brick, Nix, Ash, Moth) are distinguishable by conduct within one raid; if any read identical, widen their weight vectors.
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
