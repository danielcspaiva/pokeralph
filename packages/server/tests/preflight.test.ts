/**
 * Tests for Preflight routes
 *
 * Tests pre-battle validation API endpoints per spec 10-preflight.md
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createApp, initializeOrchestrator, getOrchestrator, resetServerState } from "../src/index.ts";
import { generatePreflightToken, TaskStatus } from "@pokeralph/core";

// Test directory setup
const testDir = join(process.cwd(), "test-preflight-routes-temp");

async function setupTestDir(): Promise<string> {
  await mkdir(testDir, { recursive: true });
  // Initialize git repo
  const proc = Bun.spawn(["git", "init"], { cwd: testDir });
  await proc.exited;
  const configEmail = Bun.spawn(["git", "config", "user.email", "test@test.com"], { cwd: testDir });
  await configEmail.exited;
  const configName = Bun.spawn(["git", "config", "user.name", "Test User"], { cwd: testDir });
  await configName.exited;
  return testDir;
}

async function cleanupTestDir(): Promise<void> {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe("Preflight routes", () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    await setupTestDir();
  });

  afterAll(async () => {
    await cleanupTestDir();
  });

  beforeEach(async () => {
    // Reset server state and initialize orchestrator
    resetServerState();
    initializeOrchestrator(testDir);

    // Initialize the .pokeralph folder
    const orchestrator = getOrchestrator();
    if (orchestrator) {
      await orchestrator.init();
    }

    // Create app with all routes and error handling
    app = createApp();
  });

  afterEach(async () => {
    const orchestrator = getOrchestrator();
    if (orchestrator) {
      await orchestrator.cleanup();
    }
    resetServerState();
  });

  describe("POST /api/preflight/run", () => {
    test("returns 400 for invalid request body", async () => {
      const res = await app.fetch(new Request("http://localhost/api/preflight/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("VALIDATION_ERROR");
    });

    test("returns 404 for non-existent task", async () => {
      const res = await app.fetch(new Request("http://localhost/api/preflight/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: "nonexistent-task" }),
      }));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("TASK_NOT_FOUND");
    });

    test("runs preflight checks and returns report", async () => {
      // Create a PRD with a task
      await getOrchestrator()!.savePRD({
        name: "Test PRD",
        description: "A test PRD",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tasks: [{
          id: "001-test-task",
          title: "Test Task",
          description: "A test task",
          status: TaskStatus.Pending,
          priority: 1,
          acceptanceCriteria: ["Test criterion"],
          iterations: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
      });

      const res = await app.fetch(new Request("http://localhost/api/preflight/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: "001-test-task" }),
      }));

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.report).toBeDefined();
      expect(body.report.taskId).toBe("001-test-task");
      expect(body.report.timestamp).toBeDefined();
      expect(body.report.duration).toBeGreaterThanOrEqual(0);
      expect(body.report.results).toBeInstanceOf(Array);
      expect(body.report.summary).toBeDefined();
      expect(typeof body.report.canStart).toBe("boolean");
    });

    test("returns DTO without function references", async () => {
      await getOrchestrator()!.savePRD({
        name: "Test PRD",
        description: "A test PRD",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tasks: [{
          id: "001-test-task",
          title: "Test Task",
          description: "A test task",
          status: TaskStatus.Pending,
          priority: 1,
          acceptanceCriteria: ["Test criterion"],
          iterations: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
      });

      const res = await app.fetch(new Request("http://localhost/api/preflight/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: "001-test-task" }),
      }));

      const body = await res.json();

      // Verify no function references in response
      for (const result of body.report.results) {
        expect(result.check.check).toBeUndefined();
        expect(result.check.fix).toBeUndefined();
        expect(typeof result.check.hasAutoFix).toBe("boolean");
      }
    });

    test("returns 503 when orchestrator not initialized", async () => {
      resetServerState();

      const res = await app.fetch(new Request("http://localhost/api/preflight/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: "001-test-task" }),
      }));

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe("SERVICE_UNAVAILABLE");

      // Re-initialize for subsequent tests
      initializeOrchestrator(testDir);
    });
  });

  describe("POST /api/preflight/fix", () => {
    test("returns 400 for invalid request body", async () => {
      const res = await app.fetch(new Request("http://localhost/api/preflight/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: "test" }), // Missing checkId
      }));

      expect(res.status).toBe(400);
    });

    test("returns 404 for non-existent task", async () => {
      const res = await app.fetch(new Request("http://localhost/api/preflight/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: "nonexistent", checkId: "repo_status" }),
      }));

      expect(res.status).toBe(404);
    });

    test("returns fix result and updated check", async () => {
      // Create a PRD with a task
      await getOrchestrator()!.savePRD({
        name: "Test PRD",
        description: "A test PRD",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tasks: [{
          id: "001-test-task",
          title: "Test Task",
          description: "A test task",
          status: TaskStatus.Pending,
          priority: 1,
          acceptanceCriteria: ["Test criterion"],
          iterations: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
      });

      // Try to fix a check that doesn't have a fix
      const res = await app.fetch(new Request("http://localhost/api/preflight/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: "001-test-task", checkId: "memory" }),
      }));

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.result).toBeDefined();
      expect(body.result.success).toBe(false); // memory check has no fix
      expect(body.updatedCheck).toBeDefined();
    });
  });

  describe("POST /api/preflight/restore-stash", () => {
    test("returns 400 for invalid request body", async () => {
      const res = await app.fetch(new Request("http://localhost/api/preflight/restore-stash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }));

      expect(res.status).toBe(400);
    });

    test("returns error for invalid stash ref", async () => {
      const res = await app.fetch(new Request("http://localhost/api/preflight/restore-stash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stashRef: "stash@{999}" }),
      }));

      expect(res.status).toBe(200); // Returns 200 with failure result
      const body = await res.json();
      expect(body.result.success).toBe(false);
    });
  });

  describe("POST /api/preflight/dry-run", () => {
    test("returns 400 for invalid request body", async () => {
      const res = await app.fetch(new Request("http://localhost/api/preflight/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }));

      expect(res.status).toBe(400);
    });

    test("returns 404 for non-existent task", async () => {
      const res = await app.fetch(new Request("http://localhost/api/preflight/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: "nonexistent" }),
      }));

      expect(res.status).toBe(404);
    });

    test("returns dry run result", async () => {
      // Create a PRD with a task
      await getOrchestrator()!.savePRD({
        name: "Test PRD",
        description: "A test PRD",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tasks: [{
          id: "001-test-task",
          title: "Test Task",
          description: "A test task that modifies auth.ts file",
          status: TaskStatus.Pending,
          priority: 1,
          acceptanceCriteria: ["Test criterion", "Another criterion"],
          iterations: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
      });

      const res = await app.fetch(new Request("http://localhost/api/preflight/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: "001-test-task" }),
      }));

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.result).toBeDefined();
      expect(body.result.taskId).toBe("001-test-task");
      expect(body.result.timestamp).toBeDefined();
      expect(body.result.prompt).toBeDefined();
      expect(body.result.filesLikelyAffected).toBeDefined();
      expect(body.result.estimatedIterations).toBeDefined();
      expect(body.result.estimatedDuration).toBeDefined();
    });
  });

  describe("POST /api/preflight/validate-token", () => {
    test("returns 400 when token is missing", async () => {
      const res = await app.fetch(new Request("http://localhost/api/preflight/validate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }));

      expect(res.status).toBe(400);
    });

    test("validates valid token", async () => {
      const taskId = "001-test-task";
      const timestamp = new Date().toISOString();
      const token = generatePreflightToken(taskId, timestamp);

      const res = await app.fetch(new Request("http://localhost/api/preflight/validate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }));

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.valid).toBe(true);
      expect(body.taskId).toBe(taskId);
    });

    test("rejects invalid token", async () => {
      const res = await app.fetch(new Request("http://localhost/api/preflight/validate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "invalid-token" }),
      }));

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.valid).toBe(false);
      expect(body.expired).toBe(true);
    });

    test("rejects expired token", async () => {
      const taskId = "001-test-task";
      const oldTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 minutes ago
      const token = generatePreflightToken(taskId, oldTimestamp);

      const res = await app.fetch(new Request("http://localhost/api/preflight/validate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }));

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.valid).toBe(false);
      expect(body.expired).toBe(true);
    });
  });

  describe("GET /api/preflight/checks", () => {
    test("returns list of available checks", async () => {
      const res = await app.fetch(new Request("http://localhost/api/preflight/checks"));

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.checks).toBeInstanceOf(Array);
      expect(body.checks.length).toBeGreaterThan(0);

      // Verify check structure
      for (const check of body.checks) {
        expect(check.id).toBeDefined();
        expect(check.name).toBeDefined();
        expect(check.description).toBeDefined();
        expect(check.category).toBeDefined();
        expect(check.severity).toBeDefined();
        expect(typeof check.hasAutoFix).toBe("boolean");
        // No function references
        expect(check.check).toBeUndefined();
        expect(check.fix).toBeUndefined();
      }
    });

    test("returns checks from all categories", async () => {
      const res = await app.fetch(new Request("http://localhost/api/preflight/checks"));

      const body = await res.json();
      const categories = new Set(body.checks.map((c: { category: string }) => c.category));

      expect(categories.has("environment")).toBe(true);
      expect(categories.has("git")).toBe(true);
      expect(categories.has("config")).toBe(true);
      expect(categories.has("task")).toBe(true);
    });

    test("returns 503 when orchestrator not initialized", async () => {
      resetServerState();

      const res = await app.fetch(new Request("http://localhost/api/preflight/checks"));

      expect(res.status).toBe(503);

      // Re-initialize for subsequent tests
      initializeOrchestrator(testDir);
    });
  });
});
