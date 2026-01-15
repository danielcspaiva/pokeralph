/**
 * Tests for the main Orchestrator class
 *
 * The Orchestrator is a facade that unifies all services and exposes a clean API.
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Orchestrator } from "../src/orchestrator.ts";
import { DEFAULT_CONFIG } from "../src/types/index.ts";
import type { PRD } from "../src/types/index.ts";
import { TaskStatus } from "../src/types/index.ts";

describe("Orchestrator", () => {
  let tempDir: string;
  let orchestrator: Orchestrator;

  beforeEach(async () => {
    // Create a temp directory for each test
    tempDir = await mkdtemp(join(tmpdir(), "orchestrator-test-"));
    orchestrator = new Orchestrator(tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ==========================================================================
  // Constructor and Initialization
  // ==========================================================================

  describe("constructor", () => {
    test("creates instance with working directory", () => {
      expect(orchestrator).toBeDefined();
    });

    test("accepts workingDir as string", () => {
      const orch = new Orchestrator("/some/path");
      expect(orch).toBeDefined();
    });
  });

  describe("init()", () => {
    test("creates .pokeralph folder structure", async () => {
      await orchestrator.init();

      // Verify folder exists by trying to load config
      const config = await orchestrator.getConfig();
      expect(config).toBeDefined();
    });

    test("creates default config if none exists", async () => {
      await orchestrator.init();
      const config = await orchestrator.getConfig();

      expect(config.maxIterationsPerTask).toBe(DEFAULT_CONFIG.maxIterationsPerTask);
      expect(config.mode).toBe(DEFAULT_CONFIG.mode);
    });

    test("preserves existing config on re-init", async () => {
      await orchestrator.init();
      await orchestrator.updateConfig({ maxIterationsPerTask: 20 });

      // Re-init should not overwrite
      await orchestrator.init();
      const config = await orchestrator.getConfig();

      expect(config.maxIterationsPerTask).toBe(20);
    });
  });

  // ==========================================================================
  // Configuration Management
  // ==========================================================================

  describe("getConfig()", () => {
    test("returns current config", async () => {
      await orchestrator.init();
      const config = await orchestrator.getConfig();

      expect(config).toMatchObject({
        maxIterationsPerTask: expect.any(Number),
        mode: expect.stringMatching(/^(hitl|yolo)$/),
        feedbackLoops: expect.any(Array),
        timeoutMinutes: expect.any(Number),
        pollingIntervalMs: expect.any(Number),
        autoCommit: expect.any(Boolean),
      });
    });

    test("throws if .pokeralph not initialized", async () => {
      await expect(orchestrator.getConfig()).rejects.toThrow();
    });
  });

  describe("updateConfig()", () => {
    test("updates partial config", async () => {
      await orchestrator.init();

      await orchestrator.updateConfig({ maxIterationsPerTask: 25 });
      const config = await orchestrator.getConfig();

      expect(config.maxIterationsPerTask).toBe(25);
    });

    test("preserves non-updated fields", async () => {
      await orchestrator.init();
      const originalConfig = await orchestrator.getConfig();

      await orchestrator.updateConfig({ maxIterationsPerTask: 25 });
      const config = await orchestrator.getConfig();

      expect(config.mode).toBe(originalConfig.mode);
      expect(config.feedbackLoops).toEqual(originalConfig.feedbackLoops);
    });

    test("updates multiple fields at once", async () => {
      await orchestrator.init();

      await orchestrator.updateConfig({
        maxIterationsPerTask: 15,
        mode: "yolo",
        autoCommit: false,
      });

      const config = await orchestrator.getConfig();

      expect(config.maxIterationsPerTask).toBe(15);
      expect(config.mode).toBe("yolo");
      expect(config.autoCommit).toBe(false);
    });
  });

  // ==========================================================================
  // PRD Management
  // ==========================================================================

  describe("getPRD()", () => {
    test("returns null if no PRD exists", async () => {
      await orchestrator.init();
      const prd = await orchestrator.getPRD();

      expect(prd).toBeNull();
    });

    test("returns existing PRD", async () => {
      await orchestrator.init();

      // Create a test PRD
      const testPRD: PRD = {
        name: "Test Project",
        description: "A test project",
        createdAt: new Date().toISOString(),
        tasks: [],
        metadata: {
          version: "0.1.0",
          generatedBy: "test",
        },
      };

      // Save PRD via internal file manager (we'll test savePRD separately)
      await orchestrator.savePRD(testPRD);

      const prd = await orchestrator.getPRD();
      expect(prd?.name).toBe("Test Project");
    });
  });

  describe("savePRD()", () => {
    test("saves PRD to file system", async () => {
      await orchestrator.init();

      const testPRD: PRD = {
        name: "My Project",
        description: "My description",
        createdAt: new Date().toISOString(),
        tasks: [],
        metadata: {
          version: "1.0.0",
          generatedBy: "test",
        },
      };

      await orchestrator.savePRD(testPRD);
      const loaded = await orchestrator.getPRD();

      expect(loaded?.name).toBe("My Project");
      expect(loaded?.description).toBe("My description");
    });
  });

  // ==========================================================================
  // Task Management
  // ==========================================================================

  describe("getTasks()", () => {
    test("returns empty array if no PRD", async () => {
      await orchestrator.init();
      const tasks = await orchestrator.getTasks();

      expect(tasks).toEqual([]);
    });

    test("returns tasks from PRD", async () => {
      await orchestrator.init();

      const testPRD: PRD = {
        name: "Test",
        description: "Test",
        createdAt: new Date().toISOString(),
        tasks: [
          {
            id: "001-task",
            title: "First Task",
            description: "Description",
            status: TaskStatus.Pending,
            priority: 1,
            acceptanceCriteria: ["Done"],
            iterations: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        metadata: { version: "0.1.0", generatedBy: "test" },
      };

      await orchestrator.savePRD(testPRD);
      const tasks = await orchestrator.getTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.id).toBe("001-task");
    });
  });

  describe("getTask()", () => {
    test("returns null if task not found", async () => {
      await orchestrator.init();
      const task = await orchestrator.getTask("nonexistent");

      expect(task).toBeNull();
    });

    test("returns task by id", async () => {
      await orchestrator.init();

      const testPRD: PRD = {
        name: "Test",
        description: "Test",
        createdAt: new Date().toISOString(),
        tasks: [
          {
            id: "001-task",
            title: "First Task",
            description: "Description",
            status: TaskStatus.Pending,
            priority: 1,
            acceptanceCriteria: [],
            iterations: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        metadata: { version: "0.1.0", generatedBy: "test" },
      };

      await orchestrator.savePRD(testPRD);
      const task = await orchestrator.getTask("001-task");

      expect(task?.id).toBe("001-task");
      expect(task?.title).toBe("First Task");
    });
  });

  describe("addTask()", () => {
    test("adds task to PRD and returns with generated id", async () => {
      await orchestrator.init();

      // Create empty PRD first
      await orchestrator.savePRD({
        name: "Test",
        description: "Test",
        createdAt: new Date().toISOString(),
        tasks: [],
        metadata: { version: "0.1.0", generatedBy: "test" },
      });

      const newTask = await orchestrator.addTask({
        title: "New Task",
        description: "A new task",
        priority: 1,
        acceptanceCriteria: ["Criterion 1"],
      });

      expect(newTask.id).toBeDefined();
      expect(newTask.title).toBe("New Task");
      expect(newTask.status).toBe(TaskStatus.Pending);

      // Verify it was saved
      const tasks = await orchestrator.getTasks();
      expect(tasks).toHaveLength(1);
    });

    test("assigns sequential id based on existing tasks", async () => {
      await orchestrator.init();

      await orchestrator.savePRD({
        name: "Test",
        description: "Test",
        createdAt: new Date().toISOString(),
        tasks: [
          {
            id: "001-existing",
            title: "Existing",
            description: "Existing task",
            status: TaskStatus.Completed,
            priority: 1,
            acceptanceCriteria: [],
            iterations: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        metadata: { version: "0.1.0", generatedBy: "test" },
      });

      const newTask = await orchestrator.addTask({
        title: "Second Task",
        description: "Second",
        priority: 2,
        acceptanceCriteria: [],
      });

      expect(newTask.id).toMatch(/^002-/);
    });
  });

  describe("updateTask()", () => {
    test("updates task fields", async () => {
      await orchestrator.init();

      await orchestrator.savePRD({
        name: "Test",
        description: "Test",
        createdAt: new Date().toISOString(),
        tasks: [
          {
            id: "001-task",
            title: "Original Title",
            description: "Original",
            status: TaskStatus.Pending,
            priority: 1,
            acceptanceCriteria: [],
            iterations: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        metadata: { version: "0.1.0", generatedBy: "test" },
      });

      const updated = await orchestrator.updateTask("001-task", {
        title: "Updated Title",
        priority: 5,
      });

      expect(updated.title).toBe("Updated Title");
      expect(updated.priority).toBe(5);
      expect(updated.description).toBe("Original"); // Unchanged
    });

    test("throws if task not found", async () => {
      await orchestrator.init();

      await orchestrator.savePRD({
        name: "Test",
        description: "Test",
        createdAt: new Date().toISOString(),
        tasks: [],
        metadata: { version: "0.1.0", generatedBy: "test" },
      });

      await expect(
        orchestrator.updateTask("nonexistent", { title: "New" })
      ).rejects.toThrow();
    });

    test("updates updatedAt timestamp", async () => {
      await orchestrator.init();

      const oldDate = "2020-01-01T00:00:00Z";
      await orchestrator.savePRD({
        name: "Test",
        description: "Test",
        createdAt: new Date().toISOString(),
        tasks: [
          {
            id: "001-task",
            title: "Task",
            description: "Description",
            status: TaskStatus.Pending,
            priority: 1,
            acceptanceCriteria: [],
            iterations: [],
            createdAt: oldDate,
            updatedAt: oldDate,
          },
        ],
        metadata: { version: "0.1.0", generatedBy: "test" },
      });

      const updated = await orchestrator.updateTask("001-task", { title: "New" });

      expect(updated.updatedAt).not.toBe(oldDate);
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(oldDate).getTime()
      );
    });
  });

  // ==========================================================================
  // Battle Management (delegates to BattleOrchestrator)
  // ==========================================================================

  describe("startBattle()", () => {
    test("throws if task not found", async () => {
      await orchestrator.init();

      await orchestrator.savePRD({
        name: "Test",
        description: "Test",
        createdAt: new Date().toISOString(),
        tasks: [],
        metadata: { version: "0.1.0", generatedBy: "test" },
      });

      await expect(orchestrator.startBattle("nonexistent")).rejects.toThrow();
    });
  });

  describe("pauseBattle()", () => {
    test("does nothing if no battle running", () => {
      // Should not throw
      orchestrator.pauseBattle();
    });
  });

  describe("resumeBattle()", () => {
    test("throws if no battle to resume", async () => {
      await expect(orchestrator.resumeBattle()).rejects.toThrow();
    });
  });

  describe("cancelBattle()", () => {
    test("does nothing if no battle running", async () => {
      // Should not throw
      await orchestrator.cancelBattle();
    });
  });

  describe("approveBattle()", () => {
    test("does nothing if not awaiting approval", () => {
      // Should not throw
      orchestrator.approveBattle();
    });
  });

  // ==========================================================================
  // Battle Progress and History
  // ==========================================================================

  describe("getBattleProgress()", () => {
    test("returns null if no progress exists", async () => {
      await orchestrator.init();
      const progress = await orchestrator.getBattleProgress("001-task");

      expect(progress).toBeNull();
    });
  });

  describe("getBattleHistory()", () => {
    test("returns null if no history exists", async () => {
      await orchestrator.init();
      const history = await orchestrator.getBattleHistory("001-task");

      expect(history).toBeNull();
    });
  });

  // ==========================================================================
  // Planning (delegates to PlanService)
  // ==========================================================================

  describe("startPlanning()", () => {
    test("method exists and is callable", async () => {
      await orchestrator.init();
      expect(typeof orchestrator.startPlanning).toBe("function");
    });
  });

  describe("onPlanningOutput()", () => {
    test("registers callback for planning output", async () => {
      await orchestrator.init();
      const callback = () => {};

      // Should not throw
      orchestrator.onPlanningOutput(callback);
    });
  });

  describe("onPlanningQuestion()", () => {
    test("registers callback for planning questions", async () => {
      await orchestrator.init();
      const callback = () => {};

      // Should not throw
      orchestrator.onPlanningQuestion(callback);
    });
  });

  describe("answerPlanningQuestion()", () => {
    test("throws if not waiting for input", async () => {
      await orchestrator.init();

      await expect(
        orchestrator.answerPlanningQuestion("answer")
      ).rejects.toThrow();
    });
  });

  describe("finishPlanning()", () => {
    test("throws if no planning session", async () => {
      await orchestrator.init();

      await expect(orchestrator.finishPlanning()).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  describe("onBattleEvent()", () => {
    test("registers listener for battle events", async () => {
      await orchestrator.init();
      const callback = () => {};

      // Should not throw
      orchestrator.onBattleEvent("battle_start", callback);
    });

    test("can register multiple listeners", async () => {
      await orchestrator.init();

      orchestrator.onBattleEvent("battle_start", () => {});
      orchestrator.onBattleEvent("battle_complete", () => {});
      orchestrator.onBattleEvent("battle_failed", () => {});
    });
  });

  // ==========================================================================
  // Factory/Singleton Pattern
  // ==========================================================================

  describe("static create()", () => {
    test("creates new Orchestrator instance", () => {
      const orch = Orchestrator.create(tempDir);
      expect(orch).toBeInstanceOf(Orchestrator);
    });

    test("creates different instances for different directories", () => {
      const orch1 = Orchestrator.create("/path/one");
      const orch2 = Orchestrator.create("/path/two");

      expect(orch1).not.toBe(orch2);
    });
  });

  // ==========================================================================
  // Full Integration Flow
  // ==========================================================================

  describe("integration", () => {
    test("full workflow: init -> save PRD -> add task -> get tasks", async () => {
      // Initialize
      await orchestrator.init();

      // Save a PRD
      await orchestrator.savePRD({
        name: "Integration Test",
        description: "Testing full workflow",
        createdAt: new Date().toISOString(),
        tasks: [],
        metadata: { version: "0.1.0", generatedBy: "test" },
      });

      // Add a task
      const task = await orchestrator.addTask({
        title: "Test Task",
        description: "Integration test task",
        priority: 1,
        acceptanceCriteria: ["Works"],
      });

      // Verify task was added
      const tasks = await orchestrator.getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.id).toBe(task.id);

      // Get specific task
      const retrieved = await orchestrator.getTask(task.id);
      expect(retrieved?.title).toBe("Test Task");
    });
  });
});
