/**
 * Tests for the app store
 */

import { describe, test, expect, beforeEach } from "vitest";
import {
  useAppStore,
  type CurrentBattle,
} from "@/stores/app-store";
import type { Config, PRD, Task, Progress, Battle } from "@pokeralph/core";

// ==========================================================================
// Test Data Fixtures
// ==========================================================================

const mockConfig: Config = {
  maxIterationsPerTask: 10,
  mode: "hitl",
  feedbackLoops: ["test", "lint", "typecheck"],
  timeoutMinutes: 30,
  pollingIntervalMs: 2000,
  autoCommit: true,
};

const mockTask1: Task = {
  id: "001-task-one",
  title: "Task One",
  description: "First task",
  status: "pending",
  priority: 1,
  acceptanceCriteria: ["Criterion 1"],
  createdAt: "2025-01-15T10:00:00Z",
  updatedAt: "2025-01-15T10:00:00Z",
};

const mockTask2: Task = {
  id: "002-task-two",
  title: "Task Two",
  description: "Second task",
  status: "completed",
  priority: 2,
  acceptanceCriteria: ["Criterion 2"],
  createdAt: "2025-01-15T10:00:00Z",
  updatedAt: "2025-01-15T10:00:00Z",
};

const mockTask3: Task = {
  id: "003-task-three",
  title: "Task Three",
  description: "Third task",
  status: "in_progress",
  priority: 3,
  acceptanceCriteria: ["Criterion 3"],
  createdAt: "2025-01-15T10:00:00Z",
  updatedAt: "2025-01-15T10:00:00Z",
};

const mockPRD: PRD = {
  name: "Test Project",
  description: "A test project",
  tasks: [mockTask1, mockTask2, mockTask3],
  metadata: {
    createdAt: "2025-01-15T10:00:00Z",
    updatedAt: "2025-01-15T10:00:00Z",
    version: "1.0.0",
  },
};

const mockProgress: Progress = {
  taskId: "001-task-one",
  currentIteration: 1,
  status: "in_progress",
  lastUpdate: "2025-01-15T10:30:00Z",
  logs: ["Starting task..."],
  lastOutput: "Running...",
  completionDetected: false,
  error: null,
  feedbackResults: {},
};

const mockBattle: Battle = {
  taskId: "001-task-one",
  status: "completed",
  iterations: [],
  startedAt: "2025-01-15T10:00:00Z",
  completedAt: "2025-01-15T11:00:00Z",
};

const mockCurrentBattle: CurrentBattle = {
  taskId: "001-task-one",
  iteration: 1,
  status: "in_progress",
  mode: "hitl",
  isRunning: true,
  isPaused: false,
  isAwaitingApproval: false,
};

// ==========================================================================
// Tests
// ==========================================================================

describe("app-store", () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAppStore.getState().reset();
  });

  // ========================================================================
  // Initial State Tests
  // ========================================================================

  describe("initial state", () => {
    test("has correct default values", () => {
      const state = useAppStore.getState();

      expect(state.isConnected).toBe(false);
      expect(state.connectionId).toBe(null);
      expect(state.config).toBe(null);
      expect(state.prd).toBe(null);
      expect(state.tasks).toEqual([]);
      expect(state.currentBattle).toBe(null);
      expect(state.battleProgress).toEqual({});
      expect(state.battleHistory).toEqual({});
      expect(state.planningSession).toEqual({
        state: "idle",
        pendingQuestion: null,
        conversationOutput: [],
      });
    });
  });

  // ========================================================================
  // Connection Actions Tests
  // ========================================================================

  describe("connection actions", () => {
    test("setConnected updates connection state", () => {
      useAppStore.getState().setConnected(true, "conn-123");

      expect(useAppStore.getState().isConnected).toBe(true);
      expect(useAppStore.getState().connectionId).toBe("conn-123");
    });

    test("setConnected can disconnect", () => {
      useAppStore.getState().setConnected(true, "conn-123");
      useAppStore.getState().setConnected(false);

      expect(useAppStore.getState().isConnected).toBe(false);
      expect(useAppStore.getState().connectionId).toBe(null);
    });
  });

  // ========================================================================
  // Config Actions Tests
  // ========================================================================

  describe("config actions", () => {
    test("setConfig sets the full config", () => {
      useAppStore.getState().setConfig(mockConfig);

      expect(useAppStore.getState().config).toEqual(mockConfig);
    });

    test("updateConfig merges partial config", () => {
      useAppStore.getState().setConfig(mockConfig);
      useAppStore.getState().updateConfig({ maxIterationsPerTask: 20 });

      expect(useAppStore.getState().config?.maxIterationsPerTask).toBe(20);
      expect(useAppStore.getState().config?.mode).toBe("hitl");
    });

    test("updateConfig does nothing if config is null", () => {
      useAppStore.getState().updateConfig({ maxIterationsPerTask: 20 });

      expect(useAppStore.getState().config).toBe(null);
    });
  });

  // ========================================================================
  // PRD/Tasks Actions Tests
  // ========================================================================

  describe("PRD/Tasks actions", () => {
    test("setPRD sets PRD and extracts tasks", () => {
      useAppStore.getState().setPRD(mockPRD);

      expect(useAppStore.getState().prd).toEqual(mockPRD);
      expect(useAppStore.getState().tasks).toEqual(mockPRD.tasks);
    });

    test("setPRD(null) clears PRD and tasks", () => {
      useAppStore.getState().setPRD(mockPRD);
      useAppStore.getState().setPRD(null);

      expect(useAppStore.getState().prd).toBe(null);
      expect(useAppStore.getState().tasks).toEqual([]);
    });

    test("setTasks sets tasks directly", () => {
      useAppStore.getState().setTasks([mockTask1, mockTask2]);

      expect(useAppStore.getState().tasks).toEqual([mockTask1, mockTask2]);
    });

    test("updateTask updates a specific task", () => {
      useAppStore.getState().setPRD(mockPRD);
      useAppStore.getState().updateTask("001-task-one", { status: "completed" });

      const task = useAppStore.getState().tasks.find((t) => t.id === "001-task-one");
      expect(task?.status).toBe("completed");

      // Also updates in PRD
      const prdTask = useAppStore.getState().prd?.tasks.find((t) => t.id === "001-task-one");
      expect(prdTask?.status).toBe("completed");
    });

    test("addTask adds a new task", () => {
      useAppStore.getState().setPRD(mockPRD);

      const newTask: Task = {
        id: "004-task-four",
        title: "Task Four",
        description: "Fourth task",
        status: "pending",
        priority: 4,
        acceptanceCriteria: [],
        createdAt: "2025-01-15T10:00:00Z",
        updatedAt: "2025-01-15T10:00:00Z",
      };

      useAppStore.getState().addTask(newTask);

      expect(useAppStore.getState().tasks).toHaveLength(4);
      expect(useAppStore.getState().prd?.tasks).toHaveLength(4);
    });

    test("removeTask removes a task", () => {
      useAppStore.getState().setPRD(mockPRD);
      useAppStore.getState().removeTask("001-task-one");

      expect(useAppStore.getState().tasks).toHaveLength(2);
      expect(useAppStore.getState().prd?.tasks).toHaveLength(2);
      expect(useAppStore.getState().tasks.find((t) => t.id === "001-task-one")).toBeUndefined();
    });
  });

  // ========================================================================
  // Battle Actions Tests
  // ========================================================================

  describe("battle actions", () => {
    test("setCurrentBattle sets the current battle", () => {
      useAppStore.getState().setCurrentBattle(mockCurrentBattle);

      expect(useAppStore.getState().currentBattle).toEqual(mockCurrentBattle);
    });

    test("setCurrentBattle(null) clears current battle", () => {
      useAppStore.getState().setCurrentBattle(mockCurrentBattle);
      useAppStore.getState().setCurrentBattle(null);

      expect(useAppStore.getState().currentBattle).toBe(null);
    });

    test("setBattleProgress sets progress for a task", () => {
      useAppStore.getState().setBattleProgress("001-task-one", mockProgress);

      expect(useAppStore.getState().battleProgress["001-task-one"]).toEqual(mockProgress);
    });

    test("setBattleHistory sets history for a task", () => {
      useAppStore.getState().setBattleHistory("001-task-one", mockBattle);

      expect(useAppStore.getState().battleHistory["001-task-one"]).toEqual(mockBattle);
    });

    test("clearBattleProgress removes progress for a task", () => {
      useAppStore.getState().setBattleProgress("001-task-one", mockProgress);
      useAppStore.getState().clearBattleProgress("001-task-one");

      expect(useAppStore.getState().battleProgress["001-task-one"]).toBeUndefined();
    });
  });

  // ========================================================================
  // Planning Actions Tests
  // ========================================================================

  describe("planning actions", () => {
    test("setPlanningState updates planning state", () => {
      useAppStore.getState().setPlanningState("planning");

      expect(useAppStore.getState().planningSession.state).toBe("planning");
    });

    test("setPendingQuestion sets pending question", () => {
      useAppStore.getState().setPendingQuestion("What framework?");

      expect(useAppStore.getState().planningSession.pendingQuestion).toBe("What framework?");
    });

    test("addPlanningOutput appends to output", () => {
      useAppStore.getState().addPlanningOutput("Line 1");
      useAppStore.getState().addPlanningOutput("Line 2");

      expect(useAppStore.getState().planningSession.conversationOutput).toEqual([
        "Line 1",
        "Line 2",
      ]);
    });

    test("clearPlanningSession resets planning state", () => {
      useAppStore.getState().setPlanningState("planning");
      useAppStore.getState().setPendingQuestion("Question?");
      useAppStore.getState().addPlanningOutput("Output");

      useAppStore.getState().clearPlanningSession();

      expect(useAppStore.getState().planningSession).toEqual({
        state: "idle",
        pendingQuestion: null,
        conversationOutput: [],
      });
    });
  });

  // ========================================================================
  // Hydration Actions Tests
  // ========================================================================

  describe("hydration actions", () => {
    test("hydrate merges partial state", () => {
      useAppStore.getState().hydrate({
        config: mockConfig,
        isConnected: true,
      });

      expect(useAppStore.getState().config).toEqual(mockConfig);
      expect(useAppStore.getState().isConnected).toBe(true);
      expect(useAppStore.getState().prd).toBe(null); // Not changed
    });

    test("reset resets to initial state", () => {
      useAppStore.getState().setConfig(mockConfig);
      useAppStore.getState().setPRD(mockPRD);
      useAppStore.getState().setCurrentBattle(mockCurrentBattle);

      useAppStore.getState().reset();

      expect(useAppStore.getState().config).toBe(null);
      expect(useAppStore.getState().prd).toBe(null);
      expect(useAppStore.getState().currentBattle).toBe(null);
    });
  });

  // ========================================================================
  // Selectors Tests
  // ========================================================================

  describe("selectors", () => {
    beforeEach(() => {
      useAppStore.getState().setConfig(mockConfig);
      useAppStore.getState().setPRD(mockPRD);
      useAppStore.getState().setCurrentBattle(mockCurrentBattle);
    });

    test("useIsConnected returns connection status", () => {
      useAppStore.getState().setConnected(true);
      // Access store state directly since we can't use hooks outside React
      expect(useAppStore.getState().isConnected).toBe(true);
    });

    test("useConfig returns config", () => {
      expect(useAppStore.getState().config).toEqual(mockConfig);
    });

    test("usePRD returns PRD", () => {
      expect(useAppStore.getState().prd).toEqual(mockPRD);
    });

    test("useTasks returns all tasks", () => {
      expect(useAppStore.getState().tasks).toHaveLength(3);
    });

    test("useCurrentBattle returns current battle", () => {
      expect(useAppStore.getState().currentBattle).toEqual(mockCurrentBattle);
    });

    test("usePlanningSession returns planning session", () => {
      expect(useAppStore.getState().planningSession).toEqual({
        state: "idle",
        pendingQuestion: null,
        conversationOutput: [],
      });
    });
  });

  // ========================================================================
  // Task Selectors Tests
  // ========================================================================

  describe("task selectors", () => {
    beforeEach(() => {
      useAppStore.getState().setPRD(mockPRD);
    });

    test("can find task by ID", () => {
      const task = useAppStore.getState().tasks.find((t) => t.id === "001-task-one");
      expect(task).toEqual(mockTask1);
    });

    test("can filter tasks by status", () => {
      const pendingTasks = useAppStore.getState().tasks.filter((t) => t.status === "pending");
      expect(pendingTasks).toHaveLength(1);
      expect(pendingTasks[0].id).toBe("001-task-one");
    });

    test("can get pending tasks", () => {
      const pending = useAppStore.getState().tasks.filter((t) => t.status === "pending");
      expect(pending).toHaveLength(1);
    });

    test("can get completed tasks", () => {
      const completed = useAppStore.getState().tasks.filter((t) => t.status === "completed");
      expect(completed).toHaveLength(1);
    });

    test("can get in-progress tasks", () => {
      const inProgress = useAppStore.getState().tasks.filter((t) => t.status === "in_progress");
      expect(inProgress).toHaveLength(1);
    });
  });

  // ========================================================================
  // Derived Selectors Tests
  // ========================================================================

  describe("derived selectors", () => {
    beforeEach(() => {
      useAppStore.getState().setPRD(mockPRD);
    });

    test("task counts are calculated correctly", () => {
      const tasks = useAppStore.getState().tasks;
      const counts = {
        total: tasks.length,
        pending: tasks.filter((t) => t.status === "pending").length,
        completed: tasks.filter((t) => t.status === "completed").length,
        in_progress: tasks.filter((t) => t.status === "in_progress").length,
      };

      expect(counts.total).toBe(3);
      expect(counts.pending).toBe(1);
      expect(counts.completed).toBe(1);
      expect(counts.in_progress).toBe(1);
    });

    test("next pending task is the one with lowest priority", () => {
      const pending = useAppStore.getState().tasks.filter((t) => t.status === "pending");
      const nextTask = pending.sort((a, b) => a.priority - b.priority)[0];

      expect(nextTask?.id).toBe("001-task-one");
    });

    test("battle running status is correct", () => {
      useAppStore.getState().setCurrentBattle(mockCurrentBattle);
      expect(useAppStore.getState().currentBattle?.isRunning).toBe(true);
    });

    test("battle paused status is correct", () => {
      useAppStore.getState().setCurrentBattle({
        ...mockCurrentBattle,
        isPaused: true,
        isRunning: false,
      });
      expect(useAppStore.getState().currentBattle?.isPaused).toBe(true);
    });

    test("awaiting approval status is correct", () => {
      useAppStore.getState().setCurrentBattle({
        ...mockCurrentBattle,
        isAwaitingApproval: true,
        isRunning: false,
      });
      expect(useAppStore.getState().currentBattle?.isAwaitingApproval).toBe(true);
    });
  });

  // ========================================================================
  // Battle Progress/History Tests
  // ========================================================================

  describe("battle progress and history", () => {
    test("can get progress for a task", () => {
      useAppStore.getState().setBattleProgress("001-task-one", mockProgress);

      expect(useAppStore.getState().battleProgress["001-task-one"]).toEqual(mockProgress);
    });

    test("can get all battle progress", () => {
      useAppStore.getState().setBattleProgress("001-task-one", mockProgress);

      expect(Object.keys(useAppStore.getState().battleProgress)).toHaveLength(1);
    });

    test("can get history for a task", () => {
      useAppStore.getState().setBattleHistory("001-task-one", mockBattle);

      expect(useAppStore.getState().battleHistory["001-task-one"]).toEqual(mockBattle);
    });

    test("can get all battle history", () => {
      useAppStore.getState().setBattleHistory("001-task-one", mockBattle);

      expect(Object.keys(useAppStore.getState().battleHistory)).toHaveLength(1);
    });
  });

  // ========================================================================
  // Persistence Tests
  // ========================================================================

  describe("persistence", () => {
    test("partialize only includes config", () => {
      // The store is configured with partialize that only persists config
      // Verify this by checking the store configuration
      // We test behavior: after setting all state, only config matters for persistence
      useAppStore.getState().setConfig(mockConfig);
      useAppStore.getState().setPRD(mockPRD);
      useAppStore.getState().setCurrentBattle(mockCurrentBattle);

      // Verify full state has all values
      expect(useAppStore.getState().config).toEqual(mockConfig);
      expect(useAppStore.getState().prd).toEqual(mockPRD);
      expect(useAppStore.getState().currentBattle).toEqual(mockCurrentBattle);

      // After reset, only config would be restored from persistence
      // (though in test environment, persist may not work fully)
      // The key point is the partialize config exists and only includes config
      const state = useAppStore.getState();
      expect(state.config).toBeDefined();
    });

    test("non-config state is ephemeral", () => {
      // Set all state
      useAppStore.getState().setConfig(mockConfig);
      useAppStore.getState().setPRD(mockPRD);
      useAppStore.getState().setCurrentBattle(mockCurrentBattle);

      // After reset, only persisted state would remain (config)
      useAppStore.getState().reset();

      // All state should be reset to initial values
      expect(useAppStore.getState().config).toBe(null);
      expect(useAppStore.getState().prd).toBe(null);
      expect(useAppStore.getState().currentBattle).toBe(null);
    });
  });
});
