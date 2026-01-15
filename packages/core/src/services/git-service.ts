/**
 * GitService for PokéRalph
 *
 * Manages Git operations (commit, status, revert) for autonomous development.
 * Uses Bun.spawn() to execute git commands.
 */

/**
 * Options for creating a GitService instance
 */
export interface GitServiceOptions {
  /**
   * Working directory containing the git repository
   */
  workingDir: string;
}

/**
 * Represents the status of a modified file
 */
export interface FileStatus {
  /**
   * File path relative to repository root
   */
  path: string;

  /**
   * Status code (M = modified, A = added, D = deleted, ? = untracked, etc.)
   */
  status: string;

  /**
   * Whether the file is staged for commit
   */
  staged: boolean;
}

/**
 * Represents the overall git status
 */
export interface GitStatus {
  /**
   * Whether the repository has any changes (staged or unstaged)
   */
  isDirty: boolean;

  /**
   * List of staged files
   */
  staged: FileStatus[];

  /**
   * List of unstaged modified files
   */
  unstaged: FileStatus[];

  /**
   * List of untracked files
   */
  untracked: FileStatus[];

  /**
   * Current branch name
   */
  branch: string | null;
}

/**
 * Information about a commit
 */
export interface CommitInfo {
  /**
   * Commit hash (full SHA)
   */
  hash: string;

  /**
   * Short commit hash (7 characters)
   */
  shortHash: string;

  /**
   * Commit message
   */
  message: string;

  /**
   * Author name
   */
  author: string;

  /**
   * Author email
   */
  email: string;

  /**
   * Commit date
   */
  date: Date;
}

/**
 * GitService - manages Git operations for PokéRalph
 *
 * @remarks
 * This service handles git operations during autonomous development:
 * - Checking repository status
 * - Staging files
 * - Creating commits with formatted messages
 * - Reverting commits
 *
 * @example
 * ```ts
 * const git = new GitService({
 *   workingDir: "/path/to/repo"
 * });
 *
 * if (await git.isRepo()) {
 *   const status = await git.status();
 *   if (status.isDirty) {
 *     await git.add("all");
 *     const hash = await git.commit("[PokéRalph] 001-task: Task title");
 *   }
 * }
 * ```
 */
export class GitService {
  /** Options for this service instance */
  private readonly options: GitServiceOptions;

  /**
   * Creates a new GitService instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: GitServiceOptions) {
    this.options = {
      workingDir: options.workingDir,
    };
  }

  /**
   * Gets the working directory
   */
  getWorkingDir(): string {
    return this.options.workingDir;
  }

  // ==========================================================================
  // Repository status methods
  // ==========================================================================

  /**
   * Checks if the working directory is a git repository
   *
   * @returns true if the directory is a git repository
   */
  async isRepo(): Promise<boolean> {
    try {
      const result = await this.runGitCommand(["rev-parse", "--is-inside-work-tree"]);
      return result.success && result.stdout.trim() === "true";
    } catch {
      return false;
    }
  }

  /**
   * Initializes a new git repository if one doesn't exist
   *
   * @throws Error if initialization fails
   */
  async init(): Promise<void> {
    if (await this.isRepo()) {
      return; // Already a repo
    }

    const result = await this.runGitCommand(["init"]);
    if (!result.success) {
      throw new Error(`Failed to initialize git repository: ${result.stderr}`);
    }
  }

  /**
   * Gets the current git status
   *
   * @returns GitStatus with information about modified files
   */
  async status(): Promise<GitStatus> {
    const status: GitStatus = {
      isDirty: false,
      staged: [],
      unstaged: [],
      untracked: [],
      branch: null,
    };

    // Get current branch
    try {
      const branchResult = await this.runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"]);
      if (branchResult.success) {
        status.branch = branchResult.stdout.trim();
      }
    } catch {
      // Not a fatal error - might be a new repo with no commits
    }

    // Get porcelain status for parsing
    const result = await this.runGitCommand(["status", "--porcelain", "-uall"]);
    if (!result.success) {
      return status;
    }

    const lines = result.stdout.split("\n").filter((line) => line.length > 0);

    for (const line of lines) {
      const indexStatus = line.charAt(0); // Status in index (staged)
      const workTreeStatus = line.charAt(1); // Status in work tree (unstaged)
      const path = line.slice(3); // File path starts at position 3

      if (indexStatus === "?" && workTreeStatus === "?") {
        // Untracked file
        status.untracked.push({
          path,
          status: "?",
          staged: false,
        });
      } else {
        // Check staged status
        if (indexStatus !== " " && indexStatus !== "?" && indexStatus !== "") {
          status.staged.push({
            path,
            status: indexStatus,
            staged: true,
          });
        }

        // Check unstaged status
        if (workTreeStatus !== " " && workTreeStatus !== "?" && workTreeStatus !== "") {
          status.unstaged.push({
            path,
            status: workTreeStatus,
            staged: false,
          });
        }
      }
    }

    status.isDirty =
      status.staged.length > 0 || status.unstaged.length > 0 || status.untracked.length > 0;

    return status;
  }

  // ==========================================================================
  // Staging methods
  // ==========================================================================

  /**
   * Adds files to the staging area
   *
   * @param files - Array of file paths or "all" to add all files
   */
  async add(files: string[] | "all"): Promise<void> {
    const args = files === "all" ? ["add", "-A"] : ["add", ...files];

    const result = await this.runGitCommand(args);
    if (!result.success) {
      throw new Error(`Failed to add files: ${result.stderr}`);
    }
  }

  // ==========================================================================
  // Commit methods
  // ==========================================================================

  /**
   * Creates a commit with the given message
   *
   * @param message - Commit message
   * @returns The commit hash
   *
   * @remarks
   * Use formatCommitMessage() to create properly formatted messages for PokéRalph.
   */
  async commit(message: string): Promise<string> {
    const result = await this.runGitCommand(["commit", "-m", message]);

    if (!result.success) {
      throw new Error(`Failed to create commit: ${result.stderr}`);
    }

    // Get the commit hash
    const hashResult = await this.runGitCommand(["rev-parse", "HEAD"]);
    if (!hashResult.success) {
      throw new Error(`Failed to get commit hash: ${hashResult.stderr}`);
    }

    return hashResult.stdout.trim();
  }

  /**
   * Formats a commit message for PokéRalph
   *
   * @param taskId - Task ID (e.g., "001-task-name")
   * @param title - Task title
   * @returns Formatted commit message
   *
   * @example
   * ```ts
   * const message = GitService.formatCommitMessage("001-setup", "Initial setup");
   * // "[PokéRalph] 001-setup: Initial setup"
   * ```
   */
  static formatCommitMessage(taskId: string, title: string): string {
    return `[PokéRalph] ${taskId}: ${title}`;
  }

  /**
   * Gets information about the last commit
   *
   * @returns CommitInfo or null if no commits exist
   */
  async getLastCommit(): Promise<CommitInfo | null> {
    const format = "%H%n%h%n%s%n%an%n%ae%n%aI";
    const result = await this.runGitCommand(["log", "-1", `--format=${format}`]);

    if (!result.success) {
      return null;
    }

    const lines = result.stdout.trim().split("\n");
    if (lines.length < 6) {
      return null;
    }

    const hash = lines[0];
    const shortHash = lines[1];
    const message = lines[2];
    const author = lines[3];
    const email = lines[4];
    const dateStr = lines[5];

    // Ensure all values are present (TypeScript array access can be undefined)
    if (!hash || !shortHash || !message || !author || !email || !dateStr) {
      return null;
    }

    return {
      hash,
      shortHash,
      message,
      author,
      email,
      date: new Date(dateStr),
    };
  }

  // ==========================================================================
  // Revert methods
  // ==========================================================================

  /**
   * Undoes the last commit (soft reset)
   *
   * @remarks
   * This performs a soft reset, keeping changes in the working directory.
   * The changes will be unstaged.
   */
  async revert(): Promise<void> {
    const result = await this.runGitCommand(["reset", "--soft", "HEAD~1"]);
    if (!result.success) {
      throw new Error(`Failed to revert: ${result.stderr}`);
    }
  }

  /**
   * Resets to a specific commit (soft reset)
   *
   * @param commitHash - The commit hash to reset to
   */
  async resetTo(commitHash: string): Promise<void> {
    const result = await this.runGitCommand(["reset", "--soft", commitHash]);
    if (!result.success) {
      throw new Error(`Failed to reset to ${commitHash}: ${result.stderr}`);
    }
  }

  // ==========================================================================
  // Utility methods
  // ==========================================================================

  /**
   * Gets the current branch name
   *
   * @returns Branch name or null if not on a branch
   */
  async getCurrentBranch(): Promise<string | null> {
    const result = await this.runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!result.success) {
      return null;
    }
    return result.stdout.trim();
  }

  /**
   * Checks if there are staged changes
   *
   * @returns true if there are staged changes
   */
  async hasStagedChanges(): Promise<boolean> {
    const result = await this.runGitCommand(["diff", "--cached", "--quiet"]);
    // Exit code 0 = no changes, 1 = has changes
    return !result.success;
  }

  /**
   * Gets the list of files that would be ignored by .gitignore
   *
   * @param paths - Paths to check
   * @returns Array of paths that are ignored
   */
  async getIgnoredFiles(paths: string[]): Promise<string[]> {
    if (paths.length === 0) {
      return [];
    }

    const result = await this.runGitCommand(["check-ignore", ...paths]);

    if (!result.success) {
      // Exit code 1 means no files are ignored
      return [];
    }

    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Runs a git command and returns the result
   */
  private async runGitCommand(
    args: string[]
  ): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }> {
    const proc = Bun.spawn(["git", ...args], {
      cwd: this.options.workingDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      this.readStream(proc.stdout),
      this.readStream(proc.stderr),
      proc.exited,
    ]);

    return {
      success: exitCode === 0,
      stdout,
      stderr,
      exitCode,
    };
  }

  /**
   * Reads a stream to string
   */
  private async readStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
    if (!stream) {
      return "";
    }

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value, { stream: true }));
      }
    } finally {
      reader.releaseLock();
    }

    return chunks.join("");
  }
}
