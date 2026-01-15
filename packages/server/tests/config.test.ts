import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { DEFAULT_CONFIG } from "@pokeralph/core";
import {
  createApp,
  initializeOrchestrator,
  getOrchestrator,
  resetServerState,
} from "../src/index.ts";

describe("Config Routes", () => {
  let tempDir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = join(
      tmpdir(),
      `pokeralph-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  describe("GET /api/config", () => {
    test("returns current configuration", async () => {
      const res = await app.fetch(new Request("http://localhost/api/config"));

      expect(res.status).toBe(200);

      const config = await res.json();
      expect(config.maxIterationsPerTask).toBe(DEFAULT_CONFIG.maxIterationsPerTask);
      expect(config.mode).toBe(DEFAULT_CONFIG.mode);
      expect(config.feedbackLoops).toEqual(DEFAULT_CONFIG.feedbackLoops);
      expect(config.timeoutMinutes).toBe(DEFAULT_CONFIG.timeoutMinutes);
      expect(config.pollingIntervalMs).toBe(DEFAULT_CONFIG.pollingIntervalMs);
      expect(config.autoCommit).toBe(DEFAULT_CONFIG.autoCommit);
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      // Reset state to remove orchestrator
      resetServerState();

      const res = await app.fetch(new Request("http://localhost/api/config"));

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
      expect(data.message).toContain("Orchestrator not initialized");
    });

    test("returns 404 when config file does not exist", async () => {
      // Reset and create orchestrator without initializing .pokeralph
      resetServerState();
      const newTempDir = join(
        tmpdir(),
        `pokeralph-noconfig-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      mkdirSync(newTempDir, { recursive: true });
      initializeOrchestrator(newTempDir);

      const res = await app.fetch(new Request("http://localhost/api/config"));

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("CONFIG_NOT_FOUND");

      // Clean up
      rmSync(newTempDir, { recursive: true, force: true });
    });
  });

  describe("PUT /api/config", () => {
    test("updates maxIterationsPerTask", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxIterationsPerTask: 20 }),
        })
      );

      expect(res.status).toBe(200);

      const config = await res.json();
      expect(config.maxIterationsPerTask).toBe(20);
      // Other fields unchanged
      expect(config.mode).toBe(DEFAULT_CONFIG.mode);
    });

    test("updates mode to yolo", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "yolo" }),
        })
      );

      expect(res.status).toBe(200);

      const config = await res.json();
      expect(config.mode).toBe("yolo");
    });

    test("updates feedbackLoops array", async () => {
      const newLoops = ["test", "typecheck"];
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedbackLoops: newLoops }),
        })
      );

      expect(res.status).toBe(200);

      const config = await res.json();
      expect(config.feedbackLoops).toEqual(newLoops);
    });

    test("updates timeoutMinutes", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeoutMinutes: 60 }),
        })
      );

      expect(res.status).toBe(200);

      const config = await res.json();
      expect(config.timeoutMinutes).toBe(60);
    });

    test("updates pollingIntervalMs", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pollingIntervalMs: 5000 }),
        })
      );

      expect(res.status).toBe(200);

      const config = await res.json();
      expect(config.pollingIntervalMs).toBe(5000);
    });

    test("updates autoCommit", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ autoCommit: false }),
        })
      );

      expect(res.status).toBe(200);

      const config = await res.json();
      expect(config.autoCommit).toBe(false);
    });

    test("updates multiple fields at once", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            maxIterationsPerTask: 15,
            mode: "yolo",
            autoCommit: false,
          }),
        })
      );

      expect(res.status).toBe(200);

      const config = await res.json();
      expect(config.maxIterationsPerTask).toBe(15);
      expect(config.mode).toBe("yolo");
      expect(config.autoCommit).toBe(false);
      // Unchanged fields
      expect(config.feedbackLoops).toEqual(DEFAULT_CONFIG.feedbackLoops);
    });

    test("returns 400 for invalid JSON", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: "not valid json",
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("INVALID_JSON");
    });

    test("returns 400 for empty update object", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("EMPTY_UPDATE");
    });

    test("returns 400 for invalid mode value", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "invalid" }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
      expect(data.message).toContain("mode");
    });

    test("returns 400 for negative maxIterationsPerTask", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxIterationsPerTask: -5 }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    test("returns 400 for non-integer maxIterationsPerTask", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxIterationsPerTask: 10.5 }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    test("returns 400 for negative timeoutMinutes", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeoutMinutes: -1 }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    test("returns 400 for non-boolean autoCommit", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ autoCommit: "yes" }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    test("returns 400 for non-array feedbackLoops", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedbackLoops: "test" }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      // Reset state to remove orchestrator
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxIterationsPerTask: 20 }),
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    test("ignores unknown fields in update", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            maxIterationsPerTask: 25,
            unknownField: "should be ignored",
          }),
        })
      );

      expect(res.status).toBe(200);

      const config = await res.json();
      expect(config.maxIterationsPerTask).toBe(25);
      expect(config.unknownField).toBeUndefined();
    });
  });

  describe("Config persistence", () => {
    test("updated config persists across requests", async () => {
      // Update config
      await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxIterationsPerTask: 42 }),
        })
      );

      // Get config again
      const res = await app.fetch(new Request("http://localhost/api/config"));

      expect(res.status).toBe(200);

      const config = await res.json();
      expect(config.maxIterationsPerTask).toBe(42);
    });

    test("partial updates preserve other fields", async () => {
      // First update
      await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxIterationsPerTask: 30 }),
        })
      );

      // Second update - different field
      await app.fetch(
        new Request("http://localhost/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "yolo" }),
        })
      );

      // Get final config
      const res = await app.fetch(new Request("http://localhost/api/config"));
      const config = await res.json();

      // Both updates should be preserved
      expect(config.maxIterationsPerTask).toBe(30);
      expect(config.mode).toBe("yolo");
    });
  });
});
