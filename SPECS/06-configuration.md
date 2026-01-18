# 06 - Configuration Specification

## Purpose

Configuration controls how battles are executed in PokéRalph. This includes execution mode (HITL/YOLO), feedback loops, timeouts, and auto-commit behavior. Configuration is per-project and stored in `.pokeralph/config.json`.

## User Stories

### US-CF-1: Set Execution Mode
**As a** developer
**I want** to choose between HITL and YOLO modes
**So that** I can control how much oversight I have

**Acceptance Criteria:**
- Clear explanation of each mode
- Easy toggle between modes
- Mode persists across sessions
- Can override per-battle

### US-CF-2: Configure Feedback Loops
**As a** developer
**I want** to specify which feedback loops to run
**So that** battles validate the work appropriately

**Acceptance Criteria:**
- Add/remove feedback loops
- Reorder loops
- Each loop is a shell command
- Validate commands exist

### US-CF-3: Set Iteration Limits
**As a** developer
**I want** to set max iterations per task
**So that** battles don't run forever

**Acceptance Criteria:**
- Configurable max iterations
- Reasonable default (10)
- Warning if set too high
- Task-level override possible

### US-CF-4: Configure Auto-Commit
**As a** developer
**I want** to control automatic git commits
**So that** I can manage version history

**Acceptance Criteria:**
- Enable/disable auto-commit
- Commits only when feedback passes
- Clear commit message format
- Option to require commit message

## Current Behavior

### Config Schema

```typescript
interface Config {
  maxIterationsPerTask: number;  // Default: 10
  mode: ExecutionMode;           // "hitl" | "yolo"
  feedbackLoops: string[];       // ["test", "lint", "typecheck"]
  timeoutMinutes: number;        // Default: 30
  pollingIntervalMs: number;     // Default: 2000
  autoCommit: boolean;           // Default: true
}

const DEFAULT_CONFIG: Config = {
  maxIterationsPerTask: 10,
  mode: "hitl",
  feedbackLoops: ["test", "lint", "typecheck"],
  timeoutMinutes: 30,
  pollingIntervalMs: 2000,
  autoCommit: true,
};
```

### Execution Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| **HITL** | Pauses after each iteration for approval | High-risk tasks, learning, debugging |
| **YOLO** | Runs until completion or max iterations | Low-risk tasks, trusted patterns |

### Feedback Loops

Feedback loops are shell commands run after each iteration:

| Loop | Default Command | Purpose |
|------|-----------------|---------|
| `test` | `bun test` | Run test suite |
| `lint` | `bun run lint` | Check code style |
| `typecheck` | `bun run typecheck` | TypeScript type checking |

Custom loops can be added (e.g., `format:check`, `security-scan`).

## API Specification

### GET /api/config

Get current configuration.

**Response:**
```typescript
interface ConfigResponse {
  config: Config;
}
```

---

### PUT /api/config

Update configuration.

**Request:**
```typescript
interface UpdateConfigRequest {
  maxIterationsPerTask?: number;
  mode?: ExecutionMode;
  feedbackLoops?: string[];
  timeoutMinutes?: number;
  pollingIntervalMs?: number;
  autoCommit?: boolean;
}
```

**Response:**
```typescript
interface UpdateConfigResponse {
  config: Config;
}
```

**Errors:**
| Status | Code | Description |
|--------|------|-------------|
| 400 | `INVALID_CONFIG` | Validation failed |
| 409 | `BATTLE_IN_PROGRESS` | Cannot change during battle |

**Validation Rules:**
| Field | Rule |
|-------|------|
| `maxIterationsPerTask` | 1-100 |
| `mode` | "hitl" or "yolo" |
| `feedbackLoops` | Non-empty array of strings |
| `timeoutMinutes` | 1-60 |
| `pollingIntervalMs` | 500-10000 |
| `autoCommit` | boolean |

---

### POST /api/config/reset

Reset configuration to defaults.

**Response:**
```typescript
interface ResetConfigResponse {
  config: Config;
}
```

---

### POST /api/config/validate-loops

Validate that feedback loop commands exist.

**Request:**
```typescript
interface ValidateLoopsRequest {
  loops: string[];
}
```

**Response:**
```typescript
interface ValidateLoopsResponse {
  results: {
    loop: string;
    valid: boolean;
    error?: string;
  }[];
}
```

---

## UI Requirements

### Settings View Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  ⚙️ Settings                                              [Reset] │
│  ═══════════════════════════════════════════════════════════════  │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Execution Mode                                                   │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  ┌────────────────────────┐  ┌────────────────────────┐          │
│  │ ◉ HITL                 │  │ ○ YOLO                 │          │
│  │ Human in the Loop      │  │ Fully Automatic        │          │
│  │                        │  │                        │          │
│  │ Pauses after each      │  │ Runs until completion  │          │
│  │ iteration for your     │  │ or max iterations.     │          │
│  │ approval. Best for     │  │ Best for trusted       │          │
│  │ high-risk tasks.       │  │ patterns and low-risk  │          │
│  │                        │  │ tasks.                 │          │
│  └────────────────────────┘  └────────────────────────┘          │
│                                                                    │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  Iteration Limits                                                 │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  Max iterations per task:  [10______] ⓘ                           │
│  Timeout per iteration:    [30______] minutes                     │
│                                                                    │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  Feedback Loops                                                   │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  Run these commands after each iteration:                         │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 1. test       [bun test____________] [✓ Valid] [↑][↓] [×]   │ │
│  │ 2. lint       [bun run lint________] [✓ Valid] [↑][↓] [×]   │ │
│  │ 3. typecheck  [bun run typecheck___] [✓ Valid] [↑][↓] [×]   │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  [+ Add Feedback Loop]                                            │
│                                                                    │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  Git Integration                                                  │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  [✓] Auto-commit after successful iterations                      │
│                                                                    │
│      Commit message format:                                       │
│      feat({taskId}): {taskTitle} - iteration {n}                 │
│                                                                    │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  Advanced                                                         │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  Progress polling interval: [2000____] ms                         │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                           [Cancel]    [Save]      │
└────────────────────────────────────────────────────────────────────┘
```

### Mode Selection Cards

```
┌────────────────────────────────┐
│  ○ / ◉ MODE_NAME              │  <- Radio button + title
│  ─────────────────────────────│
│  Short description of mode    │  <- Subtitle
│                               │
│  Longer explanation of when   │  <- Body text
│  to use this mode and what    │
│  to expect during execution.  │
└────────────────────────────────┘
```

### Feedback Loop Row

```
┌──────────────────────────────────────────────────────────────┐
│  {n}. {name}    [{command_______________}]    {status} [↑][↓][×]
└──────────────────────────────────────────────────────────────┘

Where:
- {n} = order number
- {name} = loop name (editable)
- {command} = shell command (editable)
- {status} = ✓ Valid | ⚠️ Not found | ? Unknown
- [↑][↓] = reorder buttons
- [×] = delete button
```

---

## Component States

### Mode Selection

| State | Visual |
|-------|--------|
| `unselected` | Empty radio, normal colors |
| `selected` | Filled radio, accent border |
| `disabled` | Grayed out (during battle) |

### Feedback Loop Row

| State | Visual |
|-------|--------|
| `valid` | Green checkmark |
| `invalid` | Red warning |
| `checking` | Spinner |
| `editing` | Input focused |

### Save Button

| State | Visual |
|-------|--------|
| `clean` | Disabled |
| `dirty` | Enabled, primary color |
| `saving` | Disabled, spinner |
| `error` | Enabled, error color |

---

## Validation Rules

### Max Iterations
- Minimum: 1
- Maximum: 100
- Warning if > 20: "High iteration count may consume significant resources"

### Timeout
- Minimum: 1 minute
- Maximum: 60 minutes
- Warning if > 45: "Long timeouts may indicate tasks that are too large"

### Feedback Loops
- At least one loop required
- Name must be alphanumeric + hyphens
- Command must be non-empty
- Duplicate names not allowed

### Polling Interval
- Minimum: 500ms
- Maximum: 10000ms
- Warning if < 1000: "Very fast polling may impact performance"

---

## Error Handling

### Validation Errors

| Error | Cause | User Message | Recovery |
|-------|-------|--------------|----------|
| Out of range | Invalid number | "Value must be between X and Y" | Adjust input |
| Invalid command | Command not found | "Command 'X' not found" | Fix command |
| Duplicate name | Same loop name | "Loop name already exists" | Change name |

### Save Errors

| Error | Cause | User Message | Recovery |
|-------|-------|--------------|----------|
| Battle running | Config locked | "Cannot change settings during battle" | Wait or cancel |
| Write failed | File permission | "Could not save settings" | Check permissions |
| Network error | Server unreachable | "Server not responding" | Retry |

---

## Edge Cases

### Config During Battle

**Problem:** User tries to change config while battle running.

**Current Behavior:** Changes may or may not take effect.

**Proposed Improvement:**
- Lock config UI during battle
- Queue changes for next battle
- Show warning about pending changes

---

### Invalid Default Commands

**Problem:** Default feedback commands may not work in all projects.

**Current Behavior:** Commands fail silently at runtime.

**Proposed Improvement:**
- Detect project type (package.json scripts)
- Suggest appropriate commands
- Validate on config save
- Clear error messages at runtime

---

### Config Migration

**Problem:** Config schema may change between versions.

**Current Behavior:** No version field, no migration.

**Proposed Improvement:**
- Add version field to config
- Automatic migration on load
- Preserve unknown fields

---

### Multiple Clients

**Problem:** Two clients could edit config simultaneously.

**Current Behavior:** Last write wins.

**Proposed Improvement:**
- Optimistic locking with version
- Broadcast config changes
- Merge non-conflicting changes

---

## Feedback Loop Commands

### Default Commands by Project Type

| Project Type | test | lint | typecheck |
|--------------|------|------|-----------|
| Bun | `bun test` | `bun run lint` | `bun run typecheck` |
| Node/npm | `npm test` | `npm run lint` | `npm run typecheck` |
| pnpm | `pnpm test` | `pnpm run lint` | `pnpm run typecheck` |
| yarn | `yarn test` | `yarn lint` | `yarn typecheck` |
| Python | `pytest` | `ruff check` | `mypy .` |
| Go | `go test ./...` | `golangci-lint run` | N/A |

### Custom Loop Examples

| Name | Command | Purpose |
|------|---------|---------|
| `format:check` | `bun run format:check` | Verify formatting |
| `build` | `bun run build` | Ensure project builds |
| `security` | `npm audit` | Check for vulnerabilities |
| `coverage` | `bun test --coverage` | Verify test coverage |

---

## Testing Requirements

### Unit Tests
- [ ] Config validation rejects invalid values
- [ ] Default config is valid
- [ ] Mode toggle updates correctly
- [ ] Feedback loop CRUD works
- [ ] Reorder preserves all loops

### Integration Tests
- [ ] Config saves to file
- [ ] Config loads on startup
- [ ] Config updates affect battles
- [ ] Reset restores defaults

### E2E Tests
- [ ] Open settings view
- [ ] Change execution mode
- [ ] Add feedback loop
- [ ] Remove feedback loop
- [ ] Save and verify persistence

---

## Performance Considerations

### Config Loading
- Load once on app start
- Cache in memory
- Reload only when file changes

### Validation
- Debounce command validation
- Cache validation results
- Validate in background

### Saving
- Debounce rapid saves
- Show pending state
- Queue if battle running

---

## Accessibility Requirements

### Keyboard Navigation
- Tab through form fields
- Space to toggle checkboxes
- Arrow keys for radio buttons
- Enter to save

### Screen Reader Support
- Form fields labeled
- Validation errors announced
- Mode descriptions readable
- Help text accessible

### Visual
- High contrast for mode cards
- Clear focus indicators
- Error states distinct

---

## Flexible Feedback Configuration (UX Enhancement)

### Per-Task Configuration Overrides

**Purpose:** Allow specific tasks to have custom configurations that differ from defaults.

**Task Override Schema:**
```typescript
interface TaskConfigOverride {
  taskId: string;
  overrides: Partial<Config>;
  reason?: string;  // Why this task needs different config
}

// Example: Task with long test suite needs more time
const taskOverride: TaskConfigOverride = {
  taskId: "005-integration-tests",
  overrides: {
    timeoutMinutes: 45,          // Override: 45 min instead of 30
    maxIterationsPerTask: 15,    // Override: 15 iterations instead of 10
    feedbackLoops: ["test"],     // Override: only run tests, skip lint/typecheck
  },
  reason: "Integration tests take longer and don't need lint checks",
};
```

**Override UI in Task Details:**
```
┌────────────────────────────────────────────────────────────────────┐
│  Task Settings: 005-integration-tests                    [X Close] │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Configuration Overrides                                       │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ [✓] Use custom settings for this task                        │ │
│  │                                                              │ │
│  │ Timeout per iteration:                                       │ │
│  │ [45_____] minutes (default: 30)                             │ │
│  │                                                              │ │
│  │ Max iterations:                                              │ │
│  │ [15_____] (default: 10)                                     │ │
│  │                                                              │ │
│  │ Feedback Loops:                                              │ │
│  │ [✓] test    [ ] lint    [ ] typecheck                       │ │
│  │ (Default: all enabled)                                       │ │
│  │                                                              │ │
│  │ Reason for overrides (optional):                             │ │
│  │ [Integration tests take longer; lint not needed_____]       │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│                                   [Reset to Defaults]    [Save]   │
└────────────────────────────────────────────────────────────────────┘
```

**Merged Config Logic:**
```typescript
function getEffectiveConfig(taskId: string): Config {
  const baseConfig = loadConfig();
  const taskOverride = loadTaskOverride(taskId);

  if (!taskOverride) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    ...taskOverride.overrides,
    // Deep merge for arrays like feedbackLoops
    feedbackLoops: taskOverride.overrides.feedbackLoops ?? baseConfig.feedbackLoops,
  };
}
```

---

### Re-Run Only Failing Loops

**Purpose:** Speed up iterations by only re-running feedback loops that failed.

**Configuration:**
```typescript
interface FeedbackLoopConfig {
  name: string;
  command: string;
  timeout: number;           // Per-loop timeout in minutes
  retryOnFailure: boolean;   // Re-run only this loop if it fails
  required: boolean;         // If false, failure is a warning not error
  runCondition?: "always" | "on_change" | "on_failure";
}

interface SmartFeedbackConfig {
  loops: FeedbackLoopConfig[];
  rerunStrategy: "all" | "failed_only" | "smart";
  parallelExecution: boolean;
}

// Example configuration
const smartFeedbackConfig: SmartFeedbackConfig = {
  loops: [
    {
      name: "test",
      command: "bun test",
      timeout: 5,
      retryOnFailure: true,
      required: true,
      runCondition: "always",
    },
    {
      name: "lint",
      command: "bun run lint",
      timeout: 2,
      retryOnFailure: false,
      required: false,  // Lint failures are warnings
      runCondition: "on_change",
    },
    {
      name: "typecheck",
      command: "bun run typecheck",
      timeout: 3,
      retryOnFailure: true,
      required: true,
      runCondition: "always",
    },
  ],
  rerunStrategy: "failed_only",  // Only re-run loops that failed
  parallelExecution: false,
};
```

**Re-Run UI:**
```
┌────────────────────────────────────────────────────────────────────┐
│  Feedback Results                                                  │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  ✓ test:       8 passed, 0 failed        (2.1s)                   │
│  ✗ lint:       2 warnings                (0.4s)    [Not Required] │
│  ✗ typecheck:  1 error                   (1.2s)    [Required]     │
│                                                                    │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  Re-run Options:                                                   │
│  ◉ Re-run failed loops only (typecheck)                           │
│  ○ Re-run all loops                                                │
│                                                                    │
│  [ ] Skip non-required failures (proceed despite lint warnings)   │
│                                                                    │
│  [Re-run Selected]                    [Continue Anyway]            │
└────────────────────────────────────────────────────────────────────┘
```

**Re-Run Logic:**
```typescript
async function runFeedbackLoops(
  loops: FeedbackLoopConfig[],
  previousResults?: FeedbackResults,
  strategy: "all" | "failed_only" | "smart" = "all"
): Promise<FeedbackResults> {
  const loopsToRun = selectLoopsToRun(loops, previousResults, strategy);

  const results: FeedbackResults = {};

  for (const loop of loopsToRun) {
    // Check run condition
    if (loop.runCondition === "on_change" && !hasRelevantChanges(loop)) {
      results[loop.name] = previousResults?.[loop.name] ?? { passed: true, skipped: true };
      continue;
    }

    const result = await runLoop(loop);
    results[loop.name] = result;

    // If required loop fails and no retry, stop
    if (!result.passed && loop.required && !loop.retryOnFailure) {
      break;
    }
  }

  return results;
}

function selectLoopsToRun(
  loops: FeedbackLoopConfig[],
  previousResults: FeedbackResults | undefined,
  strategy: string
): FeedbackLoopConfig[] {
  if (strategy === "all" || !previousResults) {
    return loops;
  }

  if (strategy === "failed_only") {
    return loops.filter(loop =>
      !previousResults[loop.name]?.passed
    );
  }

  // Smart: re-run failed + dependent loops
  if (strategy === "smart") {
    const failedLoops = loops.filter(loop =>
      !previousResults[loop.name]?.passed
    );
    // Could add dependency analysis here
    return failedLoops;
  }

  return loops;
}
```

---

### Conditional Pass with Rationale

**Purpose:** Allow battles to proceed when non-critical feedback fails, with documented rationale.

**Conditional Pass Schema:**
```typescript
interface ConditionalPass {
  loopName: string;
  reason: string;
  approvedBy: "user" | "config";
  timestamp: string;
}

interface FeedbackResult {
  passed: boolean;
  output: string;
  duration: number;
  conditionalPass?: ConditionalPass;
}
```

**Conditional Pass UI:**
```
┌────────────────────────────────────────────────────────────────────┐
│  Feedback Loop Failed: lint                                        │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Output:                                                       │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ src/utils/helper.ts:23:5                                     │ │
│  │   warning: 'console.log' statements should be removed        │ │
│  │                                                              │ │
│  │ src/utils/helper.ts:45:10                                    │ │
│  │   warning: Unused variable 'temp'                            │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  This loop is configured as "not required".                       │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Proceed with conditional pass?                                │ │
│  │                                                              │ │
│  │ Rationale (required):                                        │ │
│  │ [Console logs are for debugging, will clean up later____]   │ │
│  │                                                              │ │
│  │ [✓] Remember this decision for similar failures             │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│      [Fix Issues First]               [Continue with Warnings →]  │
└────────────────────────────────────────────────────────────────────┘
```

**Auto-Conditional Pass Rules:**
```typescript
interface AutoConditionalPassRule {
  loopName: string;
  conditions: ConditionCheck[];
  rationale: string;
}

interface ConditionCheck {
  type: "output_contains" | "error_count_below" | "severity_level";
  value: string | number;
}

// Example: Auto-pass lint if only warnings (no errors)
const autoPassRules: AutoConditionalPassRule[] = [
  {
    loopName: "lint",
    conditions: [
      { type: "severity_level", value: "warning" },  // Only warnings, no errors
    ],
    rationale: "Lint warnings are acceptable during development",
  },
  {
    loopName: "typecheck",
    conditions: [
      { type: "error_count_below", value: 3 },       // Less than 3 type errors
      { type: "output_contains", value: "any" },     // Contains 'any' type issues
    ],
    rationale: "Minor type issues from 'any' usage during prototyping",
  },
];

async function evaluateConditionalPass(
  loop: FeedbackLoopConfig,
  result: FeedbackResult,
  rules: AutoConditionalPassRule[]
): Promise<ConditionalPass | null> {
  const rule = rules.find(r => r.loopName === loop.name);
  if (!rule) return null;

  const conditionsMet = rule.conditions.every(condition =>
    evaluateCondition(condition, result)
  );

  if (conditionsMet) {
    return {
      loopName: loop.name,
      reason: rule.rationale,
      approvedBy: "config",
      timestamp: new Date().toISOString(),
    };
  }

  return null;
}
```

---

### Feedback Loop Settings UI

```
┌────────────────────────────────────────────────────────────────────┐
│  Feedback Loop Settings                                           │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Loop: test                                                    │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ Command: [bun test___________________________]               │ │
│  │ Timeout: [5___] minutes                                      │ │
│  │                                                              │ │
│  │ [✓] Required (failure blocks progress)                       │ │
│  │ [✓] Retry on failure (re-run if failed)                      │ │
│  │                                                              │ │
│  │ Run Condition:                                               │ │
│  │ ◉ Always   ○ On file change   ○ On failure only             │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Loop: lint                                                    │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ Command: [bun run lint_______________________]               │ │
│  │ Timeout: [2___] minutes                                      │ │
│  │                                                              │ │
│  │ [ ] Required (warnings allowed)                              │ │
│  │ [ ] Retry on failure                                         │ │
│  │                                                              │ │
│  │ Auto-pass conditions:                                        │ │
│  │ [✓] Pass if only warnings (no errors)                        │ │
│  │ [ ] Pass if < ___ issues                                     │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  Re-run Strategy:                                                  │
│  ○ Re-run all loops   ◉ Re-run failed only   ○ Smart (with deps) │
│                                                                    │
│  [ ] Run loops in parallel (faster but may conflict)              │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Open Questions

1. **Should we support config profiles?** Switch between different configs.
2. **Should we support per-task config overrides?** *(Addressed above)*
3. **Should feedback loops have individual timeouts?** *(Addressed above)*
4. **Should we support conditional loops?** *(Addressed above)*
5. **Should conditional passes be auditable?** Track all conditional passes for review.
6. **Should we support loop dependencies?** e.g., only run typecheck if test passes.
