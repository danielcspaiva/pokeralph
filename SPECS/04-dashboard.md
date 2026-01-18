# 04 - Dashboard Specification

## Purpose

The Dashboard is the main view for managing tasks in PokéRalph. It displays all tasks from the PRD, shows their status, and provides quick actions for starting battles, viewing history, and managing tasks.

## User Stories

### US-DB-1: View All Tasks
**As a** developer
**I want** to see all my tasks in one view
**So that** I can understand project progress at a glance

**Acceptance Criteria:**
- All tasks from PRD displayed
- Task status clearly indicated
- Sorted by priority by default
- Filter/search available

### US-DB-2: Start Battle from Dashboard
**As a** developer
**I want** to start a battle directly from the task card
**So that** I can quickly begin work

**Acceptance Criteria:**
- "Start Battle" button on each pending task
- Mode selector (HITL/YOLO) available
- Visual feedback when battle starts
- Navigate to battle view

### US-DB-3: View Task Details
**As a** developer
**I want** to see task details without leaving dashboard
**So that** I can make informed decisions

**Acceptance Criteria:**
- Expandable task cards
- Show description, acceptance criteria
- Show battle history summary
- Quick actions accessible

### US-DB-4: Filter and Sort Tasks
**As a** developer
**I want** to filter and sort tasks
**So that** I can focus on relevant work

**Acceptance Criteria:**
- Filter by status (pending, in_progress, completed, failed)
- Sort by priority, status, created date
- Search by title/description
- Remember filter preferences

## Current Behavior

The dashboard displays tasks in a grid layout with cards for each task. Each card shows:
- Task title and ID
- Current status with visual indicator
- Priority badge
- Quick action buttons

### Component Structure

```
Dashboard
├── DashboardHeader
│   ├── ProjectName
│   ├── TaskStats (X pending, Y completed, etc.)
│   └── ActionButtons (New Task, Refresh)
├── FilterBar
│   ├── StatusFilter (dropdown/pills)
│   ├── SortSelector
│   └── SearchInput
├── TaskGrid
│   └── TaskCard[] (mapped from tasks)
│       ├── TaskCardHeader (title, id, status badge)
│       ├── TaskCardBody (description preview)
│       ├── TaskCardMeta (priority, dates)
│       └── TaskCardActions (Start, History, Edit)
└── EmptyState (when no tasks)
```

## API Specification

### GET /api/tasks

Get all tasks from PRD.

**Response:**
```typescript
interface TasksResponse {
  tasks: Task[];
  stats: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
  };
}
```

---

### GET /api/tasks/{taskId}

Get a single task by ID.

**Response:**
```typescript
interface TaskResponse {
  task: Task;
  battle: Battle | null;
  progress: Progress | null;
}
```

**Errors:**
| Status | Code | Description |
|--------|------|-------------|
| 404 | `TASK_NOT_FOUND` | Task doesn't exist |

---

### PUT /api/tasks/{taskId}

Update a task.

**Request:**
```typescript
interface UpdateTaskRequest {
  title?: string;
  description?: string;
  priority?: number;
  acceptanceCriteria?: string[];
  status?: TaskStatus;
}
```

**Response:**
```typescript
interface UpdateTaskResponse {
  task: Task;
}
```

**Errors:**
| Status | Code | Description |
|--------|------|-------------|
| 404 | `TASK_NOT_FOUND` | Task doesn't exist |
| 400 | `INVALID_STATUS` | Cannot transition to status |
| 409 | `TASK_IN_BATTLE` | Cannot edit during battle |

---

### POST /api/tasks

Add a new task to PRD.

**Request:**
```typescript
interface AddTaskRequest {
  title: string;
  description: string;
  priority: number;
  acceptanceCriteria: string[];
}
```

**Response:**
```typescript
interface AddTaskResponse {
  task: Task;
}
```

**Errors:**
| Status | Code | Description |
|--------|------|-------------|
| 400 | `NO_PRD` | No PRD exists |
| 400 | `INVALID_TASK` | Missing required fields |

---

### DELETE /api/tasks/{taskId}

Delete a task from PRD.

**Response:**
```typescript
interface DeleteTaskResponse {
  success: boolean;
}
```

**Errors:**
| Status | Code | Description |
|--------|------|-------------|
| 404 | `TASK_NOT_FOUND` | Task doesn't exist |
| 409 | `TASK_IN_BATTLE` | Cannot delete during battle |

---

## UI Requirements

### Dashboard Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  PokéRalph - My Project                           [+ New Task]    │
│  ─────────────────────────────────────────────────────────────────│
│  📊 8 tasks: 3 pending | 1 in progress | 4 completed | 0 failed   │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Filter: [All ▼] [Pending] [In Progress] [Completed] [Failed]     │
│  Sort: [Priority ▼]  Search: [________________🔍]                  │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────┐  ┌──────────────────────┐               │
│  │ 001-setup-project    │  │ 002-auth-system      │               │
│  │ ═══════════════════  │  │ ═══════════════════  │               │
│  │ 🟢 Completed         │  │ 🟡 In Progress       │               │
│  │                      │  │                      │               │
│  │ Set up the monorepo  │  │ Implement user       │               │
│  │ with Bun workspaces  │  │ authentication with  │               │
│  │ and TypeScript...    │  │ JWT tokens...        │               │
│  │                      │  │                      │               │
│  │ Priority: 1          │  │ Priority: 2          │               │
│  │ Iterations: 3        │  │ Iterations: 2/10     │               │
│  │                      │  │                      │               │
│  │ [History] [Details]  │  │ [View Battle]        │               │
│  └──────────────────────┘  └──────────────────────┘               │
│                                                                    │
│  ┌──────────────────────┐  ┌──────────────────────┐               │
│  │ 003-api-endpoints    │  │ 004-frontend-ui      │               │
│  │ ═══════════════════  │  │ ═══════════════════  │               │
│  │ ⚪ Pending           │  │ ⚪ Pending           │               │
│  │                      │  │                      │               │
│  │ Create REST API      │  │ Build React          │               │
│  │ endpoints for CRUD   │  │ components for the   │               │
│  │ operations...        │  │ main UI...           │               │
│  │                      │  │                      │               │
│  │ Priority: 3          │  │ Priority: 4          │               │
│  │                      │  │                      │               │
│  │ [Start ▼] [Details]  │  │ [Start ▼] [Details]  │               │
│  └──────────────────────┘  └──────────────────────┘               │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Task Card Component

```
┌─────────────────────────────────────────┐
│ {task.id}                    {status}   │  <- Header
│ ═══════════════════════════════════════ │
│                                         │
│ {task.description.slice(0, 100)}...     │  <- Body (truncated)
│                                         │
│ Priority: {task.priority}               │  <- Meta
│ {battleInfo}                            │
│                                         │
│ [{Action1}] [{Action2}] [{Action3}]     │  <- Actions
└─────────────────────────────────────────┘
```

### Status Indicators

| Status | Color | Icon | Badge Text |
|--------|-------|------|------------|
| Pending | Gray | ⚪ | "Pending" |
| Planning | Blue | 📝 | "Planning" |
| In Progress | Yellow | 🟡 | "In Progress" |
| Paused | Orange | ⏸️ | "Paused" |
| Completed | Green | 🟢 | "Completed" |
| Failed | Red | 🔴 | "Failed" |

### Action Buttons by Status

| Status | Primary Action | Secondary Actions |
|--------|----------------|-------------------|
| Pending | Start Battle | Details, Edit, Delete |
| Planning | View Planning | Cancel |
| In Progress | View Battle | Pause, Cancel |
| Paused | Resume | Cancel, Details |
| Completed | View History | Retry, Details |
| Failed | Retry | View History, Details |

### Empty States

**No PRD:**
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              📋 No Project Defined Yet                  │
│                                                         │
│  Start by describing your project idea. PokéRalph      │
│  will help you create a PRD with tasks.                │
│                                                         │
│                [Start Planning →]                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**No Tasks Match Filter:**
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              🔍 No Tasks Found                          │
│                                                         │
│  No tasks match your current filters.                   │
│                                                         │
│                [Clear Filters]                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Task Details Modal

```
┌────────────────────────────────────────────────────────────┐
│  Task Details                                    [X Close] │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ID: 003-api-endpoints                                     │
│  Title: Create REST API Endpoints                          │
│  Status: Pending                                           │
│  Priority: 3                                               │
│                                                            │
│  ─────────────────────────────────────────────────────────│
│  Description:                                              │
│                                                            │
│  Create REST API endpoints for CRUD operations on the     │
│  main resources. Include proper error handling, input     │
│  validation, and response formatting.                     │
│                                                            │
│  ─────────────────────────────────────────────────────────│
│  Acceptance Criteria:                                      │
│                                                            │
│  ✓ GET /api/items returns all items                       │
│  ✓ POST /api/items creates new item                       │
│  ✓ PUT /api/items/:id updates item                        │
│  ✓ DELETE /api/items/:id deletes item                     │
│  ✓ Proper error responses (400, 404, 500)                 │
│                                                            │
│  ─────────────────────────────────────────────────────────│
│  Battle History:                                           │
│  No battles yet                                            │
│                                                            │
│  ─────────────────────────────────────────────────────────│
│  Created: Jan 15, 2025 at 10:00 AM                        │
│  Updated: Jan 15, 2025 at 10:00 AM                        │
│                                                            │
├────────────────────────────────────────────────────────────┤
│         [Delete]              [Edit]      [Start Battle]  │
└────────────────────────────────────────────────────────────┘
```

---

## Component States

### TaskCard States

| State | Visual | Actions Available |
|-------|--------|-------------------|
| `idle` | Normal card | All actions |
| `hover` | Elevated, subtle highlight | All actions |
| `loading` | Skeleton/spinner | None |
| `selected` | Border highlight | All actions |
| `disabled` | Grayed out | None |

### Filter States

| State | Description |
|-------|-------------|
| `all` | Show all tasks |
| `pending` | Only pending tasks |
| `in_progress` | Only in-progress tasks |
| `completed` | Only completed tasks |
| `failed` | Only failed tasks |

### Sort Options

| Option | Description | Default |
|--------|-------------|---------|
| `priority_asc` | Lowest priority first | ✓ |
| `priority_desc` | Highest priority first | |
| `status` | Group by status | |
| `created_asc` | Oldest first | |
| `created_desc` | Newest first | |
| `name` | Alphabetical | |

---

## Error Handling

### Data Loading Errors

| Error | Cause | User Message | Recovery |
|-------|-------|--------------|----------|
| No PRD | PRD not created | "No project defined" | Show planning CTA |
| Network error | Server unreachable | "Could not load tasks" | Retry button |
| Parse error | Corrupt PRD | "Error reading tasks" | Contact support |

### Action Errors

| Error | Cause | User Message | Recovery |
|-------|-------|--------------|----------|
| Start battle failed | Battle in progress | "Another battle running" | Wait or cancel |
| Delete failed | Task in battle | "Cannot delete active task" | Wait for completion |
| Edit failed | Task locked | "Task cannot be edited now" | Wait for unlock |

---

## Edge Cases

### Real-time Updates

**Problem:** Multiple clients viewing dashboard, one starts battle.

**Current Behavior:** Other clients don't see status change until refresh.

**Proposed Improvement:**
- Broadcast task status changes via WebSocket
- Add `task_updated` event type
- Auto-refresh affected cards

---

### Large Task Lists

**Problem:** PRD with 100+ tasks could be slow to render.

**Current Behavior:** All tasks rendered at once.

**Proposed Improvement:**
- Virtual scrolling for large lists
- Pagination option
- Progressive loading

---

### Stale Data

**Problem:** Dashboard shows outdated task status.

**Current Behavior:** Data fetched on mount, no refresh.

**Proposed Improvement:**
- Periodic refresh (every 30s)
- WebSocket updates for real-time
- Visual indicator for stale data

---

## Testing Requirements

### Unit Tests
- [ ] TaskCard renders all status variants
- [ ] Filter changes update displayed tasks
- [ ] Sort options work correctly
- [ ] Search filters by title and description
- [ ] Empty states render correctly

### Integration Tests
- [ ] Dashboard loads tasks from API
- [ ] Start battle updates task status
- [ ] Delete removes task from list
- [ ] Edit updates task in list

### E2E Tests
- [ ] Navigate to dashboard
- [ ] Filter by status
- [ ] Start battle from card
- [ ] View task details modal
- [ ] Delete a task

---

## Performance Considerations

### Initial Load
- Fetch all tasks in single request
- Return stats in same response
- Lazy load battle history

### Re-renders
- Memoize TaskCard components
- Use stable keys for list
- Debounce search input

### Memory
- Clean up listeners on unmount
- Limit stored filter state
- Clear task details on modal close

---

## Accessibility Requirements

### Keyboard Navigation
- Tab through task cards
- Enter to select/activate
- Arrow keys within card actions
- Escape to close modal

### Screen Reader Support
- Card has meaningful label
- Status announced on change
- Actions have aria-labels
- Modal has proper focus trap

### Color Contrast
- Status colors meet WCAG AA
- Text readable on all backgrounds
- Focus indicators visible

---

## Smart Task Management (UX Enhancement)

### Next Task Recommendation

**Purpose:** Help users decide which task to work on next.

**Recommendation Algorithm:**
```typescript
interface TaskRecommendation {
  task: Task;
  score: number;
  reasons: RecommendationReason[];
  suggestedMode: "hitl" | "yolo";
}

interface RecommendationReason {
  type: "priority" | "dependency" | "risk" | "momentum" | "blocking";
  label: string;
  impact: number;  // -100 to +100
}

function computeTaskRecommendation(task: Task, context: ProjectContext): TaskRecommendation {
  const reasons: RecommendationReason[] = [];
  let score = 0;

  // Priority factor (highest priority = highest score)
  const priorityScore = (10 - task.priority) * 10;
  reasons.push({
    type: "priority",
    label: `Priority ${task.priority}`,
    impact: priorityScore,
  });
  score += priorityScore;

  // Dependency factor (tasks with completed dependencies score higher)
  const dependenciesMet = checkDependencies(task, context.completedTasks);
  if (dependenciesMet) {
    reasons.push({ type: "dependency", label: "Dependencies met", impact: 20 });
    score += 20;
  } else {
    reasons.push({ type: "dependency", label: "Blocked by dependencies", impact: -50 });
    score -= 50;
  }

  // Risk assessment (lower risk = higher YOLO suitability)
  const riskScore = assessTaskRisk(task);
  const riskImpact = riskScore.level === "low" ? 15 : riskScore.level === "medium" ? 0 : -15;
  reasons.push({
    type: "risk",
    label: `${riskScore.level} risk`,
    impact: riskImpact,
  });
  score += riskImpact;

  // Momentum factor (similar tasks to recently completed)
  const momentumScore = calculateMomentum(task, context.recentTasks);
  if (momentumScore > 0) {
    reasons.push({ type: "momentum", label: "Similar to recent work", impact: momentumScore });
    score += momentumScore;
  }

  // Blocking factor (tasks that unblock others)
  const blockedCount = countBlockedTasks(task, context.pendingTasks);
  if (blockedCount > 0) {
    const blockingScore = blockedCount * 10;
    reasons.push({ type: "blocking", label: `Unblocks ${blockedCount} tasks`, impact: blockingScore });
    score += blockingScore;
  }

  return {
    task,
    score,
    reasons,
    suggestedMode: riskScore.level === "low" ? "yolo" : "hitl",
  };
}
```

**Recommendation UI:**
```
┌────────────────────────────────────────────────────────────────────┐
│  📌 Recommended Next Task                                          │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 003-api-endpoints                              Score: 85     │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ Create REST API endpoints for CRUD operations                │ │
│  │                                                              │ │
│  │ Why this task?                                                │ │
│  │ ✓ High priority (2)                           +80            │ │
│  │ ✓ All dependencies met                        +20            │ │
│  │ ✓ Low risk - straightforward CRUD             +15            │ │
│  │ ✓ Unblocks 2 other tasks                      +20            │ │
│  │ ─ Similar to recent auth work                  +5            │ │
│  │                                                              │ │
│  │ Suggested Mode: YOLO (low risk, tested pattern)              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  [Skip Recommendation]        [Start Battle →] (YOLO recommended)  │
└────────────────────────────────────────────────────────────────────┘
```

---

### Task Queue / Battle Backlog

**Purpose:** Queue multiple YOLO-friendly tasks for batch execution.

**Queue UI:**
```
┌────────────────────────────────────────────────────────────────────┐
│  Battle Queue                                        [Clear Queue] │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  Queue up tasks for automatic execution in YOLO mode.             │
│  Tasks will run sequentially until complete or failed.            │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Queued Tasks (3)                              Est: 45 min    │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ 1. ☰ 003-api-endpoints         Low risk    ~15 min    [×]   │ │
│  │ 2. ☰ 004-data-models           Low risk    ~10 min    [×]   │ │
│  │ 3. ☰ 005-error-handling        Med risk    ~20 min    [×]   │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ Drag to reorder • Click × to remove                         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Queue Settings:                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ ○ Stop on first failure                                      │ │
│  │ ◉ Continue to next task on failure                           │ │
│  │ ○ Notify after each task                                     │ │
│  │ ◉ Notify only when queue completes                           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Add to Queue:                                                 │ │
│  │ [Search tasks...________________] [+ Add Selected]           │ │
│  │                                                              │ │
│  │ YOLO-Ready Tasks:                                            │ │
│  │ □ 006-logging-system       Low risk                         │ │
│  │ □ 007-config-loader        Low risk                         │ │
│  │ □ 008-test-utils           Low risk                         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  [Cancel]                              [Start Queue (3 tasks) →]  │
└────────────────────────────────────────────────────────────────────┘
```

**Queue Data Structure:**
```typescript
interface BattleQueue {
  id: string;
  tasks: QueuedTask[];
  settings: QueueSettings;
  status: "idle" | "running" | "paused" | "completed" | "failed";
  currentIndex: number;
  results: QueueResult[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface QueuedTask {
  taskId: string;
  order: number;
  estimatedDuration: number;  // minutes
  riskLevel: "low" | "medium" | "high";
}

interface QueueSettings {
  stopOnFailure: boolean;
  notifyAfterEach: boolean;
  mode: "yolo";  // Queue only supports YOLO mode
}

interface QueueResult {
  taskId: string;
  status: "completed" | "failed" | "skipped";
  iterations: number;
  duration: number;
  error?: string;
}
```

**Queue API:**
```typescript
// POST /api/queue
interface CreateQueueRequest {
  tasks: string[];  // Task IDs in order
  settings: QueueSettings;
}

// POST /api/queue/start
interface StartQueueResponse {
  queueId: string;
  estimatedDuration: number;
}

// GET /api/queue/status
interface QueueStatusResponse {
  queue: BattleQueue;
  currentTask?: Task;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
}
```

---

### One-Click Battle Flow

**Purpose:** Streamline the path from task selection to battle start.

**Flow Diagram:**
```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Task Card   │───▶│  Mode Select │───▶│  Preflight   │───▶│    Battle    │
│   (Click)    │    │  (Optional)  │    │   (Auto)     │    │   (Start)    │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

**One-Click Button States:**

| State | Button | Behavior |
|-------|--------|----------|
| Recommended YOLO | "Quick Start (YOLO)" | Skip mode select, run preflight, start |
| Recommended HITL | "Start Battle" | Show mode confirmation, then preflight |
| Blocked | "Blocked" (disabled) | Show tooltip with blocking reason |
| In Progress | "View Battle" | Navigate to active battle |

**Quick Start UI on Task Card:**
```
┌─────────────────────────────────────────┐
│ 003-api-endpoints                       │
│ ═══════════════════════════════════════│
│ ⚪ Pending                    Low Risk  │
│                                         │
│ Create REST API endpoints for...        │
│                                         │
│ Priority: 2 | Est: ~15 min              │
│                                         │
│ ┌─────────────────────────────────────┐│
│ │ [Quick Start ▼]      [Details]     ││
│ │  ├─ YOLO (recommended)              ││
│ │  └─ HITL                            ││
│ └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

**Quick Start Flow (expanded):**
```
User clicks "Quick Start" dropdown → selects "YOLO"
    ↓
System runs preflight checks (2-3 seconds)
    ↓
If all pass → Battle starts immediately
If warnings → Show warning toast, start anyway (configurable)
If errors → Show preflight modal with errors
```

**Keyboard Shortcuts:**
| Shortcut | Action |
|----------|--------|
| `Enter` | Quick start with recommended mode |
| `Shift+Enter` | Quick start with YOLO |
| `Ctrl+Enter` | Quick start with HITL |
| `Q` | Add to queue |
| `D` | View details |
| `H` | View history |

---

### Task Risk Assessment

**Purpose:** Help users understand task complexity for mode selection.

**Risk Factors:**
```typescript
interface TaskRiskAssessment {
  level: "low" | "medium" | "high";
  score: number;  // 0-100
  factors: RiskFactor[];
  recommendation: string;
}

interface RiskFactor {
  name: string;
  impact: "low" | "medium" | "high";
  description: string;
}

function assessTaskRisk(task: Task): TaskRiskAssessment {
  const factors: RiskFactor[] = [];
  let score = 0;

  // Acceptance criteria count
  const criteriaCount = task.acceptanceCriteria?.length ?? 0;
  if (criteriaCount > 5) {
    factors.push({ name: "Complex requirements", impact: "medium", description: `${criteriaCount} acceptance criteria` });
    score += 20;
  }

  // Description length (complexity indicator)
  if (task.description.length > 500) {
    factors.push({ name: "Complex scope", impact: "medium", description: "Detailed description" });
    score += 15;
  }

  // Keywords indicating risk
  const highRiskKeywords = ["refactor", "migrate", "security", "auth", "payment", "database"];
  const mediumRiskKeywords = ["api", "integration", "external", "third-party"];

  const descLower = task.description.toLowerCase();
  for (const keyword of highRiskKeywords) {
    if (descLower.includes(keyword)) {
      factors.push({ name: `Involves ${keyword}`, impact: "high", description: "Higher complexity area" });
      score += 25;
      break;
    }
  }

  for (const keyword of mediumRiskKeywords) {
    if (descLower.includes(keyword)) {
      factors.push({ name: `Involves ${keyword}`, impact: "medium", description: "Moderate complexity" });
      score += 15;
      break;
    }
  }

  // Previous battle failures
  const previousBattle = getPreviousBattle(task.id);
  if (previousBattle?.status === "failed") {
    factors.push({ name: "Previously failed", impact: "high", description: "Task failed in previous attempt" });
    score += 30;
  }

  const level = score < 30 ? "low" : score < 60 ? "medium" : "high";
  const recommendation = level === "low"
    ? "Safe for YOLO mode"
    : level === "medium"
    ? "Consider HITL for first attempt"
    : "Recommend HITL mode";

  return { level, score, factors, recommendation };
}
```

**Risk Badge on Task Card:**
```
┌────────────────────────────────────────┐
│                            Risk: Low   │
│                            ●○○         │
└────────────────────────────────────────┘

Risk Indicators:
●○○ = Low risk (green)
●●○ = Medium risk (yellow)
●●● = High risk (red)
```

---

## Open Questions

1. **Should we support task reordering?** Drag-and-drop to change priority.
2. **Should we support task dependencies?** Show blocked tasks differently.
3. **Should we support bulk actions?** Select multiple tasks for batch operations.
4. **Should we support task templates?** Pre-defined task structures.
5. **Should queue support HITL mode?** Currently queue is YOLO-only for simplicity.
6. **Should risk assessment be configurable?** Custom keywords per project.
