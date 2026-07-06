# build/ — historical scaffolding, NOT the source of truth

**`src/index.html` is the single source of truth for WHISPER HEIST.** The game
is one self-contained file; the sim core and gossip+mutation logic ship inside
its `<script id="sim">` block (per `docs/spec/spec-whisper-heist/interfaces.md`).

The `*.js` files in this directory (`sim.js`, `gossip.js`, `render.js`,
`juice.js`, `bootstrap.js`) are **historical extraction scaffolding** from an
early workstream split. They are **not built from, imported by, or under test**:

- The game loads nothing from `build/` — it runs entirely from `src/index.html`.
- The deterministic suite (`tests/sim.test.mjs`, `tests/gossip.test.mjs`) now
  loads the **shipped** `<script id="sim">` block via `tests/extract-sim.mjs`
  (extract → eval in a Node VM → assert). It no longer reads these copies.

These files **drifted** from the shipped block (e.g. a stale `log()` shape and a
bond-less `stepRaid` decision path) and, while the tests read them, they were a
false safety net. Rather than maintain a second copy that can silently re-drift,
they are retained only as a historical reference and are frozen.

**Do not edit these to change game behavior** — edit `src/index.html`. If you
ever need a fresh standalone copy of a block, re-extract it from
`src/index.html` (see `tests/extract-sim.mjs` for the extraction logic).
