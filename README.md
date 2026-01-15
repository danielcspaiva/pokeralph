# PokéRalph

> An autonomous development orchestrator that runs Claude Code in loops (Ralph technique) with a Pokémon Game Boy-themed interface.

PokéRalph transforms autonomous development into a gamified experience where each task is a "battle". It orchestrates Claude Code to execute tasks autonomously while providing real-time progress monitoring and human oversight when needed.

## Features

- **Planning Mode**: Describe an idea and let Claude refine it into a detailed PRD
- **Task Breakdown**: Automatically break PRDs into individual executable tasks
- **Battle System**: Execute tasks in autonomous Ralph loops with progress tracking
- **Two Execution Modes**:
  - **HITL (Human in the Loop)**: Review and approve each iteration
  - **YOLO Mode**: Fully autonomous execution until completion
- **Real-time Progress**: Monitor task execution via file polling and WebSocket events
- **Feedback Loops**: Automatic test, lint, and typecheck validation after each iteration
- **Git Integration**: Auto-commit on successful task completion

## Architecture

```
┌─────────────────────────────────────────────┐
│              @pokeralph/web                 │
│           React + Vite + Zustand            │
└─────────────────────┬───────────────────────┘
                      │ HTTP / WebSocket
┌─────────────────────▼───────────────────────┐
│            @pokeralph/server                │
│          Hono REST + WebSocket              │
└─────────────────────┬───────────────────────┘
                      │ imports
┌─────────────────────▼───────────────────────┐
│             @pokeralph/core                 │
│   Pure business logic (zero UI deps)        │
└─────────────────────────────────────────────┘
```

**Key principles:**
- **Core is pure**: Zero UI dependencies, runs anywhere
- **Server is the bridge**: All UIs connect via HTTP/WebSocket
- **UIs are interchangeable**: Web, CLI, Desktop all use the same server

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Monorepo | Bun workspaces |
| Language | TypeScript (strict) |
| Server | Hono |
| Frontend | React + Vite |
| State | Zustand |
| Linting | Biome |
| Tests | Bun test + Vitest |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Claude Code CLI](https://claude.ai/code) installed and configured

### Installation

```bash
git clone https://github.com/danielcspaiva/pokeralph.git
cd pokeralph
bun install
```

### Development

```bash
bun run dev        # Run server + web together
bun test           # Run all tests
bun run lint       # Lint with Biome
bun run typecheck  # TypeScript check
```

## How It Works

1. **Start Planning**: Describe your project idea
2. **Generate PRD**: Claude refines your idea into a structured PRD
3. **Break into Tasks**: PRD is automatically split into executable tasks
4. **Battle!**: Each task runs in a Ralph loop:
   - Claude executes the task
   - Progress is monitored via file polling
   - Feedback loops run (test/lint/typecheck)
   - On success: auto-commit and continue
   - On HITL mode: wait for approval

### Completion Detection

Tasks complete when Claude emits the completion sigil:
```
<promise>COMPLETE</promise>
```

## Configuration

Settings are stored in `.pokeralph/config.json`:

```json
{
  "maxIterationsPerTask": 10,
  "mode": "hitl",
  "feedbackLoops": ["test", "lint", "typecheck"],
  "timeoutMinutes": 30,
  "pollingIntervalMs": 2000,
  "autoCommit": true
}
```

## Roadmap

- **v0.1.0** - Core + Server + Web (current)
- **v0.2.0** - CLI Interface (Ink/OpenTUI)
- **v0.3.0** - Desktop App (Tauri v2)
- **v0.4.0** - Pokémon Theme (pixel art, animations, sounds)
- **v0.5.0** - Integrations (GitHub Issues, Linear)

## References

- [Ralph Wiggum Technique](https://ghuntley.com/ralph/)
- [Tips for AI Coding with Ralph](https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum)
- [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

## License

MIT
