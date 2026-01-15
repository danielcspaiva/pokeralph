# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PokéRalph is an autonomous development orchestrator that runs Claude Code in loops (Ralph technique). It transforms autonomous development into a gamified experience where each task is a "battle". The project is a Bun workspace monorepo with three packages: core (business logic), server (Hono API), and web (React SPA).

## Commands

```bash
bun install              # Install all dependencies
bun run dev              # Run server (port 3456) + web (port 5173) together
bun test                 # Run all tests across packages
bun run typecheck        # TypeScript type checking
bun run lint             # Lint with Biome
bun run format           # Format with Biome
```

Run a single test file:
```bash
bun test packages/core/tests/file-manager.test.ts
```

## Bun-First Development

Default to using Bun instead of Node.js:

- `bun <file>` instead of `node <file>` or `ts-node <file>`
- `bun test` instead of `jest` or `vitest` (for core/server)
- `bun install` instead of `npm/yarn/pnpm install`
- `bunx <package>` instead of `npx <package>`
- Bun automatically loads `.env` - don't use dotenv

**Bun APIs to use:**
- `Bun.serve()` for HTTP servers with WebSocket support (not express)
- `bun:sqlite` for SQLite (not better-sqlite3)
- `Bun.file()` for file I/O (not node:fs readFile/writeFile)
- `Bun.spawn()` for child processes (not execa)
- `Bun.$` for shell commands

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
│   Types, Services, Orchestrator             │
└─────────────────────────────────────────────┘
```

**Key principles:**
- Core is pure: zero UI dependencies, runs anywhere
- Server is the bridge: all UIs connect via HTTP/WebSocket
- Polling, not streaming: Claude writes to files, app monitors via polling
- Completion sigil: `<promise>COMPLETE</promise>` marks task completion

## Monorepo Structure

```
packages/
├── core/                    # @pokeralph/core
│   ├── src/
│   │   ├── types/           # Domain interfaces (PRD, Task, Config, etc.)
│   │   ├── services/        # FileManager, ClaudeBridge, LoopController, etc.
│   │   ├── utils/           # Pure helpers
│   │   └── orchestrator.ts  # Main facade
│   └── tests/
│
├── server/                  # @pokeralph/server
│   ├── src/
│   │   ├── routes/          # REST endpoints (config, prd, planning, battle)
│   │   ├── websocket/       # Real-time events
│   │   └── middleware/      # CORS, logging, error handling
│   └── tests/
│
└── web/                     # @pokeralph/web
    └── src/
        ├── components/      # Layout, Sidebar, TaskCard, etc.
        ├── views/           # Dashboard, Planning, Battle, History
        ├── stores/          # Zustand state
        └── api/             # HTTP client + WebSocket
```

## Data Persistence

All data lives in `.pokeralph/` folder in the user's repo:

```
.pokeralph/
├── config.json              # Settings (maxIterations, mode, feedbackLoops)
├── prd.json                 # PRD with tasks and status
└── battles/
    └── {task-id}/
        ├── progress.json    # Current iteration status (polled by app)
        ├── history.json     # Completed iterations
        └── logs/            # Per-iteration logs
```

## Core Services

The `@pokeralph/core` package contains these services:

| Service | Purpose |
|---------|---------|
| FileManager | All I/O for `.pokeralph/` folder |
| PromptBuilder | Constructs prompts for Claude |
| ClaudeBridge | Spawns/monitors Claude Code CLI |
| ProgressWatcher | Polls progress.json, emits events |
| FeedbackRunner | Runs test/lint/typecheck loops |
| GitService | Git commit, status, revert |
| LoopController | Orchestrates full Ralph loop |
| PlanService | Handles planning phase |
| Orchestrator | Main facade unifying all services |

## Execution Modes

**HITL (Human in the Loop):** Pauses after each iteration for user approval. Use for high-risk tasks.

**YOLO Mode:** Runs automatically until completion sigil or max iterations. Use for low-risk tasks.

## Testing

Use `bun test` for core/server packages:

```ts
import { test, expect } from "bun:test";

test("example", () => {
  expect(1).toBe(1);
});
```

Use Vitest for React component tests in the web package.
