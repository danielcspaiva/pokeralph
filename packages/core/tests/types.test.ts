import { test, expect, describe } from "bun:test";
import {
  VERSION,
  // Config
  type Config,
  type ExecutionMode,
  DEFAULT_CONFIG,
  // Task
  type Task,
  TaskStatus,
  // PRD
  type PRD,
  type PRDMetadata,
  // Progress
  type Progress,
  type ProgressStatus,
  type FeedbackResult,
  createInitialProgress,
  // Iteration
  type Iteration,
  type IterationResult,
  createIteration,
  // Battle
  type Battle,
  type BattleStatus,
  createBattle,
  // Events
  type EventType,
  createEvent,
  type BattleStartPayload,
} from "../src/index.ts";

describe("@pokeralph/core types", () => {
  describe("Config", () => {
    test("DEFAULT_CONFIG has all required fields", () => {
      expect(DEFAULT_CONFIG.maxIterationsPerTask).toBe(10);
      expect(DEFAULT_CONFIG.mode).toBe("hitl");
      expect(DEFAULT_CONFIG.feedbackLoops).toContain("test");
      expect(DEFAULT_CONFIG.feedbackLoops).toContain("lint");
      expect(DEFAULT_CONFIG.feedbackLoops).toContain("typecheck");
      expect(DEFAULT_CONFIG.timeoutMinutes).toBe(30);
      expect(DEFAULT_CONFIG.pollingIntervalMs).toBe(2000);
      expect(DEFAULT_CONFIG.autoCommit).toBe(true);
    });

    test("Config type accepts valid configuration", () => {
      const config: Config = {
        maxIterationsPerTask: 5,
        mode: "yolo",
        feedbackLoops: ["test"],
        timeoutMinutes: 15,
        pollingIntervalMs: 1000,
        autoCommit: false,
      };
      expect(config.mode).toBe("yolo");
    });

    test("ExecutionMode accepts valid values", () => {
      const hitl: ExecutionMode = "hitl";
      const yolo: ExecutionMode = "yolo";
      expect(hitl).toBe("hitl");
      expect(yolo).toBe("yolo");
    });
  });

  describe("Task", () => {
    test("TaskStatus enum has correct values", () => {
      expect(TaskStatus.Pending as string).toBe("pending");
      expect(TaskStatus.Planning as string).toBe("planning");
      expect(TaskStatus.InProgress as string).toBe("in_progress");
      expect(TaskStatus.Paused as string).toBe("paused");
      expect(TaskStatus.Completed as string).toBe("completed");
      expect(TaskStatus.Failed as string).toBe("failed");
    });

    test("Task type accepts valid task", () => {
      const task: Task = {
        id: "001-setup",
        title: "Setup monorepo",
        description: "Create the initial monorepo structure",
        status: TaskStatus.Pending,
        priority: 1,
        acceptanceCriteria: ["Criterion 1", "Criterion 2"],
        iterations: [],
        createdAt: "2025-01-15T10:00:00Z",
        updatedAt: "2025-01-15T10:00:00Z",
      };
      expect(task.id).toBe("001-setup");
      expect(task.status).toBe(TaskStatus.Pending);
    });
  });

  describe("PRD", () => {
    test("PRD type accepts valid PRD", () => {
      const prd: PRD = {
        name: "Test Project",
        description: "A test project description",
        tasks: [],
        createdAt: "2025-01-15T10:00:00Z",
      };
      expect(prd.name).toBe("Test Project");
    });

    test("PRD with metadata", () => {
      const metadata: PRDMetadata = {
        version: "1.0.0",
        generatedBy: "claude-code",
        originalIdea: "Build a todo app",
      };
      const prd: PRD = {
        name: "Test Project",
        description: "A test project",
        tasks: [],
        metadata,
        createdAt: "2025-01-15T10:00:00Z",
        updatedAt: "2025-01-15T11:00:00Z",
      };
      expect(prd.metadata?.version).toBe("1.0.0");
    });
  });

  describe("Progress", () => {
    test("createInitialProgress creates valid progress", () => {
      const progress = createInitialProgress("001-setup");
      expect(progress.taskId).toBe("001-setup");
      expect(progress.currentIteration).toBe(0);
      expect(progress.status).toBe("idle");
      expect(progress.logs).toEqual([]);
      expect(progress.lastOutput).toBe("");
      expect(progress.completionDetected).toBe(false);
      expect(progress.error).toBeNull();
      expect(progress.feedbackResults).toEqual({});
    });

    test("Progress type accepts full progress object", () => {
      const progress: Progress = {
        taskId: "001-setup",
        currentIteration: 3,
        status: "in_progress",
        lastUpdate: "2025-01-15T10:30:00Z",
        logs: ["Log 1", "Log 2"],
        lastOutput: "Running tests...",
        completionDetected: false,
        error: null,
        feedbackResults: {
          test: { passed: true, output: "5 passed" },
          lint: { passed: false, output: "2 errors" },
        },
      };
      expect(progress.feedbackResults.test?.passed).toBe(true);
    });

    test("FeedbackResult type is valid", () => {
      const result: FeedbackResult = {
        passed: true,
        output: "All tests passed",
        duration: 1500,
      };
      expect(result.passed).toBe(true);
    });

    test("ProgressStatus accepts valid values", () => {
      const statuses: ProgressStatus[] = [
        "idle",
        "in_progress",
        "awaiting_approval",
        "completed",
        "failed",
      ];
      expect(statuses).toHaveLength(5);
    });
  });

  describe("Iteration", () => {
    test("createIteration creates valid iteration", () => {
      const iteration = createIteration(1);
      expect(iteration.number).toBe(1);
      expect(iteration.output).toBe("");
      expect(iteration.result).toBe("success");
      expect(iteration.filesChanged).toEqual([]);
      expect(iteration.startedAt).toBeDefined();
    });

    test("Iteration type accepts full iteration", () => {
      const iteration: Iteration = {
        number: 2,
        startedAt: "2025-01-15T10:00:00Z",
        endedAt: "2025-01-15T10:05:00Z",
        output: "Implemented feature X",
        result: "success",
        filesChanged: ["src/index.ts", "tests/index.test.ts"],
        commitHash: "abc123",
      };
      expect(iteration.filesChanged).toHaveLength(2);
    });

    test("IterationResult accepts valid values", () => {
      const results: IterationResult[] = [
        "success",
        "failure",
        "timeout",
        "cancelled",
      ];
      expect(results).toHaveLength(4);
    });
  });

  describe("Battle", () => {
    test("createBattle creates valid battle", () => {
      const battle = createBattle("001-setup");
      expect(battle.taskId).toBe("001-setup");
      expect(battle.status).toBe("pending");
      expect(battle.iterations).toEqual([]);
      expect(battle.startedAt).toBeDefined();
    });

    test("Battle type accepts full battle", () => {
      const battle: Battle = {
        taskId: "001-setup",
        status: "completed",
        iterations: [createIteration(1)],
        startedAt: "2025-01-15T10:00:00Z",
        completedAt: "2025-01-15T10:30:00Z",
        durationMs: 1800000,
      };
      expect(battle.status).toBe("completed");
    });

    test("BattleStatus accepts valid values", () => {
      const statuses: BattleStatus[] = [
        "pending",
        "running",
        "paused",
        "awaiting_approval",
        "completed",
        "failed",
        "cancelled",
      ];
      expect(statuses).toHaveLength(7);
    });
  });

  describe("Events", () => {
    test("createEvent creates valid event", () => {
      const payload: BattleStartPayload = {
        taskId: "001-setup",
        task: {
          id: "001-setup",
          title: "Setup",
          description: "Setup the project",
          status: TaskStatus.Pending,
          priority: 1,
          acceptanceCriteria: [],
          iterations: [],
          createdAt: "2025-01-15T10:00:00Z",
          updatedAt: "2025-01-15T10:00:00Z",
        },
      };
      const event = createEvent("battle_start", payload);
      expect(event.type).toBe("battle_start");
      expect(event.payload.taskId).toBe("001-setup");
      expect(event.timestamp).toBeDefined();
    });

    test("EventType accepts valid event types", () => {
      const types: EventType[] = [
        "planning_started",
        "planning_output",
        "battle_start",
        "iteration_start",
        "progress_update",
        "await_approval",
        "error",
      ];
      expect(types).toContain("battle_start");
    });
  });

  describe("VERSION", () => {
    test("exports VERSION", () => {
      expect(VERSION).toBe("0.1.0");
    });
  });
});

// Type assertion tests (compile-time checks)
// These tests verify that the types are correctly defined

// Task with iterations (runtime data from battle history)
const taskWithIterations: Task = {
  id: "001-test",
  title: "Test Task",
  description: "A test task",
  status: TaskStatus.Completed,
  priority: 1,
  acceptanceCriteria: ["Test criterion"],
  iterations: [
    {
      number: 1,
      startedAt: "2025-01-15T10:00:00Z",
      endedAt: "2025-01-15T10:05:00Z",
      output: "Done",
      result: "success",
      filesChanged: [],
    },
  ],
  createdAt: "2025-01-15T09:00:00Z",
  updatedAt: "2025-01-15T10:05:00Z",
};

// PRD with full task list
const completePRD: PRD = {
  name: "Complete Project",
  description: "A fully specified project",
  tasks: [taskWithIterations],
  metadata: {
    version: "1.0.0",
    generatedBy: "claude-code",
  },
  createdAt: "2025-01-15T09:00:00Z",
  updatedAt: "2025-01-15T10:05:00Z",
};

// Full progress object
const fullProgress: Progress = {
  taskId: "001-test",
  currentIteration: 1,
  status: "completed",
  lastUpdate: "2025-01-15T10:05:00Z",
  logs: ["Starting...", "Running tests...", "Complete!"],
  lastOutput: "All tests passed",
  completionDetected: true,
  error: null,
  feedbackResults: {
    test: { passed: true, output: "10 passed", duration: 5000 },
    lint: { passed: true, output: "No issues" },
    typecheck: { passed: true, output: "No errors" },
  },
};

// Full battle object
const completedBattle: Battle = {
  taskId: "001-test",
  status: "completed",
  iterations: taskWithIterations.iterations,
  startedAt: "2025-01-15T10:00:00Z",
  completedAt: "2025-01-15T10:05:00Z",
  durationMs: 300000,
};

// Type assertion: ensure exports are accessible
test("Type assertions compile correctly", () => {
  expect(taskWithIterations.id).toBe("001-test");
  expect(completePRD.name).toBe("Complete Project");
  expect(fullProgress.completionDetected).toBe(true);
  expect(completedBattle.status).toBe("completed");
});
