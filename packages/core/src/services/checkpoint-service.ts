/**
 * Checkpoint Service for PokéRalph
 *
 * Implements checkpoint creation, storage, and restoration for battle recovery.
 * Supports two storage strategies:
 * - Commit-based: Creates actual git commits (when autoCommit=true)
 * - Patch-based: Stores diffs as patches (when autoCommit=false)
 *
 * Based on spec 11-recovery.md lines 773-992.
 */

import type { Iteration } from "../types/iteration.ts";
import type { FeedbackResults } from "../types/progress.ts";
import { GitService } from "./git-service.ts";

// ==========================================================================
// Types and Interfaces (11-recovery.md lines 777-794)
// ==========================================================================

/**
 * Storage type for checkpoints
 */
export type CheckpointStorageType = "commit" | "patch";

/**
 * Checkpoint representing a restorable state after an iteration
 * Per spec (11-recovery.md lines 780-794)
 */
export interface Checkpoint {
  /** Unique checkpoint ID */
  id: string;
  /** Battle ID this checkpoint belongs to */
  battleId: string;
  /** Iteration number this checkpoint was created after */
  afterIteration: number;
  /** Storage type used for this checkpoint */
  storageType: CheckpointStorageType;
  /** Git commit hash (for commit-based storage) */
  commitHash?: string;
  /** Git diff patch content (for patch-based storage) */
  patch?: string;
  /** Base commit hash this patch applies to (for patch-based storage) */
  baseCommitHash?: string;
  /** ISO timestamp when checkpoint was created */
  timestamp: string;
  /** Human-readable description of this checkpoint */
  description: string;
  /** Files that changed in this iteration */
  files: string[];
  /** Feedback results from this iteration */
  feedbackResults: FeedbackResults;
}

/**
 * Interface for checkpoint storage implementations
 * Per spec (11-recovery.md lines 796-804)
 */
export interface CheckpointStorage {
  /** Type of storage used */
  type: CheckpointStorageType;

  /**
   * Creates a checkpoint at current state
   * @param battleId - Battle ID
   * @param iteration - Iteration to create checkpoint after
   * @param workingDir - Working directory
   * @param feedbackResults - Results from feedback loops
   * @param existingCheckpoints - Existing checkpoints for reference
   */
  create(
    battleId: string,
    iteration: Iteration,
    workingDir: string,
    feedbackResults: FeedbackResults,
    existingCheckpoints: Checkpoint[]
  ): Promise<Checkpoint>;

  /**
   * Restores to a checkpoint
   * @param checkpoint - Checkpoint to restore to
   * @param workingDir - Working directory
   */
  restore(checkpoint: Checkpoint, workingDir: string): Promise<void>;
}

/**
 * Result of a rollback operation
 */
export interface RollbackResult {
  /** Whether the rollback succeeded */
  success: boolean;
  /** Iteration that was restored to */
  restoredToIteration: number;
  /** ID of checkpoint used */
  checkpointId: string;
  /** Storage type of the checkpoint */
  storageType: CheckpointStorageType;
  /** Error message if failed */
  error?: string;
}

/**
 * Options for rollback operation
 * Per spec (11-recovery.md lines 605-609)
 */
export interface RollbackOptions {
  /** Type of rollback to perform */
  type: "iteration" | "checkpoint" | "full";
  /** Target iteration number (for iteration/checkpoint rollback) */
  targetIteration?: number;
  /** Whether to preserve battle history */
  preserveHistory: boolean;
}

/**
 * Retention policy for checkpoint cleanup
 * Per spec (11-recovery.md lines 935-947)
 */
export interface CheckpointRetentionPolicy {
  /** Maximum number of checkpoints to keep */
  maxCheckpoints: number;
  /** Maximum age of checkpoints in milliseconds */
  maxAge: number;
  /** Whether to keep failed iteration checkpoints */
  keepFailed: boolean;
  /** Whether to keep successful iteration checkpoints */
  keepSuccessful: boolean;
}

/**
 * Default retention policy per spec (11-recovery.md lines 942-947)
 */
export const DEFAULT_RETENTION_POLICY: CheckpointRetentionPolicy = {
  maxCheckpoints: 10,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  keepFailed: true,
  keepSuccessful: true,
};

// ==========================================================================
// Utility Functions
// ==========================================================================

/**
 * Generates a unique checkpoint ID
 */
function generateCheckpointId(): string {
  return `cp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generates a description for a checkpoint
 * Per spec (11-recovery.md lines 923-929)
 */
function generateCheckpointDescription(iteration: Iteration): string {
  // If iteration has a summary headline, use that
  // Currently iterations don't have summaries, so use default
  return `After iteration ${iteration.number}`;
}

// ==========================================================================
// CommitCheckpointStorage (11-recovery.md lines 809-844)
// ==========================================================================

/**
 * Commit-based checkpoint storage
 * Creates actual git commits for each iteration when autoCommit=true
 */
export class CommitCheckpointStorage implements CheckpointStorage {
  type: CheckpointStorageType = "commit";

  async create(
    battleId: string,
    iteration: Iteration,
    workingDir: string,
    feedbackResults: FeedbackResults,
    _existingCheckpoints: Checkpoint[]
  ): Promise<Checkpoint> {
    const git = new GitService({ workingDir });

    // Check if we have a commit hash from the iteration
    // The commit should have been created by the battle orchestrator
    let commitHash = iteration.commitHash;

    // If no commit hash yet, the changes should already be committed
    // Get the current HEAD as the commit hash
    if (!commitHash) {
      const lastCommit = await git.getLastCommit();
      if (!lastCommit) {
        throw new Error("No commit found for checkpoint creation");
      }
      commitHash = lastCommit.hash;
    }

    // Get files from the iteration
    const files = iteration.filesChanged || [];

    return {
      id: generateCheckpointId(),
      battleId,
      afterIteration: iteration.number,
      storageType: "commit",
      commitHash,
      timestamp: new Date().toISOString(),
      description: generateCheckpointDescription(iteration),
      files,
      feedbackResults,
    };
  }

  async restore(checkpoint: Checkpoint, workingDir: string): Promise<void> {
    if (!checkpoint.commitHash) {
      throw new Error("Commit-based checkpoint missing commitHash");
    }

    // Perform hard reset to the checkpoint commit
    const result = await this.runGitCommand(
      ["reset", "--hard", checkpoint.commitHash],
      workingDir
    );

    if (!result.success) {
      throw new Error(`Failed to restore checkpoint: ${result.stderr}`);
    }
  }

  /**
   * Runs a git command directly for operations not in GitService
   */
  private async runGitCommand(
    args: string[],
    workingDir: string
  ): Promise<{ success: boolean; stdout: string; stderr: string }> {
    const proc = Bun.spawn(["git", ...args], {
      cwd: workingDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    return {
      success: exitCode === 0,
      stdout,
      stderr,
    };
  }
}

// ==========================================================================
// PatchCheckpointStorage (11-recovery.md lines 851-898)
// ==========================================================================

/**
 * Patch-based checkpoint storage
 * Stores diffs instead of creating commits when autoCommit=false
 * Allows rollback even when user hasn't committed changes
 */
export class PatchCheckpointStorage implements CheckpointStorage {
  type: CheckpointStorageType = "patch";

  async create(
    battleId: string,
    iteration: Iteration,
    workingDir: string,
    feedbackResults: FeedbackResults,
    _existingCheckpoints: Checkpoint[]
  ): Promise<Checkpoint> {
    // Get current HEAD commit as base
    const baseCommitHash = await this.getHead(workingDir);

    // Generate patch of all changes (staged and unstaged)
    const patch = await this.generatePatch(workingDir);

    // Get list of changed files
    const files = iteration.filesChanged || (await this.getChangedFiles(workingDir));

    return {
      id: generateCheckpointId(),
      battleId,
      afterIteration: iteration.number,
      storageType: "patch",
      patch,
      baseCommitHash,
      timestamp: new Date().toISOString(),
      description: generateCheckpointDescription(iteration),
      files,
      feedbackResults,
    };
  }

  async restore(checkpoint: Checkpoint, workingDir: string): Promise<void> {
    if (!checkpoint.baseCommitHash) {
      throw new Error("Patch-based checkpoint missing baseCommitHash");
    }

    // 1. Reset to the base commit
    const resetResult = await this.runGitCommand(
      ["reset", "--hard", checkpoint.baseCommitHash],
      workingDir
    );

    if (!resetResult.success) {
      throw new Error(`Failed to reset to base commit: ${resetResult.stderr}`);
    }

    // 2. Apply the stored patch if it exists and is not empty
    if (checkpoint.patch?.trim()) {
      const applyResult = await this.applyPatch(workingDir, checkpoint.patch);
      if (!applyResult.success) {
        throw new Error(`Failed to apply patch: ${applyResult.stderr}`);
      }
    }
  }

  /**
   * Gets the current HEAD commit hash
   */
  private async getHead(workingDir: string): Promise<string> {
    const result = await this.runGitCommand(["rev-parse", "HEAD"], workingDir);
    if (!result.success) {
      throw new Error(`Failed to get HEAD: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  /**
   * Generates a patch of all changes (staged, unstaged, and untracked)
   */
  private async generatePatch(workingDir: string): Promise<string> {
    // Get diff of tracked files (staged and unstaged)
    const trackedDiff = await this.runGitCommand(
      ["diff", "HEAD"],
      workingDir
    );

    // Get list of untracked files
    const untrackedResult = await this.runGitCommand(
      ["ls-files", "--others", "--exclude-standard"],
      workingDir
    );

    let patch = trackedDiff.success ? trackedDiff.stdout : "";

    // Add untracked files to patch
    if (untrackedResult.success && untrackedResult.stdout.trim()) {
      const untrackedFiles = untrackedResult.stdout.trim().split("\n");
      for (const file of untrackedFiles) {
        const fileContent = await this.readFile(workingDir, file);
        if (fileContent !== null) {
          // Create a patch entry for the new file
          patch += `\ndiff --git a/${file} b/${file}\n`;
          patch += "new file mode 100644\n";
          patch += "--- /dev/null\n";
          patch += `+++ b/${file}\n`;
          const lines = fileContent.split("\n");
          patch += `@@ -0,0 +1,${lines.length} @@\n`;
          for (const line of lines) {
            patch += `+${line}\n`;
          }
        }
      }
    }

    return patch;
  }

  /**
   * Reads a file's content
   */
  private async readFile(workingDir: string, filePath: string): Promise<string | null> {
    try {
      const fullPath = `${workingDir}/${filePath}`;
      const file = Bun.file(fullPath);
      return await file.text();
    } catch {
      return null;
    }
  }

  /**
   * Gets list of changed files
   */
  private async getChangedFiles(workingDir: string): Promise<string[]> {
    const result = await this.runGitCommand(
      ["status", "--porcelain"],
      workingDir
    );

    if (!result.success) {
      return [];
    }

    return result.stdout
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => line.slice(3).trim());
  }

  /**
   * Applies a patch to the working directory
   */
  private async applyPatch(
    workingDir: string,
    patch: string
  ): Promise<{ success: boolean; stderr: string }> {
    // Write patch to temp file
    const tempPath = `${workingDir}/.pokeralph/.patch-temp-${Date.now()}`;
    await Bun.write(tempPath, patch);

    try {
      // Apply patch with git apply
      const result = await this.runGitCommand(
        ["apply", "--whitespace=nowarn", tempPath],
        workingDir
      );
      return { success: result.success, stderr: result.stderr };
    } finally {
      // Clean up temp file
      try {
        await Bun.file(tempPath).exists() && (await Bun.write(tempPath, ""));
        const file = Bun.file(tempPath);
        if (await file.exists()) {
          // Remove temp file by unlinking
          const proc = Bun.spawn(["rm", "-f", tempPath], { cwd: workingDir });
          await proc.exited;
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Runs a git command
   */
  private async runGitCommand(
    args: string[],
    workingDir: string
  ): Promise<{ success: boolean; stdout: string; stderr: string }> {
    const proc = Bun.spawn(["git", ...args], {
      cwd: workingDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    return {
      success: exitCode === 0,
      stdout,
      stderr,
    };
  }
}

// ==========================================================================
// Factory and Utility Functions (11-recovery.md lines 900-930)
// ==========================================================================

/**
 * Factory function to get the appropriate checkpoint storage
 * Per spec (11-recovery.md lines 903-907)
 *
 * @param config - Battle configuration
 * @returns CheckpointStorage implementation
 */
export function getCheckpointStorage(config: { autoCommit: boolean }): CheckpointStorage {
  return config.autoCommit
    ? new CommitCheckpointStorage()
    : new PatchCheckpointStorage();
}

/**
 * Creates a checkpoint after a successful iteration
 * Per spec (11-recovery.md lines 909-921)
 *
 * @param battleId - Battle ID
 * @param iteration - Completed iteration
 * @param workingDir - Working directory
 * @param config - Configuration with autoCommit setting
 * @param feedbackResults - Results from feedback loops
 * @param existingCheckpoints - Existing checkpoints for reference
 * @returns Created checkpoint
 */
export async function createCheckpoint(
  battleId: string,
  iteration: Iteration,
  workingDir: string,
  config: { autoCommit: boolean },
  feedbackResults: FeedbackResults,
  existingCheckpoints: Checkpoint[] = []
): Promise<Checkpoint> {
  const storage = getCheckpointStorage(config);
  return storage.create(battleId, iteration, workingDir, feedbackResults, existingCheckpoints);
}

/**
 * Restores to a checkpoint
 *
 * @param checkpoint - Checkpoint to restore to
 * @param workingDir - Working directory
 * @param config - Configuration with autoCommit setting
 */
export async function restoreCheckpoint(
  checkpoint: Checkpoint,
  workingDir: string,
  config: { autoCommit: boolean }
): Promise<void> {
  const storage = getCheckpointStorage(config);
  return storage.restore(checkpoint, workingDir);
}

/**
 * Finds a checkpoint by iteration number
 *
 * @param checkpoints - Array of checkpoints
 * @param afterIteration - Target iteration number
 * @returns Checkpoint or undefined
 */
export function findCheckpointByIteration(
  checkpoints: Checkpoint[],
  afterIteration: number
): Checkpoint | undefined {
  return checkpoints.find((cp) => cp.afterIteration === afterIteration);
}

/**
 * Gets the initial checkpoint (before any iterations)
 *
 * @param checkpoints - Array of checkpoints
 * @returns Initial checkpoint or undefined
 */
export function getInitialCheckpoint(checkpoints: Checkpoint[]): Checkpoint | undefined {
  // Initial checkpoint has afterIteration = 0
  return checkpoints.find((cp) => cp.afterIteration === 0);
}

// ==========================================================================
// Checkpoint Cleanup (11-recovery.md lines 934-991)
// ==========================================================================

/**
 * Cleans up old checkpoints based on retention policy
 * Per spec (11-recovery.md lines 949-991)
 *
 * @param checkpoints - Array of checkpoints to clean
 * @param policy - Retention policy to apply
 * @returns Filtered array of checkpoints to keep
 */
export function cleanupCheckpoints(
  checkpoints: Checkpoint[],
  policy: CheckpointRetentionPolicy = DEFAULT_RETENTION_POLICY
): Checkpoint[] {
  const now = Date.now();

  // Sort by timestamp, newest first
  const sorted = [...checkpoints].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const toKeep: Checkpoint[] = [];
  const toRemove: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const cp = sorted[i];
    if (!cp) continue;

    const age = now - new Date(cp.timestamp).getTime();

    // Always keep first few checkpoints up to maxCheckpoints
    if (i < policy.maxCheckpoints) {
      toKeep.push(cp);
      continue;
    }

    // Remove if too old
    if (age > policy.maxAge) {
      toRemove.push(cp.id);
      continue;
    }

    // Check if it's worth keeping based on feedback results
    const allPassed = Object.values(cp.feedbackResults).every((r) => r.passed);

    if (!allPassed && policy.keepFailed) {
      toKeep.push(cp);
      continue;
    }

    if (allPassed && policy.keepSuccessful) {
      toKeep.push(cp);
      continue;
    }

    toRemove.push(cp.id);
  }

  return toKeep;
}

/**
 * Gets checkpoints that would be removed by cleanup
 *
 * @param checkpoints - Array of checkpoints
 * @param policy - Retention policy to apply
 * @returns Array of checkpoint IDs that would be removed
 */
export function getCheckpointsToRemove(
  checkpoints: Checkpoint[],
  policy: CheckpointRetentionPolicy = DEFAULT_RETENTION_POLICY
): string[] {
  const kept = cleanupCheckpoints(checkpoints, policy);
  const keptIds = new Set(kept.map((cp) => cp.id));
  return checkpoints.filter((cp) => !keptIds.has(cp.id)).map((cp) => cp.id);
}

/**
 * Creates an initial checkpoint before battle starts
 *
 * @param battleId - Battle ID
 * @param workingDir - Working directory
 * @param config - Configuration with autoCommit setting
 * @returns Initial checkpoint
 */
export async function createInitialCheckpoint(
  battleId: string,
  workingDir: string,
  config: { autoCommit: boolean }
): Promise<Checkpoint> {
  const git = new GitService({ workingDir });

  // Get current HEAD as base
  const lastCommit = await git.getLastCommit();
  const commitHash = lastCommit?.hash;

  if (!commitHash) {
    throw new Error("Cannot create initial checkpoint: no commits in repository");
  }

  return {
    id: generateCheckpointId(),
    battleId,
    afterIteration: 0,
    storageType: config.autoCommit ? "commit" : "patch",
    commitHash,
    baseCommitHash: commitHash,
    timestamp: new Date().toISOString(),
    description: "Before battle started",
    files: [],
    feedbackResults: {},
  };
}

/**
 * Validates a checkpoint can be restored
 *
 * @param checkpoint - Checkpoint to validate
 * @returns Object with valid flag and error message if invalid
 */
export function validateCheckpoint(checkpoint: Checkpoint): {
  valid: boolean;
  error?: string;
} {
  if (!checkpoint.id) {
    return { valid: false, error: "Checkpoint missing ID" };
  }

  if (checkpoint.storageType === "commit") {
    if (!checkpoint.commitHash) {
      return { valid: false, error: "Commit-based checkpoint missing commitHash" };
    }
  } else if (checkpoint.storageType === "patch") {
    if (!checkpoint.baseCommitHash) {
      return { valid: false, error: "Patch-based checkpoint missing baseCommitHash" };
    }
  }

  return { valid: true };
}
