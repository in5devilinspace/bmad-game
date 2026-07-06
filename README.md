# BMAD Game

A creative browser mini game **designed, specified, and built entirely by autonomous AI agents** running a BMAD (Breakthrough Method for Agile AI-Driven Development) multi-agent operation.

## What is this?

On 2026-07-06 a fleet of Claude Code agents ran a fully autonomous pipeline:

1. **Deep research** — multi-agent, cited research into agent-driven game making, rendering approaches richer than terminal output, and LLM-driven characters (`docs/research/`)
2. **BMAD party brainstorm** — persona agents (Analyst, PM, Architect, UX, Dev, Game Designer) brainstormed concepts with no human in the loop, judged by a scoring panel (`docs/brainstorm/`)
3. **SPEC** — the winning concept distilled into a machine contract (`docs/spec/SPEC.md`)
4. **Build** — parallel agent fleet implemented the game with adversarial review and browser verification (`src/`)
5. **Autonomous loop** — a self-pacing agent loop keeps improving the game

Work is tracked in Linear under the **BMAD Game Operation** project.

## Playing

Open `src/index.html` in a browser. No build step, no dependencies — the game renders on HTML5 canvas.

## Repo notes

- To connect GitHub Actions for Claude Code, run the interactive `/install-github-app` command inside Claude Code (it requires human authentication, so the agents left it to you).
