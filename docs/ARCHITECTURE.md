# PokéRalph Architecture

This document provides detailed technical documentation for the PokéRalph system architecture.

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Package Structure](#package-structure)
- [Core Services](#core-services)
- [Data Flow](#data-flow)
- [Data Persistence](#data-persistence)
- [API Reference](#api-reference)
- [WebSocket Events](#websocket-events)
- [Execution Modes](#execution-modes)

## Overview

PokéRalph is an autonomous development orchestrator that runs Claude Code in loops (the "Ralph technique"). The system is built as a monorepo with three packages that follow a clean layered architecture.

### Key Design Principles

1. **Core is pure**: The core package has zero UI dependencies and can run in any JavaScript environment
2. **Server is the bridge**: All user interfaces connect through HTTP/WebSocket
3. **Polling, not streaming**: Claude writes to files, the app monitors via polling
4. **Event-driven**: Services communicate through events, enabling loose coupling

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERFACES                          │
├─────────────┬─────────────┬──────────────┬─────────────────┤
│   Web App   │   Desktop   │    Mobile    │      CLI        │
│ React+Vite  │   Tauri v2  │ React Native │   Ink/OpenTUI   │
│   (v0.1)    │   (v0.3)    │   (future)   │     (v0.2)      │
└──────┬──────┴──────┬──────┴──────┬───────┴──────┬──────────┘
       └─────────────┴──────┬──────┴──────────────┘
                            │ HTTP / WebSocket
┌───────────────────────────▼────────────────────────────────┐
│                   @pokeralph/server                         │
│               REST API + WebSocket (Hono)                   │
│            Runs locally, all UIs connect here               │
└───────────────────────────┬────────────────────────────────┘
                            │ imports
┌───────────────────────────▼────────────────────────────────┐
│                    @pokeralph/core                          │
│             Business logic (100% portable)                  │
│      Types, Claude bridge, Loop controller, Services        │
└────────────────────────────────────────────────────────────┘
```

## Package Structure

### @pokeralph/core

The core package contains all business logic with zero external dependencies on UI frameworks.

```
packages/core/
├── src/
│   ├── types/              # Domain interfaces
│   │   ├── config.ts       # Config, ExecutionMode
│   │   ├── task.ts         # Task, TaskStatus
│   │   ├── prd.ts          # PRD, PRDMetadata
│   │   ├── progress.ts     # Progress, FeedbackResult
│   │   ├── iteration.ts    # Iteration, IterationResult
│   │   ├── battle.ts       # Battle, BattleStatus
│   │   ├── events.ts       # Event types
│   │   └── index.ts        # Re-exports
│   │
│   ├── services/           # Business services
│   │   ├── file-manager.ts
│   │   ├── prompt-builder.ts
│   │   ├── claude-bridge.ts
│   │   ├── progress-watcher.ts
│   │   ├── feedback-runner.ts
│   │   ├── git-service.ts
│   │   ├── battle-orchestrator.ts
│   │   ├── plan-service.ts
│   │   ├── schemas.ts      # Zod validation schemas
│   │   ├── errors.ts       # Custom error classes
│   │   └── index.ts        # Re-exports
│   │
│   ├── orchestrator.ts     # Main facade
│   └── index.ts            # Public API
│
└── tests/                  # Unit tests
```

### @pokeralph/server

The server package provides the HTTP and WebSocket API using Hono.

```
packages/server/
├── src/
│   ├── routes/             # REST endpoints
│   │   ├── config.ts       # GET/PUT /api/config
│   │   ├── prd.ts          # CRUD /api/prd, /api/prd/tasks
│   │   ├── planning.ts     # POST /api/planning/*
│   │   ├── battle.ts       # POST /api/battle/*
│   │   └── index.ts        # Route aggregation
│   │
│   ├── websocket/          # Real-time events
│   │   └── index.ts        # WebSocket handler
│   │
│   ├── middleware/         # Hono middleware
│   │   ├── error-handler.ts
│   │   └── index.ts
│   │
│   └── index.ts            # Entry point
│
└── tests/                  # Integration tests
```

### @pokeralph/web

The web package is a React SPA built with Vite.

```
packages/web/
└── src/
    ├── components/         # Reusable UI components
    │   ├── Layout.tsx
    │   ├── Sidebar.tsx
    │   ├── Header.tsx
    │   ├── TaskCard.tsx
    │   ├── ConfigModal.tsx
    │   └── index.ts
    │
    ├── views/              # Page components
    │   ├── Dashboard.tsx
    │   ├── Planning.tsx
    │   ├── Battle.tsx
    │   ├── History.tsx
    │   └── index.ts
    │
    ├── stores/             # Zustand state
    │   ├── app-store.ts
    │   └── index.ts
    │
    ├── api/                # Server communication
    │   ├── client.ts       # HTTP client
    │   ├── websocket.ts    # WebSocket client
    │   └── index.ts
    │
    ├── App.tsx             # Router setup
    └── main.tsx            # Entry point
```

## Core Services

### FileManager

Handles all file I/O for the `.pokeralph/` folder.

| Method | Description |
|--------|-------------|
| `init()` | Creates folder structure |
| `exists()` | Checks if `.pokeralph` exists |
| `loadConfig()` | Reads and validates config.json |
| `saveConfig(config)` | Writes config.json |
| `loadPRD()` | Reads and validates prd.json |
| `savePRD(prd)` | Writes prd.json |
| `createBattleFolder(taskId)` | Creates battle folder |
| `loadProgress(taskId)` | Reads progress.json |
| `saveProgress(taskId, progress)` | Writes progress.json |
| `loadBattleHistory(taskId)` | Reads history.json |
| `appendIteration(taskId, iteration)` | Adds iteration to history |
| `writeIterationLog(taskId, num, log)` | Saves iteration log |

### PromptBuilder

Constructs prompts for Claude Code in different contexts.

| Method | Description |
|--------|-------------|
| `buildPlanningPrompt(idea)` | Prompt for plan mode |
| `buildTaskPrompt(task, context)` | Prompt for task execution |
| `buildBreakdownPrompt(prd)` | Prompt for PRD breakdown |
| `summarizePRD(prd)` | Creates PRD summary |
| `getCompletionSigil()` | Returns `<promise>COMPLETE</promise>` |

### ClaudeBridge

Spawns and monitors Claude Code CLI processes.

| Method | Description |
|--------|-------------|
| `spawnPlanMode(prompt)` | Starts Claude in plan mode |
| `spawnExecutionMode(prompt)` | Starts with accept edits |
| `kill()` | Kills current process |
| `isRunning()` | Checks if process is active |
| `onOutput(callback)` | Registers stdout handler |
| `onError(callback)` | Registers stderr handler |
| `onExit(callback)` | Registers exit handler |

### ProgressWatcher

Monitors progress files via polling and emits events.

| Event | When Emitted |
|-------|--------------|
| `progress` | File changes detected |
| `complete` | `completionDetected` becomes true |
| `error` | `error` field becomes non-null |
| `feedback` | `feedbackResults` changes |

### FeedbackRunner

Executes feedback loops (test, lint, typecheck).

| Method | Description |
|--------|-------------|
| `detectAvailableLoops()` | Discovers scripts in package.json |
| `runLoop(name)` | Executes a specific loop |
| `runAll(loops)` | Executes multiple loops |
| `runAvailable()` | Runs all standard loops |

### GitService

Manages Git operations.

| Method | Description |
|--------|-------------|
| `isRepo()` | Checks if directory is a git repo |
| `init()` | Initializes repo if needed |
| `status()` | Returns modified files |
| `add(files)` | Stages files |
| `commit(message)` | Creates commit, returns hash |
| `revert()` | Undoes last commit |
| `formatCommitMessage(taskId, title)` | Formats as `[PokéRalph] taskId: title` |

### BattleOrchestrator

Orchestrates the complete Battle Loop for a task.

| Event | Payload |
|-------|---------|
| `battle_start` | `{ taskId, mode }` |
| `iteration_start` | `{ taskId, iteration }` |
| `iteration_end` | `{ taskId, iteration, result }` |
| `feedback_result` | `{ results }` |
| `await_approval` | `{ taskId, iteration }` |
| `battle_complete` | `{ taskId, iterations }` |
| `battle_failed` | `{ taskId, error }` |

### PlanService

Manages planning phase and PRD generation.

| State | Description |
|-------|-------------|
| `idle` | No planning session |
| `planning` | Claude is generating |
| `waiting_input` | Claude asked a question |
| `completed` | PRD generated |

### Orchestrator

Main facade that unifies all services.

```typescript
const orchestrator = Orchestrator.create(workingDir);

// Initialize
await orchestrator.init();

// Planning
orchestrator.startPlanning(idea);
orchestrator.onPlanningOutput(callback);
orchestrator.answerPlanningQuestion(answer);
const prd = orchestrator.finishPlanning();

// Tasks
const tasks = orchestrator.getTasks();
orchestrator.addTask({ title, description, ... });

// Battle
orchestrator.startBattle(taskId, mode);
orchestrator.pauseBattle();
orchestrator.resumeBattle();
orchestrator.approveBattle();
orchestrator.cancelBattle();
```

## Data Flow

### Battle Loop Flow

```
┌─────────────┐
│ Start Battle│
└──────┬──────┘
       │
       ▼
┌──────────────┐
│ Build Prompt │
└──────┬───────┘
       │
       ▼
┌───────────────┐
│ Spawn Claude  │
└───────┬───────┘
       │
       ▼
┌────────────────────┐    File changes
│ Poll progress.json │◄──────────────────┐
└────────┬───────────┘                   │
         │                               │
         ▼                               │
┌────────────────────┐              ┌────┴────┐
│ Completion sigil?  │──No──────────► Claude  │
└────────┬───────────┘              │ writes  │
         │ Yes                      └─────────┘
         ▼
┌────────────────────┐
│ Run feedback loops │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ All passed?        │──No──► Next iteration
└────────┬───────────┘
         │ Yes
         ▼
┌────────────────────┐
│ Auto-commit        │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ Battle complete    │
└────────────────────┘
```

### HITL vs YOLO

**HITL Mode**: After each iteration, the orchestrator emits `await_approval` and waits for `approveBattle()` to be called before continuing.

**YOLO Mode**: Runs automatically until:
- Completion sigil detected
- Max iterations reached
- Error occurs

## Data Persistence

All data is stored in `.pokeralph/` in the user's project:

```
.pokeralph/
├── config.json               # Project configuration
├── prd.json                  # PRD with tasks
│
└── battles/                  # Battle history
    └── {task-id}/
        ├── progress.json     # Current progress (polled)
        ├── history.json      # Completed iterations
        └── logs/
            ├── iteration-1.txt
            ├── iteration-2.txt
            └── ...
```

### Schema: config.json

```typescript
interface Config {
  maxIterationsPerTask: number;  // 1-50
  mode: "hitl" | "yolo";
  feedbackLoops: string[];       // ["test", "lint", "typecheck"]
  timeoutMinutes: number;
  pollingIntervalMs: number;
  autoCommit: boolean;
}
```

### Schema: prd.json

```typescript
interface PRD {
  name: string;
  description: string;
  createdAt: string;
  updatedAt?: string;
  metadata?: PRDMetadata;
  tasks: Task[];
}

interface Task {
  id: string;                    // "001-task-name"
  title: string;
  description: string;
  status: TaskStatus;
  priority: number;
  acceptanceCriteria: string[];
  createdAt: string;
  updatedAt: string;
}
```

### Schema: progress.json

```typescript
interface Progress {
  taskId: string;
  currentIteration: number;
  status: "pending" | "in_progress" | "completed" | "failed";
  lastUpdate: string;
  logs: string[];
  lastOutput: string;
  completionDetected: boolean;
  error: string | null;
  feedbackResults: Record<string, FeedbackResult>;
}
```

## API Reference

### Configuration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET | Get current config |
| `/api/config` | PUT | Update config |

### PRD & Tasks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/prd` | GET | Get PRD |
| `/api/prd` | PUT | Update PRD |
| `/api/prd/tasks` | GET | List all tasks |
| `/api/prd/tasks` | POST | Create task |
| `/api/prd/tasks/:id` | GET | Get task |
| `/api/prd/tasks/:id` | PUT | Update task |
| `/api/prd/tasks/:id` | DELETE | Delete task |

### Planning

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/planning/status` | GET | Get planning state |
| `/api/planning/start` | POST | Start planning |
| `/api/planning/answer` | POST | Answer question |
| `/api/planning/finish` | POST | Finish planning |
| `/api/planning/reset` | POST | Reset planning |

### Battle

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/battle/current` | GET | Get current battle |
| `/api/battle/start/:taskId` | POST | Start battle |
| `/api/battle/pause` | POST | Pause battle |
| `/api/battle/resume` | POST | Resume battle |
| `/api/battle/cancel` | POST | Cancel battle |
| `/api/battle/approve` | POST | Approve iteration |
| `/api/battle/:taskId/progress` | GET | Get progress |
| `/api/battle/:taskId/history` | GET | Get history |

## WebSocket Events

Connect to `/ws` for real-time events.

### Message Format

```typescript
interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: string;
}
```

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{ connectionId }` | Connection established |
| `planning_output` | `{ output }` | Claude output during planning |
| `planning_question` | `{ question }` | Claude asks a question |
| `planning_completed` | `{ prd }` | Planning finished |
| `battle_start` | `{ taskId, mode }` | Battle started |
| `iteration_start` | `{ taskId, iteration }` | Iteration started |
| `iteration_end` | `{ taskId, iteration, result }` | Iteration ended |
| `iteration_output` | `{ taskId, output }` | Claude output |
| `progress_update` | `{ taskId, progress }` | Progress changed |
| `feedback_result` | `{ results }` | Feedback loop results |
| `await_approval` | `{ taskId, iteration }` | Waiting for approval |
| `approval_received` | `{}` | Approval received |
| `battle_complete` | `{ taskId }` | Battle succeeded |
| `battle_failed` | `{ taskId, error }` | Battle failed |

## Execution Modes

### HITL (Human in the Loop)

Recommended for:
- High-risk tasks
- Architecture decisions
- Initial development

Flow:
1. Execute iteration
2. Show results to user
3. Wait for approval
4. Continue or cancel

### YOLO Mode

Recommended for:
- Low-risk tasks
- Documentation
- Simple bug fixes

Flow:
1. Execute iteration
2. Check completion sigil
3. If complete: finish
4. If not: continue until max iterations

### Completion Detection

Claude must emit this sigil when a task is complete:

```
<promise>COMPLETE</promise>
```

The ProgressWatcher detects this in `progress.json`:

```json
{
  "completionDetected": true
}
```
