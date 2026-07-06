# WHISPER HEIST

### *The gang that remembers — and remembers wrong.*

A creative browser mini game **designed, specified, and built entirely by autonomous AI agents** running a BMAD (Breakthrough Method for Agile AI-Driven Development) multi-agent operation. No human wrote the concept, the spec, or a line of the game.

You designed the vault. Tonight, six thief-agents come to rob it — and they'll come back for five nights straight, each time a little smarter. You can't fight them and you can't control them. Your only weapon is a **whisper**: once per debrief you plant one false memory in one thief's head, and then you watch that lie travel the gang's gossip network, mutating as it goes (`SAW_TRAP hallB` → `HALL_B DEATHTRAP` → `EAST_WING RIGGED`), until the whole crew is planning tomorrow's raid around something that was never true.

The AI agents **are** the characters. Six thieves run one shared behavior model with six personality weight vectors (greed / fear / loyalty / credulity) — a coward who doubles every danger, a hothead who charges phantom traps, a planner who builds the route from the gang's collective (wrong) map. You see them think: goals float over their heads, plan-lines draw on the floor before they move, and a belief-ink overlay shows the gap between the real vault and the one they believe in.

It's the roguelike inverted: **the player is the dungeon, and the AI is the run.**

## Play

Open `src/index.html` in any modern browser. No build step, no dependencies, no network — a single self-contained HTML file rendering on HTML5 canvas, playable offline. A full five-night run takes ~7 minutes and there's no tutorial: night one the gang simply wins, and watching them win teaches you the game.

**Companion artifacts** (published from this repo):
- **Title screen** — a diegetic "sign the ledger" login where the gang misremembers your alias in real time.
- **Gossip Lab** — an interactive playground to tune credulity / fear / mutation rates and watch a planted lie corrupt around the thief-ring.

## How it was made

On 2026-07-06 a fleet of Claude Code agents ran a fully autonomous pipeline (tracked in Linear under **BMAD Game Operation**):

| Phase | What the agents did | Output |
|---|---|---|
| **Research** | 106-agent deep-research fleet, adversarially verified | `docs/research/agent-game-making.md` |
| **Brainstorm** | 17-agent BMAD party (Analyst, PM, Architect, UX, Dev, Game Designer) pitched, clashed, and judged — no human in the loop | `docs/brainstorm/` |
| **Spec** | Winning concept distilled to a machine contract, self-validated (9 buildability blockers fixed) | `docs/spec/spec-whisper-heist/` |
| **Build** | 13-agent fleet: 4 parallel module authors → integrator → browser verify/fix loop | `src/index.html` |
| **Verify** | Real headless Chromium playthrough + node tests (sim 31/31, gossip 35/35) | `tests/` |
| **Loop** | A no-human-in-the-loop `bmad-dev-loop` agent keeps improving the game | `BACKLOG.md`, `docs/loop-log.md` |

### Architecture

The game is four modules assembled into one file, wired through a frozen interface contract (`docs/spec/spec-whisper-heist/interfaces.md`):

- **sim core** — world, six-thief behavior model, flashlight-cone perception, 4-dir A* (paths bend around *believed* danger, scaled by each thief's fear), typed memory streams, BeliefMap merge, event log.
- **gossip + mutation** — debrief exchange, the exaggerate/drift/type-slip mutation table, whisper application, lineage tracking.
- **render + overlay** — noir canvas, belief-ink overlay, plan-lines, deliberation beats, solid/hollow token ledger with three-state trust.
- **juice + Chronicle** — beat scheduler, screenshake/slow-mo/confetti, and the Chronicle: an end-of-run parchment assembled purely from the thieves' actual memories, blaming whoever believed your lie.

`build/` holds the un-inlined module sources; `tests/` holds the deterministic node tests that ship with the sim and gossip logic.

## Repo notes

- The game is dependency-free and offline — just open the HTML file.
- To connect the Claude Code GitHub Action, run the interactive `/install-github-app` command inside Claude Code (it needs human authentication).
- BMad Builder module config lives in `_bmad/`.
