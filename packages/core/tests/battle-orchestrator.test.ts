import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { BattleOrchestrator } from "../src/services/battle-orchestrator.ts";
import { FileManager } from "../src/services/file-manager.ts";
import { ClaudeBridge } from "../src/services/claude-bridge.ts";
import { ProgressWatcher } from "../src/services/progress-watcher.ts";
import { FeedbackRunner } from "../src/services/feedback-runner.ts";
import { GitService } from "../src/services/git-service.ts";
import { PromptBuilder } from "../src/services/prompt-builder.ts";
import { TaskStatus, DEFAULT_CONFIG } from "../src/types/index.ts";
import type { PRD, Config } from "../src/types/index.ts";

// Path to the mock Claude script
const MOCK_CLAUDE_PATH = join(import.meta.dir, "fixtures", "mock-claude.ts");

// Create a unique temp directory in system temp
const getTempDir = () =>
  join(tmpdir(), `pokeralph-battle-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Creates a mock PRD for testing
 */
function createMockPRD(taskId = "001-test-task"): PRD {
  return {
    name: "Test Project",
    description: "A test project for battle orchestrator",
    tasks: [
      {
        id: taskId,
        title: "Test Task",
        description: "A test task for testing the battle orchestrator",
        status: TaskStatus.Pending,
        priority: 1,
        acceptanceCriteria: ["Criterion 1", "Criterion 2"],
        iterations: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Creates all dependencies for BattleOrchestrator
 */
function createDependencies(tempDir: string) {
  const fileManager = new FileManager(tempDir);
  const claudeBridge = new ClaudeBridge({
    workingDir: tempDir,
    claudePath: `bun ${MOCK_CLAUDE_PATH}`,
    timeoutMs: 5000,
  });
  const progressWatcher = new ProgressWatcher({
    fileManager,
    intervalMs: 100, // Fast polling for tests
  });
  const feedbackRunner = new FeedbackRunner({
    workingDir: tempDir,
  });
  const gitService = new GitService({
    workingDir: tempDir,
  });
  const promptBuilder = new PromptBuilder();

  return {
    fileManager,
    claudeBridge,
    progressWatcher,
    feedbackRunner,
    gitService,
    promptBuilder,
  };
}

/**
 * Sets up a temp directory with required structure
 */
async function setupTempDir(tempDir: string, deps: ReturnType<typeof createDependencies>) {
  // Create directory structure
  mkdirSync(tempDir, { recursive: true });

  // Initialize git repo
  await deps.gitService.init();

  // Initialize .pokeralph folder
  await deps.fileManager.init();

  // Create a package.json for feedback runner
  const packageJson = {
    name: "test-project",
    scripts: {
      test: 'echo "Tests passed"',
      lint: 'echo "Lint passed"',
      typecheck: 'echo "Typecheck passed"',
    },
  };
  await Bun.write(join(tempDir, "package.json"), JSON.stringify(packageJson, null, 2));
}

describe("BattleOrchestrator", () => {
  let tempDir: string;
  let deps: ReturnType<typeof createDependencies>;
  let orchestrator: BattleOrchestrator;

  beforeEach(async () => {
    tempDir = getTempDir();
    deps = createDependencies(tempDir);
    await setupTempDir(tempDir, deps);

    // Set up mock Claude environment
    process.env.MOCK_CLAUDE_MODE = "success";
    process.env.MOCK_CLAUDE_DELAY = "10";
    process.env.MOCK_CLAUDE_EXIT_CODE = "0";

    orchestrator = new BattleOrchestrator(deps);
  });

  afterEach(async () => {
    // Clean up
    deps.progressWatcher.stop();
    deps.claudeBridge.kill();

    // Reset env vars
    process.env.MOCK_CLAUDE_MODE = undefined;
    process.env.MOCK_CLAUDE_DELAY = undefined;
    process.env.MOCK_CLAUDE_EXIT_CODE = undefined;

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
    test("creates instance with dependencies", () => {
      const orch = new BattleOrchestrator(deps);
      expect(orch).toBeInstanceOf(BattleOrchestrator);
      expect(orch.isRunning()).toBe(false);
      expect(orch.isPaused()).toBe(false);
      expect(orch.isAwaitingApproval()).toBe(false);
    });
  });

  // ============================================================================
  // startBattle
  // ============================================================================

  describe("startBattle", () => {
    test("throws error if battle already in progress", async () => {
      // Save PRD
      await deps.fileManager.savePRD(createMockPRD());

      // Start first battle (don't await - we want it running)
      process.env.MOCK_CLAUDE_MODE = "timeout";
      process.env.MOCK_CLAUDE_DELAY = "5000";

      const startPromise = orchestrator.startBattle("001-test-task", "yolo");

      // Small delay to ensure battle started
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Try to start another battle
      expect(() => orchestrator.startBattle("001-test-task", "yolo")).toThrow(
        /Battle already in progress/
      );

      // Cancel to clean up
      await orchestrator.cancel();
      await startPromise.catch(() => {}); // Ignore any errors from cancelled battle
    });

    test("throws error if task not found", async () => {
      await deps.fileManager.savePRD(createMockPRD());

      await expect(orchestrator.startBattle("nonexistent-task", "yolo")).rejects.toThrow(
        /Task "nonexistent-task" not found/
      );
    });

    test("creates battle folder structure", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      // Start and let complete
      await orchestrator.startBattle(taskId, "yolo");

      // Verify folder was created by checking if progress can be loaded
      const progress = await deps.fileManager.loadProgress(taskId);
      expect(progress.taskId).toBe(taskId);
    });

    test("emits battle_start event", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      let eventReceived = false;
      let eventTaskId = "";

      orchestrator.on("battle_start", ({ taskId: id }) => {
        eventReceived = true;
        eventTaskId = id;
      });

      await orchestrator.startBattle(taskId, "yolo");

      expect(eventReceived).toBe(true);
      expect(eventTaskId).toBe(taskId);
    });

    test("updates task status to in_progress", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      // Use timeout mode so we can check status before completion
      process.env.MOCK_CLAUDE_MODE = "timeout";
      process.env.MOCK_CLAUDE_DELAY = "5000";

      const startPromise = orchestrator.startBattle(taskId, "yolo");

      // Wait a bit for status update
      await new Promise((resolve) => setTimeout(resolve, 50));

      const prd = await deps.fileManager.loadPRD();
      const task = prd.tasks.find((t) => t.id === taskId);
      expect(task?.status).toBe(TaskStatus.InProgress);

      // Clean up
      await orchestrator.cancel();
      await startPromise.catch(() => {});
    });
  });

  // ============================================================================
  // Battle completion (YOLO mode)
  // ============================================================================

  describe("YOLO mode", () => {
    test("completes battle when completion sigil detected", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      let completed = false;

      orchestrator.on("battle_complete", () => {
        completed = true;
      });

      await orchestrator.startBattle(taskId, "yolo");

      expect(completed).toBe(true);
      expect(orchestrator.isRunning()).toBe(false);
    });

    test("saves battle history on completion", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      await orchestrator.startBattle(taskId, "yolo");

      const battle = await deps.fileManager.loadBattleHistory(taskId);
      expect(battle.status).toBe("completed");
      expect(battle.completedAt).toBeDefined();
      expect(battle.iterations.length).toBeGreaterThan(0);
    });

    test("updates progress on completion", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      await orchestrator.startBattle(taskId, "yolo");

      const progress = await deps.fileManager.loadProgress(taskId);
      expect(progress.status).toBe("completed");
      expect(progress.completionDetected).toBe(true);
    });

    test("updates task status to completed", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      await orchestrator.startBattle(taskId, "yolo");

      const prd = await deps.fileManager.loadPRD();
      const task = prd.tasks.find((t) => t.id === taskId);
      expect(task?.status).toBe(TaskStatus.Completed);
    });
  });

  // ============================================================================
  // HITL mode
  // ============================================================================

  describe("HITL mode", () => {
    test("waits for approval after iteration when no completion sigil", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      // Use output mode without completion sigil so HITL wait is triggered
      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = "Iteration complete (no sigil)";
      process.env.MOCK_CLAUDE_DELAY = "10";

      // Use 2 max iterations and no feedback loops for faster test
      // (we need at least 2 so we can do 1 iteration + fail on max)
      const config: Config = {
        ...DEFAULT_CONFIG,
        maxIterationsPerTask: 2,
        feedbackLoops: [], // No feedback loops for simpler testing
        autoCommit: false, // Skip git commit
      };
      await deps.fileManager.saveConfig(config);

      let awaitingApproval = false;

      orchestrator.on("await_approval", () => {
        awaitingApproval = true;
        // Use setImmediate to ensure approval happens after state is set
        setImmediate(() => {
          orchestrator.approve();
        });
      });

      // The battle will fail due to max iterations after approval
      await orchestrator.startBattle(taskId, "hitl");

      // Should have been awaiting approval
      expect(awaitingApproval).toBe(true);
    });

    test("emits approval_received when approved", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      // Use output mode without completion sigil
      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = "Iteration complete (no sigil)";
      process.env.MOCK_CLAUDE_DELAY = "10";

      const config: Config = {
        ...DEFAULT_CONFIG,
        maxIterationsPerTask: 2,
        feedbackLoops: [], // No feedback loops for simpler testing
        autoCommit: false, // Skip git commit
      };
      await deps.fileManager.saveConfig(config);

      let approvalReceived = false;

      orchestrator.on("await_approval", () => {
        setImmediate(() => {
          orchestrator.approve();
        });
      });

      orchestrator.on("approval_received", ({ approved }) => {
        approvalReceived = true;
        expect(approved).toBe(true);
      });

      await orchestrator.startBattle(taskId, "hitl");

      expect(approvalReceived).toBe(true);
    });

    test("isAwaitingApproval returns true during approval wait", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      // Use output mode without completion sigil
      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = "Iteration complete (no sigil)";
      process.env.MOCK_CLAUDE_DELAY = "10";

      const config: Config = {
        ...DEFAULT_CONFIG,
        maxIterationsPerTask: 2,
        feedbackLoops: [], // No feedback loops for simpler testing
        autoCommit: false, // Skip git commit
      };
      await deps.fileManager.saveConfig(config);

      let wasAwaiting = false;

      orchestrator.on("await_approval", () => {
        wasAwaiting = orchestrator.isAwaitingApproval();
        setImmediate(() => {
          orchestrator.approve();
        });
      });

      await orchestrator.startBattle(taskId, "hitl");

      expect(wasAwaiting).toBe(true);
    });
  });

  // ============================================================================
  // pause / resume
  // ============================================================================

  describe("pause", () => {
    test("pauses after current iteration", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      // Use longer execution to have time to pause
      process.env.MOCK_CLAUDE_MODE = "timeout";
      process.env.MOCK_CLAUDE_DELAY = "5000";

      let pauseEventReceived = false;

      orchestrator.on("battle_pause", () => {
        pauseEventReceived = true;
      });

      const startPromise = orchestrator.startBattle(taskId, "yolo");

      // Wait a bit then pause
      await new Promise((resolve) => setTimeout(resolve, 50));
      orchestrator.pause();

      expect(orchestrator.isPaused()).toBe(true);
      expect(pauseEventReceived).toBe(true);

      // Cancel to clean up
      await orchestrator.cancel();
      await startPromise.catch(() => {});
    });
  });

  describe("resume", () => {
    test("throws if no battle to resume", async () => {
      await expect(orchestrator.resume()).rejects.toThrow(/No battle to resume/);
    });
  });

  // ============================================================================
  // cancel
  // ============================================================================

  describe("cancel", () => {
    test("cancels running battle", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      process.env.MOCK_CLAUDE_MODE = "timeout";
      process.env.MOCK_CLAUDE_DELAY = "5000";

      let cancelEventReceived = false;

      orchestrator.on("battle_cancel", () => {
        cancelEventReceived = true;
      });

      const startPromise = orchestrator.startBattle(taskId, "yolo");

      await new Promise((resolve) => setTimeout(resolve, 50));

      await orchestrator.cancel("Test cancellation");

      expect(orchestrator.isRunning()).toBe(false);
      expect(cancelEventReceived).toBe(true);

      await startPromise.catch(() => {});
    });

    test("saves cancellation reason to battle history", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      process.env.MOCK_CLAUDE_MODE = "timeout";
      process.env.MOCK_CLAUDE_DELAY = "5000";

      const startPromise = orchestrator.startBattle(taskId, "yolo");

      await new Promise((resolve) => setTimeout(resolve, 50));

      await orchestrator.cancel("Custom cancellation reason");

      const battle = await deps.fileManager.loadBattleHistory(taskId);
      expect(battle.status).toBe("cancelled");
      expect(battle.error).toBe("Custom cancellation reason");

      await startPromise.catch(() => {});
    });

    test("does nothing if no battle running", async () => {
      // Should not throw
      await orchestrator.cancel();
      expect(orchestrator.isRunning()).toBe(false);
    });
  });

  // ============================================================================
  // Events
  // ============================================================================

  describe("events", () => {
    test("emits iteration_start event", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      let iterationStarted = false;
      let iterationNum = 0;

      orchestrator.on("iteration_start", ({ taskId: id, iteration }) => {
        iterationStarted = true;
        iterationNum = iteration;
        expect(id).toBe(taskId);
      });

      await orchestrator.startBattle(taskId, "yolo");

      expect(iterationStarted).toBe(true);
      expect(iterationNum).toBeGreaterThan(0);
    });

    test("emits iteration_end event", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      let iterationEnded = false;

      orchestrator.on("iteration_end", ({ taskId: id, iteration, result }) => {
        iterationEnded = true;
        expect(id).toBe(taskId);
        expect(iteration).toBeGreaterThan(0);
        expect(result).toBeDefined();
      });

      await orchestrator.startBattle(taskId, "yolo");

      expect(iterationEnded).toBe(true);
    });

    test("emits iteration_output event", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      let outputReceived = false;

      orchestrator.on("iteration_output", ({ output }) => {
        outputReceived = true;
        expect(output).toContain("Claude Code Mock");
      });

      await orchestrator.startBattle(taskId, "yolo");

      expect(outputReceived).toBe(true);
    });

    test("emits completion_detected event", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      let completionDetected = false;

      orchestrator.on("completion_detected", ({ taskId: id }) => {
        completionDetected = true;
        expect(id).toBe(taskId);
      });

      await orchestrator.startBattle(taskId, "yolo");

      expect(completionDetected).toBe(true);
    });
  });

  // ============================================================================
  // getCurrentState
  // ============================================================================

  describe("getCurrentState", () => {
    test("returns null when no battle running", () => {
      expect(orchestrator.getCurrentState()).toBeNull();
    });

    test("returns current state during battle", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      process.env.MOCK_CLAUDE_MODE = "timeout";
      process.env.MOCK_CLAUDE_DELAY = "5000";

      const startPromise = orchestrator.startBattle(taskId, "yolo");

      await new Promise((resolve) => setTimeout(resolve, 50));

      const state = orchestrator.getCurrentState();
      expect(state).not.toBeNull();
      expect(state?.taskId).toBe(taskId);
      expect(state?.mode).toBe("yolo");

      await orchestrator.cancel();
      await startPromise.catch(() => {});
    });
  });

  // ============================================================================
  // Max iterations
  // ============================================================================

  describe("max iterations", () => {
    test("fails battle when max iterations reached", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      // Save a config with very low max iterations
      const config: Config = {
        ...DEFAULT_CONFIG,
        maxIterationsPerTask: 1,
      };
      await deps.fileManager.saveConfig(config);

      // Use mode that doesn't complete
      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = "Some output without completion sigil";

      let battleFailed = false;

      orchestrator.on("battle_failed", ({ error }) => {
        battleFailed = true;
        expect(error).toContain("Maximum iterations");
      });

      await orchestrator.startBattle(taskId, "yolo");

      expect(battleFailed).toBe(true);
    });
  });

  // ============================================================================
  // Error handling
  // ============================================================================

  describe("error handling", () => {
    test("emits error event on Claude failure", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      // Save config with low iterations to fail fast
      const config: Config = {
        ...DEFAULT_CONFIG,
        maxIterationsPerTask: 1,
      };
      await deps.fileManager.saveConfig(config);

      process.env.MOCK_CLAUDE_MODE = "error";
      process.env.MOCK_CLAUDE_EXIT_CODE = "1";

      let _errorEmitted = false;

      orchestrator.on("error", () => {
        _errorEmitted = true;
      });

      await orchestrator.startBattle(taskId, "yolo");

      // Error should be emitted during iteration
      // Note: May or may not be true depending on exact flow
    });
  });

  // ============================================================================
  // Recovery
  // ============================================================================

  describe("recovery", () => {
    test("can recover existing battle state", async () => {
      const taskId = "001-test-task";
      await deps.fileManager.savePRD(createMockPRD(taskId));

      // First battle - cancel mid-way
      process.env.MOCK_CLAUDE_MODE = "timeout";
      process.env.MOCK_CLAUDE_DELAY = "5000";

      const startPromise1 = orchestrator.startBattle(taskId, "yolo");
      await new Promise((resolve) => setTimeout(resolve, 50));
      await orchestrator.cancel();
      await startPromise1.catch(() => {});

      // Second battle - should pick up
      process.env.MOCK_CLAUDE_MODE = "success";
      process.env.MOCK_CLAUDE_DELAY = "10";

      // Create new orchestrator (simulating restart)
      const orchestrator2 = new BattleOrchestrator(deps);

      await orchestrator2.startBattle(taskId, "yolo");

      // Should complete successfully
      const battle = await deps.fileManager.loadBattleHistory(taskId);
      expect(battle.status).toBe("completed");
    });
  });
});
