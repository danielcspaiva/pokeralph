import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  createApp,
  initializeOrchestrator,
  getOrchestrator,
  resetServerState,
} from "../src/index.ts";

describe("Battle Routes", () => {
  let tempDir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = join(
      tmpdir(),
      `pokeralph-battle-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(tempDir, { recursive: true });

    // Initialize git repo in temp directory so battle operations work
    try {
      execSync("git init", { cwd: tempDir, stdio: "ignore" });
      execSync("git config user.email test@test.com", { cwd: tempDir, stdio: "ignore" });
      execSync("git config user.name Test", { cwd: tempDir, stdio: "ignore" });
    } catch {
      // Ignore git init errors - some tests don't need git
    }

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

  afterEach(async () => {
    // Cancel any running battle
    const orchestrator = getOrchestrator();
    if (orchestrator) {
      try {
        await orchestrator.cancelBattle("Test cleanup");
      } catch {
        // Ignore if no battle running
      }
    }

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
  // Helper: Create a PRD with a task for testing
  // ==========================================================================

  async function createTestTask() {
    const orchestrator = getOrchestrator();
    if (!orchestrator) throw new Error("Orchestrator not initialized");

    // Create PRD first
    await orchestrator.savePRD({
      name: "Test Project",
      description: "Test project for battle tests",
      createdAt: new Date().toISOString(),
      tasks: [],
    });

    // Add a task
    const task = await orchestrator.addTask({
      title: "Test Task",
      description: "A test task for battle testing",
      priority: 1,
      acceptanceCriteria: ["Test passes"],
    });

    return task;
  }

  // ==========================================================================
  // GET /api/battle/current
  // ==========================================================================

  describe("GET /api/battle/current", () => {
    test("returns no battle when none is running", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/battle/current")
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.battle).toBeNull();
      expect(data.isRunning).toBe(false);
      expect(data.isPaused).toBe(false);
      expect(data.isAwaitingApproval).toBe(false);
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/battle/current")
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ==========================================================================
  // POST /api/battle/start/:taskId
  // ==========================================================================

  describe("POST /api/battle/start/:taskId", () => {
    test("returns 404 when task doesn't exist", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/battle/start/nonexistent-task", {
          method: "POST",
        })
      );

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("TASK_NOT_FOUND");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/battle/start/some-task", {
          method: "POST",
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    // Note: Tests that actually start battles are skipped because they require
    // Claude CLI to be available. The startBattle method kicks off an async
    // battle loop that runs Claude, which isn't available in test environments.
    // Full battle lifecycle testing is done in e2e tests with Claude mock.
    //
    // Tests that would be here include:
    // - accepts optional mode parameter (hitl/yolo)
    // - uses config mode when mode not specified
    // - returns 409 when battle already in progress
  });

  // ==========================================================================
  // POST /api/battle/pause
  // ==========================================================================

  describe("POST /api/battle/pause", () => {
    test("returns 409 when no battle is running", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/battle/pause", {
          method: "POST",
        })
      );

      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.error).toBe("NO_BATTLE_RUNNING");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/battle/pause", {
          method: "POST",
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    // Note: Tests that pause running battles are in e2e tests with Claude mock
    // because they require an actual battle to be running.
  });

  // ==========================================================================
  // POST /api/battle/resume
  // ==========================================================================

  describe("POST /api/battle/resume", () => {
    test("returns 409 when no battle is paused", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/battle/resume", {
          method: "POST",
        })
      );

      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.error).toBe("NO_BATTLE_PAUSED");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/battle/resume", {
          method: "POST",
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    // Note: Tests that resume paused battles are in e2e tests with Claude mock
    // because they require an actual battle to be paused.
  });

  // ==========================================================================
  // POST /api/battle/cancel
  // ==========================================================================

  describe("POST /api/battle/cancel", () => {
    test("returns 409 when no battle is in progress", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/battle/cancel", {
          method: "POST",
        })
      );

      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.error).toBe("NO_BATTLE_IN_PROGRESS");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/battle/cancel", {
          method: "POST",
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    // Note: Tests that cancel running/paused battles are in e2e tests with Claude mock
    // because they require an actual battle to be in progress.
  });

  // ==========================================================================
  // POST /api/battle/approve
  // ==========================================================================

  describe("POST /api/battle/approve", () => {
    test("returns 409 when not awaiting approval", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/battle/approve", {
          method: "POST",
        })
      );

      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.error).toBe("NOT_AWAITING_APPROVAL");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/battle/approve", {
          method: "POST",
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    // Note: Tests that approve battles awaiting approval are in e2e tests with Claude mock
    // because they require an actual battle to be in HITL mode and awaiting approval.
  });

  // ==========================================================================
  // GET /api/battle/:taskId/progress
  // ==========================================================================

  describe("GET /api/battle/:taskId/progress", () => {
    test("returns 404 when task doesn't exist", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/battle/nonexistent-task/progress")
      );

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("TASK_NOT_FOUND");
    });

    test("returns null progress when no battle started", async () => {
      const task = await createTestTask();

      const res = await app.fetch(
        new Request(`http://localhost/api/battle/${task.id}/progress`)
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.taskId).toBe(task.id);
      expect(data.progress).toBeNull();
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/battle/some-task/progress")
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ==========================================================================
  // GET /api/battle/:taskId/history
  // ==========================================================================

  describe("GET /api/battle/:taskId/history", () => {
    test("returns 404 when task doesn't exist", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/battle/nonexistent-task/history")
      );

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("TASK_NOT_FOUND");
    });

    test("returns null history when no battle started", async () => {
      const task = await createTestTask();

      const res = await app.fetch(
        new Request(`http://localhost/api/battle/${task.id}/history`)
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.taskId).toBe(task.id);
      expect(data.history).toBeNull();
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/battle/some-task/history")
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ==========================================================================
  // Integration - API Documentation
  // ==========================================================================

  describe("API endpoint documentation", () => {
    test("root API lists battle endpoints", async () => {
      const res = await app.fetch(new Request("http://localhost/api"));

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.endpoints.battle).toBeDefined();
      expect(data.endpoints.battle).toContain("/api/battle/start/:taskId");
      expect(data.endpoints.battle).toContain("/api/battle/current");
    });
  });

  // ==========================================================================
  // HTTP Methods
  // ==========================================================================

  describe("HTTP methods", () => {
    test("GET on /api/battle/start/:taskId returns 404 (only POST allowed)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/battle/start/some-task")
      );

      expect(res.status).toBe(404);
    });

    test("GET on /api/battle/pause returns 404 (only POST allowed)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/battle/pause")
      );

      expect(res.status).toBe(404);
    });

    test("GET on /api/battle/resume returns 404 (only POST allowed)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/battle/resume")
      );

      expect(res.status).toBe(404);
    });

    test("GET on /api/battle/cancel returns 404 (only POST allowed)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/battle/cancel")
      );

      expect(res.status).toBe(404);
    });

    test("GET on /api/battle/approve returns 404 (only POST allowed)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/battle/approve")
      );

      expect(res.status).toBe(404);
    });

    test("POST on /api/battle/current returns 404 (only GET allowed)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/battle/current", {
          method: "POST",
        })
      );

      expect(res.status).toBe(404);
    });

    test("POST on /api/battle/:taskId/progress returns 404 (only GET allowed)", async () => {
      const task = await createTestTask();

      const res = await app.fetch(
        new Request(`http://localhost/api/battle/${task.id}/progress`, {
          method: "POST",
        })
      );

      expect(res.status).toBe(404);
    });

    test("POST on /api/battle/:taskId/history returns 404 (only GET allowed)", async () => {
      const task = await createTestTask();

      const res = await app.fetch(
        new Request(`http://localhost/api/battle/${task.id}/history`, {
          method: "POST",
        })
      );

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // Battle Flow Integration
  // ==========================================================================

  // Note: Full battle lifecycle integration tests (start -> pause -> resume -> cancel)
  // are in e2e tests with Claude mock because they require the battle loop to actually
  // run. These API tests focus on request/response validation and error handling.
});
