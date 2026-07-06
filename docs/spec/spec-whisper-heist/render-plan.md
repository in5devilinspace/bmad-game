# Render Plan

Canvas, juice, pacing, and build-order contract (CAP-6/7/8 presentation). Top-down noir vault, single 24x16 grid, one `<canvas>`.

## Scene layers (paint order)

```
1 floor grid + vault walls          (dark noir palette, vignette)
2 belief-ink overlay                (translucent hand-drawn strokes, per-thief color)
3 plan-lines                        (dashed, drawn pre-raid, live-redraw on replans)
4 traps/plates/alarms/loot/gem      (truth layer)
5 thieves                           (readable silhouettes + goal icon overhead)
6 deliberation beats                (pause, eye-flick, wobbling intent arrow, commit)
7 fx: flashlight cones w/ alpha falloff, slow-mo + screenshake on plate trip,
     alarm shockwave rings, banknote confetti on vault crack
8 debrief table scene               (tokens physically slide thief→thief, mutate mid-slide)
9 Chronicle                         (animated parchment scroll, end of run)
```

## Beat scheduler (hard constraint)

One queue owns all dramatic events: max **one per 1.5s**, max **two speech bubbles** on screen. Excess events queue; stale ones drop. Six minds must stay couch-readable.

## Deliberation beat (CAP-6)

Before any committed action: ~300ms pause → eye-flick between the top two scored options → intent arrow wobbles toward each → snaps to winner → move. Converts tuning flaws into character quirks.

## Debrief stage (CAP-4/5)

Thieves circle a table; exchanged tokens slide as glyphs along visible arcs, mutating hue/glyph mid-slide; hollow copies bud off solid originals. Then the whisper UI: click a thief → radial picker of token types → place location on a mini-map → token flies in. One play, then night falls.

## Chronicle (CAP-8)

Parchment unfurls; 5-8 lines assembled from the run's real memory/event log with blame attribution ("Nix swore the east wing was rigged. It was empty. Nix is why we're still poor."). Template-composed from logged tokens — never canned. Screenshot-bait by design. No numerals; outcome reads through pips/moons and prose.

## Build order (scope contract)

**Must (walking skeleton — gate before anything else):** 3 thieves, 5 token types, 1 whisper, 2 nights; grid A*; utility scorer + typed memory streams; gossip transfer with mutation; plan-line render; belief-ink overlay; then the full 5-night structure.
**Should (after gate):** all 6 thieves + 10 tokens; deliberation beat; hollow/solid; debrief slide animations; Chronicle scroll; juice pass (shake, slow-mo, confetti); three-state trust glow.
**Cut (never):** see SPEC Non-goals.

Fleet split (4 parallel workstreams): sim core / gossip+mutation / render+overlay / juice+Chronicle.
