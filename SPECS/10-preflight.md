# 10 - Preflight Specification

## Purpose

Preflight is the validation stage before starting a battle. It ensures the environment is ready, checks for potential issues, and gives users confidence about what will happen. A thorough preflight process prevents wasted iterations and confusing failures.

## User Stories

### US-PF-1: Environment Validation
**As a** developer
**I want** to know if my environment is ready for a battle
**So that** I don't waste iterations on fixable issues

**Acceptance Criteria:**
- Check git status
- Validate feedback loops exist
- Verify configuration
- Check for active battles

### US-PF-2: Battle Preview
**As a** developer
**I want** to see what a battle will do before it starts
**So that** I can make informed decisions

**Acceptance Criteria:**
- Show task summary
- Display configuration
- Estimate iterations
- Show affected files (when possible)

### US-PF-3: Warning Handling
**As a** developer
**I want** to be warned about non-blocking issues
**So that** I can decide whether to proceed

**Acceptance Criteria:**
- Distinguish errors from warnings
- Allow proceeding with warnings
- Provide fix suggestions
- Remember warning dismissals

### US-PF-4: Dry Run Option
**As a** developer
**I want** to preview what Claude will do
**So that** I can validate the approach before committing

**Acceptance Criteria:**
- Show generated prompt
- List expected file changes
- Estimate duration
- No actual changes made

---

## Preflight Checks

### Check Categories

| Category | Severity | Description |
|----------|----------|-------------|
| **Blocker** | Error | Must be fixed before battle can start |
| **Warning** | Warning | Can proceed but may cause issues |
| **Info** | Info | FYI, no action needed |

### Standard Checks

```typescript
interface PreflightCheck {
  id: string;
  name: string;
  description: string;
  category: "environment" | "git" | "config" | "task" | "system";
  severity: "error" | "warning" | "info";
  check: (context: PreflightContext) => Promise<PreflightResult>;
  fix?: (context: PreflightContext) => Promise<FixResult>;
}

interface PreflightContext {
  taskId: string;
  task: Task;
  config: Config;
  workingDir: string;
  // Stash reference if auto-stash was used during preflight
  stashRef?: string;
}

/**
 * Restore stashed changes after battle completes or is cancelled.
 * UI should show "Restore Stashed Changes" action when stashRef exists.
 */
async function restoreStashedChanges(workingDir: string, stashRef: string): Promise<FixResult> {
  try {
    await git.stashPop(workingDir, stashRef);
    return { success: true, message: "Stashed changes restored" };
  } catch (error) {
    return {
      success: false,
      message: `Failed to restore stash: ${error.message}. Run 'git stash list' to find your changes.`,
    };
  }
}

interface PreflightResult {
  passed: boolean;
  message: string;
  details?: string;
  canProceed: boolean;
  suggestion?: string;
}

interface FixResult {
  success: boolean;
  message: string;
  metadata?: Record<string, unknown>;  // Optional metadata (e.g., stashRef)
}

/**
 * Tokenize a shell command to extract the executable name.
 * Handles quoted strings, paths, and various command formats.
 *
 * Examples:
 *   "bun test --watch"      → "bun"
 *   "npm run lint"          → "npm"
 *   "/usr/local/bin/node"   → "node" (basename)
 *   "NODE_ENV=test bun test"→ "bun" (skip env vars)
 *   "'my command' args"     → "my command"
 */
function tokenizeCommand(command: string): string {
  const trimmed = command.trim();

  // Skip leading environment variable assignments (VAR=value)
  const parts = trimmed.split(/\s+/);
  let executablePart = parts[0];

  for (const part of parts) {
    if (!part.includes("=")) {
      executablePart = part;
      break;
    }
  }

  // Handle quoted commands
  if (executablePart.startsWith('"') || executablePart.startsWith("'")) {
    const quote = executablePart[0];
    const endQuote = command.indexOf(quote, command.indexOf(quote) + 1);
    if (endQuote > 0) {
      executablePart = command.slice(1, endQuote);
    }
  }

  // Extract basename if it's a path
  if (executablePart.includes("/")) {
    executablePart = executablePart.split("/").pop() ?? executablePart;
  }

  return executablePart;
}
```

### Environment Checks

```typescript
const ENVIRONMENT_CHECKS: PreflightCheck[] = [
  {
    id: "claude_cli",
    name: "Claude CLI",
    description: "Verify Claude CLI is installed and accessible",
    category: "environment",
    severity: "error",
    check: async () => {
      try {
        const result = await Bun.spawn(["claude", "--version"]).exited;
        return {
          passed: result === 0,
          message: result === 0 ? "Claude CLI available" : "Claude CLI not found",
          canProceed: result === 0,
          suggestion: "Install Claude CLI: npm install -g @anthropic-ai/claude-cli",
        };
      } catch {
        return {
          passed: false,
          message: "Claude CLI not found",
          canProceed: false,
          suggestion: "Install Claude CLI: npm install -g @anthropic-ai/claude-cli",
        };
      }
    },
  },

  {
    id: "disk_space",
    name: "Disk Space",
    description: "Check available disk space",
    category: "environment",
    severity: "warning",
    check: async (ctx) => {
      const space = await checkDiskSpace(ctx.workingDir);
      const minRequired = 100 * 1024 * 1024;  // 100MB
      const passed = space.available > minRequired;

      return {
        passed,
        message: passed
          ? `${formatBytes(space.available)} available`
          : `Only ${formatBytes(space.available)} available`,
        canProceed: true,
        suggestion: passed ? undefined : "Free up disk space before proceeding",
      };
    },
  },

  {
    id: "memory",
    name: "Available Memory",
    description: "Check system memory",
    category: "environment",
    severity: "info",
    check: async () => {
      const mem = process.memoryUsage();
      const heapUsed = mem.heapUsed / 1024 / 1024;

      return {
        passed: true,
        message: `${heapUsed.toFixed(0)}MB heap used`,
        canProceed: true,
      };
    },
  },
];
```

### Git Checks

```typescript
const GIT_CHECKS: PreflightCheck[] = [
  {
    id: "repo_status",
    name: "Repository Status",
    description: "Check for uncommitted changes",
    category: "git",
    severity: "warning",
    check: async (ctx) => {
      const status = await git.status(ctx.workingDir);

      if (status.isClean) {
        return {
          passed: true,
          message: "Working tree is clean",
          canProceed: true,
        };
      }

      return {
        passed: false,
        message: `${status.files.length} uncommitted changes`,
        details: status.files.slice(0, 10).join("\n") +
          (status.files.length > 10 ? `\n... and ${status.files.length - 10} more` : ""),
        canProceed: true,
        suggestion: "Consider committing or stashing changes",
      };
    },
    fix: async (ctx) => {
      const stashRef = await git.stash(ctx.workingDir, "pokeralph-preflight-stash");
      // Store stash reference in preflight state for later restore
      ctx.stashRef = stashRef;
      return {
        success: true,
        message: "Changes stashed",
        metadata: { stashRef },  // Include in response for UI
      };
    },
  },

  {
    id: "branch_tracking",
    name: "Branch Tracking",
    description: "Check if branch tracks a remote",
    category: "git",
    severity: "info",
    check: async (ctx) => {
      const branch = await git.currentBranch(ctx.workingDir);
      const tracking = await git.trackingBranch(ctx.workingDir);

      if (tracking) {
        const ahead = await git.aheadBehind(ctx.workingDir);
        return {
          passed: true,
          message: `On ${branch}, tracking ${tracking} (${ahead.ahead} ahead, ${ahead.behind} behind)`,
          canProceed: true,
        };
      }

      return {
        passed: true,
        message: `On ${branch}, not tracking remote`,
        canProceed: true,
      };
    },
  },

  {
    id: "conflicts",
    name: "Merge Conflicts",
    description: "Check for unresolved merge conflicts",
    category: "git",
    severity: "error",
    check: async (ctx) => {
      const hasConflicts = await git.hasConflicts(ctx.workingDir);

      return {
        passed: !hasConflicts,
        message: hasConflicts ? "Unresolved merge conflicts detected" : "No merge conflicts",
        canProceed: !hasConflicts,
        suggestion: hasConflicts ? "Resolve merge conflicts before starting battle" : undefined,
      };
    },
  },
];
```

### Configuration Checks

```typescript
const CONFIG_CHECKS: PreflightCheck[] = [
  {
    id: "config_valid",
    name: "Configuration Valid",
    description: "Validate battle configuration",
    category: "config",
    severity: "error",
    check: async (ctx) => {
      const validation = validateConfig(ctx.config);

      return {
        passed: validation.valid,
        message: validation.valid ? "Configuration valid" : validation.errors.join(", "),
        details: validation.warnings?.join("\n"),
        canProceed: validation.valid,
      };
    },
  },

  {
    id: "feedback_loops",
    name: "Feedback Loops",
    description: "Verify feedback loop commands exist",
    category: "config",
    severity: "error",
    check: async (ctx) => {
      const results: { loop: string; valid: boolean; error?: string }[] = [];

      for (const loop of ctx.config.feedbackLoops) {
        const fullCommand = getLoopCommand(loop, ctx.config);
        // Tokenize command to extract the executable
        // "bun test --watch" → validate "bun", not the full string
        const executable = tokenizeCommand(fullCommand);
        const exists = await commandExists(executable);
        results.push({
          loop,
          valid: exists,
          error: exists ? undefined : `Command not found: ${executable} (from: ${fullCommand})`,
        });
      }

      const allValid = results.every(r => r.valid);
      const invalid = results.filter(r => !r.valid);

      return {
        passed: allValid,
        message: allValid
          ? `All ${results.length} feedback loops available`
          : `${invalid.length} loops unavailable`,
        details: results.map(r => `${r.loop}: ${r.valid ? "✓" : r.error}`).join("\n"),
        canProceed: false,
        suggestion: invalid.length > 0
          ? `Check commands in Settings: ${invalid.map(r => r.loop).join(", ")}`
          : undefined,
      };
    },
  },

  {
    id: "iteration_limit",
    name: "Iteration Limit",
    description: "Check if iteration limit is reasonable",
    category: "config",
    severity: "info",
    check: async (ctx) => {
      const limit = ctx.config.maxIterationsPerTask;

      if (limit > 20) {
        return {
          passed: true,
          message: `Max ${limit} iterations - consider reducing if task is well-scoped`,
          canProceed: true,
        };
      }

      return {
        passed: true,
        message: `Max ${limit} iterations`,
        canProceed: true,
      };
    },
  },
];
```

### Task Checks

```typescript
const TASK_CHECKS: PreflightCheck[] = [
  {
    id: "task_status",
    name: "Task Status",
    description: "Check task is ready to battle",
    category: "task",
    severity: "error",
    check: async (ctx) => {
      if (ctx.task.status === "completed") {
        return {
          passed: false,
          message: "Task is already completed",
          canProceed: false,
          suggestion: "Choose a pending or in-progress task",
        };
      }

      if (ctx.task.status === "in_progress") {
        return {
          passed: true,
          message: "Task has previous battle history",
          canProceed: true,
        };
      }

      return {
        passed: true,
        message: "Task is ready",
        canProceed: true,
      };
    },
  },

  {
    id: "no_concurrent",
    name: "No Active Battle",
    description: "Check no other battle is running",
    category: "task",
    severity: "error",
    check: async () => {
      const activeBattle = await getActiveBattle();

      if (activeBattle) {
        return {
          passed: false,
          message: `Battle for ${activeBattle.taskId} is running`,
          canProceed: false,
          suggestion: "Wait for current battle to complete or cancel it",
        };
      }

      return {
        passed: true,
        message: "No active battle",
        canProceed: true,
      };
    },
  },

  {
    id: "acceptance_criteria",
    name: "Acceptance Criteria",
    description: "Check task has acceptance criteria",
    category: "task",
    severity: "warning",
    check: async (ctx) => {
      const criteria = ctx.task.acceptanceCriteria ?? [];

      if (criteria.length === 0) {
        return {
          passed: false,
          message: "No acceptance criteria defined",
          canProceed: true,
          suggestion: "Add acceptance criteria to help Claude understand success",
        };
      }

      return {
        passed: true,
        message: `${criteria.length} acceptance criteria defined`,
        canProceed: true,
      };
    },
  },

  {
    id: "task_complexity",
    name: "Task Complexity",
    description: "Estimate task complexity",
    category: "task",
    severity: "info",
    check: async (ctx) => {
      const risk = assessTaskRisk(ctx.task);

      return {
        passed: true,
        message: `${risk.level} complexity - ${risk.recommendation}`,
        details: risk.factors.map(f => `• ${f.name}: ${f.description}`).join("\n"),
        canProceed: true,
      };
    },
  },
];
```

---

## Preflight Runner

### Execution Logic

```typescript
interface PreflightReport {
  taskId: string;
  timestamp: string;
  duration: number;
  results: PreflightCheckResult[];
  summary: PreflightSummary;
  canStart: boolean;
}

interface PreflightCheckResult {
  check: PreflightCheck;
  result: PreflightResult;
  duration: number;
}

/**
 * DTO for API responses - excludes non-serializable function references
 * from PreflightCheck. Use toDTO() to convert before sending over the wire.
 */
interface PreflightCheckResultDTO {
  check: {
    id: string;
    name: string;
    description: string;
    category: "environment" | "git" | "config" | "task" | "system";
    severity: "error" | "warning" | "info";
    // Note: check and fix functions are NOT included in DTO
    hasAutoFix: boolean;  // Indicates if auto-fix is available
  };
  result: PreflightResult;
  duration: number;
}

/**
 * Convert PreflightCheckResult to serializable DTO for API responses
 */
function toPreflightCheckResultDTO(result: PreflightCheckResult): PreflightCheckResultDTO {
  return {
    check: {
      id: result.check.id,
      name: result.check.name,
      description: result.check.description,
      category: result.check.category,
      severity: result.check.severity,
      hasAutoFix: typeof result.check.fix === "function",
    },
    result: result.result,
    duration: result.duration,
  };
}

interface PreflightSummary {
  total: number;
  passed: number;
  warnings: number;
  errors: number;
}

async function runPreflight(context: PreflightContext): Promise<PreflightReport> {
  const startTime = Date.now();
  const results: PreflightCheckResult[] = [];

  const allChecks = [
    ...ENVIRONMENT_CHECKS,
    ...GIT_CHECKS,
    ...CONFIG_CHECKS,
    ...TASK_CHECKS,
  ];

  // Run checks in parallel where possible
  const checkPromises = allChecks.map(async (check) => {
    const checkStart = Date.now();
    const result = await check.check(context);
    return {
      check,
      result,
      duration: Date.now() - checkStart,
    };
  });

  const settledResults = await Promise.allSettled(checkPromises);

  for (const settled of settledResults) {
    if (settled.status === "fulfilled") {
      results.push(settled.value);
    } else {
      // Check threw an error
      results.push({
        check: allChecks[settledResults.indexOf(settled)],
        result: {
          passed: false,
          message: `Check failed: ${settled.reason}`,
          canProceed: false,
        },
        duration: 0,
      });
    }
  }

  // Calculate summary
  const summary: PreflightSummary = {
    total: results.length,
    passed: results.filter(r => r.result.passed).length,
    warnings: results.filter(r => !r.result.passed && r.result.canProceed).length,
    errors: results.filter(r => !r.result.passed && !r.result.canProceed).length,
  };

  const canStart = summary.errors === 0;

  return {
    taskId: context.taskId,
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    results,
    summary,
    canStart,
  };
}
```

---

## Preflight UI

### Full Preflight View

```
┌────────────────────────────────────────────────────────────────────┐
│  Battle Preflight: 002-auth-system                                 │
│  ═══════════════════════════════════════════════════════════════  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Task Summary                                                  │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ Title:       Implement user authentication                   │ │
│  │ Description: Add JWT-based auth with login/logout...         │ │
│  │ Priority:    2                                               │ │
│  │ Criteria:    5 acceptance criteria                           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Preflight Checks                                     12 / 12 │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │                                                              │ │
│  │ Environment                                                  │ │
│  │ ✓ Claude CLI            Available (v1.2.3)                  │ │
│  │ ✓ Disk Space            12.4 GB available                   │ │
│  │ ℹ Memory                 156 MB heap used                    │ │
│  │                                                              │ │
│  │ Git                                                          │ │
│  │ ⚠ Repository Status     3 uncommitted changes    [View] [Fix]│ │
│  │ ✓ Branch Tracking       On main, tracking origin/main       │ │
│  │ ✓ Merge Conflicts       No conflicts                        │ │
│  │                                                              │ │
│  │ Configuration                                                │ │
│  │ ✓ Config Valid          Configuration valid                 │ │
│  │ ✓ Feedback Loops        3 loops available                   │ │
│  │ ℹ Iteration Limit       Max 10 iterations                    │ │
│  │                                                              │ │
│  │ Task                                                         │ │
│  │ ✓ Task Status           Task is ready                        │ │
│  │ ✓ No Active Battle      No active battle                     │ │
│  │ ✓ Acceptance Criteria   5 criteria defined                   │ │
│  │ ℹ Task Complexity       Medium risk - consider HITL          │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Summary                                                       │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ ✓ 10 passed  ⚠ 1 warning  ✗ 0 errors  ℹ 3 info              │ │
│  │                                                              │ │
│  │ Battle can start. Review warning above if concerned.        │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Battle Configuration                                          │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ Mode:           ◉ HITL  ○ YOLO                               │ │
│  │ Max Iterations: 10                                            │ │
│  │ Auto-commit:    Enabled                                       │ │
│  │ Feedback Loops: test → lint → typecheck                      │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│       [Run Dry Run]           [Cancel]           [Start Battle →] │
└────────────────────────────────────────────────────────────────────┘
```

### Compact Preflight (Quick Start)

```
┌────────────────────────────────────────────────────────────────────┐
│  Quick Preflight                                                   │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  ✓ Environment ready   ⚠ 1 warning   ✓ Config valid   ✓ Task OK  │
│                                                                    │
│  ⚠ 3 uncommitted changes - Continue anyway?                       │
│                                                                    │
│                              [View Details]      [Start Battle →]  │
└────────────────────────────────────────────────────────────────────┘
```

### Error State

```
┌────────────────────────────────────────────────────────────────────┐
│  ✗ Cannot Start Battle                                             │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  2 blocking issues found:                                          │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ ✗ Feedback Loops                                              │ │
│  │   Command 'bun test' not found                               │ │
│  │   → Check that bun is installed and in PATH                   │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ ✗ Active Battle                                               │ │
│  │   Battle for 001-setup-project is running                    │ │
│  │   → Wait for completion or cancel it                         │ │
│  │                                            [View Battle]      │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│                              [Cancel]      [Start Battle] (disabled)│
└────────────────────────────────────────────────────────────────────┘
```

---

## Dry Run Feature

### Dry Run Process

```typescript
type ConfidenceLevel = "high" | "medium" | "low";

interface DryRunResult {
  taskId: string;
  timestamp: string;

  // What would be sent to Claude
  prompt: {
    full: string;           // Complete prompt (only shown if user clicks "Show full prompt")
    redacted: string;       // Prompt with sensitive data redacted (default view)
    redactedFields: string[]; // List of what was redacted
  };
  promptTokens: number;

  // Predictions with confidence levels
  filesLikelyAffected: {
    files: string[];
    confidence: ConfidenceLevel;
    reason: string;  // Why this confidence level
  };
  estimatedIterations: {
    min: number;
    max: number;
    confidence: ConfidenceLevel;
    reason: string;
  };
  estimatedDuration: {
    min: number;
    max: number;
    confidence: ConfidenceLevel;
    reason: string;
  };

  // Context used
  existingFiles: string[];
  contextSize: number;
}

/**
 * Patterns for sensitive data that should be redacted in dry run prompt preview
 */
const SENSITIVE_PATTERNS = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[\w-]+["']?/gi, label: "API keys" },
  { pattern: /(?:password|passwd|pwd)\s*[:=]\s*["']?[^\s"']+["']?/gi, label: "Passwords" },
  { pattern: /(?:secret|token)\s*[:=]\s*["']?[\w-]+["']?/gi, label: "Secrets/Tokens" },
  { pattern: /(?:aws_)?(?:access_key|secret_key)\s*[:=]\s*["']?[\w/+=]+["']?/gi, label: "AWS credentials" },
  { pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END/gi, label: "Private keys" },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, label: "GitHub tokens" },
  { pattern: /sk-[a-zA-Z0-9]{32,}/g, label: "OpenAI API keys" },
];

function redactSensitiveData(prompt: string): { redacted: string; redactedFields: string[] } {
  let redacted = prompt;
  const redactedFields: string[] = [];

  for (const { pattern, label } of SENSITIVE_PATTERNS) {
    if (pattern.test(redacted)) {
      redacted = redacted.replace(pattern, `[REDACTED: ${label}]`);
      if (!redactedFields.includes(label)) {
        redactedFields.push(label);
      }
    }
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
  }

  return { redacted, redactedFields };
}

async function runDryRun(context: PreflightContext): Promise<DryRunResult> {
  // 1. Build the prompt that would be sent
  const fullPrompt = await buildPrompt(context.task, context.config);
  const { redacted, redactedFields } = redactSensitiveData(fullPrompt);

  // 2. Analyze task to predict affected files
  const filesLikelyAffected = predictAffectedFiles(context.task);
  const fileConfidence = assessFileConfidence(context.task, filesLikelyAffected);

  // 3. Estimate iterations based on task complexity
  const risk = assessTaskRisk(context.task);
  const estimatedIterations = estimateIterations(risk);
  const iterationConfidence = assessIterationConfidence(context.task, risk);

  // 4. Estimate duration
  const estimatedDuration = estimateDuration(estimatedIterations, context.config);
  const durationConfidence = assessDurationConfidence(estimatedIterations);

  return {
    taskId: context.taskId,
    timestamp: new Date().toISOString(),
    prompt: {
      full: fullPrompt,
      redacted,
      redactedFields,
    },
    promptTokens: countTokens(fullPrompt),
    filesLikelyAffected: {
      files: filesLikelyAffected,
      ...fileConfidence,
    },
    estimatedIterations: {
      ...estimatedIterations,
      ...iterationConfidence,
    },
    estimatedDuration: {
      ...estimatedDuration,
      ...durationConfidence,
    },
    existingFiles: await listRelevantFiles(context.workingDir, context.task),
    contextSize: await measureContextSize(context.workingDir),
  };
}

function assessFileConfidence(task: Task, files: string[]): { confidence: ConfidenceLevel; reason: string } {
  // High confidence: explicit file mentions in task
  if (files.length > 0 && task.description.includes(files[0])) {
    return { confidence: "high", reason: "Files explicitly mentioned in task description" };
  }
  // Medium confidence: reasonable inference from task
  if (files.length > 0) {
    return { confidence: "medium", reason: "Files inferred from task keywords" };
  }
  // Low confidence: no specific files identified
  return { confidence: "low", reason: "No specific files identified, will depend on Claude's analysis" };
}

function assessIterationConfidence(task: Task, risk: TaskRisk): { confidence: ConfidenceLevel; reason: string } {
  if (risk.level === "low" && task.acceptanceCriteria.length <= 3) {
    return { confidence: "high", reason: "Well-scoped task with clear criteria" };
  }
  if (risk.level === "medium") {
    return { confidence: "medium", reason: "Moderately complex task" };
  }
  return { confidence: "low", reason: "Complex task with multiple unknowns" };
}

function assessDurationConfidence(iterations: { min: number; max: number }): { confidence: ConfidenceLevel; reason: string } {
  const range = iterations.max - iterations.min;
  if (range <= 2) {
    return { confidence: "high", reason: "Narrow iteration range" };
  }
  if (range <= 5) {
    return { confidence: "medium", reason: "Moderate iteration range" };
  }
  return { confidence: "low", reason: "Wide iteration range indicates uncertainty" };
}

function predictAffectedFiles(task: Task): string[] {
  const files: string[] = [];

  // Parse task description for file hints
  const patterns = [
    /(?:create|add|modify|update|edit)\s+(?:the\s+)?(\S+\.\w+)/gi,
    /(?:in|at)\s+(\S+\.\w+)/gi,
    /(\S+\.(ts|tsx|js|jsx|py|go|rs))/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(task.description)) !== null) {
      if (!files.includes(match[1])) {
        files.push(match[1]);
      }
    }
  }

  return files;
}
```

### Dry Run UI

```
┌────────────────────────────────────────────────────────────────────┐
│  Dry Run Results                                         [X Close] │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Estimated Outcomes                                            │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ Iterations:  3-5        ●●○ Medium confidence               │ │
│  │              "Moderately complex task"                        │ │
│  │ Duration:    15-30 min  ●●○ Medium confidence               │ │
│  │              "Moderate iteration range"                       │ │
│  │ Risk Level:  Medium                                          │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Files Likely Affected              ●●●  High confidence      │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ + src/middleware/auth.ts        (new)                        │ │
│  │ ~ src/routes/api.ts             (modify)                     │ │
│  │ + tests/auth.test.ts            (new)                        │ │
│  │                                                              │ │
│  │ "Files explicitly mentioned in task description"             │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Prompt Preview                         [○ Show full prompt]  │ │
│  │ ────────────────────────────────────────────────────────────│ │
│  │ You are working on the task: "Implement user authentication" │ │
│  │                                                              │ │
│  │ Description:                                                  │ │
│  │ Add JWT-based authentication with login/logout endpoints,    │ │
│  │ middleware for protected routes, and user session handling.  │ │
│  │ Use secret: [REDACTED: Secrets/Tokens]                       │ │
│  │                                                              │ │
│  │ Acceptance Criteria:                                          │ │
│  │ 1. Login endpoint returns JWT token                          │ │
│  │ 2. Logout endpoint invalidates session                       │ │
│  │ 3. Protected routes require valid token                      │ │
│  │ ...                                                          │ │
│  │                                                              │ │
│  │ ⚠ 1 field redacted: Secrets/Tokens                          │ │
│  │ (~1,234 tokens)                                    [Copy]    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Confidence Legend: ●●● High  ●●○ Medium  ●○○ Low               │
│                                                                    │
│                              [Cancel]           [Start Battle →]  │
└────────────────────────────────────────────────────────────────────┘
```

**UI Behavior:**
- "Show full prompt" toggle reveals unredacted prompt (requires explicit user action)
- Confidence indicators use filled/empty circles for quick visual parsing
- Redacted fields are listed so user knows what was hidden
- Copy button copies the currently visible prompt (redacted or full)

---

## API Specification

### POST /api/preflight/run

Run preflight checks for a task.

**Request:**
```typescript
interface PreflightRequest {
  taskId: string;
}
```

**Response:**
```typescript
/**
 * API response uses DTO types to ensure serialization safety.
 * Function references from PreflightCheck are converted to hasAutoFix boolean.
 */
interface PreflightResponse {
  report: {
    taskId: string;
    timestamp: string;
    duration: number;
    results: PreflightCheckResultDTO[];  // Use DTO, not raw PreflightCheckResult
    summary: PreflightSummary;
    canStart: boolean;
    stashRef?: string;  // If auto-stash was used, include for restore

    // Token for battle start - only provided if canStart is true
    // Must be passed to POST /api/battle/start within 5 minutes
    preflightToken?: string;
  };
}

/**
 * Generate a preflight token for battle start authorization.
 * Token encodes taskId and timestamp, validated server-side.
 */
function generatePreflightToken(taskId: string, timestamp: string): string {
  // Simple implementation - in production, use signed JWT or HMAC
  const payload = JSON.stringify({ taskId, timestamp });
  return Buffer.from(payload).toString("base64url");
}
```

---

### POST /api/preflight/fix

Attempt to fix a preflight issue.

**Request:**
```typescript
interface PreflightFixRequest {
  taskId: string;
  checkId: string;
}
```

**Response:**
```typescript
interface PreflightFixResponse {
  result: FixResult;
  updatedCheck: PreflightCheckResult;
}
```

---

### POST /api/preflight/dry-run

Run dry run analysis.

**Request:**
```typescript
interface DryRunRequest {
  taskId: string;
}
```

**Response:**
```typescript
interface DryRunResponse {
  result: DryRunResult;
}
```

---

### POST /api/preflight/restore-stash

Restore stashed changes after battle completion or cancellation.

**Request:**
```typescript
interface RestoreStashRequest {
  stashRef: string;
}
```

**Response:**
```typescript
interface RestoreStashResponse {
  result: FixResult;
}
```

---

## Analytics Events

Preflight emits the following analytics events for metrics tracking:

```typescript
type PreflightAnalyticsEvent =
  | PreflightStartedEvent
  | PreflightCompletedEvent
  | PreflightCheckFailedEvent
  | PreflightFixAppliedEvent
  | PreflightStashCreatedEvent
  | PreflightStashRestoredEvent
  | DryRunRequestedEvent;

interface PreflightStartedEvent {
  type: "preflight_started";
  taskId: string;
  timestamp: string;
}

interface PreflightCompletedEvent {
  type: "preflight_completed";
  taskId: string;
  timestamp: string;
  duration: number;
  summary: PreflightSummary;
  canStart: boolean;
}

interface PreflightCheckFailedEvent {
  type: "preflight_check_failed";
  taskId: string;
  checkId: string;
  severity: "error" | "warning";
  message: string;
  timestamp: string;
}

interface PreflightFixAppliedEvent {
  type: "preflight_fix_applied";
  taskId: string;
  checkId: string;
  success: boolean;
  timestamp: string;
}

interface PreflightStashCreatedEvent {
  type: "preflight_stash_created";
  taskId: string;
  stashRef: string;
  fileCount: number;
  timestamp: string;
}

interface PreflightStashRestoredEvent {
  type: "preflight_stash_restored";
  stashRef: string;
  success: boolean;
  timestamp: string;
}

interface DryRunRequestedEvent {
  type: "dry_run_requested";
  taskId: string;
  timestamp: string;
  promptTokens: number;
  filesLikelyAffected: number;
  estimatedIterations: { min: number; max: number };
}
```

---

## Error Handling

### Check Failures

| Error | Cause | User Message | Recovery |
|-------|-------|--------------|----------|
| Check timeout | Check took too long | "Check timed out" | Retry or skip |
| Check crash | Check threw error | "Check failed unexpectedly" | Report bug |
| Permission denied | Can't access resource | "Permission denied" | Check permissions |

### Fix Failures

| Error | Cause | User Message | Recovery |
|-------|-------|--------------|----------|
| Fix failed | Auto-fix didn't work | "Could not auto-fix" | Manual fix |
| Partial fix | Fix incomplete | "Partially fixed" | Manual completion |

---

## Testing Requirements

### Unit Tests
- [ ] Each check runs correctly
- [ ] Check results are accurate
- [ ] Summary calculation correct
- [ ] canStart logic correct

### Integration Tests
- [ ] Full preflight runs in various project states
- [ ] Fixes work correctly
- [ ] Dry run produces accurate estimates

### E2E Tests
- [ ] Preflight UI displays correctly
- [ ] User can proceed with warnings
- [ ] User cannot proceed with errors
- [ ] Fix buttons work

---

## Performance Considerations

### Check Parallelization
- Run independent checks in parallel
- Git checks can run together
- Environment checks can run together
- Wait for slow checks (disk, network)

### Caching
- Cache command existence checks (1 minute)
- Cache git status (5 seconds)
- Cache disk space (30 seconds)

### Timeouts
- Individual check timeout: 5 seconds
- Total preflight timeout: 30 seconds
- User can skip slow checks

---

## Accessibility Requirements

### Keyboard Navigation
- Tab through check results
- Enter to expand details
- Space to trigger fix
- Escape to close

### Screen Reader Support
- Check status announced
- Details readable
- Fix results announced

### Visual
- Clear pass/fail colors
- High contrast icons
- Error states distinct

---

## Open Questions

1. **Should preflight results be cached?** Skip redundant checks.
2. **Should users be able to disable specific checks?**
3. **Should preflight run automatically on task selection?**
4. **Should we support custom preflight checks?**
