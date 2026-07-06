# WHISPER HEIST

*The gang that remembers — and remembers wrong.*

**Winner of the BMAD game-concept jam, 105/120 across three judges.** Base chassis: Amelia's SECOND STORY (runner-up, 103.5). Remix discipline: John. Grafts credited inline.

## Vision

You designed the vault; tonight a gang of six thief-agents will case it, raid it, fail, debrief, and come back smarter — except everything they know about you passes through imperfect, personality-warped gossip, and your only weapon is a single whisper: one false memory planted in one thief's head per debrief. You never fight the thieves. You fight their *beliefs about you* — poisoning a coward who doubles every danger, a hothead who discards it, a planner who builds tomorrow's entire route around your lie — and you watch the whole epistemic catastrophe unfold as ink, arrows, and thought-tokens on a noir canvas. Five nights, ~7 minutes, one HTML file, no tutorial: night one the gang simply wins, and watching them win teaches you the whole game (Amelia). It is the roguelike inversion Rex named — the player is the dungeon, and the AI is the run.

## Core Loop

Five nights, hard-capped. Each night is two phases:

1. **RAID (60s, watch).** The gang executes a plan drawn as dashed plan-lines on the vault floor *before* they move (Amelia). Overlaid on the true vault layout is the gang's collective belief about it, rendered as translucent hand-drawn ink (grafted from Mary's SEARCH PARTY) — the player's core skill is reading the gap between truth and belief. Every thief decision plays through Sally's deliberation beat from LAST LIGHT: pause, eye-flick between options, a wobbling intent arrow, commit — so when a thief tiptoes around a hallway that was never trapped, you *see* the poisoned belief win the argument.
2. **DEBRIEF (20s, act).** The thieves gather at the table and gossip: memory tokens physically slide from thief to thief (Amelia), mutating as they pass via Rex's exaggeration table — `SAW_TRAP hallB` becomes `HALL_B DEATHTRAP` becomes `EAST_WING RIGGED` (Mary's "exaggeration is coded in," from RUMOR MILL). You play exactly **one whisper card**: click a thief, pick a false token from the closed vocabulary, plant it. That is the entire verb set (John: one verb, not two — no trap-dragging *and* whispering).

Score = nights the gem survives + seconds of delay inflicted. After night five, the run closes with **the Chronicle** (grafted back from Rex's THE GRAPEVINE, per the emergence judge's note that cutting it traded away the shareable story artifact): an animated parchment retelling the heist assembled *purely from the thieves' actual memory streams* — "Nix swore the east wing was rigged. It was empty. Nix is why we're still poor." Every line is unauthored, quotable, and screenshot-bait for session two.

## Agents As Characters

The exact autonomous-agent model — generative-agents-lite, no hand-waving:

- **One agent class, six weight vectors** (Winston's zero-special-cases rule from BEACON/CONWAY). Scout, Lockpick, Muscle, Coward, Hothead, Planner differ *only* in weights over greed / fear / loyalty / credulity. The Coward doubling danger memories is a parameter, not an if-statement.
- **Goals.** Each thief holds a goal stack (reach gem → survive → stick with the plan → protect a bonded teammate). The active goal renders as an icon above their head at all times.
- **Memory.** A per-thief memory stream of **typed tokens from a fixed vocabulary of ~10 icons** (Amelia; John: legibility solved at design time, never freeform text). Each token carries source, confidence, and age. Firsthand memories render as **solid** glyphs; secondhand gossip renders **hollow** (grafted from Winston's BEACON) — epistemics readable at a glance, zero text.
- **Gossip = lossy memory transfer.** At debrief, tokens copy between thieves imperfectly, re-weighted by personality (Amelia) and run through Rex's mutation-with-noise table, constrained to the closed vocabulary so mutation is always a visible glyph shift, never noise. Trust between thieves — and in each remembered fact — is clamped to **three visible states** (glow / neutral / grey), never a float (Sally's WAGGLE! cut, framed on the wall per John).
- **Decision cadence.** Thieves re-score their options at fixed ~2s ticks during raids plus event-driven re-plans (alarm, teammate flees, trap sighted). Every choice is a utility argmax over the thief's *own memory tokens*, so wrong beliefs mechanically produce wrong plans.
- **Thinking made visible.** Four channels, all diegetic: (1) the pre-raid plan-lines drawn on the floor, which visibly warp around phantom traps; (2) Sally's pause–glance–intent-arrow deliberation beat before every commit, which converts tuning flaws into character quirks instead of bug reports; (3) hover any thief to open their memory ledger of solid/hollow tokens; (4) the belief-ink overlay showing the gang's collective wrong map of your vault (Mary). Cooperation, stubbornness, and heroic stupidity are all watchable, attributable, and blameable — Mary's read-a-mind-and-blame-a-mind law.

## Canvas & Juice

Top-down noir vault on a single 24x16 grid. Sweeping flashlight cones with soft alpha falloff; dashed plan-lines that redraw live on mid-raid re-plans; slow-mo + screen shake when a plate trips; alarm shockwave rings; banknote confetti on a vault crack (Amelia). Belief-ink overlay in translucent hand-drawn strokes, per-thief color (Mary). The debrief table is the showpiece: memory tokens physically sliding thief to thief, visibly mutating hue/glyph mid-slide, hollow copies budding off solid originals (Amelia + Rex + Winston). Chaos is conducted by Amelia's SHIP DAY **beat scheduler** — max one dramatic event per 1.5 seconds, max two speech bubbles on screen — so six minds stay readable from a couch. Finale: the Chronicle unfurls as an animated parchment scroll (Rex). Zero numerals on screen, ever (Sally).

## Scope

**Must (walking skeleton by lunch — John):** 3 thieves, 5 token types, 1 whisper, 2 nights; grid A*; utility scorer + typed memory streams; gossip transfer with mutation; plan-line render; belief-ink overlay; the bell-curve 5-night structure by end of day.
**Should (afternoon):** all 6 thieves and 10 tokens, deliberation beat, hollow/solid rendering, debrief slide animations, Chronicle scroll, juice pass (shake, slow-mo, confetti), three-state trust glow.
**Cut (now and forever — John):** trap-dragging as a second verb, free-text dialogue, a sixth+ thief, save state, difficulty settings, any phase 2. ~1,600 lines, four parallel fleet workstreams (sim core / gossip+mutation / render+overlay / juice+Chronicle), one self-contained HTML file, no network, offline.

**Acceptance criteria (Mary's one-metric law):** a planted lie must visibly propagate to a second thief and alter a drawn plan-line within one debrief cycle, or we tune gossip fidelity before adding anything; **time-to-first-outsmart** — the moment the player watches the gang avoid a perfectly safe hallway because of their lie — must land by night two.

## Risks

1. **Whisper-only agency fails playtest.** Mitigation: the bet is reversible — the trap-dragging parent game (SECOND STORY) is the same skeleton; fallback costs zero sunk work (shippable judge's clincher).
2. **Mutation reads as noise.** Mitigation: closed 10-token vocabulary; every mutation is a discrete glyph/hue shift; lineage traceable in the ledger; Chronicle does post-hoc attribution.
3. **Debrief is a 20-second reading toll** (delight judge's one complaint). Mitigation: tokens are icons not text, the slide animation *is* the information, and the beat scheduler paces it to three readable beats.
4. **Six agents = visual soup.** Mitigation: hover-only ledgers, two-bubble cap, one-event-per-1.5s governor (Amelia).
5. **Estimate optimism** (shippable judge: agent-hours hide in trap-x-perception interactions). Mitigation: one grid, slot-based interactions, deterministic tests on typed tokens, skeleton-by-lunch checkpoint with a kill decision attached.

## Score Table

Sum of creativity + feasibility + agents_fidelity + fun across all three judges (emergence / shippable / delight; max 120).

| # | Concept | Persona | Emergence | Shippable | Delight | **Total** |
|---|---------|---------|-----------|-----------|---------|-----------|
| 1 | **WHISPER HEIST** 🏆 | John (remix) | 34 | 35 | 36 | **105** |
| 2 | SECOND STORY | Amelia | 35 | 34 | 34.5 | 103.5 |
| 3 | THE WHISPER JOB | Mary (remix) | 35 | 32.5 | 35 | 102.5 |
| 3 | HEIST GRAPEVINE | Rex (remix) | 35 | 32.5 | 35 | 102.5 |
| 5 | WAGGLE! | Sally | 33 | 33 | 34.5 | 100.5 |
| 6 | LIGHTHOUSE, MERGED | Sally/Amelia (remix) | 32 | 32 | 35 | 99 |
| 7 | LAST LIGHT | Sally | 31 | 32 | 33.5 | 96.5 |
| 8 | ONE LAST BEACON | Winston (remix) | 31 | 31.5 | 33.5 | 96 |
| 9 | LOOSE LIPS | John | 29 | 30.5 | 32.5 | 92 |
| 10 | RUMOR MILL | Mary | 29 | 29.5 | 31 | 89.5 |
| 11 | BEACON | Winston | 30 | 29 | 29 | 88 |
| 12 | SEARCH PARTY | Mary | 28 | 27.5 | 28.5 | 84 |
| 12 | THE GRAPEVINE | Rex | 28 | 27.5 | 28.5 | 84 |
| 14 | SHIP DAY | Amelia | 26 | 26 | 30 | 82 |
| 15 | SCOPE CREEP | Rex | 26 | 26.5 | 28 | 80.5 |
| 16 | CONWAY & CONWAY | Winston | 26 | 25 | 26.5 | 77.5 |
| 17 | DEMO DAY | John | 23 | 25 | 27 | 75 |

*Note: the top four concepts are all one design — three personas (Mary, John, Rex) independently derived the whisper-heist remix on Amelia's SECOND STORY chassis. The emergence judge called that convergence "the strongest emergent signal of the night." WHISPER HEIST wins as its tightest cut: the only remix that made its parent smaller, with the Chronicle grafted back in from its siblings as the one graft all three judges agreed it was missing.*