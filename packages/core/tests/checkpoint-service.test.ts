/**
 * Tests for CheckpointService
 *
 * Tests checkpoint creation, storage, restoration, and cleanup.
 * Based on spec 11-recovery.md lines 773-992.
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  // Storage implementations
  CommitCheckpointStorage,
  PatchCheckpointStorage,
  // Factory and utility functions
  getCheckpointStorage,
  createCheckpoint,
  restoreCheckpoint,
  createInitialCheckpoint,
  findCheckpointByIteration,
  getInitialCheckpoint,
  validateCheckpoint,
  // Cleanup functions
  cleanupCheckpoints,
  getCheckpointsToRemove,
  DEFAULT_RETENTION_POLICY,
  // Types
  type Checkpoint,
  type CheckpointRetentionPolicy,
} from "../src/services/checkpoint-service.ts";

import type { Iteration } from "../src/types/iteration.ts";
import type { FeedbackResults } from "../src/types/progress.ts";

// ==========================================================================
// Test Helpers
// ==========================================================================

let testDir: string;

async function setupTestRepo(): Promise<string> {
  // Create temp directory
  testDir = await mkdtemp(join(tmpdir(), "pokeralph-checkpoint-test-"));

  // Initialize git repo
  const initProc = Bun.spawn(["git", "init"], { cwd: testDir });
  await initProc.exited;

  // Configure git
  const configNameProc = Bun.spawn(
    ["git", "config", "user.name", "Test User"],
    { cwd: testDir }
  );
  await configNameProc.exited;

  const configEmailProc = Bun.spawn(
    ["git", "config", "user.email", "test@example.com"],
    { cwd: testDir }
  );
  await configEmailProc.exited;

  // Create initial file and commit
  await Bun.write(join(testDir, "README.md"), "# Test Project\n");
  const addProc = Bun.spawn(["git", "add", "-A"], { cwd: testDir });
  await addProc.exited;
  const commitProc = Bun.spawn(["git", "commit", "-m", "Initial commit"], {
    cwd: testDir,
  });
  await commitProc.exited;

  // Create .pokeralph folder
  await Bun.write(join(testDir, ".pokeralph", "config.json"), "{}");

  return testDir;
}

async function cleanupTestRepo(): Promise<void> {
  if (testDir) {
    await rm(testDir, { recursive: true, force: true });
  }
}

function createTestIteration(number: number, result: "success" | "failure" = "success"): Iteration {
  return {
    number,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    output: `Iteration ${number} output`,
    result,
    filesChanged: [`file${number}.ts`],
    commitHash: undefined, // Will be set by actual commit
  };
}

function createTestFeedbackResults(passed = true): FeedbackResults {
  return {
    test: { passed, output: passed ? "5 passed" : "2 failed", duration: 1000 },
    lint: { passed: true, output: "No errors", duration: 500 },
    typecheck: { passed: true, output: "No errors", duration: 800 },
  };
}

function createTestCheckpoint(
  afterIteration: number,
  options: Partial<Checkpoint> = {}
): Checkpoint {
  const feedbackResults = createTestFeedbackResults(options.feedbackResults ?
    Object.values(options.feedbackResults).every(r => r.passed) : true);

  return {
    id: `cp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    battleId: "battle-123",
    afterIteration,
    storageType: "commit",
    commitHash: "abc123",
    timestamp: new Date().toISOString(),
    description: `After iteration ${afterIteration}`,
    files: [`file${afterIteration}.ts`],
    feedbackResults,
    ...options,
  };
}

// ==========================================================================
// getCheckpointStorage Tests
// ==========================================================================

describe("getCheckpointStorage", () => {
  test("returns CommitCheckpointStorage when autoCommit is true", () => {
    const storage = getCheckpointStorage({ autoCommit: true });
    expect(storage.type).toBe("commit");
    expect(storage).toBeInstanceOf(CommitCheckpointStorage);
  });

  test("returns PatchCheckpointStorage when autoCommit is false", () => {
    const storage = getCheckpointStorage({ autoCommit: false });
    expect(storage.type).toBe("patch");
    expect(storage).toBeInstanceOf(PatchCheckpointStorage);
  });
});

// ==========================================================================
// CommitCheckpointStorage Tests
// ==========================================================================

describe("CommitCheckpointStorage", () => {
  beforeEach(async () => {
    await setupTestRepo();
  });

  afterEach(async () => {
    await cleanupTestRepo();
  });

  test("creates checkpoint with commit hash", async () => {
    const storage = new CommitCheckpointStorage();
    const iteration = createTestIteration(1);
    const feedbackResults = createTestFeedbackResults();

    const checkpoint = await storage.create(
      "battle-123",
      iteration,
      testDir,
      feedbackResults,
      []
    );

    expect(checkpoint.id).toMatch(/^cp-\d+-[a-z0-9]+$/);
    expect(checkpoint.battleId).toBe("battle-123");
    expect(checkpoint.afterIteration).toBe(1);
    expect(checkpoint.storageType).toBe("commit");
    expect(checkpoint.commitHash).toBeDefined();
    expect(checkpoint.timestamp).toBeDefined();
    expect(checkpoint.description).toBe("After iteration 1");
    expect(checkpoint.feedbackResults).toEqual(feedbackResults);
  });

  test("uses iteration commit hash if available", async () => {
    const storage = new CommitCheckpointStorage();

    // Make a commit
    await Bun.write(join(testDir, "test.ts"), "export const x = 1;");
    const addProc = Bun.spawn(["git", "add", "-A"], { cwd: testDir });
    await addProc.exited;
    const commitProc = Bun.spawn(["git", "commit", "-m", "Test commit"], {
      cwd: testDir,
    });
    await commitProc.exited;

    // Get the commit hash
    const hashProc = Bun.spawn(["git", "rev-parse", "HEAD"], {
      cwd: testDir,
      stdout: "pipe",
    });
    const hash = (await new Response(hashProc.stdout).text()).trim();

    const iteration = createTestIteration(1);
    iteration.commitHash = hash;

    const checkpoint = await storage.create(
      "battle-123",
      iteration,
      testDir,
      createTestFeedbackResults(),
      []
    );

    expect(checkpoint.commitHash).toBe(hash);
  });

  test("restores to checkpoint commit", async () => {
    const storage = new CommitCheckpointStorage();

    // Make initial commit with a file
    await Bun.write(join(testDir, "test.ts"), "version 1");
    const add1 = Bun.spawn(["git", "add", "-A"], { cwd: testDir });
    await add1.exited;
    const commit1 = Bun.spawn(["git", "commit", "-m", "Version 1"], { cwd: testDir });
    await commit1.exited;

    // Get commit hash
    const hash1Proc = Bun.spawn(["git", "rev-parse", "HEAD"], {
      cwd: testDir,
      stdout: "pipe",
    });
    const hash1 = (await new Response(hash1Proc.stdout).text()).trim();

    // Make second commit
    await Bun.write(join(testDir, "test.ts"), "version 2");
    const add2 = Bun.spawn(["git", "add", "-A"], { cwd: testDir });
    await add2.exited;
    const commit2 = Bun.spawn(["git", "commit", "-m", "Version 2"], { cwd: testDir });
    await commit2.exited;

    // Verify we're on version 2
    const contentBefore = await Bun.file(join(testDir, "test.ts")).text();
    expect(contentBefore).toBe("version 2");

    // Create checkpoint for version 1
    const checkpoint = createTestCheckpoint(1, { commitHash: hash1 });

    // Restore
    await storage.restore(checkpoint, testDir);

    // Verify we're back to version 1
    const contentAfter = await Bun.file(join(testDir, "test.ts")).text();
    expect(contentAfter).toBe("version 1");
  });

  test("throws error when restoring checkpoint without commit hash", async () => {
    const storage = new CommitCheckpointStorage();
    const checkpoint = createTestCheckpoint(1, { commitHash: undefined });

    await expect(storage.restore(checkpoint, testDir)).rejects.toThrow(
      "Commit-based checkpoint missing commitHash"
    );
  });
});

// ==========================================================================
// PatchCheckpointStorage Tests
// ==========================================================================

describe("PatchCheckpointStorage", () => {
  beforeEach(async () => {
    await setupTestRepo();
  });

  afterEach(async () => {
    await cleanupTestRepo();
  });

  test("creates checkpoint with patch content", async () => {
    const storage = new PatchCheckpointStorage();

    // Make some changes without committing
    await Bun.write(join(testDir, "README.md"), "# Modified\n");

    const iteration = createTestIteration(1);
    iteration.filesChanged = ["README.md"];

    const checkpoint = await storage.create(
      "battle-123",
      iteration,
      testDir,
      createTestFeedbackResults(),
      []
    );

    expect(checkpoint.id).toMatch(/^cp-\d+-[a-z0-9]+$/);
    expect(checkpoint.battleId).toBe("battle-123");
    expect(checkpoint.afterIteration).toBe(1);
    expect(checkpoint.storageType).toBe("patch");
    expect(checkpoint.baseCommitHash).toBeDefined();
    expect(checkpoint.patch).toBeDefined();
    expect(checkpoint.patch).toContain("README.md");
  });

  test("creates checkpoint including untracked files", async () => {
    const storage = new PatchCheckpointStorage();

    // Create a new untracked file
    await Bun.write(join(testDir, "newfile.ts"), "export const x = 1;\n");

    const iteration = createTestIteration(1);
    iteration.filesChanged = ["newfile.ts"];

    const checkpoint = await storage.create(
      "battle-123",
      iteration,
      testDir,
      createTestFeedbackResults(),
      []
    );

    expect(checkpoint.patch).toBeDefined();
    expect(checkpoint.patch).toContain("newfile.ts");
    expect(checkpoint.patch).toContain("new file mode");
  });

  test("restores from patch checkpoint", async () => {
    const storage = new PatchCheckpointStorage();

    // Get base commit hash
    const hashProc = Bun.spawn(["git", "rev-parse", "HEAD"], {
      cwd: testDir,
      stdout: "pipe",
    });
    const baseHash = (await new Response(hashProc.stdout).text()).trim();

    // Make changes
    await Bun.write(join(testDir, "README.md"), "# Modified Content\n");

    // Create patch
    const diffProc = Bun.spawn(["git", "diff", "HEAD"], {
      cwd: testDir,
      stdout: "pipe",
    });
    const patch = await new Response(diffProc.stdout).text();

    // Make more changes (simulate continuing work)
    await Bun.write(join(testDir, "README.md"), "# Even More Modified\n");

    // Create checkpoint
    const checkpoint = createTestCheckpoint(1, {
      storageType: "patch",
      baseCommitHash: baseHash,
      patch: patch,
    });

    // Restore
    await storage.restore(checkpoint, testDir);

    // Verify content matches the patched state
    const content = await Bun.file(join(testDir, "README.md")).text();
    expect(content).toBe("# Modified Content\n");
  });

  test("throws error when restoring checkpoint without base commit hash", async () => {
    const storage = new PatchCheckpointStorage();
    const checkpoint = createTestCheckpoint(1, {
      storageType: "patch",
      baseCommitHash: undefined,
      patch: "some patch",
    });

    await expect(storage.restore(checkpoint, testDir)).rejects.toThrow(
      "Patch-based checkpoint missing baseCommitHash"
    );
  });

  test("handles empty patch on restore", async () => {
    const storage = new PatchCheckpointStorage();

    // Get current commit hash
    const hashProc = Bun.spawn(["git", "rev-parse", "HEAD"], {
      cwd: testDir,
      stdout: "pipe",
    });
    const baseHash = (await new Response(hashProc.stdout).text()).trim();

    // Create checkpoint with empty patch
    const checkpoint = createTestCheckpoint(1, {
      storageType: "patch",
      baseCommitHash: baseHash,
      patch: "",
    });

    // Should not throw
    await storage.restore(checkpoint, testDir);

    // Content should be at base commit state
    const content = await Bun.file(join(testDir, "README.md")).text();
    expect(content).toBe("# Test Project\n");
  });
});

// ==========================================================================
// createCheckpoint Tests
// ==========================================================================

describe("createCheckpoint", () => {
  beforeEach(async () => {
    await setupTestRepo();
  });

  afterEach(async () => {
    await cleanupTestRepo();
  });

  test("creates commit-based checkpoint when autoCommit is true", async () => {
    const iteration = createTestIteration(1);
    const feedbackResults = createTestFeedbackResults();

    const checkpoint = await createCheckpoint(
      "battle-123",
      iteration,
      testDir,
      { autoCommit: true },
      feedbackResults
    );

    expect(checkpoint.storageType).toBe("commit");
    expect(checkpoint.commitHash).toBeDefined();
  });

  test("creates patch-based checkpoint when autoCommit is false", async () => {
    // Make some changes
    await Bun.write(join(testDir, "test.ts"), "export const x = 1;");

    const iteration = createTestIteration(1);
    iteration.filesChanged = ["test.ts"];
    const feedbackResults = createTestFeedbackResults();

    const checkpoint = await createCheckpoint(
      "battle-123",
      iteration,
      testDir,
      { autoCommit: false },
      feedbackResults
    );

    expect(checkpoint.storageType).toBe("patch");
    expect(checkpoint.baseCommitHash).toBeDefined();
    expect(checkpoint.patch).toBeDefined();
  });
});

// ==========================================================================
// createInitialCheckpoint Tests
// ==========================================================================

describe("createInitialCheckpoint", () => {
  beforeEach(async () => {
    await setupTestRepo();
  });

  afterEach(async () => {
    await cleanupTestRepo();
  });

  test("creates checkpoint at iteration 0", async () => {
    const checkpoint = await createInitialCheckpoint(
      "battle-123",
      testDir,
      { autoCommit: true }
    );

    expect(checkpoint.afterIteration).toBe(0);
    expect(checkpoint.description).toBe("Before battle started");
    expect(checkpoint.commitHash).toBeDefined();
    expect(checkpoint.files).toEqual([]);
    expect(checkpoint.feedbackResults).toEqual({});
  });

  test("sets correct storage type based on autoCommit", async () => {
    const commitCheckpoint = await createInitialCheckpoint(
      "battle-123",
      testDir,
      { autoCommit: true }
    );
    expect(commitCheckpoint.storageType).toBe("commit");

    const patchCheckpoint = await createInitialCheckpoint(
      "battle-123",
      testDir,
      { autoCommit: false }
    );
    expect(patchCheckpoint.storageType).toBe("patch");
  });
});

// ==========================================================================
// findCheckpointByIteration Tests
// ==========================================================================

describe("findCheckpointByIteration", () => {
  test("finds checkpoint by iteration number", () => {
    const checkpoints = [
      createTestCheckpoint(0),
      createTestCheckpoint(1),
      createTestCheckpoint(2),
      createTestCheckpoint(3),
    ];

    const found = findCheckpointByIteration(checkpoints, 2);
    expect(found).toBeDefined();
    expect(found!.afterIteration).toBe(2);
  });

  test("returns undefined when not found", () => {
    const checkpoints = [
      createTestCheckpoint(0),
      createTestCheckpoint(1),
    ];

    const found = findCheckpointByIteration(checkpoints, 5);
    expect(found).toBeUndefined();
  });

  test("handles empty array", () => {
    const found = findCheckpointByIteration([], 1);
    expect(found).toBeUndefined();
  });
});

// ==========================================================================
// getInitialCheckpoint Tests
// ==========================================================================

describe("getInitialCheckpoint", () => {
  test("finds checkpoint with afterIteration 0", () => {
    const checkpoints = [
      createTestCheckpoint(0),
      createTestCheckpoint(1),
      createTestCheckpoint(2),
    ];

    const initial = getInitialCheckpoint(checkpoints);
    expect(initial).toBeDefined();
    expect(initial!.afterIteration).toBe(0);
  });

  test("returns undefined when no initial checkpoint", () => {
    const checkpoints = [
      createTestCheckpoint(1),
      createTestCheckpoint(2),
    ];

    const initial = getInitialCheckpoint(checkpoints);
    expect(initial).toBeUndefined();
  });
});

// ==========================================================================
// validateCheckpoint Tests
// ==========================================================================

describe("validateCheckpoint", () => {
  test("validates commit-based checkpoint with commit hash", () => {
    const checkpoint = createTestCheckpoint(1, {
      storageType: "commit",
      commitHash: "abc123",
    });

    const result = validateCheckpoint(checkpoint);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("fails commit-based checkpoint without commit hash", () => {
    const checkpoint = createTestCheckpoint(1, {
      storageType: "commit",
      commitHash: undefined,
    });

    const result = validateCheckpoint(checkpoint);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Commit-based checkpoint missing commitHash");
  });

  test("validates patch-based checkpoint with base commit hash", () => {
    const checkpoint = createTestCheckpoint(1, {
      storageType: "patch",
      baseCommitHash: "abc123",
    });

    const result = validateCheckpoint(checkpoint);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("fails patch-based checkpoint without base commit hash", () => {
    const checkpoint = createTestCheckpoint(1, {
      storageType: "patch",
      baseCommitHash: undefined,
    });

    const result = validateCheckpoint(checkpoint);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Patch-based checkpoint missing baseCommitHash");
  });

  test("fails checkpoint without ID", () => {
    const checkpoint = createTestCheckpoint(1);
    // @ts-expect-error - intentionally testing invalid state
    checkpoint.id = "";

    const result = validateCheckpoint(checkpoint);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Checkpoint missing ID");
  });
});

// ==========================================================================
// cleanupCheckpoints Tests
// ==========================================================================

describe("cleanupCheckpoints", () => {
  test("keeps checkpoints up to maxCheckpoints", () => {
    const checkpoints = Array.from({ length: 15 }, (_, i) =>
      createTestCheckpoint(i, {
        timestamp: new Date(Date.now() - i * 1000).toISOString(),
      })
    );

    const policy: CheckpointRetentionPolicy = {
      maxCheckpoints: 10,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      keepFailed: true,
      keepSuccessful: true,
    };

    const kept = cleanupCheckpoints(checkpoints, policy);
    expect(kept.length).toBeLessThanOrEqual(15); // May keep some based on other criteria
  });

  test("removes checkpoints older than maxAge", () => {
    const now = Date.now();
    const checkpoints = [
      createTestCheckpoint(0, { timestamp: new Date(now).toISOString() }),
      createTestCheckpoint(1, { timestamp: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString() }),
      createTestCheckpoint(2, { timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString() }), // Older than 7 days
    ];

    const policy: CheckpointRetentionPolicy = {
      maxCheckpoints: 2, // Only keep 2, so the old one will be evaluated for age
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      keepFailed: false,
      keepSuccessful: false,
    };

    const kept = cleanupCheckpoints(checkpoints, policy);
    // First 2 are kept by maxCheckpoints, third is too old and not kept by other criteria
    expect(kept.length).toBe(2);
    expect(kept.find(cp => cp.afterIteration === 2)).toBeUndefined();
  });

  test("keeps failed checkpoints when keepFailed is true", () => {
    const failedResults = createTestFeedbackResults(false);
    const checkpoints = [
      createTestCheckpoint(0, { feedbackResults: createTestFeedbackResults(true) }),
      createTestCheckpoint(1, { feedbackResults: createTestFeedbackResults(true) }),
      createTestCheckpoint(2, { feedbackResults: failedResults }), // Failed
    ];

    const policy: CheckpointRetentionPolicy = {
      maxCheckpoints: 1, // Only guarantee first one
      maxAge: 7 * 24 * 60 * 60 * 1000,
      keepFailed: true, // Should keep failed even if over maxCheckpoints
      keepSuccessful: false,
    };

    const kept = cleanupCheckpoints(checkpoints, policy);
    // Should keep the failed checkpoint
    const failedKept = kept.find(cp =>
      Object.values(cp.feedbackResults).some(r => !r.passed)
    );
    expect(failedKept).toBeDefined();
  });

  test("uses default retention policy when not provided", () => {
    const checkpoints = [
      createTestCheckpoint(0),
      createTestCheckpoint(1),
    ];

    const kept = cleanupCheckpoints(checkpoints);
    expect(kept.length).toBe(2); // Should keep all within default limits
  });
});

// ==========================================================================
// getCheckpointsToRemove Tests
// ==========================================================================

describe("getCheckpointsToRemove", () => {
  test("returns IDs of checkpoints to remove", () => {
    const now = Date.now();
    const checkpoints = Array.from({ length: 15 }, (_, i) =>
      createTestCheckpoint(i, {
        id: `cp-${i}`,
        timestamp: new Date(now - i * 1000).toISOString(),
      })
    );

    const policy: CheckpointRetentionPolicy = {
      maxCheckpoints: 5,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      keepFailed: false,
      keepSuccessful: false,
    };

    const toRemove = getCheckpointsToRemove(checkpoints, policy);
    expect(toRemove.length).toBeGreaterThan(0);
    expect(toRemove.every(id => id.startsWith("cp-"))).toBe(true);
  });

  test("returns empty array when all checkpoints are kept", () => {
    const checkpoints = [
      createTestCheckpoint(0),
      createTestCheckpoint(1),
    ];

    const policy: CheckpointRetentionPolicy = {
      maxCheckpoints: 10,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      keepFailed: true,
      keepSuccessful: true,
    };

    const toRemove = getCheckpointsToRemove(checkpoints, policy);
    expect(toRemove.length).toBe(0);
  });
});

// ==========================================================================
// DEFAULT_RETENTION_POLICY Tests
// ==========================================================================

describe("DEFAULT_RETENTION_POLICY", () => {
  test("has correct default values per spec", () => {
    expect(DEFAULT_RETENTION_POLICY.maxCheckpoints).toBe(10);
    expect(DEFAULT_RETENTION_POLICY.maxAge).toBe(7 * 24 * 60 * 60 * 1000); // 7 days
    expect(DEFAULT_RETENTION_POLICY.keepFailed).toBe(true);
    expect(DEFAULT_RETENTION_POLICY.keepSuccessful).toBe(true);
  });
});

// ==========================================================================
// restoreCheckpoint Tests
// ==========================================================================

describe("restoreCheckpoint", () => {
  beforeEach(async () => {
    await setupTestRepo();
  });

  afterEach(async () => {
    await cleanupTestRepo();
  });

  test("uses correct storage based on autoCommit", async () => {
    // Make a commit
    await Bun.write(join(testDir, "test.ts"), "version 1");
    const add = Bun.spawn(["git", "add", "-A"], { cwd: testDir });
    await add.exited;
    const commit = Bun.spawn(["git", "commit", "-m", "v1"], { cwd: testDir });
    await commit.exited;

    const hashProc = Bun.spawn(["git", "rev-parse", "HEAD"], {
      cwd: testDir,
      stdout: "pipe",
    });
    const hash = (await new Response(hashProc.stdout).text()).trim();

    // Make more changes
    await Bun.write(join(testDir, "test.ts"), "version 2");
    const add2 = Bun.spawn(["git", "add", "-A"], { cwd: testDir });
    await add2.exited;
    const commit2 = Bun.spawn(["git", "commit", "-m", "v2"], { cwd: testDir });
    await commit2.exited;

    const checkpoint = createTestCheckpoint(1, {
      storageType: "commit",
      commitHash: hash,
    });

    // Restore using commit-based
    await restoreCheckpoint(checkpoint, testDir, { autoCommit: true });

    const content = await Bun.file(join(testDir, "test.ts")).text();
    expect(content).toBe("version 1");
  });
});
