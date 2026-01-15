import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { TaskStatus } from "@pokeralph/core";
import type { PRD, Task } from "@pokeralph/core";
import {
  createApp,
  initializeOrchestrator,
  getOrchestrator,
  resetServerState,
} from "../src/index.ts";

/**
 * Helper to create a minimal valid PRD
 */
function createTestPRD(overrides: Partial<PRD> = {}): PRD {
  const now = new Date().toISOString();
  return {
    name: "Test Project",
    description: "A test project",
    tasks: [],
    createdAt: now,
    ...overrides,
  };
}

/**
 * Helper to create a minimal valid task
 */
function createTestTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: "001-test-task",
    title: "Test Task",
    description: "A test task description",
    status: TaskStatus.Pending,
    priority: 1,
    acceptanceCriteria: ["Criterion 1", "Criterion 2"],
    iterations: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("PRD Routes", () => {
  let tempDir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = join(
      tmpdir(),
      `pokeralph-prd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(tempDir, { recursive: true });

    // Reset server state and initialize orchestrator
    resetServerState();
    initializeOrchestrator(tempDir);

    // Initialize the .pokeralph folder
    const orchestrator = getOrchestrator();
    if (orchestrator) {
      await orchestrator.init();
    }

    // Create app for testing
    app = createApp();
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Reset server state
    resetServerState();
  });

  // ==========================================================================
  // GET /api/prd
  // ==========================================================================

  describe("GET /api/prd", () => {
    test("returns 404 when no PRD exists", async () => {
      const res = await app.fetch(new Request("http://localhost/api/prd"));

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("PRD_NOT_FOUND");
    });

    test("returns PRD when it exists", async () => {
      // Create a PRD first
      const testPRD = createTestPRD({
        name: "My Project",
        description: "Test description",
      });

      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(new Request("http://localhost/api/prd"));

      expect(res.status).toBe(200);

      const prd = await res.json();
      expect(prd.name).toBe("My Project");
      expect(prd.description).toBe("Test description");
      expect(Array.isArray(prd.tasks)).toBe(true);
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(new Request("http://localhost/api/prd"));

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ==========================================================================
  // PUT /api/prd
  // ==========================================================================

  describe("PUT /api/prd", () => {
    test("creates a new PRD when none exists", async () => {
      const newPRD = createTestPRD({
        name: "New Project",
        description: "Created via API",
      });

      const res = await app.fetch(
        new Request("http://localhost/api/prd", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newPRD),
        })
      );

      expect(res.status).toBe(201);

      const prd = await res.json();
      expect(prd.name).toBe("New Project");
      expect(prd.description).toBe("Created via API");
    });

    test("updates existing PRD with partial data", async () => {
      // Create initial PRD
      const testPRD = createTestPRD({ name: "Original Name" });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      // Update with partial data
      const res = await app.fetch(
        new Request("http://localhost/api/prd", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated Name" }),
        })
      );

      expect(res.status).toBe(200);

      const prd = await res.json();
      expect(prd.name).toBe("Updated Name");
      expect(prd.description).toBe(testPRD.description); // Unchanged
    });

    test("returns 400 for invalid JSON", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/prd", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: "not valid json",
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("INVALID_JSON");
    });

    test("returns 400 for empty update on existing PRD", async () => {
      // Create initial PRD
      const testPRD = createTestPRD();
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("EMPTY_UPDATE");
    });

    test("returns 400 for missing required fields on new PRD", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/prd", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Only Name" }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/prd", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createTestPRD()),
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ==========================================================================
  // GET /api/prd/tasks
  // ==========================================================================

  describe("GET /api/prd/tasks", () => {
    test("returns 404 when no PRD exists", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks")
      );

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("PRD_NOT_FOUND");
    });

    test("returns empty array when PRD has no tasks", async () => {
      // Create PRD with no tasks
      const testPRD = createTestPRD({ tasks: [] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks")
      );

      expect(res.status).toBe(200);

      const tasks = await res.json();
      expect(tasks).toEqual([]);
    });

    test("returns all tasks from PRD", async () => {
      // Create PRD with tasks
      const task1 = createTestTask({ id: "001-task-one", title: "Task One" });
      const task2 = createTestTask({ id: "002-task-two", title: "Task Two" });
      const testPRD = createTestPRD({ tasks: [task1, task2] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks")
      );

      expect(res.status).toBe(200);

      const tasks = await res.json();
      expect(tasks).toHaveLength(2);
      expect(tasks[0].title).toBe("Task One");
      expect(tasks[1].title).toBe("Task Two");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks")
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ==========================================================================
  // GET /api/prd/tasks/:id
  // ==========================================================================

  describe("GET /api/prd/tasks/:id", () => {
    test("returns 404 when task does not exist", async () => {
      // Create PRD with no tasks
      const testPRD = createTestPRD({ tasks: [] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/nonexistent")
      );

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("TASK_NOT_FOUND");
    });

    test("returns task when it exists", async () => {
      // Create PRD with a task
      const task = createTestTask({
        id: "001-my-task",
        title: "My Task",
        description: "Task description",
      });
      const testPRD = createTestPRD({ tasks: [task] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/001-my-task")
      );

      expect(res.status).toBe(200);

      const returnedTask = await res.json();
      expect(returnedTask.id).toBe("001-my-task");
      expect(returnedTask.title).toBe("My Task");
      expect(returnedTask.description).toBe("Task description");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/some-id")
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ==========================================================================
  // POST /api/prd/tasks
  // ==========================================================================

  describe("POST /api/prd/tasks", () => {
    test("returns 404 when no PRD exists", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "New Task",
            description: "Description",
            priority: 1,
            acceptanceCriteria: ["Criterion"],
          }),
        })
      );

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("PRD_NOT_FOUND");
    });

    test("creates a new task", async () => {
      // Create PRD first
      const testPRD = createTestPRD({ tasks: [] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "New Task",
            description: "Task description",
            priority: 1,
            acceptanceCriteria: ["Criterion 1", "Criterion 2"],
          }),
        })
      );

      expect(res.status).toBe(201);

      const task = await res.json();
      expect(task.title).toBe("New Task");
      expect(task.description).toBe("Task description");
      expect(task.priority).toBe(1);
      expect(task.acceptanceCriteria).toEqual(["Criterion 1", "Criterion 2"]);
      expect(task.status).toBe(TaskStatus.Pending);
      expect(task.id).toBeDefined();
    });

    test("auto-generates task ID", async () => {
      // Create PRD first
      const testPRD = createTestPRD({ tasks: [] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "My New Feature",
            description: "Description",
            priority: 1,
            acceptanceCriteria: [],
          }),
        })
      );

      expect(res.status).toBe(201);

      const task = await res.json();
      expect(task.id).toMatch(/^001-/); // Starts with task number
      expect(task.id).toContain("my-new-feature"); // Contains slugified title
    });

    test("returns 400 for invalid JSON", async () => {
      // Create PRD first
      const testPRD = createTestPRD({ tasks: [] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not valid json",
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("INVALID_JSON");
    });

    test("returns 400 for missing required fields", async () => {
      // Create PRD first
      const testPRD = createTestPRD({ tasks: [] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Only Title" }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    test("returns 400 for empty title", async () => {
      // Create PRD first
      const testPRD = createTestPRD({ tasks: [] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "",
            description: "Desc",
            priority: 1,
            acceptanceCriteria: [],
          }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
      expect(data.message).toContain("title");
    });

    test("returns 400 for invalid priority", async () => {
      // Create PRD first
      const testPRD = createTestPRD({ tasks: [] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Task",
            description: "Desc",
            priority: -1,
            acceptanceCriteria: [],
          }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Task",
            description: "Desc",
            priority: 1,
            acceptanceCriteria: [],
          }),
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ==========================================================================
  // PUT /api/prd/tasks/:id
  // ==========================================================================

  describe("PUT /api/prd/tasks/:id", () => {
    test("returns 404 when task does not exist", async () => {
      // Create PRD with no tasks
      const testPRD = createTestPRD({ tasks: [] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/nonexistent", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        })
      );

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("TASK_NOT_FOUND");
    });

    test("updates task title", async () => {
      // Create PRD with a task
      const task = createTestTask({ id: "001-task", title: "Original" });
      const testPRD = createTestPRD({ tasks: [task] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/001-task", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated Title" }),
        })
      );

      expect(res.status).toBe(200);

      const updatedTask = await res.json();
      expect(updatedTask.title).toBe("Updated Title");
      expect(updatedTask.id).toBe("001-task"); // ID unchanged
    });

    test("updates task status", async () => {
      // Create PRD with a task
      const task = createTestTask({
        id: "001-task",
        status: TaskStatus.Pending,
      });
      const testPRD = createTestPRD({ tasks: [task] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/001-task", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: TaskStatus.InProgress }),
        })
      );

      expect(res.status).toBe(200);

      const updatedTask = await res.json();
      expect(updatedTask.status).toBe(TaskStatus.InProgress);
    });

    test("updates multiple fields", async () => {
      // Create PRD with a task
      const task = createTestTask({ id: "001-task" });
      const testPRD = createTestPRD({ tasks: [task] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/001-task", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "New Title",
            description: "New Description",
            priority: 5,
          }),
        })
      );

      expect(res.status).toBe(200);

      const updatedTask = await res.json();
      expect(updatedTask.title).toBe("New Title");
      expect(updatedTask.description).toBe("New Description");
      expect(updatedTask.priority).toBe(5);
    });

    test("returns 400 for empty update", async () => {
      // Create PRD with a task
      const task = createTestTask({ id: "001-task" });
      const testPRD = createTestPRD({ tasks: [task] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/001-task", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("EMPTY_UPDATE");
    });

    test("returns 400 for invalid JSON", async () => {
      // Create PRD with a task
      const task = createTestTask({ id: "001-task" });
      const testPRD = createTestPRD({ tasks: [task] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/001-task", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: "not valid json",
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("INVALID_JSON");
    });

    test("returns 400 for invalid status", async () => {
      // Create PRD with a task
      const task = createTestTask({ id: "001-task" });
      const testPRD = createTestPRD({ tasks: [task] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/001-task", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "invalid_status" }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/some-id", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ==========================================================================
  // DELETE /api/prd/tasks/:id
  // ==========================================================================

  describe("DELETE /api/prd/tasks/:id", () => {
    test("returns 404 when PRD does not exist", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/some-id", {
          method: "DELETE",
        })
      );

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("PRD_NOT_FOUND");
    });

    test("returns 404 when task does not exist", async () => {
      // Create PRD with no tasks
      const testPRD = createTestPRD({ tasks: [] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/nonexistent", {
          method: "DELETE",
        })
      );

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("TASK_NOT_FOUND");
    });

    test("deletes task and returns 204", async () => {
      // Create PRD with a task
      const task = createTestTask({ id: "001-task", title: "To Delete" });
      const testPRD = createTestPRD({ tasks: [task] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/001-task", {
          method: "DELETE",
        })
      );

      expect(res.status).toBe(204);

      // Verify task is gone
      const getRes = await app.fetch(
        new Request("http://localhost/api/prd/tasks/001-task")
      );
      expect(getRes.status).toBe(404);
    });

    test("deletes correct task from multiple tasks", async () => {
      // Create PRD with multiple tasks
      const task1 = createTestTask({ id: "001-task-one", title: "Task One" });
      const task2 = createTestTask({ id: "002-task-two", title: "Task Two" });
      const task3 = createTestTask({
        id: "003-task-three",
        title: "Task Three",
      });
      const testPRD = createTestPRD({ tasks: [task1, task2, task3] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      // Delete middle task
      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/002-task-two", {
          method: "DELETE",
        })
      );

      expect(res.status).toBe(204);

      // Verify remaining tasks
      const tasksRes = await app.fetch(
        new Request("http://localhost/api/prd/tasks")
      );
      const tasks = await tasksRes.json();

      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe("001-task-one");
      expect(tasks[1].id).toBe("003-task-three");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/some-id", {
          method: "DELETE",
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ==========================================================================
  // Integration / Persistence Tests
  // ==========================================================================

  describe("Integration", () => {
    test("created task persists across requests", async () => {
      // Create PRD
      const testPRD = createTestPRD({ tasks: [] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      // Create task
      await app.fetch(
        new Request("http://localhost/api/prd/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Persistent Task",
            description: "Should persist",
            priority: 1,
            acceptanceCriteria: [],
          }),
        })
      );

      // Get all tasks
      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks")
      );
      const tasks = await res.json();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe("Persistent Task");
    });

    test("updated task persists across requests", async () => {
      // Create PRD with task
      const task = createTestTask({ id: "001-task", title: "Original" });
      const testPRD = createTestPRD({ tasks: [task] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      // Update task
      await app.fetch(
        new Request("http://localhost/api/prd/tasks/001-task", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        })
      );

      // Get task again
      const res = await app.fetch(
        new Request("http://localhost/api/prd/tasks/001-task")
      );
      const retrievedTask = await res.json();

      expect(retrievedTask.title).toBe("Updated");
    });

    test("PRD updatedAt is updated when tasks are modified", async () => {
      // Create PRD with task
      const task = createTestTask({ id: "001-task" });
      const testPRD = createTestPRD({ tasks: [task] });
      const orchestrator = getOrchestrator();
      await orchestrator?.savePRD(testPRD);

      // Get original PRD
      const originalRes = await app.fetch(
        new Request("http://localhost/api/prd")
      );
      const originalPRD = await originalRes.json();

      // Wait a tiny bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Delete task
      await app.fetch(
        new Request("http://localhost/api/prd/tasks/001-task", {
          method: "DELETE",
        })
      );

      // Get updated PRD
      const updatedRes = await app.fetch(
        new Request("http://localhost/api/prd")
      );
      const updatedPRD = await updatedRes.json();

      // updatedAt should be different
      expect(updatedPRD.updatedAt).toBeDefined();
      expect(updatedPRD.updatedAt).not.toBe(originalPRD.createdAt);
    });
  });
});
