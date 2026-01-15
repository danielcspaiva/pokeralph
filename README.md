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
- **Polling, not streaming**: Claude writes to files, app monitors via polling

For detailed technical documentation, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Bun | Fast, native TypeScript, integrated workspaces |
| Monorepo | Bun workspaces | Simplicity, no extra tools |
| Language | TypeScript (strict) | Type safety throughout |
| Server | Hono | Lightweight, portable (Bun/Deno/Edge) |
| Frontend | React + Vite | Fast SPA development |
| State | Zustand | Simple, no boilerplate |
| Linting | Biome | Unified lint + format, fast |
| Tests | Bun test + Vitest | Bun test for core/server, Vitest for React |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+ (`curl -fsSL https://bun.sh/install | bash`)
- [Claude Code CLI](https://claude.ai/code) installed and configured

### Installation

```bash
# Clone the repository
git clone https://github.com/danielcspaiva/pokeralph.git
cd pokeralph

# Install dependencies
bun install
```

### First Use

```bash
# Start the development server
bun run dev

# Open http://localhost:5173 in your browser
```

1. Click "New Idea" to start planning
2. Describe your project idea
3. Review and confirm the generated PRD
4. Start battling tasks!

## Available Commands

| Command | Description |
|---------|-------------|
| `bun install` | Install all dependencies |
| `bun run dev` | Run server (port 3456) + web (port 5173) together |
| `bun test` | Run all tests across packages |
| `bun run test:e2e` | Run end-to-end tests |
| `bun run typecheck` | TypeScript type checking |
| `bun run lint` | Lint with Biome |
| `bun run format` | Format with Biome |
| `bun run format:check` | Check formatting without changes |
| `bun run build` | Build all packages |

### Running Individual Package Commands

```bash
# Run tests for a specific package
bun test packages/core/tests/file-manager.test.ts

# Run server only
bun run packages/server/src/index.ts

# Run web only
bun run --cwd packages/web dev
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

Settings are stored in `.pokeralph/config.json` in your project:

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

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxIterationsPerTask` | number | 10 | Maximum iterations before task fails |
| `mode` | string | "hitl" | Execution mode: "hitl" or "yolo" |
| `feedbackLoops` | string[] | ["test", "lint", "typecheck"] | Validation commands to run |
| `timeoutMinutes` | number | 30 | Timeout per iteration in minutes |
| `pollingIntervalMs` | number | 2000 | Progress file polling interval |
| `autoCommit` | boolean | true | Auto-commit on successful completion |

## Project Structure

```
pokeralph/
├── packages/
│   ├── core/           # @pokeralph/core - Business logic
│   │   ├── src/
│   │   │   ├── types/      # Domain interfaces
│   │   │   ├── services/   # FileManager, ClaudeBridge, etc.
│   │   │   └── orchestrator.ts
│   │   └── tests/
│   │
│   ├── server/         # @pokeralph/server - REST API + WebSocket
│   │   ├── src/
│   │   │   ├── routes/     # API endpoints
│   │   │   ├── websocket/  # Real-time events
│   │   │   └── middleware/
│   │   └── tests/
│   │
│   └── web/            # @pokeralph/web - React SPA
│       └── src/
│           ├── components/  # UI components
│           ├── views/       # Page components
│           ├── stores/      # Zustand state
│           └── api/         # HTTP + WebSocket client
│
├── tests/
│   └── e2e/            # End-to-end tests
│
└── scripts/
    └── dev.ts          # Development script
```

## Roadmap

- **v0.1.0** - Core + Server + Web (current)
- **v0.2.0** - CLI Interface (Ink/OpenTUI)
- **v0.3.0** - Desktop App (Tauri v2)
- **v0.4.0** - Pokémon Theme (pixel art, animations, sounds)
- **v0.5.0** - Integrations (GitHub Issues, Linear)

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## References

- [Ralph Wiggum Technique](https://ghuntley.com/ralph/)
- [Tips for AI Coding with Ralph](https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum)
- [Getting Started with Ralph](https://www.aihero.dev/getting-started-with-ralph)
- [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

## License

MIT - see [LICENSE](LICENSE) for details.
