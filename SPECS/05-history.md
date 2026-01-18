# 05 - History View Specification

## Purpose

The History view provides a detailed timeline of battle iterations for a task. It allows developers to review what Claude did in each iteration, see feedback results, view changed files, and understand the path to completion or failure.

## User Stories

### US-HI-1: View Iteration Timeline
**As a** developer
**I want** to see a timeline of all iterations
**So that** I can understand how the task progressed

**Acceptance Criteria:**
- Chronological list of iterations
- Each iteration shows start/end time
- Result status visible (success/failure)
- Expandable for details

### US-HI-2: View Iteration Output
**As a** developer
**I want** to see Claude's output for each iteration
**So that** I can understand what work was done

**Acceptance Criteria:**
- Full output accessible
- Syntax highlighting for code
- Searchable content
- Copy to clipboard

### US-HI-3: View Feedback Results
**As a** developer
**I want** to see feedback loop results per iteration
**So that** I can identify what passed or failed

**Acceptance Criteria:**
- Show test/lint/typecheck results
- Pass/fail indicator
- Expandable output
- Duration shown

### US-HI-4: View Changed Files
**As a** developer
**I want** to see which files changed in each iteration
**So that** I can review the modifications

**Acceptance Criteria:**
- List of changed files
- Add/modify/delete indicators
- Link to diff if available
- Git commit reference

## Current Behavior

History data is stored in two locations:
- `battles/{taskId}/history.json` - Battle and iteration metadata
- `battles/{taskId}/logs/iteration-{n}.log` - Full iteration output

### Data Structure

```typescript
// Battle from history.json
interface Battle {
  taskId: string;
  status: BattleStatus;
  iterations: Iteration[];
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

// Each iteration
interface Iteration {
  number: number;
  startedAt: string;
  endedAt?: string;
  output: string;          // Summary in history.json
  result: IterationResult;
  filesChanged: string[];
  commitHash?: string;
  error?: string;
}
```

## API Specification

### GET /api/battle/{taskId}/history

Get complete battle history for a task.

**Response:**
```typescript
interface HistoryResponse {
  battle: Battle | null;
  iterations: IterationWithLogs[];
}

interface IterationWithLogs extends Iteration {
  fullOutput?: string;  // From log file
  feedbackResults?: FeedbackResults;
}
```

---

### GET /api/battle/{taskId}/iteration/{number}

Get details for a specific iteration.

**Response:**
```typescript
interface IterationDetailResponse {
  iteration: Iteration;
  fullOutput: string;
  feedbackResults: FeedbackResults;
  diff?: string;  // Git diff if available
}
```

**Errors:**
| Status | Code | Description |
|--------|------|-------------|
| 404 | `TASK_NOT_FOUND` | Task doesn't exist |
| 404 | `ITERATION_NOT_FOUND` | Iteration doesn't exist |

---

### GET /api/battle/{taskId}/logs/{iteration}

Get raw log file for an iteration.

**Response:**
```typescript
interface LogResponse {
  content: string;
}
```

---

## UI Requirements

### History View Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard                                               │
│                                                                    │
│  Battle History: 002-auth-system                                  │
│  ═══════════════════════════════════════════════════════════════  │
│  Status: 🟢 Completed | Duration: 45 minutes | Iterations: 5      │
│  Started: Jan 15, 2025 10:00 AM | Completed: Jan 15, 2025 10:45 AM│
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Timeline                                                          │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  ┌─ Iteration 5 ──────────────────────────────────────────────┐   │
│  │ ✅ Success | 10:40 - 10:45 (5 min) | Commit: abc1234       │   │
│  │                                                             │   │
│  │ Summary: Completed authentication implementation. All      │   │
│  │ tests passing. <promise>COMPLETE</promise> detected.       │   │
│  │                                                             │   │
│  │ Files Changed: 3                                            │   │
│  │ • src/auth/middleware.ts (modified)                        │   │
│  │ • tests/auth.test.ts (modified)                            │   │
│  │ • src/types/user.ts (modified)                             │   │
│  │                                                             │   │
│  │ Feedback:                                                   │   │
│  │ ✅ test: 12 passed (2.3s)                                  │   │
│  │ ✅ lint: No errors (0.5s)                                  │   │
│  │ ✅ typecheck: No errors (1.2s)                             │   │
│  │                                                             │   │
│  │ [View Full Output] [View Diff]                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─ Iteration 4 ──────────────────────────────────────────────┐   │
│  │ ⚠️ Partial | 10:30 - 10:40 (10 min) | Commit: def5678      │   │
│  │                                                             │   │
│  │ Summary: Fixed type errors in auth middleware. Tests now   │   │
│  │ passing but lint has warnings.                             │   │
│  │                                                             │   │
│  │ [Expand ▼]                                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─ Iteration 3 ──────────────────────────────────────────────┐   │
│  │ ❌ Failed | 10:15 - 10:30 (15 min) | No commit             │   │
│  │                                                             │   │
│  │ Summary: Attempted to implement JWT validation but         │   │
│  │ introduced type errors.                                    │   │
│  │                                                             │   │
│  │ [Expand ▼]                                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─ Iteration 2 ───────────────────────────── [Collapsed] ────┐   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─ Iteration 1 ───────────────────────────── [Collapsed] ────┐   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Iteration Detail Panel

```
┌─────────────────────────────────────────────────────────────────┐
│  Iteration 3 - Full Output                             [X Close]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Output] [Files Changed] [Feedback] [Diff]      🔍 Search     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ I'll now implement JWT token validation for the auth     │  │
│  │ middleware.                                               │  │
│  │                                                           │  │
│  │ First, let me read the current middleware implementation: │  │
│  │                                                           │  │
│  │ ```typescript                                             │  │
│  │ // src/auth/middleware.ts                                 │  │
│  │ import { verify } from 'jsonwebtoken';                    │  │
│  │                                                           │  │
│  │ export function authMiddleware(req, res, next) {          │  │
│  │   const token = req.headers.authorization?.split(' ')[1]; │  │
│  │   // ... implementation                                   │  │
│  │ }                                                         │  │
│  │ ```                                                       │  │
│  │                                                           │  │
│  │ I see the issue - the types are missing. Let me add them: │  │
│  │                                                           │  │
│  │ [... more output ...]                                     │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Line 1-50 of 234                              [Copy] [Download]│
└─────────────────────────────────────────────────────────────────┘
```

### Empty State (No History)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              📜 No Battle History                       │
│                                                         │
│  This task hasn't been executed yet.                    │
│  Start a battle to see iteration history.               │
│                                                         │
│                [Start Battle →]                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Component States

### IterationCard States

| State | Visual | Description |
|-------|--------|-------------|
| `collapsed` | Single line summary | Default for older iterations |
| `expanded` | Full details visible | Click to expand |
| `loading` | Spinner | Fetching full output |
| `highlighted` | Border accent | Currently selected |

### Result Indicators

| Result | Icon | Color | Description |
|--------|------|-------|-------------|
| `success` | ✅ | Green | All feedback passed |
| `failure` | ❌ | Red | Feedback failed |
| `timeout` | ⏱️ | Orange | Iteration timed out |
| `cancelled` | ⏹️ | Gray | User cancelled |
| `partial` | ⚠️ | Yellow | Mixed results |

### Tab States

| Tab | Content |
|-----|---------|
| Output | Full Claude output |
| Files Changed | List of modified files |
| Feedback | Test/lint/typecheck results |
| Diff | Git diff (if available) |

---

## Error Handling

### Data Loading Errors

| Error | Cause | User Message | Recovery |
|-------|-------|--------------|----------|
| No history | No battle run | "No history available" | Start battle CTA |
| Log not found | File deleted | "Log file not available" | Show summary only |
| Network error | Server unreachable | "Could not load history" | Retry button |

### Display Errors

| Error | Cause | User Message | Recovery |
|-------|-------|--------------|----------|
| Output too large | Very long output | "Output truncated" | Download full log |
| Parse error | Malformed data | "Error displaying output" | Show raw text |

---

## Edge Cases

### Very Long Output

**Problem:** Iteration output can be thousands of lines.

**Current Behavior:** Full output loaded into memory.

**Proposed Improvement:**
- Virtual scrolling for large outputs
- Load output in chunks
- Search within output
- Line number navigation

---

### Missing Log Files

**Problem:** Log files might be deleted or moved.

**Current Behavior:** Error shown to user.

**Proposed Improvement:**
- Fall back to summary from history.json
- Show warning that full output unavailable
- Offer to re-run iteration

---

### Concurrent Viewing During Battle

**Problem:** User views history while battle is running.

**Current Behavior:** Static view, no updates.

**Proposed Improvement:**
- Live updates for current iteration
- Auto-expand latest iteration
- Stream output in real-time

---

### Old Battle Format

**Problem:** History format might change between versions.

**Current Behavior:** Assume current format.

**Proposed Improvement:**
- Version field in history.json
- Migration scripts for old formats
- Graceful degradation for unknown fields

---

## Testing Requirements

### Unit Tests
- [ ] IterationCard renders all result variants
- [ ] Timeline orders iterations correctly
- [ ] Expand/collapse toggles work
- [ ] Search filters output content
- [ ] Copy button copies content

### Integration Tests
- [ ] History loads from API
- [ ] Full output fetches from log file
- [ ] Diff displays correctly
- [ ] Feedback results render

### E2E Tests
- [ ] Navigate to history from dashboard
- [ ] Expand iteration details
- [ ] Switch between tabs
- [ ] Download log file
- [ ] Navigate back to dashboard

---

## Performance Considerations

### Initial Load
- Load battle metadata first
- Lazy load full output on expand
- Cache expanded iterations

### Large Outputs
- Virtualize long text
- Truncate in collapsed view
- Pagination for many iterations

### Memory
- Unload collapsed iteration content
- Limit number of expanded iterations
- Clear on navigation away

---

## Accessibility Requirements

### Keyboard Navigation
- Arrow keys navigate timeline
- Enter expands/collapses
- Tab navigates within card
- Escape closes modal

### Screen Reader Support
- Timeline announced as list
- Iteration results announced
- Tab panels labeled
- Loading states announced

### Visual
- High contrast result indicators
- Focus visible on all interactive elements
- Text resizable without breaking layout

---

## Learning Tool Features (UX Enhancement)

### Auto-Generated Iteration Summaries

**Purpose:** Help users quickly understand what happened in each iteration without reading full logs.

**Summary Generation:**
```typescript
interface IterationSummary {
  iterationNumber: number;
  headline: string;           // One-line summary
  whatChanged: string[];      // Key changes made
  whyItHappened: string;      // Context/reasoning
  filesAffected: FileSummary[];
  feedbackResults: FeedbackSummary[];
  learnings?: string[];       // Insights for future
}

interface FileSummary {
  path: string;
  action: "created" | "modified" | "deleted";
  linesChanged: number;
  summary: string;  // Brief description of changes
}

interface FeedbackSummary {
  loop: string;
  passed: boolean;
  summary: string;  // "8 tests passed" or "2 type errors"
}

async function generateIterationSummary(
  iteration: Iteration,
  output: string,
  diff: string
): Promise<IterationSummary> {
  // 1. Parse output for key actions
  const actions = parseClaudeActions(output);

  // 2. Analyze diff for file changes
  const fileChanges = parseDiffSummary(diff);

  // 3. Extract reasoning from output
  const reasoning = extractReasoning(output);

  // 4. Identify learnings (patterns, fixes, discoveries)
  const learnings = extractLearnings(output, iteration.result);

  return {
    iterationNumber: iteration.number,
    headline: generateHeadline(actions, iteration.result),
    whatChanged: actions.map(a => a.description),
    whyItHappened: reasoning,
    filesAffected: fileChanges,
    feedbackResults: iteration.feedbackResults,
    learnings,
  };
}

function generateHeadline(actions: Action[], result: IterationResult): string {
  if (result === "success") {
    return `Completed: ${actions[0]?.description ?? "Task work"}`;
  } else if (result === "failure") {
    return `Attempted: ${actions[0]?.description ?? "Task work"} (feedback failed)`;
  }
  return `Iteration ${result}`;
}
```

**Summary UI:**
```
┌────────────────────────────────────────────────────────────────────┐
│  Iteration 3 Summary                                               │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 📋 Headline                                                   │ │
│  │ Implemented JWT token validation and protected routes         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 🔧 What Changed                                               │ │
│  │ • Created new middleware for JWT validation                   │ │
│  │ • Applied auth middleware to /api/* routes                   │ │
│  │ • Added token refresh endpoint                                │ │
│  │ • Wrote 8 tests covering auth flows                          │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 💭 Why                                                        │ │
│  │ Previous iteration set up the user model. This iteration     │ │
│  │ focused on securing the API endpoints using JWT tokens.      │ │
│  │ Chose middleware approach for clean separation of concerns.  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 💡 Learnings                                                  │ │
│  │ • Used bcrypt cost factor 10 for password hashing            │ │
│  │ • JWT expiry set to 1 hour with 7-day refresh tokens         │ │
│  │ • Error handling pattern: throw typed errors, catch at route │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  [View Full Output] [View Diff] [Fork from Here]                  │
└────────────────────────────────────────────────────────────────────┘
```

---

### Fork from Iteration (Checkpoint Resume)

**Purpose:** Resume a battle from any previous iteration checkpoint.

**Use Cases:**
- Battle diverged in wrong direction after iteration N
- Want to try different approach from known good state
- Recover from failed iteration without losing earlier work

**Fork UI:**
```
┌────────────────────────────────────────────────────────────────────┐
│  Fork Battle from Iteration 3                            [X Close] │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Create a new battle starting from the state after iteration 3.   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Source State                                                  │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ Task:       002-auth-system                                  │ │
│  │ Battle:     battle-2024-01-15-001                            │ │
│  │ Iteration:  3 (after JWT middleware implementation)          │ │
│  │ Git State:  commit abc1234                                   │ │
│  │ Files:      5 files changed from baseline                    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Fork Options                                                  │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ Git Strategy:                                                │ │
│  │ ◉ Reset to iteration commit (recommended)                    │ │
│  │   Checkout abc1234, start fresh from there                   │ │
│  │                                                              │ │
│  │ ○ Branch from iteration commit                               │ │
│  │   Create new branch 'pokeralph/fork-iter-3'                  │ │
│  │                                                              │ │
│  │ ○ Keep current state, use context only                       │ │
│  │   Don't change git, but include iteration 3 context          │ │
│  │                                                              │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ Additional Instructions (optional):                          │ │
│  │ [                                                          ] │ │
│  │ [Try a different approach for the refresh token logic...   ] │ │
│  │ [                                                          ] │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│                              [Cancel]       [Fork & Start Battle]  │
└────────────────────────────────────────────────────────────────────┘
```

**Fork Data Structure:**
```typescript
interface BattleFork {
  sourceTaskId: string;
  sourceBattleId: string;
  sourceIteration: number;
  sourceCommit: string;
  gitStrategy: "reset" | "branch" | "context-only";
  additionalInstructions?: string;
}

interface ForkResult {
  newBattleId: string;
  gitBranch?: string;
  startingIteration: number;  // Always 1 for new battle
  inheritedContext: string;   // Summary of previous iterations
}

async function forkBattle(fork: BattleFork): Promise<ForkResult> {
  // 1. Load source battle and iteration
  const sourceBattle = await loadBattle(fork.sourceTaskId, fork.sourceBattleId);
  const iterationsToInherit = sourceBattle.iterations.slice(0, fork.sourceIteration);

  // 2. Apply git strategy
  let gitBranch: string | undefined;
  if (fork.gitStrategy === "reset") {
    await git.checkout(fork.sourceCommit);
  } else if (fork.gitStrategy === "branch") {
    gitBranch = `pokeralph/fork-${fork.sourceBattleId}-iter-${fork.sourceIteration}`;
    await git.checkout(fork.sourceCommit, { branch: gitBranch });
  }

  // 3. Build inherited context
  const inheritedContext = buildInheritedContext(iterationsToInherit);

  // 4. Create new battle with forked context
  const newBattleId = await createBattle(fork.sourceTaskId, {
    forkedFrom: {
      battleId: fork.sourceBattleId,
      iteration: fork.sourceIteration,
    },
    inheritedContext,
    additionalInstructions: fork.additionalInstructions,
  });

  return {
    newBattleId,
    gitBranch,
    startingIteration: 1,
    inheritedContext,
  };
}
```

---

### Incremental/Streaming History Loading

**Purpose:** Handle large battle histories without loading everything at once.

**Loading Strategy:**
```typescript
interface HistoryLoadingOptions {
  taskId: string;
  initialCount: number;        // Load first N iterations
  loadOutputsOnExpand: boolean; // Lazy load full outputs
  streamLargeOutputs: boolean;  // Stream outputs > 100KB
}

interface StreamedOutput {
  iterationNumber: number;
  totalSize: number;
  loadedSize: number;
  chunks: OutputChunk[];
  complete: boolean;
}

interface OutputChunk {
  offset: number;
  content: string;
  timestamp: string;
}

// Progressive loading API
async function* streamIterationOutput(
  taskId: string,
  iteration: number,
  chunkSize: number = 10000  // 10KB chunks
): AsyncGenerator<OutputChunk> {
  const logPath = `.pokeralph/battles/${taskId}/logs/iteration-${iteration}.log`;
  const file = Bun.file(logPath);
  const totalSize = file.size;

  let offset = 0;
  while (offset < totalSize) {
    const slice = file.slice(offset, offset + chunkSize);
    const content = await slice.text();

    yield {
      offset,
      content,
      timestamp: new Date().toISOString(),
    };

    offset += chunkSize;
  }
}
```

**Streaming UI Indicator:**
```
┌──────────────────────────────────────────────────────────────────┐
│  Iteration 5 - Full Output                                        │
│  ─────────────────────────────────────────────────────────────────│
│  Loading: [████████████░░░░░░░░] 62% (156KB / 252KB)             │
│  ─────────────────────────────────────────────────────────────────│
│                                                                  │
│  I'll now implement the error handling for the API endpoints...  │
│                                                                  │
│  First, let me create a custom error class:                      │
│                                                                  │
│  ```typescript                                                   │
│  // src/errors/api-error.ts                                      │
│  export class ApiError extends Error {                           │
│    constructor(                                                  │
│      public statusCode: number,                                  │
│      message: string,                                            │
│      public code?: string                                        │
│    ) {                                                           │
│      super(message);                                             │
│  ▼ Loading more...                                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Virtual Scrolling for History:**
```typescript
interface VirtualizedHistory {
  totalIterations: number;
  visibleRange: { start: number; end: number };
  loadedIterations: Map<number, Iteration>;
  pendingLoads: Set<number>;
}

function useVirtualizedHistory(taskId: string): VirtualizedHistory {
  const [state, setState] = useState<VirtualizedHistory>({
    totalIterations: 0,
    visibleRange: { start: 0, end: 10 },
    loadedIterations: new Map(),
    pendingLoads: new Set(),
  });

  // Load iterations as user scrolls
  const loadIterationsInRange = useCallback(async (start: number, end: number) => {
    const needed = [];
    for (let i = start; i <= end; i++) {
      if (!state.loadedIterations.has(i) && !state.pendingLoads.has(i)) {
        needed.push(i);
      }
    }

    if (needed.length === 0) return;

    // Mark as pending
    setState(s => ({
      ...s,
      pendingLoads: new Set([...s.pendingLoads, ...needed]),
    }));

    // Load batch
    const iterations = await fetchIterations(taskId, needed);

    // Update loaded
    setState(s => {
      const loaded = new Map(s.loadedIterations);
      const pending = new Set(s.pendingLoads);
      for (const iter of iterations) {
        loaded.set(iter.number, iter);
        pending.delete(iter.number);
      }
      return { ...s, loadedIterations: loaded, pendingLoads: pending };
    });
  }, [taskId, state]);

  return state;
}
```

---

### History Export

**Purpose:** Export battle history for documentation or sharing.

**Export Formats:**
```typescript
type ExportFormat = "markdown" | "json" | "html" | "pdf";

interface ExportOptions {
  format: ExportFormat;
  includeFullOutput: boolean;
  includeDiffs: boolean;
  includeFeedbackDetails: boolean;
  iterationRange?: { start: number; end: number };
}

async function exportHistory(
  taskId: string,
  battleId: string,
  options: ExportOptions
): Promise<Blob> {
  const battle = await loadBattle(taskId, battleId);

  switch (options.format) {
    case "markdown":
      return generateMarkdownExport(battle, options);
    case "json":
      return generateJSONExport(battle, options);
    case "html":
      return generateHTMLExport(battle, options);
    case "pdf":
      return generatePDFExport(battle, options);
  }
}
```

**Markdown Export Template:**
```markdown
# Battle Report: {task.title}

## Summary
- **Task ID:** {task.id}
- **Status:** {battle.status}
- **Duration:** {battle.durationMs}ms
- **Iterations:** {battle.iterations.length}
- **Mode:** {battle.mode}

## Timeline

### Iteration 1
**Started:** {iteration.startedAt}
**Result:** {iteration.result}

#### What Changed
{summary.whatChanged.map(c => `- ${c}`)}

#### Files Modified
{summary.filesAffected.map(f => `- ${f.path} (${f.action})`)}

#### Feedback Results
{summary.feedbackResults.map(f => `- ${f.loop}: ${f.passed ? '✓' : '✗'} ${f.summary}`)}

---

### Iteration 2
...
```

**Export UI:**
```
┌────────────────────────────────────────────────────────────────────┐
│  Export Battle History                                   [X Close] │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Format:                                                           │
│  ◉ Markdown (.md)   ○ JSON (.json)   ○ HTML   ○ PDF               │
│                                                                    │
│  Include:                                                          │
│  [✓] Full Claude output                                           │
│  [✓] Git diffs                                                    │
│  [✓] Feedback loop details                                        │
│  [ ] Raw log files                                                 │
│                                                                    │
│  Iteration Range:                                                  │
│  ◉ All iterations (1-5)                                           │
│  ○ Custom range: [___] to [___]                                   │
│                                                                    │
│  Estimated size: ~45KB                                             │
│                                                                    │
│                              [Cancel]       [Export]               │
└────────────────────────────────────────────────────────────────────┘
```

---

## Open Questions

1. **Should we support iteration comparison?** Side-by-side diff between iterations.
2. **Should we support iteration replay?** Re-run a specific iteration.
3. **Should we support annotation?** Add notes to iterations.
4. **Should we support export?** Export history as report. *(Addressed above)*
5. **Should fork preserve the original battle?** Currently yes - forks create new battles.
6. **Should summaries be editable?** Allow users to annotate/correct auto-generated summaries.
