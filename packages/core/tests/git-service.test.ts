import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { GitService } from "../src/services/git-service.ts";

// Create a unique temp directory for each test
const getTempDir = () =>
  join(import.meta.dir, `.tmp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Helper to create a GitService instance
 */
function createService(tempDir: string): GitService {
  return new GitService({
    workingDir: tempDir,
  });
}

/**
 * Helper to initialize a git repo in a directory
 */
async function initRepo(tempDir: string): Promise<void> {
  const service = createService(tempDir);
  await service.init();

  // Configure git user for tests
  await runGitCommand(tempDir, ["config", "user.email", "test@pokeralph.dev"]);
  await runGitCommand(tempDir, ["config", "user.name", "PokéRalph Test"]);
}

/**
 * Helper to run git commands directly
 */
async function runGitCommand(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  return stdout.trim();
}

/**
 * Helper to create a file in a directory
 */
function createFile(dir: string, name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

describe("GitService", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = getTempDir();
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================================
  // Constructor
  // ============================================================================

  describe("constructor", () => {
    test("sets working directory", () => {
      const service = new GitService({ workingDir: tempDir });
      expect(service.getWorkingDir()).toBe(tempDir);
    });
  });

  // ============================================================================
  // isRepo
  // ============================================================================

  describe("isRepo", () => {
    test("returns false for non-repo directory", async () => {
      const service = createService(tempDir);
      const isRepo = await service.isRepo();
      expect(isRepo).toBe(false);
    });

    test("returns true for initialized repo", async () => {
      await initRepo(tempDir);
      const service = createService(tempDir);
      const isRepo = await service.isRepo();
      expect(isRepo).toBe(true);
    });

    test("returns false for non-existent directory", async () => {
      const service = createService(join(tempDir, "nonexistent"));
      const isRepo = await service.isRepo();
      expect(isRepo).toBe(false);
    });
  });

  // ============================================================================
  // init
  // ============================================================================

  describe("init", () => {
    test("initializes new git repository", async () => {
      const service = createService(tempDir);
      expect(await service.isRepo()).toBe(false);

      await service.init();

      expect(await service.isRepo()).toBe(true);
    });

    test("does nothing if already a repo", async () => {
      await initRepo(tempDir);
      const service = createService(tempDir);

      // Should not throw
      await service.init();

      expect(await service.isRepo()).toBe(true);
    });
  });

  // ============================================================================
  // status
  // ============================================================================

  describe("status", () => {
    test("returns clean status for empty repo", async () => {
      await initRepo(tempDir);
      const service = createService(tempDir);
      const status = await service.status();

      expect(status.isDirty).toBe(false);
      expect(status.staged).toEqual([]);
      expect(status.unstaged).toEqual([]);
      expect(status.untracked).toEqual([]);
    });

    test("detects untracked files", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "new-file.txt", "content");

      const service = createService(tempDir);
      const status = await service.status();

      expect(status.isDirty).toBe(true);
      expect(status.untracked.length).toBe(1);
      expect(status.untracked[0]?.path).toBe("new-file.txt");
      expect(status.untracked[0]?.status).toBe("?");
    });

    test("detects staged files", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "staged.txt", "content");
      await runGitCommand(tempDir, ["add", "staged.txt"]);

      const service = createService(tempDir);
      const status = await service.status();

      expect(status.isDirty).toBe(true);
      expect(status.staged.length).toBe(1);
      expect(status.staged[0]?.path).toBe("staged.txt");
      expect(status.staged[0]?.status).toBe("A");
      expect(status.staged[0]?.staged).toBe(true);
    });

    test("detects modified unstaged files", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file.txt", "original");
      await runGitCommand(tempDir, ["add", "file.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "Initial commit"]);

      // Modify the file
      writeFileSync(join(tempDir, "file.txt"), "modified");

      const service = createService(tempDir);
      const status = await service.status();

      expect(status.isDirty).toBe(true);
      expect(status.unstaged.length).toBe(1);
      expect(status.unstaged[0]?.path).toBe("file.txt");
      expect(status.unstaged[0]?.status).toBe("M");
      expect(status.unstaged[0]?.staged).toBe(false);
    });

    test("returns current branch name", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file.txt", "content");
      await runGitCommand(tempDir, ["add", "file.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "Initial commit"]);

      const service = createService(tempDir);
      const status = await service.status();

      // Default branch name varies by git configuration (main, master, etc.)
      expect(status.branch).toBeTruthy();
    });

    test("handles multiple files with different states", async () => {
      await initRepo(tempDir);

      // Committed file
      createFile(tempDir, "committed.txt", "content");
      await runGitCommand(tempDir, ["add", "committed.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "Initial commit"]);

      // Modified file (staged)
      writeFileSync(join(tempDir, "committed.txt"), "modified");
      await runGitCommand(tempDir, ["add", "committed.txt"]);

      // New staged file
      createFile(tempDir, "new-staged.txt", "content");
      await runGitCommand(tempDir, ["add", "new-staged.txt"]);

      // Untracked file
      createFile(tempDir, "untracked.txt", "content");

      const service = createService(tempDir);
      const status = await service.status();

      expect(status.isDirty).toBe(true);
      expect(status.staged.length).toBe(2);
      expect(status.untracked.length).toBe(1);
    });
  });

  // ============================================================================
  // add
  // ============================================================================

  describe("add", () => {
    test("adds single file to staging", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file.txt", "content");

      const service = createService(tempDir);
      await service.add(["file.txt"]);

      const status = await service.status();
      expect(status.staged.length).toBe(1);
      expect(status.staged[0]?.path).toBe("file.txt");
    });

    test("adds multiple files to staging", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file1.txt", "content1");
      createFile(tempDir, "file2.txt", "content2");

      const service = createService(tempDir);
      await service.add(["file1.txt", "file2.txt"]);

      const status = await service.status();
      expect(status.staged.length).toBe(2);
    });

    test("adds all files with 'all' parameter", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file1.txt", "content1");
      createFile(tempDir, "file2.txt", "content2");
      mkdirSync(join(tempDir, "subdir"));
      createFile(tempDir, "subdir/file3.txt", "content3");

      const service = createService(tempDir);
      await service.add("all");

      const status = await service.status();
      expect(status.staged.length).toBe(3);
      expect(status.untracked.length).toBe(0);
    });

    test("throws error for non-existent file", async () => {
      await initRepo(tempDir);

      const service = createService(tempDir);

      await expect(service.add(["nonexistent.txt"])).rejects.toThrow();
    });
  });

  // ============================================================================
  // commit
  // ============================================================================

  describe("commit", () => {
    test("creates commit with message", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file.txt", "content");
      await runGitCommand(tempDir, ["add", "file.txt"]);

      const service = createService(tempDir);
      const hash = await service.commit("Test commit message");

      expect(hash).toBeTruthy();
      expect(hash.length).toBe(40); // Full SHA

      // Verify commit was created
      const log = await runGitCommand(tempDir, ["log", "-1", "--format=%s"]);
      expect(log).toBe("Test commit message");
    });

    test("returns full commit hash", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file.txt", "content");
      await runGitCommand(tempDir, ["add", "file.txt"]);

      const service = createService(tempDir);
      const hash = await service.commit("Test commit");

      // Full SHA is 40 hex characters
      expect(hash).toMatch(/^[a-f0-9]{40}$/);
    });

    test("throws error when nothing staged", async () => {
      await initRepo(tempDir);

      const service = createService(tempDir);

      await expect(service.commit("Empty commit")).rejects.toThrow();
    });

    test("handles multiline commit messages", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file.txt", "content");
      await runGitCommand(tempDir, ["add", "file.txt"]);

      const service = createService(tempDir);
      const message = "First line\n\nDetailed description here";
      const hash = await service.commit(message);

      expect(hash).toBeTruthy();

      // Verify full message
      const log = await runGitCommand(tempDir, ["log", "-1", "--format=%B"]);
      expect(log).toContain("First line");
      expect(log).toContain("Detailed description");
    });
  });

  // ============================================================================
  // formatCommitMessage (static)
  // ============================================================================

  describe("formatCommitMessage", () => {
    test("formats message with task ID and title", () => {
      const message = GitService.formatCommitMessage("001-task-name", "Implement feature X");
      expect(message).toBe("[PokéRalph] 001-task-name: Implement feature X");
    });

    test("handles task ID with numbers only", () => {
      const message = GitService.formatCommitMessage("001", "Task title");
      expect(message).toBe("[PokéRalph] 001: Task title");
    });

    test("handles special characters in title", () => {
      const message = GitService.formatCommitMessage("002-fix", "Fix bug in auth (critical)");
      expect(message).toBe("[PokéRalph] 002-fix: Fix bug in auth (critical)");
    });
  });

  // ============================================================================
  // getLastCommit
  // ============================================================================

  describe("getLastCommit", () => {
    test("returns null for empty repo", async () => {
      await initRepo(tempDir);
      const service = createService(tempDir);
      const commit = await service.getLastCommit();
      expect(commit).toBeNull();
    });

    test("returns commit info after commit", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file.txt", "content");
      await runGitCommand(tempDir, ["add", "file.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "Test commit message"]);

      const service = createService(tempDir);
      const commit = await service.getLastCommit();

      expect(commit).not.toBeNull();
      expect(commit?.hash).toMatch(/^[a-f0-9]{40}$/);
      expect(commit?.shortHash.length).toBe(7);
      expect(commit?.message).toBe("Test commit message");
      expect(commit?.author).toBe("PokéRalph Test");
      expect(commit?.email).toBe("test@pokeralph.dev");
      expect(commit?.date).toBeInstanceOf(Date);
    });

    test("returns most recent commit", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file1.txt", "content1");
      await runGitCommand(tempDir, ["add", "file1.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "First commit"]);

      createFile(tempDir, "file2.txt", "content2");
      await runGitCommand(tempDir, ["add", "file2.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "Second commit"]);

      const service = createService(tempDir);
      const commit = await service.getLastCommit();

      expect(commit?.message).toBe("Second commit");
    });
  });

  // ============================================================================
  // revert
  // ============================================================================

  describe("revert", () => {
    test("reverts last commit (soft reset)", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file.txt", "content");
      await runGitCommand(tempDir, ["add", "file.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "Commit to revert"]);

      const service = createService(tempDir);
      await service.revert();

      // After soft reset, changes should be staged
      const status = await service.status();
      expect(status.staged.length).toBe(1);

      // No commits should exist now (if it was the first commit)
      const commit = await service.getLastCommit();
      expect(commit).toBeNull();
    });

    test("keeps changes in staging area", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file1.txt", "content1");
      await runGitCommand(tempDir, ["add", "file1.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "First commit"]);

      createFile(tempDir, "file2.txt", "content2");
      await runGitCommand(tempDir, ["add", "file2.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "Second commit"]);

      const service = createService(tempDir);
      await service.revert();

      const status = await service.status();
      expect(status.staged.length).toBe(1);
      expect(status.staged[0]?.path).toBe("file2.txt");

      const commit = await service.getLastCommit();
      expect(commit?.message).toBe("First commit");
    });

    test("throws error for empty repo", async () => {
      await initRepo(tempDir);
      const service = createService(tempDir);

      await expect(service.revert()).rejects.toThrow();
    });
  });

  // ============================================================================
  // resetTo
  // ============================================================================

  describe("resetTo", () => {
    test("resets to specific commit", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file1.txt", "content1");
      await runGitCommand(tempDir, ["add", "file1.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "First commit"]);
      const firstHash = (await runGitCommand(tempDir, ["rev-parse", "HEAD"])).trim();

      createFile(tempDir, "file2.txt", "content2");
      await runGitCommand(tempDir, ["add", "file2.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "Second commit"]);

      createFile(tempDir, "file3.txt", "content3");
      await runGitCommand(tempDir, ["add", "file3.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "Third commit"]);

      const service = createService(tempDir);
      await service.resetTo(firstHash);

      const commit = await service.getLastCommit();
      expect(commit?.message).toBe("First commit");

      // Changes from second and third commits should be staged
      const status = await service.status();
      expect(status.staged.length).toBe(2);
    });

    test("throws error for invalid commit hash", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file.txt", "content");
      await runGitCommand(tempDir, ["add", "file.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "Commit"]);

      const service = createService(tempDir);

      await expect(service.resetTo("invalid-hash")).rejects.toThrow();
    });
  });

  // ============================================================================
  // getCurrentBranch
  // ============================================================================

  describe("getCurrentBranch", () => {
    test("returns current branch name", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file.txt", "content");
      await runGitCommand(tempDir, ["add", "file.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "Initial commit"]);

      const service = createService(tempDir);
      const branch = await service.getCurrentBranch();

      // Default branch varies by git config
      expect(branch).toBeTruthy();
      expect(typeof branch).toBe("string");
    });

    test("returns correct branch after checkout", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file.txt", "content");
      await runGitCommand(tempDir, ["add", "file.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "Initial commit"]);
      await runGitCommand(tempDir, ["checkout", "-b", "feature-branch"]);

      const service = createService(tempDir);
      const branch = await service.getCurrentBranch();

      expect(branch).toBe("feature-branch");
    });
  });

  // ============================================================================
  // hasStagedChanges
  // ============================================================================

  describe("hasStagedChanges", () => {
    test("returns false when nothing staged", async () => {
      await initRepo(tempDir);

      const service = createService(tempDir);
      const hasStaged = await service.hasStagedChanges();

      expect(hasStaged).toBe(false);
    });

    test("returns false with only untracked files", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "untracked.txt", "content");

      const service = createService(tempDir);
      const hasStaged = await service.hasStagedChanges();

      expect(hasStaged).toBe(false);
    });

    test("returns true when files are staged", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "staged.txt", "content");
      await runGitCommand(tempDir, ["add", "staged.txt"]);

      const service = createService(tempDir);
      const hasStaged = await service.hasStagedChanges();

      expect(hasStaged).toBe(true);
    });

    test("returns false after commit", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file.txt", "content");
      await runGitCommand(tempDir, ["add", "file.txt"]);
      await runGitCommand(tempDir, ["commit", "-m", "Commit"]);

      const service = createService(tempDir);
      const hasStaged = await service.hasStagedChanges();

      expect(hasStaged).toBe(false);
    });
  });

  // ============================================================================
  // getIgnoredFiles
  // ============================================================================

  describe("getIgnoredFiles", () => {
    test("returns empty array when no gitignore", async () => {
      await initRepo(tempDir);
      createFile(tempDir, "file.txt", "content");

      const service = createService(tempDir);
      const ignored = await service.getIgnoredFiles(["file.txt"]);

      expect(ignored).toEqual([]);
    });

    test("returns empty array for empty input", async () => {
      await initRepo(tempDir);

      const service = createService(tempDir);
      const ignored = await service.getIgnoredFiles([]);

      expect(ignored).toEqual([]);
    });

    test("returns ignored files based on gitignore", async () => {
      await initRepo(tempDir);
      createFile(tempDir, ".gitignore", "*.log\nnode_modules/");
      createFile(tempDir, "debug.log", "log content");
      createFile(tempDir, "app.ts", "code");

      const service = createService(tempDir);
      const ignored = await service.getIgnoredFiles(["debug.log", "app.ts"]);

      expect(ignored).toContain("debug.log");
      expect(ignored).not.toContain("app.ts");
    });

    test("handles directory patterns", async () => {
      await initRepo(tempDir);
      createFile(tempDir, ".gitignore", "node_modules/");
      mkdirSync(join(tempDir, "node_modules"));
      createFile(tempDir, "node_modules/package.json", "{}");

      const service = createService(tempDir);
      const ignored = await service.getIgnoredFiles(["node_modules/package.json"]);

      expect(ignored.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Integration tests
  // ============================================================================

  describe("integration", () => {
    test("full workflow: init, add, commit, revert", async () => {
      const service = createService(tempDir);

      // Initialize
      await service.init();
      expect(await service.isRepo()).toBe(true);

      // Configure git user for commit
      await runGitCommand(tempDir, ["config", "user.email", "test@pokeralph.dev"]);
      await runGitCommand(tempDir, ["config", "user.name", "PokéRalph Test"]);

      // Create and add file
      createFile(tempDir, "feature.ts", "export const feature = true;");
      await service.add(["feature.ts"]);

      const statusAfterAdd = await service.status();
      expect(statusAfterAdd.staged.length).toBe(1);

      // Commit
      const commitMessage = GitService.formatCommitMessage("001-feature", "Add feature");
      const hash = await service.commit(commitMessage);
      expect(hash).toBeTruthy();

      const statusAfterCommit = await service.status();
      expect(statusAfterCommit.isDirty).toBe(false);

      // Verify commit
      const lastCommit = await service.getLastCommit();
      expect(lastCommit?.message).toBe("[PokéRalph] 001-feature: Add feature");

      // Revert
      await service.revert();
      const statusAfterRevert = await service.status();
      expect(statusAfterRevert.staged.length).toBe(1);
    });

    test("handles PokéRalph battle workflow", async () => {
      await initRepo(tempDir);
      const service = createService(tempDir);

      // Simulate battle iteration: Claude makes changes
      createFile(tempDir, "src/feature.ts", "// Feature implementation");
      createFile(tempDir, "tests/feature.test.ts", "// Feature tests");

      // Stage all changes
      await service.add("all");
      expect(await service.hasStagedChanges()).toBe(true);

      // Create formatted commit
      const message = GitService.formatCommitMessage("003-feature", "Implement user feature");
      const hash = await service.commit(message);

      // Verify
      const commit = await service.getLastCommit();
      expect(commit?.message).toBe("[PokéRalph] 003-feature: Implement user feature");
      expect(commit?.hash).toBe(hash);
    });
  });
});
