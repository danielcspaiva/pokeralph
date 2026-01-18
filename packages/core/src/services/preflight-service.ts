/**
 * PreflightService for PokéRalph
 *
 * Runs pre-battle validation checks to ensure the environment is ready.
 * Checks include environment, git, configuration, and task validation.
 *
 * Based on: SPECS/10-preflight.md
 */

import type { Config, Task } from "../types/index.ts";
import { GitService } from "./git-service.ts";
import { ConfigSchema } from "./schemas.ts";

// =============================================================================
// Types
// =============================================================================

/**
 * Check category for organization
 */
export type PreflightCheckCategory = "environment" | "git" | "config" | "task" | "system";

/**
 * Severity level for checks
 * - error: Must be fixed before battle can start (blocker)
 * - warning: Can proceed but may cause issues
 * - info: FYI, no action needed
 */
export type PreflightCheckSeverity = "error" | "warning" | "info";

/**
 * Context passed to each preflight check
 */
export interface PreflightContext {
  taskId: string;
  task: Task;
  config: Config;
  workingDir: string;
  /** Stash reference if auto-stash was used during preflight */
  stashRef?: string;
  /** Function to check if a battle is currently running */
  getActiveBattle?: () => { taskId: string } | null;
}

/**
 * Result of a single preflight check
 */
export interface PreflightResult {
  passed: boolean;
  message: string;
  details?: string;
  canProceed: boolean;
  suggestion?: string;
}

/**
 * Result of a fix operation
 */
export interface FixResult {
  success: boolean;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Definition of a preflight check
 */
export interface PreflightCheck {
  id: string;
  name: string;
  description: string;
  category: PreflightCheckCategory;
  severity: PreflightCheckSeverity;
  check: (context: PreflightContext) => Promise<PreflightResult>;
  fix?: (context: PreflightContext) => Promise<FixResult>;
}

/**
 * Result of running a single check (with timing)
 */
export interface PreflightCheckResult {
  check: PreflightCheck;
  result: PreflightResult;
  duration: number;
}

/**
 * DTO for API responses - excludes non-serializable function references
 */
export interface PreflightCheckResultDTO {
  check: {
    id: string;
    name: string;
    description: string;
    category: PreflightCheckCategory;
    severity: PreflightCheckSeverity;
    hasAutoFix: boolean;
  };
  result: PreflightResult;
  duration: number;
}

/**
 * Summary of preflight results
 */
export interface PreflightSummary {
  total: number;
  passed: number;
  warnings: number;
  errors: number;
  infos: number;
}

/**
 * Complete preflight report
 */
export interface PreflightReport {
  taskId: string;
  timestamp: string;
  duration: number;
  results: PreflightCheckResult[];
  summary: PreflightSummary;
  canStart: boolean;
  stashRef?: string;
  preflightToken?: string;
}

/**
 * DTO version of PreflightReport for API responses
 */
export interface PreflightReportDTO {
  taskId: string;
  timestamp: string;
  duration: number;
  results: PreflightCheckResultDTO[];
  summary: PreflightSummary;
  canStart: boolean;
  stashRef?: string;
  preflightToken?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Tokenize a shell command to extract the executable name.
 * Handles quoted strings, paths, and various command formats.
 */
export function tokenizeCommand(command: string): string {
  const trimmed = command.trim();

  // Skip leading environment variable assignments (VAR=value)
  const parts = trimmed.split(/\s+/);
  let executablePart = parts[0] ?? "";

  for (const part of parts) {
    if (!part.includes("=")) {
      executablePart = part;
      break;
    }
  }

  // Handle quoted commands
  if (executablePart.startsWith('"') || executablePart.startsWith("'")) {
    const quote = executablePart[0];
    const endQuote = command.indexOf(quote!, command.indexOf(quote!) + 1);
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

/**
 * Check if a command exists in PATH
 */
async function commandExists(command: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", command], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

/**
 * Get disk space info for a directory
 */
async function checkDiskSpace(workingDir: string): Promise<{ available: number }> {
  try {
    const proc = Bun.spawn(["df", "-k", workingDir], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return { available: Number.POSITIVE_INFINITY };
    }

    // Parse df output (second line, 4th column is available space in KB)
    const lines = output.trim().split("\n");
    if (lines.length < 2) return { available: Number.POSITIVE_INFINITY };

    const parts = lines[1]!.split(/\s+/);
    const availableKB = Number.parseInt(parts[3] ?? "0", 10);
    return { available: availableKB * 1024 }; // Convert to bytes
  } catch {
    return { available: Number.POSITIVE_INFINITY };
  }
}

/**
 * Get the full command for a feedback loop
 */
function getLoopCommand(loop: string, _config: Config): string {
  // Standard loops are run via 'bun run <name>'
  // Custom commands are run as-is
  const standardLoops = ["test", "lint", "typecheck", "format", "format:check"];
  if (standardLoops.includes(loop)) {
    return `bun run ${loop}`;
  }
  return loop;
}

/**
 * Convert PreflightCheckResult to serializable DTO for API responses
 */
export function toPreflightCheckResultDTO(result: PreflightCheckResult): PreflightCheckResultDTO {
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

/**
 * Convert PreflightReport to serializable DTO for API responses
 */
export function toPreflightReportDTO(report: PreflightReport): PreflightReportDTO {
  return {
    taskId: report.taskId,
    timestamp: report.timestamp,
    duration: report.duration,
    results: report.results.map(toPreflightCheckResultDTO),
    summary: report.summary,
    canStart: report.canStart,
    stashRef: report.stashRef,
    preflightToken: report.preflightToken,
  };
}

/**
 * Generate a preflight token for battle start authorization.
 * Token encodes taskId and timestamp, validated server-side.
 */
export function generatePreflightToken(taskId: string, timestamp: string): string {
  const payload = JSON.stringify({ taskId, timestamp });
  return Buffer.from(payload).toString("base64url");
}

/**
 * Validate a preflight token
 * @returns The decoded payload if valid, null if invalid or expired (>5 min)
 */
export function validatePreflightToken(token: string): { taskId: string; timestamp: string } | null {
  try {
    const payload = Buffer.from(token, "base64url").toString("utf-8");
    const decoded = JSON.parse(payload) as { taskId: string; timestamp: string };

    // Check expiration (5 minutes)
    const tokenTime = new Date(decoded.timestamp).getTime();
    const now = Date.now();
    if (now - tokenTime > 5 * 60 * 1000) {
      return null; // Expired
    }

    return decoded;
  } catch {
    return null;
  }
}

// =============================================================================
// Check Definitions
// =============================================================================

/**
 * Environment checks
 */
const ENVIRONMENT_CHECKS: PreflightCheck[] = [
  {
    id: "claude_cli",
    name: "Claude CLI",
    description: "Verify Claude CLI is installed and accessible",
    category: "environment",
    severity: "error",
    check: async () => {
      try {
        const proc = Bun.spawn(["claude", "--version"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const exitCode = await proc.exited;
        return {
          passed: exitCode === 0,
          message: exitCode === 0 ? "Claude CLI available" : "Claude CLI not found",
          canProceed: exitCode === 0,
          suggestion: exitCode === 0 ? undefined : "Install Claude CLI: npm install -g @anthropic-ai/claude-cli",
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
      const minRequired = 100 * 1024 * 1024; // 100MB
      const passed = space.available > minRequired;

      return {
        passed,
        message: passed
          ? `${formatBytes(space.available)} available`
          : `Only ${formatBytes(space.available)} available`,
        canProceed: true, // Warning, not blocker
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

/**
 * Git checks
 */
const GIT_CHECKS: PreflightCheck[] = [
  {
    id: "repo_status",
    name: "Repository Status",
    description: "Check for uncommitted changes",
    category: "git",
    severity: "warning",
    check: async (ctx) => {
      const gitService = new GitService({ workingDir: ctx.workingDir });

      if (!(await gitService.isRepo())) {
        return {
          passed: false,
          message: "Not a git repository",
          canProceed: false,
          suggestion: "Initialize a git repository with 'git init'",
        };
      }

      const status = await gitService.status();

      if (!status.isDirty) {
        return {
          passed: true,
          message: "Working tree is clean",
          canProceed: true,
        };
      }

      const fileCount = status.staged.length + status.unstaged.length + status.untracked.length;
      const files = [
        ...status.staged.map(f => f.path),
        ...status.unstaged.map(f => f.path),
        ...status.untracked.map(f => f.path),
      ];

      return {
        passed: false,
        message: `${fileCount} uncommitted changes`,
        details: files.slice(0, 10).join("\n") +
          (files.length > 10 ? `\n... and ${files.length - 10} more` : ""),
        canProceed: true, // Warning, not blocker
        suggestion: "Consider committing or stashing changes",
      };
    },
    fix: async (ctx) => {
      try {
        const proc = Bun.spawn(["git", "stash", "push", "-m", "pokeralph-preflight-stash"], {
          cwd: ctx.workingDir,
          stdout: "pipe",
          stderr: "pipe",
        });
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
          return { success: false, message: `Stash failed: ${stderr}` };
        }

        // Get stash reference
        const listProc = Bun.spawn(["git", "stash", "list", "-1"], {
          cwd: ctx.workingDir,
          stdout: "pipe",
        });
        const listOutput = await new Response(listProc.stdout).text();
        const stashRef = listOutput.trim().split(":")[0] ?? "stash@{0}";

        ctx.stashRef = stashRef;
        return {
          success: true,
          message: "Changes stashed",
          metadata: { stashRef },
        };
      } catch (error) {
        return {
          success: false,
          message: `Stash failed: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    },
  },

  {
    id: "branch_tracking",
    name: "Branch Tracking",
    description: "Check if branch tracks a remote",
    category: "git",
    severity: "info",
    check: async (ctx) => {
      const gitService = new GitService({ workingDir: ctx.workingDir });

      if (!(await gitService.isRepo())) {
        return {
          passed: true,
          message: "Not a git repository",
          canProceed: true,
        };
      }

      const branch = await gitService.getCurrentBranch();

      if (!branch) {
        return {
          passed: true,
          message: "No branch checked out",
          canProceed: true,
        };
      }

      // Check if tracking remote
      try {
        const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", `${branch}@{upstream}`], {
          cwd: ctx.workingDir,
          stdout: "pipe",
          stderr: "pipe",
        });
        const tracking = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;

        if (exitCode === 0 && tracking.trim()) {
          // Get ahead/behind info
          const logProc = Bun.spawn(["git", "rev-list", "--left-right", "--count", `${branch}...${tracking.trim()}`], {
            cwd: ctx.workingDir,
            stdout: "pipe",
          });
          const countOutput = await new Response(logProc.stdout).text();
          const [ahead, behind] = countOutput.trim().split(/\s+/).map(n => Number.parseInt(n, 10));

          return {
            passed: true,
            message: `On ${branch}, tracking ${tracking.trim()} (${ahead ?? 0} ahead, ${behind ?? 0} behind)`,
            canProceed: true,
          };
        }
      } catch {
        // Not tracking
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
      const gitService = new GitService({ workingDir: ctx.workingDir });

      if (!(await gitService.isRepo())) {
        return {
          passed: true,
          message: "Not a git repository",
          canProceed: true,
        };
      }

      // Check for conflict markers in staged files
      const proc = Bun.spawn(["git", "diff", "--check", "--cached"], {
        cwd: ctx.workingDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      // Also check for MERGE_HEAD which indicates an in-progress merge
      const mergeHeadProc = Bun.spawn(["git", "rev-parse", "--verify", "MERGE_HEAD"], {
        cwd: ctx.workingDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      const mergeHeadExit = await mergeHeadProc.exited;
      const isMerging = mergeHeadExit === 0;

      const hasConflicts = (exitCode !== 0 && output.includes("conflict")) || isMerging;

      return {
        passed: !hasConflicts,
        message: hasConflicts ? "Unresolved merge conflicts detected" : "No merge conflicts",
        canProceed: !hasConflicts,
        suggestion: hasConflicts ? "Resolve merge conflicts before starting battle" : undefined,
      };
    },
  },
];

/**
 * Configuration checks
 */
const CONFIG_CHECKS: PreflightCheck[] = [
  {
    id: "config_valid",
    name: "Configuration Valid",
    description: "Validate battle configuration",
    category: "config",
    severity: "error",
    check: async (ctx) => {
      const validation = ConfigSchema.safeParse(ctx.config);

      if (validation.success) {
        return {
          passed: true,
          message: "Configuration valid",
          canProceed: true,
        };
      }

      const errors = validation.error.errors.map(e => `${e.path.join(".")}: ${e.message}`);
      return {
        passed: false,
        message: errors.join(", "),
        canProceed: false,
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
      if (ctx.config.feedbackLoops.length === 0) {
        return {
          passed: true,
          message: "No feedback loops configured",
          canProceed: true,
        };
      }

      const results: { loop: string; valid: boolean; error?: string }[] = [];

      for (const loop of ctx.config.feedbackLoops) {
        const fullCommand = getLoopCommand(loop, ctx.config);
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
        canProceed: false, // Error severity - can't proceed without feedback loops
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

/**
 * Task checks
 */
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
    check: async (ctx) => {
      const activeBattle = ctx.getActiveBattle?.();

      if (activeBattle && activeBattle.taskId !== ctx.taskId) {
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
          canProceed: true, // Warning, not blocker
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

// =============================================================================
// Risk Assessment
// =============================================================================

interface TaskRiskFactor {
  name: string;
  description: string;
  weight: number;
}

interface TaskRisk {
  level: "low" | "medium" | "high";
  recommendation: string;
  factors: TaskRiskFactor[];
}

function assessTaskRisk(task: Task): TaskRisk {
  const factors: TaskRiskFactor[] = [];

  // Check description length (proxy for complexity)
  if (task.description.length > 500) {
    factors.push({
      name: "Long description",
      description: "Task has a detailed description which may indicate complexity",
      weight: 1,
    });
  }

  // Check acceptance criteria count
  if (task.acceptanceCriteria.length > 5) {
    factors.push({
      name: "Many acceptance criteria",
      description: `${task.acceptanceCriteria.length} criteria to satisfy`,
      weight: 2,
    });
  } else if (task.acceptanceCriteria.length === 0) {
    factors.push({
      name: "No acceptance criteria",
      description: "Success conditions are unclear",
      weight: 1,
    });
  }

  // Check for keywords indicating complexity
  const complexKeywords = ["refactor", "migration", "security", "authentication", "database", "api", "integration"];
  const descLower = task.description.toLowerCase();
  const hasComplex = complexKeywords.some(kw => descLower.includes(kw));
  if (hasComplex) {
    factors.push({
      name: "Complex domain",
      description: "Task involves areas that often require multiple iterations",
      weight: 2,
    });
  }

  // Calculate total risk score
  const score = factors.reduce((sum, f) => sum + f.weight, 0);

  if (score >= 4) {
    return {
      level: "high",
      recommendation: "Consider HITL mode and smaller scope",
      factors,
    };
  }

  if (score >= 2) {
    return {
      level: "medium",
      recommendation: "HITL mode recommended",
      factors,
    };
  }

  return {
    level: "low",
    recommendation: "YOLO mode suitable",
    factors: factors.length > 0 ? factors : [{ name: "Well-scoped", description: "Task appears manageable", weight: 0 }],
  };
}

// =============================================================================
// PreflightService Class
// =============================================================================

/**
 * Service for running preflight checks before battles
 */
export class PreflightService {
  private readonly workingDir: string;
  private readonly checks: PreflightCheck[];

  constructor(workingDir: string) {
    this.workingDir = workingDir;
    this.checks = [
      ...ENVIRONMENT_CHECKS,
      ...GIT_CHECKS,
      ...CONFIG_CHECKS,
      ...TASK_CHECKS,
    ];
  }

  /**
   * Run all preflight checks for a task
   */
  async runPreflight(context: PreflightContext): Promise<PreflightReport> {
    const startTime = Date.now();
    const results: PreflightCheckResult[] = [];

    // Run checks in parallel where possible
    const checkPromises = this.checks.map(async (check) => {
      const checkStart = Date.now();
      try {
        const result = await check.check(context);
        return {
          check,
          result,
          duration: Date.now() - checkStart,
        };
      } catch (error) {
        return {
          check,
          result: {
            passed: false,
            message: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
            canProceed: false,
          },
          duration: Date.now() - checkStart,
        };
      }
    });

    const settledResults = await Promise.allSettled(checkPromises);

    for (let i = 0; i < settledResults.length; i++) {
      const settled = settledResults[i]!;
      if (settled.status === "fulfilled") {
        results.push(settled.value);
      } else {
        results.push({
          check: this.checks[i]!,
          result: {
            passed: false,
            message: `Check threw error: ${settled.reason}`,
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
      warnings: results.filter(r => !r.result.passed && r.result.canProceed && r.check.severity === "warning").length,
      errors: results.filter(r => !r.result.passed && !r.result.canProceed).length,
      infos: results.filter(r => r.check.severity === "info").length,
    };

    const canStart = summary.errors === 0;
    const timestamp = new Date().toISOString();

    return {
      taskId: context.taskId,
      timestamp,
      duration: Date.now() - startTime,
      results,
      summary,
      canStart,
      stashRef: context.stashRef,
      preflightToken: canStart ? generatePreflightToken(context.taskId, timestamp) : undefined,
    };
  }

  /**
   * Apply a fix for a specific check
   */
  async applyFix(checkId: string, context: PreflightContext): Promise<{
    result: FixResult;
    updatedCheck: PreflightCheckResult;
  }> {
    const check = this.checks.find(c => c.id === checkId);
    if (!check) {
      return {
        result: { success: false, message: `Check "${checkId}" not found` },
        updatedCheck: {
          check: { id: checkId, name: "Unknown", description: "", category: "system", severity: "error", check: async () => ({ passed: false, message: "Unknown check", canProceed: false }) },
          result: { passed: false, message: "Check not found", canProceed: false },
          duration: 0,
        },
      };
    }

    if (!check.fix) {
      return {
        result: { success: false, message: `Check "${checkId}" has no auto-fix` },
        updatedCheck: {
          check,
          result: { passed: false, message: "No auto-fix available", canProceed: false },
          duration: 0,
        },
      };
    }

    // Run the fix
    const fixResult = await check.fix(context);

    // Re-run the check to verify
    const checkStart = Date.now();
    const checkResult = await check.check(context);

    return {
      result: fixResult,
      updatedCheck: {
        check,
        result: checkResult,
        duration: Date.now() - checkStart,
      },
    };
  }

  /**
   * Restore stashed changes
   */
  async restoreStash(stashRef: string): Promise<FixResult> {
    try {
      const proc = Bun.spawn(["git", "stash", "pop", stashRef], {
        cwd: this.workingDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return {
          success: false,
          message: `Failed to restore stash: ${stderr}. Run 'git stash list' to find your changes.`,
        };
      }

      return { success: true, message: "Stashed changes restored" };
    } catch (error) {
      return {
        success: false,
        message: `Failed to restore stash: ${error instanceof Error ? error.message : String(error)}. Run 'git stash list' to find your changes.`,
      };
    }
  }

  /**
   * Get all available checks
   */
  getChecks(): PreflightCheck[] {
    return [...this.checks];
  }

  /**
   * Get a specific check by ID
   */
  getCheck(checkId: string): PreflightCheck | undefined {
    return this.checks.find(c => c.id === checkId);
  }
}

export { assessTaskRisk };
export type { TaskRisk, TaskRiskFactor };
