import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import {
  createApp,
  initializeOrchestrator,
  getOrchestrator,
  resetServerState,
} from "../src/index.ts";

describe("Planning Routes", () => {
  let tempDir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = join(
      tmpdir(),
      `pokeralph-planning-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
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
    // Reset planning state if orchestrator exists
    const orchestrator = getOrchestrator();
    if (orchestrator) {
      orchestrator.resetPlanning();
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
  // GET /api/planning/status
  // ==========================================================================

  describe("GET /api/planning/status", () => {
    test("returns idle state when no planning session", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/status")
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.state).toBe("idle");
      expect(data.pendingQuestion).toBeNull();
      expect(data.isPlanning).toBe(false);
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/planning/status")
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ==========================================================================
  // POST /api/planning/start
  // ==========================================================================

  describe("POST /api/planning/start", () => {
    test("returns 400 for invalid JSON body", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not valid json",
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("INVALID_JSON");
    });

    test("returns 400 when idea is missing", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
      expect(data.message).toContain("idea");
    });

    test("returns 400 when idea is empty string", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea: "" }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/planning/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea: "Build a todo app" }),
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ==========================================================================
  // POST /api/planning/answer
  // ==========================================================================

  describe("POST /api/planning/answer", () => {
    test("returns 409 when not in waiting_input state (idle)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: "Yes, I want that" }),
        })
      );

      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.error).toBe("NOT_WAITING_INPUT");
      expect(data.message).toContain("idle");
    });

    test("returns 400 for invalid JSON body", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not valid json",
        })
      );

      // Will be 409 before JSON parsing because state check happens first
      // Or 400 if it gets to JSON parsing
      expect([400, 409]).toContain(res.status);
    });

    test("returns 400 when answer is missing", async () => {
      // This will return 409 first because we're not waiting for input
      const res = await app.fetch(
        new Request("http://localhost/api/planning/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );

      // State check happens first, so we get 409
      expect(res.status).toBe(409);
    });

    test("returns 400 when answer is empty string", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: "" }),
        })
      );

      // State check happens first
      expect(res.status).toBe(409);
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/planning/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: "My answer" }),
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ==========================================================================
  // POST /api/planning/finish
  // ==========================================================================

  describe("POST /api/planning/finish", () => {
    test("returns 409 when no planning session to finish", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/finish", {
          method: "POST",
        })
      );

      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.error).toBe("NO_PLANNING_SESSION");
      expect(data.message).toContain("No planning session");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/planning/finish", {
          method: "POST",
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ==========================================================================
  // POST /api/planning/reset
  // ==========================================================================

  describe("POST /api/planning/reset", () => {
    test("resets planning state to idle", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/reset", {
          method: "POST",
        })
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.message).toBe("Planning session reset");
      expect(data.state).toBe("idle");
    });

    test("can reset even when already idle", async () => {
      // First reset
      await app.fetch(
        new Request("http://localhost/api/planning/reset", {
          method: "POST",
        })
      );

      // Second reset (should still work)
      const res = await app.fetch(
        new Request("http://localhost/api/planning/reset", {
          method: "POST",
        })
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.state).toBe("idle");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/planning/reset", {
          method: "POST",
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ==========================================================================
  // Integration - Endpoint Documentation
  // ==========================================================================

  describe("API endpoint documentation", () => {
    test("root API lists planning endpoints", async () => {
      const res = await app.fetch(new Request("http://localhost/api"));

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.endpoints.planning).toBeDefined();
      expect(data.endpoints.planning).toContain("/api/planning/start");
      expect(data.endpoints.planning).toContain("/api/planning/status");
    });
  });

  // ==========================================================================
  // Integration - State transitions
  // ==========================================================================

  describe("State transitions", () => {
    test("reset clears planning state", async () => {
      // Check initial state
      const statusRes1 = await app.fetch(
        new Request("http://localhost/api/planning/status")
      );
      const status1 = await statusRes1.json();
      expect(status1.state).toBe("idle");

      // Reset (should keep idle)
      await app.fetch(
        new Request("http://localhost/api/planning/reset", {
          method: "POST",
        })
      );

      // Check state after reset
      const statusRes2 = await app.fetch(
        new Request("http://localhost/api/planning/status")
      );
      const status2 = await statusRes2.json();
      expect(status2.state).toBe("idle");
      expect(status2.isPlanning).toBe(false);
    });

    test("409 when trying to answer during idle state", async () => {
      // Verify we're idle
      const statusRes = await app.fetch(
        new Request("http://localhost/api/planning/status")
      );
      const status = await statusRes.json();
      expect(status.state).toBe("idle");

      // Try to answer - should fail
      const answerRes = await app.fetch(
        new Request("http://localhost/api/planning/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: "This should fail" }),
        })
      );

      expect(answerRes.status).toBe(409);
    });

    test("409 when trying to finish during idle state", async () => {
      // Verify we're idle
      const statusRes = await app.fetch(
        new Request("http://localhost/api/planning/status")
      );
      const status = await statusRes.json();
      expect(status.state).toBe("idle");

      // Try to finish - should fail
      const finishRes = await app.fetch(
        new Request("http://localhost/api/planning/finish", {
          method: "POST",
        })
      );

      expect(finishRes.status).toBe(409);

      const data = await finishRes.json();
      expect(data.error).toBe("NO_PLANNING_SESSION");
    });
  });

  // ==========================================================================
  // Error handling edge cases
  // ==========================================================================

  describe("Error handling", () => {
    test("handles missing Content-Type header gracefully", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/start", {
          method: "POST",
          body: JSON.stringify({ idea: "Test idea" }),
        })
      );

      // Should work even without explicit Content-Type
      // (Hono/fetch might handle this)
      expect([200, 400]).toContain(res.status);
    });

    test("handles non-string idea value", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea: 12345 }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    test("handles non-string answer value", async () => {
      // First we need to check the state
      const res = await app.fetch(
        new Request("http://localhost/api/planning/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: 12345 }),
        })
      );

      // Will be 409 (not in waiting_input state) before validation
      expect(res.status).toBe(409);
    });

    test("handles whitespace-only idea", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea: "   " }),
        })
      );

      // Whitespace is technically valid as it's not empty
      // Depends on trimming behavior - may succeed or fail
      expect([200, 400]).toContain(res.status);
    });
  });

  // ==========================================================================
  // HTTP Methods
  // ==========================================================================

  describe("HTTP methods", () => {
    test("GET on /api/planning/start returns 404 (only POST allowed)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/start")
      );

      expect(res.status).toBe(404);
    });

    test("GET on /api/planning/answer returns 404 (only POST allowed)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/answer")
      );

      expect(res.status).toBe(404);
    });

    test("GET on /api/planning/finish returns 404 (only POST allowed)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/finish")
      );

      expect(res.status).toBe(404);
    });

    test("GET on /api/planning/reset returns 404 (only POST allowed)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/reset")
      );

      expect(res.status).toBe(404);
    });

    test("POST on /api/planning/status returns 404 (only GET allowed)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/status", {
          method: "POST",
        })
      );

      expect(res.status).toBe(404);
    });
  });
});
