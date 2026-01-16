# Flow 2: Technical Specifications

> Technical specifications for the Planning flow including API contracts, data schemas, and component responsibilities.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Planning Architecture                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │                    Web Client (React)                    │        │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │        │
│  │  │ Planning.tsx│  │  app-store  │  │  WebSocket.ts   │  │        │
│  │  │   (View)    │  │  (Zustand)  │  │   (Events)      │  │        │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │        │
│  │         │                │                   │           │        │
│  └─────────┼────────────────┼───────────────────┼───────────┘        │
│            │                │                   │                    │
│       HTTP │                │ State        WS   │                    │
│            │                │                   │                    │
│  ┌─────────┼────────────────┼───────────────────┼───────────┐        │
│  │         ↓                ↓                   ↓           │        │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │        │
│  │  │  planning   │  │   Hono      │  │   WebSocket     │  │        │
│  │  │   routes    │  │   Server    │  │   Handler       │  │        │
│  │  └──────┬──────┘  └─────────────┘  └────────┬────────┘  │        │
│  │         │                                    │           │        │
│  │                    Server (Hono)                         │        │
│  └─────────┼────────────────────────────────────┼───────────┘        │
│            │                                    │                    │
│            │         Orchestrator               │                    │
│            ↓                ↓                   ↓                    │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │                     @pokeralph/core                      │        │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │        │
│  │  │ PlanService │  │ClaudeBridge │  │  FileManager    │  │        │
│  │  │             │──│             │  │                 │  │        │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │        │
│  │                                                          │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### Frontend Components

#### `Planning.tsx` (packages/web/src/views/Planning.tsx)

**Responsibilities:**
- Manages UI stage transitions (input → conversation → review → confirm)
- Maintains local chat message history
- Syncs with WebSocket planning events
- Handles API calls for planning operations

**Key State:**
```typescript
type PlanningStage = "input" | "conversation" | "review" | "confirm";

interface ChatMessage {
  type: "claude" | "user";
  content: string;
  timestamp: Date;
}
```

**Key Hooks:**
- `usePlanningState()` - Gets planning state from Zustand
- `usePendingQuestion()` - Gets pending question from Zustand
- `usePlanningOutput()` - Gets conversation output array

#### `app-store.ts` (packages/web/src/stores/app-store.ts)

**Planning Session State:**
```typescript
interface PlanningSession {
  state: PlanningState;           // "idle" | "planning" | "waiting_input" | "completed"
  pendingQuestion: string | null; // Question Claude is asking
  conversationOutput: string[];   // Array of Claude outputs
}
```

**Planning Actions:**
- `setPlanningState(state)` - Update planning state
- `setPendingQuestion(question)` - Set pending question
- `addPlanningOutput(output)` - Append Claude output
- `clearPlanningSession()` - Reset to initial state

#### `websocket.ts` (packages/web/src/api/websocket.ts)

**Planning Events Handled:**
- `planning_output` - Adds output to store
- `planning_question` - Sets waiting_input state + pendingQuestion
- `planning_completed` - Sets completed state

### Backend Components

#### `planning.ts` (packages/server/src/routes/planning.ts)

**Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/planning/status | Get current planning state |
| POST | /api/planning/start | Start new planning session |
| POST | /api/planning/answer | Send answer to Claude's question |
| POST | /api/planning/finish | Extract PRD from conversation |
| POST | /api/planning/breakdown | Refine PRD tasks using Claude |
| POST | /api/planning/reset | Reset planning session |

#### `plan-service.ts` (packages/core/src/services/plan-service.ts)

**Responsibilities:**
- Manages planning state machine
- Runs Claude in plan mode via ClaudeBridge
- Detects questions in Claude's output
- Parses PRD JSON from output
- Emits events for WebSocket broadcast

**Key Methods:**
- `startPlanning(idea)` - Initialize planning with user idea
- `answerQuestion(answer)` - Send answer, continue conversation
- `finishPlanning()` - Parse PRD from output buffer
- `detectQuestion(output)` - Detect if Claude is asking something
- `parsePRDOutput(raw)` - Extract PRD JSON from text
- `reset()` - Clear state and kill Claude process

## API Contracts

### GET /api/planning/status

**Response:**
```typescript
interface PlanningStatusResponse {
  state: "idle" | "planning" | "waiting_input" | "completed";
  pendingQuestion: string | null;
  isPlanning: boolean;
}
```

### POST /api/planning/start

**Request:**
```typescript
{
  idea: string; // min 1 character
}
```

**Response:**
```typescript
{
  message: "Planning session started";
  idea: string;
  state: string;
}
```

**Errors:**
- 409 `PLANNING_IN_PROGRESS` - Session already active
- 400 `VALIDATION_ERROR` - Invalid idea

### POST /api/planning/answer

**Request:**
```typescript
{
  answer: string; // min 1 character
}
```

**Response:**
```typescript
{
  message: "Answer sent";
  state: string;
}
```

**Errors:**
- 409 `NOT_WAITING_INPUT` - Not expecting input

### POST /api/planning/finish

**Response:**
```typescript
{
  message: "Planning completed successfully";
  prd: PRD;
}
```

**Errors:**
- 409 `NO_PLANNING_SESSION` - No session to finish
- 500 `PLANNING_FINISH_FAILED` - PRD parse failed

### POST /api/planning/breakdown

**Purpose:** Refine PRD tasks using Claude. Replaces existing tasks with more detailed breakdown.

**Response:**
```typescript
{
  message: "Tasks refined successfully";
  tasks: Task[];
  prd: PRD;
}
```

**Errors:**
- 409 `NO_PRD` - No PRD exists to break down
- 500 `BREAKDOWN_FAILED` - Claude task generation failed

### POST /api/planning/reset

**Response:**
```typescript
{
  message: "Planning session reset";
  state: "idle";
}
```

## PRD Schema

> **Note:** Tasks are now REQUIRED during planning. Claude must generate at least one task, and the PRD validation will reject PRDs without tasks.

```typescript
interface PRD {
  name: string;        // Project name
  description: string; // Project description
  createdAt: string;   // ISO timestamp
  tasks: Task[];       // Array of tasks (REQUIRED, min 1)
  metadata: {
    version: string;
    generatedBy: string;
    originalIdea?: string;
  };
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: number;
  acceptanceCriteria: string[];
  iterations: Iteration[];
  createdAt: string;
  updatedAt: string;
}

enum TaskStatus {
  Pending = "pending",
  Planning = "planning",
  InProgress = "in_progress",
  Paused = "paused",
  Completed = "completed",
  Failed = "failed",
}
```

## WebSocket Event Payloads

### planning_output

```typescript
interface PlanningOutputPayload {
  output: string; // Text chunk from Claude
}
```

### planning_question

```typescript
interface PlanningQuestionPayload {
  question: string; // Detected question text
}
```

### planning_completed

```typescript
// Empty payload
type PlanningCompletedPayload = Record<string, never>;
```

## Configuration

### Timeouts

From `packages/web/src/api/client.ts`:

```typescript
const DEFAULT_TIMEOUT_MS = 30000;    // 30 seconds - standard requests
const CLAUDE_TIMEOUT_MS = 300000;    // 5 minutes - Claude operations
```

### WebSocket

From `packages/web/src/api/websocket.ts`:

```typescript
interface WebSocketClientOptions {
  url?: string;                  // Default: ws://localhost:3456/ws
  autoReconnect?: boolean;       // Default: true
  reconnectDelay?: number;       // Default: 1000ms
  maxReconnectAttempts?: number; // Default: 10
  heartbeatInterval?: number;    // Default: 25000ms
}
```

## Question Detection Patterns

From `plan-service.ts:573-638`:

**Explicit Question Patterns:**
```typescript
const questionPatterns = [
  /(?:^|\n)\**(?:What|How|Which|Could you|Can you|Would you|Do you|Does|Is|Are|Should|Will)\**[^?]*\?/gm,
  /(?:I'd like to know|I need to understand|Could you clarify|Please tell me|Can you specify)[^?]*\?/gm,
  /(?:^|\n)\**\d+\.\**\s*[^?]*\?/gm,
  /(?:^|\n)[^?\n]*[-:]\s*[^?\n]*\?/gm,
];
```

**Implicit Question Patterns:**
```typescript
const implicitQuestionPatterns = [
  /(?:Here's what I need to understand|I need to understand|I'd like to understand|Let me understand)/i,
  /(?:Once you answer|After you answer|When you answer|Please answer|Please provide|Please tell me|Please clarify)/i,
  /(?:I have (?:some|a few|several) questions|Here are (?:my|some|a few) questions)/i,
  /(?:Could you (?:provide|share|tell|clarify|explain)|Would you (?:like|prefer))/i,
  /(?:What (?:would you|do you) prefer|Which (?:would you|do you) prefer)/i,
];
```

## File Storage

PRD is stored at:
```
{workingDir}/.pokeralph/prd.json
```

Created/updated by `FileManager.savePRD()`.
