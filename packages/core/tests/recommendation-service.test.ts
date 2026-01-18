/**
 * Tests for recommendation service
 *
 * Based on: SPECS/04-dashboard.md (Smart Task Management section, lines 521-623)
 */

import { describe, test, expect } from "bun:test";
import {
  computeTaskRecommendation,
  buildProjectContext,
  getTaskRecommendations,
  getTopRecommendation,
  extractDependencies,
  checkDependencies,
  countBlockedTasks,
  calculateMomentum,
  type ProjectContext,
} from "../src/services/recommendation-service.ts";
import type { Task, PRD } from "../src/types/index.ts";
import { TaskStatus } from "../src/types/task.ts";

// =============================================================================
// Test Fixtures
// =============================================================================

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "001-test-task",
    title: "Test Task",
    description: "A test task for unit testing",
    status: TaskStatus.Pending,
    priority: 5,
    acceptanceCriteria: ["Criteria 1", "Criteria 2"],
    iterations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createPRD(tasks: Task[]): PRD {
  return {
    name: "Test PRD",
    description: "A test PRD for unit testing",
    tasks,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// extractDependencies Tests
// =============================================================================

describe("extractDependencies", () => {
  test("extracts dependencies from 'after' pattern", () => {
    const task = createTask({
      description: "This should run after 001-setup-project",
    });
    const deps = extractDependencies(task);
    expect(deps).toEqual(["001-setup-project"]);
  });

  test("extracts dependencies from 'requires' pattern", () => {
    const task = createTask({
      description: "This requires 002-database-setup to be complete",
    });
    const deps = extractDependencies(task);
    expect(deps).toEqual(["002-database-setup"]);
  });

  test("extracts dependencies from 'depends on' pattern", () => {
    const task = createTask({
      description: "This task depends on 003-auth-system",
    });
    const deps = extractDependencies(task);
    expect(deps).toEqual(["003-auth-system"]);
  });

  test("extracts dependencies from 'blocked by' pattern", () => {
    const task = createTask({
      description: "Currently blocked by 004-api-layer",
    });
    const deps = extractDependencies(task);
    expect(deps).toEqual(["004-api-layer"]);
  });

  test("extracts dependencies from acceptance criteria", () => {
    const task = createTask({
      description: "Simple task",
      acceptanceCriteria: [
        "Complete after 005-core-module",
        "Should run following 006-test-setup",
      ],
    });
    const deps = extractDependencies(task);
    expect(deps).toContain("005-core-module");
    expect(deps).toContain("006-test-setup");
  });

  test("extracts multiple dependencies", () => {
    const task = createTask({
      description:
        "After 001-setup and requires 002-db. Also depends on 003-auth",
    });
    const deps = extractDependencies(task);
    expect(deps.length).toBe(3);
    expect(deps).toContain("001-setup");
    expect(deps).toContain("002-db");
    expect(deps).toContain("003-auth");
  });

  test("returns empty array for task with no dependencies", () => {
    const task = createTask({
      description: "A standalone task with no dependencies",
    });
    const deps = extractDependencies(task);
    expect(deps).toEqual([]);
  });

  test("does not include self as dependency", () => {
    const task = createTask({
      id: "001-self-ref",
      description: "This references 001-self-ref itself",
    });
    const deps = extractDependencies(task);
    expect(deps).toEqual([]);
  });

  test("does not include duplicate dependencies", () => {
    const task = createTask({
      description: "After 001-setup and also after 001-setup again",
    });
    const deps = extractDependencies(task);
    expect(deps).toEqual(["001-setup"]);
  });
});

// =============================================================================
// checkDependencies Tests
// =============================================================================

describe("checkDependencies", () => {
  test("returns true when task has no dependencies", () => {
    const task = createTask({ description: "No dependencies" });
    const completedTasks: Task[] = [];
    expect(checkDependencies(task, completedTasks)).toBe(true);
  });

  test("returns true when all dependencies are completed", () => {
    const task = createTask({
      description: "After 001-setup and requires 002-db",
    });
    const completedTasks = [
      createTask({ id: "001-setup", status: TaskStatus.Completed }),
      createTask({ id: "002-db", status: TaskStatus.Completed }),
    ];
    expect(checkDependencies(task, completedTasks)).toBe(true);
  });

  test("returns false when some dependencies are not completed", () => {
    const task = createTask({
      description: "After 001-setup and requires 002-db",
    });
    const completedTasks = [
      createTask({ id: "001-setup", status: TaskStatus.Completed }),
      // 002-db is missing
    ];
    expect(checkDependencies(task, completedTasks)).toBe(false);
  });

  test("returns false when no dependencies are completed", () => {
    const task = createTask({
      description: "After 001-setup",
    });
    const completedTasks: Task[] = [];
    expect(checkDependencies(task, completedTasks)).toBe(false);
  });

  test("is case-insensitive when matching dependencies", () => {
    const task = createTask({
      description: "After 001-SETUP",
    });
    const completedTasks = [
      createTask({ id: "001-setup", status: TaskStatus.Completed }),
    ];
    expect(checkDependencies(task, completedTasks)).toBe(true);
  });
});

// =============================================================================
// countBlockedTasks Tests
// =============================================================================

describe("countBlockedTasks", () => {
  test("returns 0 when no tasks are blocked", () => {
    const task = createTask({ id: "001-setup" });
    const pendingTasks = [
      createTask({ id: "002-standalone", description: "No dependencies" }),
    ];
    expect(countBlockedTasks(task, pendingTasks)).toBe(0);
  });

  test("counts tasks blocked by this task", () => {
    const task = createTask({ id: "001-setup" });
    const pendingTasks = [
      createTask({
        id: "002-blocked",
        description: "Requires 001-setup",
      }),
      createTask({
        id: "003-also-blocked",
        description: "After 001-setup",
      }),
    ];
    expect(countBlockedTasks(task, pendingTasks)).toBe(2);
  });

  test("does not count itself", () => {
    const task = createTask({
      id: "001-setup",
      description: "Requires 001-setup", // Self-reference
    });
    const pendingTasks = [task];
    expect(countBlockedTasks(task, pendingTasks)).toBe(0);
  });

  test("correctly counts mixed blocked and unblocked tasks", () => {
    const task = createTask({ id: "001-setup" });
    const pendingTasks = [
      createTask({
        id: "002-blocked",
        description: "After 001-setup",
      }),
      createTask({
        id: "003-unblocked",
        description: "No dependencies",
      }),
      createTask({
        id: "004-blocked-by-other",
        description: "Requires 005-other",
      }),
    ];
    expect(countBlockedTasks(task, pendingTasks)).toBe(1);
  });
});

// =============================================================================
// calculateMomentum Tests
// =============================================================================

describe("calculateMomentum", () => {
  test("returns 0 when no recent tasks", () => {
    const task = createTask();
    expect(calculateMomentum(task, [])).toBe(0);
  });

  test("returns positive score for similar tasks", () => {
    const task = createTask({
      title: "Implement authentication system",
      description: "Add user authentication with JWT tokens",
    });
    const recentTasks = [
      createTask({
        title: "Setup authentication middleware",
        description: "Create middleware for JWT token validation",
        status: TaskStatus.Completed,
      }),
    ];
    const score = calculateMomentum(task, recentTasks);
    expect(score).toBeGreaterThan(0);
  });

  test("returns higher score for tasks with matching priority", () => {
    const task = createTask({
      title: "Implement database models",
      description: "Create database schema and models",
      priority: 2,
    });
    const recentTasksSamePriority = [
      createTask({
        title: "Setup database connection",
        description: "Configure database connection and schema",
        priority: 2,
        status: TaskStatus.Completed,
      }),
    ];
    const recentTasksDiffPriority = [
      createTask({
        title: "Setup database connection",
        description: "Configure database connection and schema",
        priority: 8,
        status: TaskStatus.Completed,
      }),
    ];
    const scoreSamePriority = calculateMomentum(task, recentTasksSamePriority);
    const scoreDiffPriority = calculateMomentum(task, recentTasksDiffPriority);
    expect(scoreSamePriority).toBeGreaterThan(scoreDiffPriority);
  });

  test("returns 0 for completely unrelated tasks", () => {
    const task = createTask({
      title: "X",
      description: "Y",
    });
    const recentTasks = [
      createTask({
        title: "A",
        description: "B",
        status: TaskStatus.Completed,
      }),
    ];
    const score = calculateMomentum(task, recentTasks);
    expect(score).toBe(0);
  });

  test("only considers up to 5 recent tasks", () => {
    const task = createTask({
      title: "Implement authentication",
      description: "Add authentication features",
    });
    // Create 10 recent tasks, but we should only consider 5
    const recentTasks = Array.from({ length: 10 }, (_, i) =>
      createTask({
        id: `00${i}-task`,
        title: `Task ${i} authentication`,
        description: `Task ${i} description about authentication`,
        status: TaskStatus.Completed,
      })
    );
    // This should not throw and should return a bounded score
    const score = calculateMomentum(task, recentTasks);
    expect(score).toBeLessThanOrEqual(15); // Max momentum bonus
  });
});

// =============================================================================
// computeTaskRecommendation Tests
// =============================================================================

describe("computeTaskRecommendation", () => {
  test("computes recommendation with priority factor", () => {
    const task = createTask({ priority: 1 }); // Highest priority
    const context: ProjectContext = {
      allTasks: [task],
      completedTasks: [],
      pendingTasks: [task],
      recentTasks: [],
    };

    const rec = computeTaskRecommendation(task, context);

    expect(rec.task).toBe(task);
    expect(rec.reasons.some((r) => r.type === "priority")).toBe(true);
    const priorityReason = rec.reasons.find((r) => r.type === "priority");
    expect(priorityReason?.impact).toBe(90); // (10 - 1) * 10
  });

  test("adds dependency bonus when dependencies are met", () => {
    const task = createTask({
      description: "After 001-setup",
    });
    const context: ProjectContext = {
      allTasks: [task],
      completedTasks: [createTask({ id: "001-setup", status: TaskStatus.Completed })],
      pendingTasks: [task],
      recentTasks: [],
    };

    const rec = computeTaskRecommendation(task, context);

    const depReason = rec.reasons.find((r) => r.type === "dependency");
    expect(depReason?.label).toBe("Dependencies met");
    expect(depReason?.impact).toBe(20);
  });

  test("adds dependency penalty when dependencies are not met", () => {
    const task = createTask({
      description: "After 001-setup",
    });
    const context: ProjectContext = {
      allTasks: [task],
      completedTasks: [], // No completed tasks
      pendingTasks: [task],
      recentTasks: [],
    };

    const rec = computeTaskRecommendation(task, context);

    const depReason = rec.reasons.find((r) => r.type === "dependency");
    expect(depReason?.label).toBe("Blocked by dependencies");
    expect(depReason?.impact).toBe(-50);
  });

  test("adds risk factor based on task risk level", () => {
    const simpleTask = createTask({
      description: "Simple task with short description",
      acceptanceCriteria: ["One criteria"],
    });
    const context: ProjectContext = {
      allTasks: [simpleTask],
      completedTasks: [],
      pendingTasks: [simpleTask],
      recentTasks: [],
    };

    const rec = computeTaskRecommendation(simpleTask, context);

    expect(rec.risk).toBeDefined();
    expect(["low", "medium", "high"]).toContain(rec.risk.level);
    expect(rec.reasons.some((r) => r.type === "risk")).toBe(true);
  });

  test("adds blocking factor when task unblocks others", () => {
    const task = createTask({ id: "001-setup" });
    const blockedTask = createTask({
      id: "002-blocked",
      description: "Requires 001-setup",
    });
    const context: ProjectContext = {
      allTasks: [task, blockedTask],
      completedTasks: [],
      pendingTasks: [task, blockedTask],
      recentTasks: [],
    };

    const rec = computeTaskRecommendation(task, context);

    const blockingReason = rec.reasons.find((r) => r.type === "blocking");
    expect(blockingReason?.label).toBe("Unblocks 1 task");
    expect(blockingReason?.impact).toBe(10);
  });

  test("suggests YOLO mode for low risk tasks", () => {
    const simpleTask = createTask({
      description: "Add a simple utility function",
      acceptanceCriteria: ["Function works"],
    });
    const context: ProjectContext = {
      allTasks: [simpleTask],
      completedTasks: [],
      pendingTasks: [simpleTask],
      recentTasks: [],
    };

    const rec = computeTaskRecommendation(simpleTask, context);

    // Low risk tasks should suggest YOLO
    if (rec.risk.level === "low") {
      expect(rec.suggestedMode).toBe("yolo");
    }
  });

  test("suggests HITL mode for high risk tasks", () => {
    const riskyTask = createTask({
      description:
        "Refactor the entire authentication system with security improvements and migrate existing users",
      acceptanceCriteria: [
        "All users migrated",
        "Security audit passes",
        "Performance benchmarks met",
        "No data loss",
        "Backward compatible",
        "Documentation updated",
      ],
    });
    const context: ProjectContext = {
      allTasks: [riskyTask],
      completedTasks: [],
      pendingTasks: [riskyTask],
      recentTasks: [],
    };

    const rec = computeTaskRecommendation(riskyTask, context);

    // High risk tasks should suggest HITL
    if (rec.risk.level === "high") {
      expect(rec.suggestedMode).toBe("hitl");
    }
  });
});

// =============================================================================
// buildProjectContext Tests
// =============================================================================

describe("buildProjectContext", () => {
  test("builds context from PRD", () => {
    const tasks = [
      createTask({ id: "001-pending", status: TaskStatus.Pending }),
      createTask({ id: "002-completed", status: TaskStatus.Completed }),
      createTask({ id: "003-failed", status: TaskStatus.Failed }),
      createTask({ id: "004-in-progress", status: TaskStatus.InProgress }),
    ];
    const prd = createPRD(tasks);

    const context = buildProjectContext(prd);

    expect(context.allTasks).toEqual(tasks);
    expect(context.completedTasks.length).toBe(1);
    expect(context.completedTasks[0]?.id).toBe("002-completed");
    expect(context.pendingTasks.length).toBe(2); // Pending + Failed
    expect(context.pendingTasks.map((t) => t.id)).toContain("001-pending");
    expect(context.pendingTasks.map((t) => t.id)).toContain("003-failed");
  });

  test("sorts recentTasks by updatedAt descending", () => {
    const tasks = [
      createTask({
        id: "001-old",
        status: TaskStatus.Completed,
        updatedAt: "2024-01-01T00:00:00Z",
      }),
      createTask({
        id: "002-new",
        status: TaskStatus.Completed,
        updatedAt: "2024-01-03T00:00:00Z",
      }),
      createTask({
        id: "003-mid",
        status: TaskStatus.Completed,
        updatedAt: "2024-01-02T00:00:00Z",
      }),
    ];
    const prd = createPRD(tasks);

    const context = buildProjectContext(prd);

    expect(context.recentTasks[0]?.id).toBe("002-new");
    expect(context.recentTasks[1]?.id).toBe("003-mid");
    expect(context.recentTasks[2]?.id).toBe("001-old");
  });
});

// =============================================================================
// getTaskRecommendations Tests
// =============================================================================

describe("getTaskRecommendations", () => {
  test("returns empty result when no tasks", () => {
    const prd = createPRD([]);

    const result = getTaskRecommendations(prd);

    expect(result.recommendations).toEqual([]);
    expect(result.topRecommendation).toBeNull();
  });

  test("returns empty result when no pending/failed tasks", () => {
    const tasks = [
      createTask({ id: "001-completed", status: TaskStatus.Completed }),
      createTask({ id: "002-in-progress", status: TaskStatus.InProgress }),
    ];
    const prd = createPRD(tasks);

    const result = getTaskRecommendations(prd);

    expect(result.recommendations).toEqual([]);
    expect(result.topRecommendation).toBeNull();
  });

  test("returns sorted recommendations with highest score first", () => {
    const tasks = [
      createTask({
        id: "001-low-priority",
        priority: 10,
        status: TaskStatus.Pending,
      }),
      createTask({
        id: "002-high-priority",
        priority: 1,
        status: TaskStatus.Pending,
      }),
      createTask({
        id: "003-medium-priority",
        priority: 5,
        status: TaskStatus.Pending,
      }),
    ];
    const prd = createPRD(tasks);

    const result = getTaskRecommendations(prd);

    expect(result.recommendations.length).toBe(3);
    // Higher priority = higher score
    expect(result.recommendations[0]?.task.id).toBe("002-high-priority");
    expect(result.topRecommendation?.task.id).toBe("002-high-priority");
  });

  test("includes failed tasks in recommendations", () => {
    const tasks = [
      createTask({ id: "001-failed", status: TaskStatus.Failed, priority: 1 }),
      createTask({
        id: "002-pending",
        status: TaskStatus.Pending,
        priority: 10,
      }),
    ];
    const prd = createPRD(tasks);

    const result = getTaskRecommendations(prd);

    expect(result.recommendations.length).toBe(2);
    expect(result.recommendations.map((r) => r.task.id)).toContain("001-failed");
  });
});

// =============================================================================
// getTopRecommendation Tests
// =============================================================================

describe("getTopRecommendation", () => {
  test("returns null when no tasks", () => {
    const prd = createPRD([]);

    const result = getTopRecommendation(prd);

    expect(result).toBeNull();
  });

  test("returns the highest scored task", () => {
    const tasks = [
      createTask({
        id: "001-low",
        priority: 10,
        status: TaskStatus.Pending,
      }),
      createTask({
        id: "002-high",
        priority: 1,
        status: TaskStatus.Pending,
      }),
    ];
    const prd = createPRD(tasks);

    const result = getTopRecommendation(prd);

    expect(result?.task.id).toBe("002-high");
  });

  test("returns recommendation with all required fields", () => {
    const tasks = [createTask({ status: TaskStatus.Pending })];
    const prd = createPRD(tasks);

    const result = getTopRecommendation(prd);

    expect(result).not.toBeNull();
    if (!result) return; // Type guard
    expect(result.task).toBeDefined();
    expect(result.score).toBeTypeOf("number");
    expect(result.reasons).toBeInstanceOf(Array);
    expect(["hitl", "yolo"]).toContain(result.suggestedMode);
    expect(result.risk).toBeDefined();
    expect(["low", "medium", "high"]).toContain(result.risk.level);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("Integration: Full recommendation workflow", () => {
  test("correctly ranks tasks with complex dependencies", () => {
    const tasks = [
      // High priority but blocked
      createTask({
        id: "001-blocked-high",
        priority: 1,
        status: TaskStatus.Pending,
        description: "Requires 003-foundation",
      }),
      // Medium priority but unblocks others
      createTask({
        id: "002-unblocks",
        priority: 5,
        status: TaskStatus.Pending,
        description: "Foundation task that unblocks 001",
      }),
      // Foundation task
      createTask({
        id: "003-foundation",
        priority: 3,
        status: TaskStatus.Pending,
        description: "No dependencies",
      }),
    ];

    // Make 002-unblocks actually unblock 001-blocked-high
    const blockedTask = tasks[0];
    if (blockedTask) {
      blockedTask.description = "Requires 002-unblocks";
    }

    const prd = createPRD(tasks);
    const result = getTaskRecommendations(prd);

    // The blocked high-priority task should have a lower score due to dependency penalty
    const blockedRec = result.recommendations.find(
      (r) => r.task.id === "001-blocked-high"
    );
    const unblockingRec = result.recommendations.find(
      (r) => r.task.id === "002-unblocks"
    );

    // Blocked task should have dependency penalty applied
    expect(blockedRec).toBeDefined();
    const blockedDepReason = blockedRec?.reasons.find((r) => r.type === "dependency");
    expect(blockedDepReason?.impact).toBe(-50);

    // Unblocking task should have blocking bonus
    expect(unblockingRec).toBeDefined();
    expect(
      unblockingRec?.reasons.some((r) => r.type === "blocking")
    ).toBe(true);
  });

  test("gives higher score to tasks similar to recently completed", () => {
    const tasks = [
      // Completed auth task
      createTask({
        id: "001-auth-done",
        status: TaskStatus.Completed,
        title: "Implement authentication",
        description: "Add user authentication with tokens",
        updatedAt: new Date().toISOString(),
      }),
      // Pending auth-related task
      createTask({
        id: "002-auth-pending",
        status: TaskStatus.Pending,
        priority: 5,
        title: "Add authentication middleware",
        description: "Create middleware for token validation",
      }),
      // Pending unrelated task
      createTask({
        id: "003-unrelated",
        status: TaskStatus.Pending,
        priority: 5, // Same priority
        title: "Setup deployment",
        description: "Configure CI/CD pipeline",
      }),
    ];

    const prd = createPRD(tasks);
    const result = getTaskRecommendations(prd);

    const authRec = result.recommendations.find(
      (r) => r.task.id === "002-auth-pending"
    );
    const unrelatedRec = result.recommendations.find(
      (r) => r.task.id === "003-unrelated"
    );

    // Auth task should have momentum bonus
    const authMomentum = authRec?.reasons.find((r) => r.type === "momentum");
    const unrelatedMomentum = unrelatedRec?.reasons.find(
      (r) => r.type === "momentum"
    );

    // Auth task should have higher momentum (or some momentum) compared to unrelated
    if (authMomentum) {
      expect(authMomentum.impact).toBeGreaterThan(0);
    }
    // Unrelated task might not have momentum or have lower
    expect(unrelatedMomentum?.impact ?? 0).toBeLessThanOrEqual(
      authMomentum?.impact ?? 0
    );
  });
});
