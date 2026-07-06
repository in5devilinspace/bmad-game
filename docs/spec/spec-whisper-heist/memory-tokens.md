# Memory Tokens

Closed vocabulary (CAP-3/CAP-4). Every belief in the game is one of these 10 typed tokens plus a grid location and payload slot. **Draft status:** the set below is spec-authored (source fixed size ~10, typedness, closed-ness, and the TRAP_AT mutation example); build agents may swap individual entries if the walking skeleton demands it, logging the change.

Token = `{ type, loc, payload?, source: thiefId|WHISPER, confidence: 0..1, age: nights }`. Confidence and age are internal floats — never rendered as numbers (three-state trust display only).

| # | Type | Glyph idea | Meaning | Danger-class |
|---|---|---|---|---|
| 1 | TRAP_AT | spike | Cell (x,y) is trapped | yes |
| 2 | SAFE_PATH | dotted line | Corridor/cells verified clear | no |
| 3 | LOOT_AT | coin | Loot spot at (x,y) | no |
| 4 | GEM_AT | gem | The gem's believed location | no |
| 5 | ALARM_AT | bell | Alarm trigger at (x,y) | yes |
| 6 | LOCKED_DOOR | padlock | Door at (x,y) needs Lockpick | no |
| 7 | SHORTCUT | arrow | Passage/vent connecting two cells | no |
| 8 | PLATE_AT | pressure plate | Weight plate at (x,y) | yes |
| 9 | ROUTE_PLAN | map scroll | Planner's intended path segment | no |
| 10 | VAULT_STYLE | eye | Meta-read on the designer ("favors east traps") | no |

**Rendering epistemics (CAP-3):** firsthand tokens draw **solid**; secondhand (gossip or WHISPER-sourced) draw **hollow**. Hover ledger lists a thief's tokens as glyphs with three-state trust glow.

**Gossip transfer (CAP-4):** at debrief each pair within table-adjacency exchanges top-salience tokens. On receipt: confidence × receiver credulity (× fear multiplier for danger-class), then roll the mutation table:

| Roll | Mutation (always within vocabulary) |
|---|---|
| ~60% | Faithful copy (hollow, confidence decayed) |
| ~20% | **Exaggerate:** danger token's area grows (cell → corridor → wing), confidence up |
| ~10% | **Drift:** loc shifts to an adjacent cell/room |
| ~10% | **Type-slip:** PLATE_AT→TRAP_AT, LOOT_AT→GEM_AT, SAFE_PATH→SHORTCUT (plausible neighbor types only) |

Worked chain (contract example, from source): `TRAP_AT hallB` → exaggerate → `TRAP_AT hallB-wide "DEATHTRAP"` → drift+exaggerate → `TRAP_AT east-wing "RIGGED"`. Mutation is a visible glyph/hue shift during the token slide, never silent.

**Whisper (CAP-5):** player picks any token type + location from this table, plants it in one thief with source=WHISPER at high initial confidence, hollow render. Whispered tokens obey identical gossip/mutation/decay rules — no special-case handling.
