# 11 - Recovery Specification

## Purpose

Recovery handles situations when battles fail, get interrupted, or need manual intervention. This includes resuming from failures, rolling back bad changes, and continuing after manual fixes. A robust recovery system prevents lost work and enables graceful degradation.

## User Stories

### US-RC-1: Resume Failed Battle
**As a** developer
**I want** to resume a battle that failed mid-execution
**So that** I don't lose progress on the task

**Acceptance Criteria:**
- Show why battle failed
- Option to retry from failure point
- Option to start fresh
- Preserve successful iterations

### US-RC-2: Manual Fix and Continue
**As a** developer
**I want** to fix an issue manually and continue the battle
**So that** Claude can build on my fix

**Acceptance Criteria:**
- Pause battle for manual intervention
- Detect when I've made changes
- Re-run feedback loops
- Resume with context of my fix

### US-RC-3: Rollback Changes
**As a** developer
**I want** to roll back changes from a bad iteration
**So that** I can recover from mistakes

**Acceptance Criteria:**
- Revert to specific iteration
- Preserve battle history
- Option to revert all or selective changes
- Clear git history

### US-RC-4: Checkpoint and Restore
**As a** developer
**I want** automatic checkpoints during battle
**So that** I can always recover to a known state

**Acceptance Criteria:**
- Checkpoint after each successful iteration
- List available checkpoints
- Quick restore to any checkpoint
- Automatic cleanup of old checkpoints

---

## Failure Types

### Classification

| Type | Cause | Severity | Recovery Options |
|------|-------|----------|------------------|
| **Feedback Failure** | Tests/lint failed | Low | Retry, fix, skip |
| **Timeout** | Iteration took too long | Medium | Retry, adjust timeout |
| **Claude Error** | API/CLI error | Medium | Retry, check status |
| **System Error** | Disk full, permissions | High | Fix system, retry |
| **Cancellation** | User cancelled | Low | Resume, restart |
| **Crash** | Process killed | High | Resume from checkpoint |

### Failure Detection

```typescript
interface BattleFailure {
  type: FailureType;
  timestamp: string;
  iteration: number;
  message: string;
  details?: string;
  recoverable: boolean;
  suggestedAction: RecoveryAction;
}

type FailureType =
  | "feedback_failure"
  | "timeout"
  | "claude_error"
  | "system_error"
  | "cancellation"
  | "crash";

type RecoveryAction =
  | "retry_iteration"
  | "fix_and_continue"
  | "rollback"
  | "restart"
  | "manual_resolution";

function classifyFailure(error: Error, context: BattleContext): BattleFailure {
  // Feedback loop failures
  if (error instanceof FeedbackLoopError) {
    return {
      type: "feedback_failure",
      timestamp: new Date().toISOString(),
      iteration: context.currentIteration,
      message: `Feedback loop '${error.loop}' failed`,
      details: error.output,
      recoverable: true,
      suggestedAction: "retry_iteration",
    };
  }

  // Timeout
  if (error instanceof TimeoutError) {
    return {
      type: "timeout",
      timestamp: new Date().toISOString(),
      iteration: context.currentIteration,
      message: "Iteration timed out",
      details: `Exceeded ${context.config.timeoutMinutes} minutes`,
      recoverable: true,
      suggestedAction: "retry_iteration",
    };
  }

  // Claude API/CLI errors
  if (error instanceof ClaudeError) {
    return {
      type: "claude_error",
      timestamp: new Date().toISOString(),
      iteration: context.currentIteration,
      message: error.message,
      details: error.stack,
      recoverable: error.retryable,
      suggestedAction: error.retryable ? "retry_iteration" : "manual_resolution",
    };
  }

  // System errors
  return {
    type: "system_error",
    timestamp: new Date().toISOString(),
    iteration: context.currentIteration,
    message: error.message,
    details: error.stack,
    recoverable: false,
    suggestedAction: "manual_resolution",
  };
}
```

---

## Resume From Failure

### Resume Flow

```
┌─────────────────────┐
│   Battle Failed     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     No      ┌─────────────────────┐
│   Recoverable?      │────────────▶│  Show Manual Steps  │
└──────────┬──────────┘             └─────────────────────┘
           │ Yes
           ▼
┌─────────────────────┐
│ Show Recovery Options│
└──────────┬──────────┘
           │
     ┌─────┴─────┬─────────────┐
     ▼           ▼             ▼
┌─────────┐ ┌─────────┐ ┌─────────────┐
│  Retry  │ │Rollback │ │Manual Fix   │
│Iteration│ │& Retry  │ │& Continue   │
└─────────┘ └─────────┘ └─────────────┘
```

### Resume Options

```typescript
interface ResumeOptions {
  strategy: ResumeStrategy;
  fromIteration?: number;
  includeErrorContext: boolean;
  additionalInstructions?: string;
}

type ResumeStrategy =
  | "retry_same"          // Retry the failed iteration
  | "retry_with_context"  // Retry with error context added
  | "rollback_and_retry"  // Revert changes, retry
  | "continue_next"       // Skip to next iteration
  | "manual_then_continue"; // Wait for manual fix
```

### Resume UI

```
┌────────────────────────────────────────────────────────────────────┐
│  Battle Failed: 002-auth-system                                    │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Failure Details                                               │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ Type:       Feedback Failure                                 │ │
│  │ Iteration:  4                                                │ │
│  │ Time:       2024-01-15 14:32:15                              │ │
│  │                                                              │ │
│  │ Error:                                                        │ │
│  │ typecheck failed with 2 errors:                              │ │
│  │ • src/auth.ts:23 - Type 'string | undefined' not assignable  │ │
│  │ • src/auth.ts:45 - Property 'user' does not exist            │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Recovery Options                                              │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ ◉ Retry iteration with error context (Recommended)           │ │
│  │   Re-run iteration 4, tell Claude about the type errors      │ │
│  │                                                              │ │
│  │ ○ Rollback and retry                                         │ │
│  │   Revert changes from iteration 4, retry from clean state    │ │
│  │                                                              │ │
│  │ ○ Fix manually and continue                                  │ │
│  │   Make changes yourself, then resume battle                  │ │
│  │                                                              │ │
│  │ ○ Skip to next iteration                                     │ │
│  │   Accept current state, continue to iteration 5              │ │
│  │                                                              │ │
│  │ ○ Cancel battle                                              │ │
│  │   Stop the battle and review manually                        │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Additional Instructions (optional):                          │ │
│  │ [Consider using type assertions for the undefined case___]  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│                              [Cancel]            [Proceed →]      │
└────────────────────────────────────────────────────────────────────┘
```

### Resume Logic

```typescript
async function resumeBattle(
  taskId: string,
  battleId: string,
  options: ResumeOptions
): Promise<Battle> {
  const battle = await loadBattle(taskId, battleId);
  const failure = battle.failure;

  if (!failure) {
    throw new Error("Battle is not in failed state");
  }

  switch (options.strategy) {
    case "retry_same":
      return retryIteration(battle, {
        includeErrorContext: false,
      });

    case "retry_with_context":
      return retryIteration(battle, {
        includeErrorContext: true,
        errorContext: failure.details,
        additionalInstructions: options.additionalInstructions,
      });

    case "rollback_and_retry":
      await rollbackIteration(battle, failure.iteration);
      return retryIteration(battle, {
        includeErrorContext: true,
        errorContext: `Previous attempt failed: ${failure.message}`,
      });

    case "continue_next":
      return continueToNextIteration(battle);

    case "manual_then_continue":
      return pauseForManualFix(battle);

    default:
      throw new Error(`Unknown resume strategy: ${options.strategy}`);
  }
}

async function retryIteration(
  battle: Battle,
  options: RetryOptions
): Promise<Battle> {
  // Build enhanced prompt
  let prompt = battle.basePrompt;

  if (options.includeErrorContext && options.errorContext) {
    prompt += `\n\n## Previous Attempt Failed\n\n${options.errorContext}`;
  }

  if (options.additionalInstructions) {
    prompt += `\n\n## Additional Instructions\n\n${options.additionalInstructions}`;
  }

  // Reset iteration state
  battle.iterations[battle.currentIteration - 1] = {
    number: battle.currentIteration,
    status: "pending",
    startedAt: null,
    completedAt: null,
    output: null,
    retryCount: (battle.iterations[battle.currentIteration - 1]?.retryCount ?? 0) + 1,
  };

  // Execute
  return executeIteration(battle, prompt);
}
```

---

## Manual Fix and Continue

### Manual Fix Flow

```
┌─────────────────────┐
│   Battle Paused     │
│  (Manual Fix Mode)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  User Makes Changes │
│   in IDE/Editor     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Detect Changes     │
│  (File Watcher)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     Fail     ┌─────────────────────┐
│ Re-run Feedback     │─────────────▶│  Show Errors        │
│     Loops           │              │  Repeat Fix Cycle   │
└──────────┬──────────┘              └─────────────────────┘
           │ Pass
           ▼
┌─────────────────────┐
│  Resume Battle      │
│ (Include Fix Context)│
└─────────────────────┘
```

### Manual Fix UI

```
┌────────────────────────────────────────────────────────────────────┐
│  Battle Paused - Manual Fix Mode                                   │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Current Issue                                                 │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ typecheck failed with 2 errors:                              │ │
│  │                                                              │ │
│  │ src/auth.ts:23:5                                             │ │
│  │ error TS2322: Type 'string | undefined' is not assignable   │ │
│  │                                                              │ │
│  │ src/auth.ts:45:10                                            │ │
│  │ error TS2339: Property 'user' does not exist on type...     │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Instructions                                                  │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ 1. Open your editor and fix the errors above                 │ │
│  │ 2. Save your changes                                         │ │
│  │ 3. Click "Verify Fix" to run feedback loops                  │ │
│  │ 4. If passing, click "Continue Battle"                       │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Detected Changes                                              │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ ● Watching for changes...                                     │ │
│  │   Last detected: (waiting)                                   │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Verification                                                  │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ [Run Feedback Loops]                                         │ │
│  │                                                              │ │
│  │ Results will appear here after running...                    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│      [Cancel Battle]      [Verify Fix]      [Continue Battle →]   │
│                                            (disabled until verified)│
└────────────────────────────────────────────────────────────────────┘
```

### After Changes Detected

```
┌────────────────────────────────────────────────────────────────────┐
│  Battle Paused - Manual Fix Mode                                   │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Detected Changes                                              │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ ✓ Changes detected                                           │ │
│  │   Last detected: 10 seconds ago                              │ │
│  │                                                              │ │
│  │   Modified:                                                  │ │
│  │   • src/auth.ts (+5, -2 lines)                               │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Verification                                                  │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ ✓ test:       8 passed, 0 failed        (2.1s)              │ │
│  │ ✓ lint:       No errors                 (0.4s)              │ │
│  │ ✓ typecheck:  No errors                 (1.2s)              │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ ✓ All feedback loops passing!                                │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Ready to continue                                             │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ Your manual fix will be included in the next iteration.      │ │
│  │ Claude will continue building on your changes.               │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│      [Cancel Battle]      [Verify Again]     [Continue Battle →]  │
└────────────────────────────────────────────────────────────────────┘
```

### Manual Fix Logic

```typescript
interface ManualFixSession {
  id: string;
  battleId: string;
  taskId: string;
  startedAt: string;
  issue: BattleFailure;
  detectedChanges: FileChange[];
  verificationResults: FeedbackResults | null;
  verified: boolean;
  status: "active" | "completed" | "aborted";
}

interface FileChange {
  path: string;
  type: "modified" | "created" | "deleted";
  diff?: string;
}

// Track active sessions and their watchers for cleanup
const activeWatchers = new Map<string, FSWatcher>();

async function startManualFixSession(battle: Battle): Promise<ManualFixSession> {
  const sessionId = generateSessionId();

  const session: ManualFixSession = {
    id: sessionId,
    battleId: battle.id,
    taskId: battle.taskId,
    startedAt: new Date().toISOString(),
    issue: battle.failure!,
    detectedChanges: [],
    verificationResults: null,
    verified: false,
    status: "active",
  };

  // Start file watcher
  const watcher = watch(battle.workingDir, { recursive: true });
  watcher.on("change", (eventType, filename) => {
    if (shouldTrackChange(filename)) {
      session.detectedChanges.push({
        path: filename,
        type: eventType === "rename" ? "created" : "modified",
      });
      emitChangeDetected(session);
    }
  });

  // Track watcher for cleanup
  activeWatchers.set(sessionId, watcher);

  return session;
}

/**
 * Clean up a manual fix session's resources.
 * MUST be called when session ends, whether completed, aborted, or on error.
 *
 * Lifecycle teardown occurs on:
 * - Session complete: User clicks "Continue Battle"
 * - Session abort: User clicks "Cancel Battle"
 * - Battle cancel: Battle cancelled externally
 * - Server shutdown: Graceful shutdown handler
 * - Error: Unhandled error in session
 */
async function cleanupManualFixSession(sessionId: string): Promise<void> {
  const watcher = activeWatchers.get(sessionId);
  if (watcher) {
    watcher.close();
    activeWatchers.delete(sessionId);
  }
}

/**
 * Clean up all active manual fix sessions.
 * Called during server shutdown for graceful teardown.
 */
async function cleanupAllManualFixSessions(): Promise<void> {
  for (const [sessionId, watcher] of activeWatchers) {
    watcher.close();
    activeWatchers.delete(sessionId);
  }
}

async function verifyManualFix(session: ManualFixSession): Promise<boolean> {
  const config = await loadConfig();
  const results = await runFeedbackLoops(config.feedbackLoops);

  session.verificationResults = results;
  session.verified = Object.values(results).every(r => r.passed);

  return session.verified;
}

async function continueAfterManualFix(
  session: ManualFixSession
): Promise<Battle> {
  if (!session.verified) {
    throw new Error("Cannot continue - fix not verified");
  }

  try {
    const battle = await loadBattle(session.taskId, session.battleId);

    // Build context about manual fix
    const fixContext = buildManualFixContext(session);

    // Mark session as completed
    session.status = "completed";

    // Resume battle with fix context
    return resumeBattle(session.taskId, session.battleId, {
      strategy: "continue_next",
      additionalInstructions: fixContext,
    });
  } finally {
    // Always clean up session resources
    await cleanupManualFixSession(session.id);
  }
}

async function abortManualFixSession(session: ManualFixSession): Promise<void> {
  session.status = "aborted";
  await cleanupManualFixSession(session.id);
}

function buildManualFixContext(session: ManualFixSession): string {
  const changes = session.detectedChanges
    .map(c => `- ${c.type}: ${c.path}`)
    .join("\n");

  return `## Manual Fix Applied

The user manually fixed the following issue:
${session.issue.message}

Files changed:
${changes}

Continue building on these changes.`;
}
```

---

## Rollback

### Rollback Types

| Type | Scope | Use Case |
|------|-------|----------|
| **Iteration Rollback** | Single iteration | Undo bad iteration |
| **Checkpoint Restore** | Multiple iterations | Return to known good state |
| **Full Rollback** | Entire battle | Start completely fresh |

### Rollback Logic

```typescript
interface RollbackOptions {
  type: "iteration" | "checkpoint" | "full";
  targetIteration?: number;
  preserveHistory: boolean;
}

async function rollback(
  taskId: string,
  battleId: string,
  options: RollbackOptions
): Promise<RollbackResult> {
  const battle = await loadBattle(taskId, battleId);

  switch (options.type) {
    case "iteration":
      return rollbackIteration(battle, options.targetIteration!);

    case "checkpoint":
      return rollbackToCheckpoint(battle, options.targetIteration!);

    case "full":
      return rollbackFull(battle);
  }
}

async function rollbackIteration(
  battle: Battle,
  iteration: number
): Promise<RollbackResult> {
  // 1. Find the checkpoint before this iteration
  const checkpoint = battle.checkpoints.find(
    cp => cp.afterIteration === iteration - 1
  );

  if (!checkpoint) {
    throw new Error(`No checkpoint found before iteration ${iteration}`);
  }

  // 2. Restore using the appropriate storage strategy
  const storage = getCheckpointStorage(battle.config);
  await storage.restore(checkpoint, battle.workingDir);

  // 3. Update battle state
  battle.currentIteration = iteration;
  battle.iterations = battle.iterations.slice(0, iteration - 1);
  battle.status = "paused";

  await saveBattle(battle);

  return {
    success: true,
    restoredToIteration: iteration - 1,
    checkpointId: checkpoint.id,
    storageType: checkpoint.storageType,
  };
}

async function rollbackToCheckpoint(
  battle: Battle,
  targetIteration: number
): Promise<RollbackResult> {
  const checkpoint = battle.checkpoints.find(
    cp => cp.afterIteration === targetIteration
  );

  if (!checkpoint) {
    throw new Error(`No checkpoint found for iteration ${targetIteration}`);
  }

  // Restore using the appropriate storage strategy
  const storage = getCheckpointStorage(battle.config);
  await storage.restore(checkpoint, battle.workingDir);

  // Update battle
  battle.currentIteration = targetIteration + 1;
  battle.iterations = battle.iterations.slice(0, targetIteration);
  battle.status = "paused";

  await saveBattle(battle);

  return {
    success: true,
    restoredToIteration: targetIteration,
    checkpointId: checkpoint.id,
    storageType: checkpoint.storageType,
  };
}

async function rollbackFull(battle: Battle): Promise<RollbackResult> {
  // Find initial checkpoint before battle started
  const initialCheckpoint = battle.checkpoints[0];

  if (!initialCheckpoint) {
    throw new Error("No initial checkpoint found");
  }

  // Restore using the appropriate storage strategy
  const storage = getCheckpointStorage(battle.config);
  await storage.restore(initialCheckpoint, battle.workingDir);

  // Reset battle
  battle.currentIteration = 1;
  battle.iterations = [];
  battle.status = "pending";
  battle.failure = null;

  await saveBattle(battle);

  return {
    success: true,
    restoredToIteration: 0,
    checkpointId: initialCheckpoint.id,
    storageType: initialCheckpoint.storageType,
  };
}
```

### Rollback UI

```
┌────────────────────────────────────────────────────────────────────┐
│  Rollback: 002-auth-system                               [X Close] │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ⚠️ Warning: This action cannot be undone!                         │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Rollback Target                                               │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ ○ Rollback iteration 4 only                                  │ │
│  │   Revert changes from the last iteration                     │ │
│  │                                                              │ │
│  │ ◉ Rollback to iteration 2                                    │ │
│  │   Restore to state after "Set up JWT middleware"             │ │
│  │                                                              │ │
│  │ ○ Rollback entire battle                                     │ │
│  │   Revert all changes and start fresh                         │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Available Checkpoints                                         │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ ● Before battle     abc1234  (2024-01-15 14:00)             │ │
│  │ ✓ After iteration 1 def5678  (2024-01-15 14:12)             │ │
│  │ ✓ After iteration 2 ghi9012  (2024-01-15 14:25) ◀ Selected  │ │
│  │ ✓ After iteration 3 jkl3456  (2024-01-15 14:38)             │ │
│  │ ✗ After iteration 4 mno7890  (2024-01-15 14:51) Failed      │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ What will happen:                                             │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ • Git will be reset to commit ghi9012                        │ │
│  │ • Iterations 3-4 will be marked as rolled back               │ │
│  │ • Battle history will be preserved for reference             │ │
│  │ • You can then retry from iteration 3                        │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│                              [Cancel]              [Rollback →]   │
└────────────────────────────────────────────────────────────────────┘
```

---

## Checkpoints

### Checkpoint System

```typescript
type CheckpointStorageType = "commit" | "patch";

interface Checkpoint {
  id: string;
  battleId: string;
  afterIteration: number;
  storageType: CheckpointStorageType;
  // For commit-based storage
  commitHash?: string;
  // For patch-based storage (when autoCommit=false)
  patch?: string;           // Git diff patch content
  baseCommitHash?: string;  // The commit this patch applies to
  timestamp: string;
  description: string;
  files: string[];
  feedbackResults: FeedbackResults;
}

interface CheckpointStorage {
  type: CheckpointStorageType;

  // Create a checkpoint at current state
  create(battle: Battle, iteration: number): Promise<Checkpoint>;

  // Restore to a checkpoint
  restore(checkpoint: Checkpoint, workingDir: string): Promise<void>;
}

/**
 * Commit-based checkpoint storage (when autoCommit=true)
 * Creates actual git commits for each iteration
 */
class CommitCheckpointStorage implements CheckpointStorage {
  type: CheckpointStorageType = "commit";

  async create(battle: Battle, iteration: number): Promise<Checkpoint> {
    const commitHash = await git.commit(
      battle.workingDir,
      `pokeralph: ${battle.taskId} iteration ${iteration}`
    );

    const files = await git.getChangedFiles(
      battle.workingDir,
      battle.checkpoints[0]?.commitHash ?? "HEAD~1",
      commitHash
    );

    return {
      id: generateCheckpointId(),
      battleId: battle.id,
      afterIteration: iteration,
      storageType: "commit",
      commitHash,
      timestamp: new Date().toISOString(),
      description: generateCheckpointDescription(battle.iterations[iteration - 1]),
      files,
      feedbackResults: battle.iterations[iteration - 1].feedbackResults,
    };
  }

  async restore(checkpoint: Checkpoint, workingDir: string): Promise<void> {
    if (!checkpoint.commitHash) {
      throw new Error("Commit-based checkpoint missing commitHash");
    }
    await git.reset(workingDir, checkpoint.commitHash, { hard: true });
  }
}

/**
 * Patch-based checkpoint storage (when autoCommit=false)
 * Stores diffs instead of creating commits, allowing rollback
 * even when the user hasn't committed changes
 */
class PatchCheckpointStorage implements CheckpointStorage {
  type: CheckpointStorageType = "patch";

  async create(battle: Battle, iteration: number): Promise<Checkpoint> {
    const baseCommitHash = await git.getHead(battle.workingDir);

    // Get diff of all changes since battle start
    const previousCheckpoint = battle.checkpoints[iteration - 2];
    const diffBase = previousCheckpoint?.baseCommitHash ??
                     battle.checkpoints[0]?.baseCommitHash ??
                     baseCommitHash;

    // Generate patch of current working directory state
    const patch = await git.diff(battle.workingDir, {
      cached: false,  // Include unstaged changes
      includeUntracked: true,
    });

    const files = await git.getChangedFiles(battle.workingDir);

    return {
      id: generateCheckpointId(),
      battleId: battle.id,
      afterIteration: iteration,
      storageType: "patch",
      patch,
      baseCommitHash,
      timestamp: new Date().toISOString(),
      description: generateCheckpointDescription(battle.iterations[iteration - 1]),
      files,
      feedbackResults: battle.iterations[iteration - 1].feedbackResults,
    };
  }

  async restore(checkpoint: Checkpoint, workingDir: string): Promise<void> {
    if (!checkpoint.patch || !checkpoint.baseCommitHash) {
      throw new Error("Patch-based checkpoint missing patch or baseCommitHash");
    }

    // 1. Reset to the base commit
    await git.reset(workingDir, checkpoint.baseCommitHash, { hard: true });

    // 2. Apply the stored patch
    if (checkpoint.patch.trim()) {
      await git.applyPatch(workingDir, checkpoint.patch);
    }
  }
}

/**
 * Factory function to get the appropriate checkpoint storage
 */
function getCheckpointStorage(config: BattleConfig): CheckpointStorage {
  return config.autoCommit
    ? new CommitCheckpointStorage()
    : new PatchCheckpointStorage();
}

async function createCheckpoint(
  battle: Battle,
  iteration: number
): Promise<Checkpoint> {
  const storage = getCheckpointStorage(battle.config);
  const checkpoint = await storage.create(battle, iteration);

  // Save checkpoint
  battle.checkpoints.push(checkpoint);
  await saveBattle(battle);

  return checkpoint;
}

function generateCheckpointDescription(iteration: Iteration): string {
  if (iteration.summary) {
    return iteration.summary.headline;
  }

  return `After iteration ${iteration.number}`;
}
```

### Checkpoint Cleanup

```typescript
interface CheckpointRetentionPolicy {
  maxCheckpoints: number;
  maxAge: number;  // milliseconds
  keepFailed: boolean;
  keepSuccessful: boolean;
}

const DEFAULT_RETENTION: CheckpointRetentionPolicy = {
  maxCheckpoints: 10,
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
  keepFailed: true,
  keepSuccessful: true,
};

async function cleanupCheckpoints(
  battle: Battle,
  policy: CheckpointRetentionPolicy = DEFAULT_RETENTION
): Promise<void> {
  const now = Date.now();
  const toRemove: string[] = [];

  // Sort by timestamp, newest first
  const sorted = [...battle.checkpoints].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  for (let i = 0; i < sorted.length; i++) {
    const cp = sorted[i];
    const age = now - new Date(cp.timestamp).getTime();

    // Keep first few checkpoints
    if (i < policy.maxCheckpoints) {
      continue;
    }

    // Check age
    if (age > policy.maxAge) {
      toRemove.push(cp.id);
      continue;
    }

    // Check if it's worth keeping
    const allPassed = Object.values(cp.feedbackResults).every(r => r.passed);
    if (!allPassed && policy.keepFailed) {
      continue;
    }
    if (allPassed && policy.keepSuccessful) {
      continue;
    }

    toRemove.push(cp.id);
  }

  // Remove checkpoints
  battle.checkpoints = battle.checkpoints.filter(cp => !toRemove.includes(cp.id));
  await saveBattle(battle);
}
```

---

## API Specification

### POST /api/recovery/resume

Resume a failed battle.

**Request:**
```typescript
interface ResumeRequest {
  taskId: string;
  battleId: string;
  options: ResumeOptions;
}
```

**Response:**
```typescript
interface ResumeResponse {
  battle: Battle;
}
```

---

### POST /api/recovery/rollback

Rollback to a previous state.

**Request:**
```typescript
interface RollbackRequest {
  taskId: string;
  battleId: string;
  options: RollbackOptions;
}
```

**Response:**
```typescript
interface RollbackResponse {
  result: RollbackResult;
}
```

---

### POST /api/recovery/manual-fix/start

Start manual fix session.

**Request:**
```typescript
interface StartManualFixRequest {
  taskId: string;
  battleId: string;
}
```

**Response:**
```typescript
interface StartManualFixResponse {
  session: ManualFixSession;
}
```

---

### POST /api/recovery/manual-fix/verify

Verify manual fix.

**Request:**
```typescript
interface VerifyManualFixRequest {
  sessionId: string;
}
```

**Response:**
```typescript
interface VerifyManualFixResponse {
  verified: boolean;
  results: FeedbackResults;
}
```

---

### POST /api/recovery/manual-fix/continue

Continue after manual fix.

**Request:**
```typescript
interface ContinueManualFixRequest {
  sessionId: string;
}
```

**Response:**
```typescript
interface ContinueManualFixResponse {
  battle: Battle;
}
```

---

## Error Handling

### Recovery Errors

| Error | Cause | User Message | Recovery |
|-------|-------|--------------|----------|
| No checkpoint | Missing checkpoint | "No checkpoint available" | Start fresh |
| Git conflict | Rollback conflicts | "Rollback failed - conflicts" | Manual resolution |
| Verify failed | Fix didn't work | "Verification failed" | Try again |

---

## Testing Requirements

### Unit Tests
- [ ] Failure classification works correctly
- [ ] Resume strategies execute properly
- [ ] Rollback restores correct state
- [ ] Checkpoints created correctly

### Integration Tests
- [ ] Full resume flow works
- [ ] Manual fix session works
- [ ] Rollback preserves history
- [ ] Checkpoint cleanup works

### E2E Tests
- [ ] User can resume failed battle
- [ ] User can rollback to checkpoint
- [ ] Manual fix flow completes
- [ ] UI shows correct options

---

## Open Questions

1. **Should checkpoints be stored separately from battle history?**
2. **Should we support partial rollback (some files only)?**
3. **Should recovery options be configurable per-task?**
4. **Should we integrate with IDE for manual fix mode?**
