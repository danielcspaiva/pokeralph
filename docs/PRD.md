# PokéRalph PRD

> A Ralph loop orchestrator with a Pokémon Game Boy-themed interface. Transforms autonomous development with Claude Code into a gamified experience where each task is a battle.

**Version:** 0.1.0
**Status:** Draft
**Last updated:** January 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Monorepo Structure](#monorepo-structure)
5. [Data Persistence](#data-persistence)
6. [Execution Modes](#execution-modes)
7. [Tasks](#tasks)
8. [Default Configuration](#default-configuration)
9. [Version Roadmap](#version-roadmap)
10. [Implementation Notes](#implementation-notes)

---

## Overview

PokéRalph is a development tool that orchestrates Claude Code in autonomous loops (Ralph technique). The main flow is:

1. **Planning:** User describes an idea → Claude refines in Plan Mode → PRD generated
2. **Breakdown:** PRD is broken into individual tasks
3. **Battle:** Each task is executed in a Ralph loop (a "battle")
4. **Progress:** Interface shows real-time progress via file polling

The v0.1 interface is a functional wireframe. The Pokémon theme (pixel art, animations, sounds) will be added in v0.4.

---

## Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Runtime** | Bun | Fast, native TypeScript, integrated workspaces |
| **Monorepo** | Bun workspaces | Simplicity, no extra tools |
| **Language** | TypeScript (strict) | Type safety throughout the project |
| **Server** | Hono | Lightweight, portable (Bun/Deno/Edge), modern |
| **Frontend** | React + Vite | Fast SPA, easy to embed later |
| **State** | Zustand | Simple, no boilerplate |
| **Linting** | Biome | Unified lint + format, fast |
| **Tests** | Bun test + Vitest | Bun test for core/server, Vitest for React |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    INTERFACES (UI)                       │
├─────────────┬─────────────┬──────────────┬──────────────┤
│   Web App   │   Desktop   │    Mobile    │     CLI      │
│ React+Vite  │   Tauri v2  │ React Native │  Ink/OpenTUI │
│   (v0.1)    │   (v0.3)    │   (future)   │    (v0.2)    │
└──────┬──────┴──────┬──────┴──────┬───────┴──────┬───────┘
       └─────────────┴──────┬──────┴──────────────┘
                            │ HTTP / WebSocket
┌───────────────────────────▼─────────────────────────────┐
│                  @pokeralph/server                       │
│              REST API + WebSocket (Hono)                 │
│           Runs locally, all UIs connect                  │
└───────────────────────────┬─────────────────────────────┘
                            │ imports
┌───────────────────────────▼─────────────────────────────┐
│                   @pokeralph/core                        │
│            Business logic (100% portable)                │
│     Types, Claude bridge, Loop controller, Services      │
└─────────────────────────────────────────────────────────┘
```

### Principles

- **Core is pure:** Zero UI dependencies, runs in any environment
- **Server is the bridge:** All UIs connect via HTTP/WebSocket
- **UIs are interchangeable:** Web, desktop, CLI, mobile - all use the same server
- **Polling, not streaming:** Claude writes to files, app monitors via polling

---

## Monorepo Structure

```
pokeralph/
├── package.json              # Workspace root
├── bunfig.toml               # Bun configuration
├── tsconfig.json             # Base TypeScript
├── biome.json                # Linting + formatting
├── .gitignore
│
├── packages/
│   ├── core/                 # @pokeralph/core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── types/        # Interfaces and types
│   │   │   ├── services/     # Business services
│   │   │   ├── utils/        # Pure helpers
│   │   │   ├── orchestrator.ts
│   │   │   └── index.ts      # Public exports
│   │   └── tests/
│   │
│   ├── server/               # @pokeralph/server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── routes/       # REST endpoints
│   │   │   ├── websocket/    # WebSocket handler
│   │   │   ├── middleware/
│   │   │   └── index.ts      # Entry point
│   │   └── tests/
│   │
│   └── web/                  # @pokeralph/web
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── components/   # React components
│           ├── views/        # Main views
│           ├── hooks/        # Custom hooks
│           ├── stores/       # Zustand stores
│           ├── api/          # HTTP + WebSocket client
│           ├── App.tsx
│           └── main.tsx
│
└── tests/
    └── e2e/                  # End-to-end tests
```

---

## Data Persistence

Data is persisted in the user's repository, in the `.pokeralph/` folder:

```
.pokeralph/
├── config.json               # Project configuration
├── prd.json                  # PRD with tasks and status
│
└── battles/                  # Battle history
    └── {task-id}/
        ├── progress.json     # Current progress (polling)
        ├── history.json      # Array of iterations
        └── logs/
            ├── iteration-1.txt
            ├── iteration-2.txt
            └── ...
```

### Schemas

**config.json:**
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

**prd.json:**
```json
{
  "name": "Project Name",
  "description": "Description",
  "createdAt": "2025-01-15T10:00:00Z",
  "tasks": [
    {
      "id": "001-task-name",
      "title": "Task Title",
      "description": "Detailed description",
      "status": "pending",
      "priority": 1,
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
      "createdAt": "2025-01-15T10:00:00Z",
      "updatedAt": "2025-01-15T10:00:00Z"
    }
  ]
}
```

**progress.json:**
```json
{
  "taskId": "001-task-name",
  "currentIteration": 3,
  "status": "in_progress",
  "lastUpdate": "2025-01-15T10:30:00Z",
  "logs": [
    "Exploring codebase...",
    "Implementing function X...",
    "Running tests..."
  ]
}
```

---

## Execution Modes

### HITL (Human in the Loop)

- After each iteration, waits for user approval
- User can review output, approve, or cancel
- Recommended for high-risk tasks and architecture

### YOLO Mode

- Executes automatically until completion or max iterations reached
- Detects completion sigil: `<promise>COMPLETE</promise>`
- Recommended for low-risk tasks

---

## Tasks

### Phase 1: Infrastructure (Tasks 1-2)

#### Task 001: Monorepo setup with Bun workspaces

**Priority:** 1
**Risk:** Low
**Estimate:** 3 iterations

**Description:**
Create base monorepo structure with all packages configured.

**Acceptance Criteria:**
- [ ] Initialize repo with `bun init`
- [ ] Configure workspaces in package.json: `packages/*`
- [ ] Create packages/core with package.json (`@pokeralph/core`)
- [ ] Create packages/server with package.json (`@pokeralph/server`)
- [ ] Create packages/web with package.json (`@pokeralph/web`)
- [ ] Base tsconfig.json at root with strict mode
- [ ] Each package extends base tsconfig
- [ ] biome.json configured for lint + format
- [ ] Root scripts: dev, build, test, lint, typecheck
- [ ] `bun run dev` runs server + web simultaneously
- [ ] `bun run test` runs tests for all packages
- [ ] Verify that imports between packages work

---

#### Task 002: Define core types in @pokeralph/core

**Priority:** 2
**Risk:** Low
**Estimate:** 2 iterations

**Description:**
Create all TypeScript interfaces for the application domain.

**Acceptance Criteria:**
- [ ] `src/types/prd.ts`: Interface PRD { name, description, tasks[], metadata }
- [ ] `src/types/task.ts`: Interface Task { id, title, description, status, priority, acceptanceCriteria[], iterations[], createdAt, updatedAt }
- [ ] `src/types/task.ts`: Enum TaskStatus { pending, planning, in_progress, paused, completed, failed }
- [ ] `src/types/config.ts`: Interface Config { maxIterationsPerTask, mode, feedbackLoops[], timeoutMinutes, pollingIntervalMs, autoCommit }
- [ ] `src/types/progress.ts`: Interface Progress { taskId, currentIteration, status, lastUpdate, logs[] }
- [ ] `src/types/iteration.ts`: Interface Iteration { number, startedAt, endedAt?, output, result, filesChanged[] }
- [ ] `src/types/battle.ts`: Interface Battle { taskId, status, iterations[], startedAt, completedAt? }
- [ ] `src/types/events.ts`: Types for system events
- [ ] `src/types/index.ts`: Re-exports all types
- [ ] All types with JSDoc documenting each field
- [ ] Type tests (type assertions) to validate schemas

---

### Phase 2: Core Services (Tasks 3-11)

#### Task 003: FileManager service in @pokeralph/core

**Priority:** 3
**Risk:** Medium
**Estimate:** 4 iterations

**Description:**
Service responsible for all file I/O in the .pokeralph folder

**Acceptance Criteria:**
- [ ] `src/services/file-manager.ts`: FileManager class
- [ ] constructor(basePath: string) defines repo root
- [ ] getPokeRalphPath() returns .pokeralph folder path
- [ ] init() creates folder structure if it doesn't exist
- [ ] exists() checks if .pokeralph exists
- [ ] loadConfig(): Config reads and validates config.json
- [ ] saveConfig(config: Config) writes config.json
- [ ] loadPRD(): PRD reads and validates prd.json
- [ ] savePRD(prd: PRD) writes prd.json
- [ ] createBattleFolder(taskId: string) creates battle folder
- [ ] loadProgress(taskId: string): Progress reads progress.json
- [ ] saveProgress(taskId: string, progress: Progress) writes progress.json
- [ ] loadBattleHistory(taskId: string): Battle reads history.json
- [ ] appendIteration(taskId: string, iteration: Iteration) adds to history
- [ ] writeIterationLog(taskId: string, iterationNum: number, log: string) saves log
- [ ] Validation with Zod schemas for all reads
- [ ] Consistent error handling (FileNotFoundError, ValidationError)
- [ ] Unit tests with temporary folder for each test

---

#### Task 004: PromptBuilder service in @pokeralph/core

**Priority:** 4
**Risk:** Medium
**Estimate:** 3 iterations

**Description:**
Builds optimized prompts for Claude Code in different contexts.

**Acceptance Criteria:**
- [ ] `src/services/prompt-builder.ts`: PromptBuilder class
- [ ] buildPlanningPrompt(idea: string): string to start plan mode
- [ ] buildTaskPrompt(task: Task, context: TaskContext): string to execute task
- [ ] TaskContext includes: summarized PRD, current progress, relevant files
- [ ] Task prompt includes instruction to update progress.json
- [ ] Task prompt includes expected output format
- [ ] Prompt includes completion sigil: `<promise>COMPLETE</promise>`
- [ ] Prompt includes instruction for feedback loops to run
- [ ] Prompt includes instruction to commit after success
- [ ] buildBreakdownPrompt(prd: string): string to break PRD into tasks
- [ ] Templates are well-documented constants
- [ ] Tests verifying structure of generated prompts

---

#### Task 005: ClaudeBridge service in @pokeralph/core

**Priority:** 5
**Risk:** High
**Estimate:** 5 iterations

**Description:**
Bridge that spawns Claude Code CLI and monitors execution via file polling.

**Acceptance Criteria:**
- [ ] `src/services/claude-bridge.ts`: ClaudeBridge class
- [ ] constructor(options: ClaudeBridgeOptions) with workingDir, timeout, etc
- [ ] spawnPlanMode(prompt: string): ChildProcess starts claude in plan mode
- [ ] spawnExecutionMode(prompt: string): ChildProcess starts with acceptEdits
- [ ] buildCommand(mode: 'plan' | 'execute', prompt: string): string[]
- [ ] Uses Bun.spawn() to create child process
- [ ] kill() kills current process
- [ ] isRunning(): boolean checks if process is active
- [ ] onExit(callback) handler for when process terminates
- [ ] Captures stdout/stderr for logs
- [ ] Configurable timeout that kills process
- [ ] Tests with Claude Code mock (fake script that simulates behavior)

---

#### Task 006: ProgressWatcher service in @pokeralph/core

**Priority:** 6
**Risk:** Medium
**Estimate:** 3 iterations

**Description:**
Monitors progress files via polling and emits events.

**Acceptance Criteria:**
- [ ] `src/services/progress-watcher.ts`: ProgressWatcher class extends EventEmitter
- [ ] constructor(fileManager: FileManager, intervalMs: number)
- [ ] watch(taskId: string) starts polling task's progress.json
- [ ] stop() stops polling
- [ ] Emits 'progress' event when file changes
- [ ] Emits 'complete' event when completion sigil detected
- [ ] Emits 'error' event when error detected in progress
- [ ] Debounce to avoid emitting duplicate events
- [ ] Compares file hash to detect real changes
- [ ] Tests with files that change during execution

---

#### Task 007: FeedbackRunner service in @pokeralph/core

**Priority:** 7
**Risk:** Medium
**Estimate:** 3 iterations

**Description:**
Executes feedback loops (test, lint, typecheck) and reports results.

**Acceptance Criteria:**
- [ ] `src/services/feedback-runner.ts`: FeedbackRunner class
- [ ] constructor(workingDir: string)
- [ ] detectAvailableLoops(): string[] discovers scripts in package.json
- [ ] runLoop(name: string): FeedbackResult executes a specific loop
- [ ] runAll(loops: string[]): FeedbackResult[] executes multiple loops
- [ ] FeedbackResult: { name, passed, output, duration }
- [ ] Supports: test, lint, typecheck, format:check
- [ ] Timeout per loop (configurable)
- [ ] Captures complete stdout/stderr
- [ ] Detects exit code for pass/fail
- [ ] Tests with fake package.json

---

#### Task 008: GitService in @pokeralph/core

**Priority:** 8
**Risk:** Low
**Estimate:** 3 iterations

**Description:**
Manages Git operations (commit, status, revert).

**Acceptance Criteria:**
- [ ] `src/services/git-service.ts`: GitService class
- [ ] constructor(workingDir: string)
- [ ] isRepo(): boolean checks if it's a git repo
- [ ] init(): void initializes repo if it doesn't exist
- [ ] status(): GitStatus returns modified files
- [ ] add(files: string[] | 'all') adds files to stage
- [ ] commit(message: string): string returns commit hash
- [ ] getLastCommit(): CommitInfo returns last commit info
- [ ] revert(): void undoes last commit (soft reset)
- [ ] Formatted commit message: `[PokéRalph] {taskId}: {title}`
- [ ] Automatically ignores .pokeralph/battles/
- [ ] Uses Bun.spawn() with git commands
- [ ] Tests with temporary repo

---

#### Task 009: LoopController service in @pokeralph/core

**Priority:** 9
**Risk:** High
**Estimate:** 6 iterations

**Description:**
Orchestrates the complete Ralph loop for a task.

**Acceptance Criteria:**
- [ ] `src/services/loop-controller.ts`: LoopController class extends EventEmitter
- [ ] constructor(dependencies: { fileManager, claudeBridge, progressWatcher, feedbackRunner, gitService, promptBuilder })
- [ ] startBattle(taskId: string, mode: 'hitl' | 'yolo'): void starts execution
- [ ] Implements loop: prompt → execute → poll → feedback → commit → repeat
- [ ] Respects maxIterations from config
- [ ] Detects completion sigil and stops loop
- [ ] Detects failures and marks task as failed
- [ ] pause(): void pauses after current iteration
- [ ] resume(): void resumes paused execution
- [ ] cancel(): void cancels and marks as failed
- [ ] In HITL mode: emits 'await_approval' and waits for approve()
- [ ] approve(): void continues after HITL pause
- [ ] Emits events: battle_start, iteration_start, iteration_end, feedback_result, battle_complete, battle_failed, await_approval
- [ ] Persists state between iterations via FileManager
- [ ] Recovers state if restarted mid-execution
- [ ] E2E tests with Claude mock

---

#### Task 010: PlanService in @pokeralph/core

**Priority:** 10
**Risk:** High
**Estimate:** 5 iterations

**Description:**
Manages planning phase and PRD generation.

**Acceptance Criteria:**
- [ ] `src/services/plan-service.ts`: PlanService class extends EventEmitter
- [ ] constructor(dependencies: { claudeBridge, promptBuilder, fileManager })
- [ ] startPlanning(idea: string): void starts plan mode
- [ ] Internal state: planning, waiting_input, completed
- [ ] Emits 'output' with Claude streaming
- [ ] Emits 'question' when Claude asks a question
- [ ] answerQuestion(answer: string): void sends response
- [ ] finishPlanning(): PRD finalizes and extracts PRD
- [ ] breakIntoTasks(prd: PRD): Task[] breaks PRD into tasks
- [ ] Can use new Claude instance for breakdown
- [ ] savePRD(prd: PRD): void persists via FileManager
- [ ] Tests with conversation mocks

---

#### Task 011: Main Orchestrator class in @pokeralph/core

**Priority:** 11
**Risk:** Medium
**Estimate:** 4 iterations

**Description:**
Facade that unifies all services and exposes clean API.

**Acceptance Criteria:**
- [ ] `src/orchestrator.ts`: Orchestrator class
- [ ] constructor(workingDir: string) initializes all services
- [ ] init(): void initializes .pokeralph if needed
- [ ] getConfig(): Config returns current config
- [ ] updateConfig(partial: Partial<Config>): void updates config
- [ ] getPRD(): PRD | null returns current PRD
- [ ] startPlanning(idea: string): void delegates to PlanService
- [ ] onPlanningOutput(callback): void
- [ ] onPlanningQuestion(callback): void
- [ ] answerPlanningQuestion(answer: string): void
- [ ] finishPlanning(): PRD
- [ ] getTasks(): Task[] returns all tasks
- [ ] getTask(id: string): Task | null
- [ ] addTask(task: Omit<Task, 'id'>): Task adds task to PRD
- [ ] updateTask(id: string, partial: Partial<Task>): Task
- [ ] startBattle(taskId: string): void delegates to LoopController
- [ ] pauseBattle(): void
- [ ] resumeBattle(): void
- [ ] cancelBattle(): void
- [ ] approveBattle(): void for HITL
- [ ] onBattleEvent(event: string, callback): void
- [ ] getBattleProgress(taskId: string): Progress | null
- [ ] getBattleHistory(taskId: string): Battle | null
- [ ] Singleton or factory pattern
- [ ] `src/index.ts` exports Orchestrator and all types
- [ ] Integration tests of complete flow

---

### Phase 3: Server (Tasks 12-17)

#### Task 012: Hono server setup in @pokeralph/server

**Priority:** 12
**Risk:** Low
**Estimate:** 2 iterations

**Description:**
Configure HTTP server with Hono and route structure.

**Acceptance Criteria:**
- [ ] `src/index.ts`: Entry point that starts server
- [ ] Uses Hono with Bun adapter
- [ ] CORS configured for localhost
- [ ] Logging middleware
- [ ] Error handling middleware
- [ ] `src/routes/index.ts`: Groups all routes
- [ ] Configurable port via env PORT (default 3456)
- [ ] Health check at GET /health
- [ ] Graceful shutdown
- [ ] Instantiates Orchestrator from @pokeralph/core
- [ ] Test with bun run (server) and curl

---

#### Task 013: Configuration routes in @pokeralph/server

**Priority:** 13
**Risk:** Low
**Estimate:** 2 iterations

**Description:**
Endpoints to read and update configuration.

**Acceptance Criteria:**
- [ ] `src/routes/config.ts`: Config router
- [ ] GET /api/config returns current config
- [ ] PUT /api/config updates config (validation with Zod)
- [ ] Returns 400 if validation fails
- [ ] Integration tests

---

#### Task 014: PRD/Tasks routes in @pokeralph/server

**Priority:** 14
**Risk:** Low
**Estimate:** 3 iterations

**Description:**
Endpoints to manage PRD and tasks.

**Acceptance Criteria:**
- [ ] `src/routes/prd.ts`: PRD router
- [ ] GET /api/prd returns complete PRD
- [ ] PUT /api/prd updates entire PRD
- [ ] GET /api/tasks returns array of tasks
- [ ] GET /api/tasks/:id returns specific task
- [ ] POST /api/tasks creates new task
- [ ] PUT /api/tasks/:id updates task
- [ ] DELETE /api/tasks/:id removes task
- [ ] Validation with Zod on all endpoints
- [ ] Integration tests

---

#### Task 015: Planning routes in @pokeralph/server

**Priority:** 15
**Risk:** Medium
**Estimate:** 3 iterations

**Description:**
Endpoints for planning phase.

**Acceptance Criteria:**
- [ ] `src/routes/planning.ts`: Planning router
- [ ] POST /api/planning/start { idea } starts plan mode
- [ ] POST /api/planning/answer { answer } answers question
- [ ] POST /api/planning/finish finalizes and returns PRD
- [ ] GET /api/planning/status returns current state
- [ ] Returns 409 if planning already in progress
- [ ] Integration tests

---

#### Task 016: Battle routes in @pokeralph/server

**Priority:** 16
**Risk:** Medium
**Estimate:** 3 iterations

**Description:**
Endpoints to control task execution.

**Acceptance Criteria:**
- [ ] `src/routes/battle.ts`: Battle router
- [ ] POST /api/battle/start/:taskId starts battle
- [ ] POST /api/battle/pause pauses current battle
- [ ] POST /api/battle/resume resumes battle
- [ ] POST /api/battle/cancel cancels battle
- [ ] POST /api/battle/approve approves iteration (HITL)
- [ ] GET /api/battle/current returns ongoing battle
- [ ] GET /api/battle/:taskId/progress returns progress
- [ ] GET /api/battle/:taskId/history returns history
- [ ] Returns 409 if battle already in progress
- [ ] Returns 404 if task doesn't exist
- [ ] Integration tests

---

#### Task 017: WebSocket for real-time events

**Priority:** 17
**Risk:** Medium
**Estimate:** 3 iterations

**Description:**
WebSocket that emits Orchestrator events to clients.

**Acceptance Criteria:**
- [ ] `src/websocket/index.ts`: WebSocket setup with Hono
- [ ] Endpoint /ws accepts connections
- [ ] Listens to Orchestrator events and re-emits to clients
- [ ] Events: planning_output, planning_question, battle_start, iteration_start, iteration_end, progress_update, feedback_result, battle_complete, battle_failed, await_approval
- [ ] Format: { type: string, payload: any, timestamp: string }
- [ ] Broadcast to all connected clients
- [ ] Heartbeat/ping to detect dead connections
- [ ] Tests with fake WebSocket client

---

### Phase 4: Frontend (Tasks 18-26)

#### Task 018: React app setup in @pokeralph/web

**Priority:** 18
**Risk:** Low
**Estimate:** 2 iterations

**Description:**
Configure React + Vite + TypeScript project.

**Acceptance Criteria:**
- [ ] Initialize with Vite template react-ts
- [ ] Configure path aliases (@/)
- [ ] Install dependencies: zustand, react-router-dom
- [ ] Remove default boilerplate
- [ ] `src/main.tsx`: Entry point
- [ ] `src/App.tsx`: Router setup
- [ ] `src/index.css`: Basic CSS reset
- [ ] API proxy in vite.config.ts (/api → localhost:3456)
- [ ] `bun run dev` runs on port 5173
- [ ] Build works without errors

---

#### Task 019: API and WebSocket client in @pokeralph/web

**Priority:** 19
**Risk:** Low
**Estimate:** 2 iterations

**Description:**
Modules for server communication.

**Acceptance Criteria:**
- [ ] `src/api/client.ts`: Fetch wrapper for REST endpoints
- [ ] Typed functions: getConfig, updateConfig, getPRD, getTasks, etc
- [ ] Consistent error handling
- [ ] `src/api/websocket.ts`: WebSocket client
- [ ] connect(): void establishes connection
- [ ] disconnect(): void closes connection
- [ ] on(event, callback): void registers listener
- [ ] off(event, callback): void removes listener
- [ ] Automatic reconnection if connection drops
- [ ] Unit tests with mocks

---

#### Task 020: State management with Zustand in @pokeralph/web

**Priority:** 20
**Risk:** Low
**Estimate:** 2 iterations

**Description:**
Global store for application state.

**Acceptance Criteria:**
- [ ] `src/stores/app-store.ts`: Main store
- [ ] State: config, prd, tasks, currentBattle, planningState
- [ ] Actions: setConfig, setPRD, updateTask, setBattleProgress, etc
- [ ] Selectors: useConfig, useTasks, useCurrentBattle, etc
- [ ] Integration with WebSocket for automatic updates
- [ ] Partial persist in localStorage (config only)
- [ ] Store tests

---

#### Task 021: Base layout and UI components

**Priority:** 21
**Risk:** Low
**Estimate:** 3 iterations

**Description:**
Wireframe visual structure of the app.

**Acceptance Criteria:**
- [ ] `src/components/Layout.tsx`: Main layout with sidebar + main
- [ ] `src/components/Sidebar.tsx`: Task list with status
- [ ] `src/components/Header.tsx`: Project name, mode, config button
- [ ] `src/components/TaskCard.tsx`: Task card in sidebar
- [ ] Visual status indicators: pending (gray), in_progress (yellow), completed (green), failed (red)
- [ ] Wireframe style: simple borders, neutral colors, no Pokémon theme yet
- [ ] Responsive: sidebar collapses on mobile
- [ ] CSS modules or Tailwind

---

#### Task 022: Dashboard/Home view

**Priority:** 22
**Risk:** Low
**Estimate:** 3 iterations

**Description:**
Initial screen with project overview.

**Acceptance Criteria:**
- [ ] `src/views/Dashboard.tsx`: Main view
- [ ] Shows: total tasks, completed, pending, in progress
- [ ] Task list with filters (All, Pending, Completed, Failed)
- [ ] Click on task opens details
- [ ] 'Start Next Battle' button starts next pending task
- [ ] 'New Idea' button goes to Planning
- [ ] Empty state if no PRD: shows call-to-action for Planning

---

#### Task 023: Planning Mode view

**Priority:** 23
**Risk:** Medium
**Estimate:** 4 iterations

**Description:**
Interface for planning phase with Claude.

**Acceptance Criteria:**
- [ ] `src/views/Planning.tsx`: Planning view
- [ ] Textarea to describe idea
- [ ] 'Start Planning' button calls API
- [ ] Chat area showing Claude output (streaming via WebSocket)
- [ ] When Claude asks question: shows input to answer
- [ ] 'Send Answer' button sends response
- [ ] Loading indicators during processing
- [ ] Preview of PRD being generated
- [ ] 'Finish Planning' button finalizes
- [ ] Review/edit PRD screen before confirming
- [ ] 'Confirm & Start' button saves PRD and goes to Dashboard

---

#### Task 024: Battle view (task execution)

**Priority:** 24
**Risk:** Medium
**Estimate:** 4 iterations

**Description:**
Interface during task execution.

**Acceptance Criteria:**
- [ ] `src/views/Battle.tsx`: Battle view
- [ ] Shows current task: title, description, acceptance criteria
- [ ] Progress bar: iteration X of Y
- [ ] Timer showing current iteration duration
- [ ] Log area showing Claude output (streaming)
- [ ] Feedback loop status: ✓ test, ✓ lint, ✗ typecheck
- [ ] Control buttons: Pause, Cancel
- [ ] In HITL mode: 'Approve & Continue' button appears after each iteration
- [ ] Loading animation during execution
- [ ] Success message with confetti on completion
- [ ] Error message if failed, with retry button

---

#### Task 025: Task History view

**Priority:** 25
**Risk:** Low
**Estimate:** 3 iterations

**Description:**
View battle history for a task.

**Acceptance Criteria:**
- [ ] `src/views/History.tsx`: History view
- [ ] Receives taskId as route parameter
- [ ] Vertical timeline of iterations
- [ ] Each iteration shows: number, duration, result (pass/fail)
- [ ] Expand iteration shows complete output
- [ ] List of files modified in iteration
- [ ] Link to commit if available
- [ ] 'Retry Task' button if task failed

---

#### Task 026: Configuration modal

**Priority:** 26
**Risk:** Low
**Estimate:** 2 iterations

**Description:**
Interface to adjust settings.

**Acceptance Criteria:**
- [ ] `src/components/ConfigModal.tsx`: Config modal
- [ ] Slider: maxIterationsPerTask (1-50)
- [ ] Toggle: HITL / YOLO mode
- [ ] Checkboxes: feedback loops (test, lint, typecheck, format)
- [ ] Number input: timeoutMinutes
- [ ] Number input: pollingIntervalMs
- [ ] Toggle: autoCommit
- [ ] Save button calls API and closes modal
- [ ] Cancel button closes without saving
- [ ] Inline input validation

---

### Phase 5: Finalization (Tasks 27-29)

#### Task 027: Dev script that runs everything together

**Priority:** 27
**Risk:** Low
**Estimate:** 2 iterations

**Description:**
Single command for local development.

**Acceptance Criteria:**
- [ ] Script `bun run dev` at monorepo root
- [ ] Runs server in background on port 3456
- [ ] Runs web with Vite on port 5173
- [ ] Both in watch mode (hot reload)
- [ ] Ctrl+C kills both processes
- [ ] Colored output identifying each process
- [ ] Uses concurrently or custom Bun script

---

#### Task 028: E2E tests of complete flow

**Priority:** 28
**Risk:** Medium
**Estimate:** 4 iterations

**Description:**
Tests that validate integration of all components.

**Acceptance Criteria:**
- [ ] `tests/e2e/` folder at root
- [ ] Test: create PRD via API, verify persistence
- [ ] Test: start battle, simulate progress, verify WebSocket events
- [ ] Test: HITL flow with manual approve
- [ ] Test: YOLO flow until completion
- [ ] Test: failed task marks status correctly
- [ ] Claude Code CLI mock for deterministic tests
- [ ] Script `bun run test:e2e` runs tests
- [ ] CI pipeline executing tests on PR

---

#### Task 029: Project documentation

**Priority:** 29
**Risk:** Low
**Estimate:** 2 iterations

**Description:**
README and docs for users and contributors.

**Acceptance Criteria:**
- [ ] README.md: Overview, features, screenshots
- [ ] README.md: Quick start (installation, first use)
- [ ] README.md: Available commands
- [ ] README.md: Configuration explained
- [ ] README.md: Architecture (diagram)
- [ ] CONTRIBUTING.md: How to contribute
- [ ] CONTRIBUTING.md: Development setup
- [ ] CONTRIBUTING.md: Code conventions
- [ ] LICENSE: MIT
- [ ] docs/ARCHITECTURE.md: Technical details

---

## Default Configuration

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

---

## Version Roadmap

### v0.1.0 - Core + Web (this PRD)

- Monorepo with Bun workspaces
- @pokeralph/core with all business logic
- @pokeralph/server with REST API + WebSocket
- @pokeralph/web with functional wireframe interface
- HITL and YOLO modes
- File polling for progress

### v0.2.0 - CLI Interface

- Command `pokeralph init` initializes project
- Command `pokeralph plan` starts planning in terminal
- Command `pokeralph battle` executes task
- Command `pokeralph status` shows overview
- TUI interface with Ink or OpenTUI
- Same core logic, different rendering

### v0.3.0 - Desktop App (Tauri)

- Native app for Mac/Windows/Linux
- Tauri v2 with React frontend
- Native system notifications
- System tray icon
- Auto-update

### v0.4.0 - Pokemon Theme

- Game Boy-style pixel art visuals
- Tasks as animated Pokémon battles
- HP bar = task progress
- Attacks = Claude actions
- 8-bit sound effects
- Each PRD = a gym
- Badge on PRD completion
- Pokédex of implemented features

### v0.5.0 - Integrations

- Pull tasks from GitHub Issues
- Pull tasks from Linear
- Sync status back to issue tracker
- Webhook for external notifications

---

## Implementation Notes

1. **This PRD was created to be executed by PokéRalph itself** (meta!)

2. **v0.1.0 focuses on functionality:** Core + server + web. Pokémon theme is v0.4.0 to avoid mixing complexity.

3. **High-risk tasks should be HITL:** Core services, Claude bridge, loop controller.

4. **Low-risk tasks can be YOLO:** Docs, polish, simple UI.

5. **Bun is the only runtime:** Workspaces, test, and execution.

6. **Hono was chosen for being lightweight and portable:** Works on Bun, Deno, edge.

7. **Layered architecture allows extension:** CLI, desktop, mobile can be added later without refactoring core.

8. **Completion sigil:** `<promise>COMPLETE</promise>` - Claude must emit this when task is complete.

---

## References

- [Ralph Wiggum - ghuntley.com](https://ghuntley.com/ralph/)
- [11 Tips for AI Coding with Ralph](https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum)
- [Getting Started with Ralph](https://www.aihero.dev/getting-started-with-ralph)
- [Claude Code Plan Mode](https://docs.anthropic.com/en/docs/claude-code/plan-mode)
- [Effective Harnesses for Long-Running Agents - Anthropic](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
