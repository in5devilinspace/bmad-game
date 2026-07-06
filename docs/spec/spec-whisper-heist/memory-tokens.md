# Memory Tokens

Closed vocabulary (CAP-3/CAP-4). Every belief in the game is one of these 10 typed tokens. **Draft status:** the set below is spec-authored (source fixed size ~10, typedness, closed-ness, and the TRAP_AT mutation example); build agents may swap individual entries if the walking skeleton demands it, logging the change.

Token shape is canonical in `interfaces.md`: `{ type, loc, payload, source, originId, hops, confidence: 0..1 (clamped), age, firsthand }`. Confidence and age are internal floats — never rendered as numbers (three-state display: glow ≥0.66 > neutral ≥0.33 > grey).

| # | Type | Glyph idea | loc shape | payload | Meaning | Danger-class | Whisperable |
|---|---|---|---|---|---|---|---|
| 1 | TRAP_AT | spike | cell or region | — | Trap there | yes | ✓ |
| 2 | SAFE_PATH | dotted line | region | — | Region verified clear | no | ✓ |
| 3 | LOOT_AT | coin | cell | — | Loot spot | no | ✓ |
| 4 | GEM_AT | gem | cell | — | The gem's believed location | no | ✓ |
| 5 | ALARM_AT | bell | cell | — | Alarm trigger there | yes | ✓ |
| 6 | PLATE_AT | pressure plate | cell | — | Weight plate there | yes | ✓ |
| 7 | LOCKED_DOOR | padlock | cell | doorId | Door needs the `lockpick` ability | no | ✓ |
| 8 | SHORTCUT | arrow | cell-pair `{a,b}` | — | Passage connecting two cells | no | — |
| 9 | ROUTE_PLAN | map scroll | null | Cell[] path | Moth's intended path segment | no | — |
| 10 | VAULT_STYLE | eye | region | hazard-class | Meta-read on the vault's designer; acts as a confidence prior on unexplored cells of that region during scoring | varies | — |

Epithet strings that appear in mutation chains ("DEATHTRAP", "RIGGED") are **Chronicle-only flavor** carried in `hops` records — never rendered during play (no-free-text constraint holds on screen).

**Rendering epistemics (CAP-3):** firsthand tokens draw **solid**; secondhand (gossip or WHISPER-sourced) draw **hollow**. The hover ledger is transient and never pauses the sim; click pins it. A pinned token exposes its **lineage**: origin thief (or the whisper), gossip hops, and mutations applied — the mutation-reads-as-noise mitigation.

**Gossip transfer (CAP-4):** debrief-only. Each ring-adjacent pair (seating in `thief-archetypes.md`) exchanges its **top-2 salience** tokens; salience = confidence × 1/(1+age) × 1.5-if-danger. On receipt: confidence × receiver credulity (× fear multiplier for danger-class, applied once per the fear-once rule), clamp [0,1], then roll the mutation table (seeded PRNG):

| Roll | Mutation (always within vocabulary) |
|---|---|
| ~60% | Faithful copy (hollow, confidence decayed) |
| ~20% | **Exaggerate:** danger token's loc grows one hierarchy level (cell → region → wing), confidence up (clamped) |
| ~10% | **Drift:** loc shifts to an adjacent cell/region |
| ~10% | **Type-slip** — exhaustive closed list: PLATE_AT→TRAP_AT, LOOT_AT→GEM_AT, SAFE_PATH→SHORTCUT |

**Receipt-merge policy:** tokens coexist in the stream; same type+loc duplicates merge to max confidence; contradictions (TRAP_AT vs SAFE_PATH covering one cell) both persist and compete at scoring time by confidence.

**Aging:** confidence ×0.9 at each NIGHT_START; tokens expire below 0.15; aged firsthand tokens stay solid.

Worked chain (contract example, from source): `TRAP_AT hall-b` → exaggerate → `TRAP_AT central "DEATHTRAP"` → drift+exaggerate → `TRAP_AT east wing "RIGGED"`. Mutation is a visible glyph/hue shift during the token slide, never silent.

**Whisper (CAP-5):** player picks a **whisperable** type + location, plants it in one thief with `source: 'WHISPER'`, confidence 0.9, hollow render. At most one per debrief; skipping ("hold your tongue") is allowed and the debrief waits for play-or-skip. Whispered tokens obey identical gossip/mutation/decay rules — no special-case handling; their `originId` is how CAP-4's gate and the Chronicle attribute the lie.
