# Render Plan

Canvas, juice, pacing, and build-order contract (CAP-6/7/8 presentation). Top-down noir vault on the fixed 24x16 grid (`vault-map.md`), one `<canvas>`.

## Scene layers (paint order)

```
1 floor grid + vault walls          (dark noir palette, vignette)
2 belief-ink overlay                (translucent hand-drawn strokes rendering the sim's merged
                                     BeliefMap; per-thief color = provenance tint of the
                                     max-confidence holder — one merged map, tinted strokes)
3 plan-lines                        (dashed; source of truth = each thief's current committed
                                     path from interfaces.md, which Moth seeds pre-raid from
                                     ROUTE_PLAN tokens; live-redraw on REPLAN)
4 traps/plates/alarms/loot/gem      (truth layer)
5 thieves                           (readable silhouettes + active-goal icon overhead)
6 deliberation beats                (pause, eye-flick, wobbling intent arrow, commit)
7 fx: flashlight cones (drawn EXACTLY as the sim's perception geometry, interfaces.md),
     slow-mo + screenshake on plate trip, alarm shockwave rings,
     banknote confetti on loot/gem grab
8 debrief table scene               (tokens physically slide thief→thief, mutate mid-slide)
9 Chronicle                         (animated parchment scroll, end of run)
```

## Beat scheduler (hard constraint)

One presentation-only queue (owned by juice+Chronicle, `interfaces.md`): max **one dramatic event per 1.5s**, max **two speech bubbles** on screen; stale events drop; the sim never blocks on playback. Speech bubbles trigger on flee, danger-spot, trap-trip, and debrief mutation callouts, and contain **closed-vocabulary glyphs only**.

## Deliberation beat (CAP-6)

Sim-time (the thief is genuinely paused; exempt from the beat budget): ~300ms pause → eye-flick between the top two scored options → intent arrow wobbles toward each → snaps to winner → move. Converts tuning flaws into character quirks.

## Debrief stage (CAP-4/5)

Thieves sit the fixed ring (`thief-archetypes.md`); exchanged tokens slide as glyphs along visible arcs, mutating hue/glyph mid-slide; hollow copies bud off solid originals. The beat scheduler paces the exchange into **three readable beats**. Then the whisper UI: click a thief → radial picker of **whisperable** token types → place location on a mini-map (single tap; whisperable types are all single-loc by contract) → token flies in. One play or an explicit "hold your tongue" skip — the debrief waits; then night falls.

## Chronicle (CAP-8)

Parchment unfurls; 5–8 lines template-composed from the run's EventLog and final memory streams, with blame attributed via token lineage ("Nix swore the east wing was rigged. It was empty. Nix is why we're still poor."). Acceptance: every line contains at least one run-specific logged token/event reference. Outcome reads diegetically, zero numerals: **moons = nights the gem survived, pips = delay inflicted, gem icon = its final fate.** Screenshot-bait by design.

## Build order (scope contract)

**Must (walking skeleton — gate before anything else):** thieves **Vex/Nix/Moth**; tokens **TRAP_AT, SAFE_PATH, LOOT_AT, GEM_AT, ALARM_AT**; 1 whisper; 2 nights; 4-dir grid A*; utility scorer + typed memory streams; gossip transfer with mutation; plan-line render; belief-ink overlay; then the full **bell-curve 5-night structure** (stakes ramp to a peak; night 1 is the guaranteed outer-loot win at the low end).
**Should (after gate, cut in reverse order if over the 2,000-line cap):** all 6 thieves + 10 tokens; deliberation beat; hollow/solid; debrief slide animations; Chronicle scroll; juice pass (shake, slow-mo, confetti); three-state trust glow.
**Cut (never):** see SPEC Non-goals.

Fleet split (4 parallel workstreams): sim core / gossip+mutation / render+overlay / juice+Chronicle — ownership table in `interfaces.md`; deterministic typed-token tests ship with sim core and gossip+mutation.
