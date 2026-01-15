import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import app, {
  createApp,
  initializeOrchestrator,
  getOrchestrator,
  getServerState,
  resetServerState,
  startServer,
} from "../src/index.ts";

describe("@pokeralph/server", () => {
  describe("health endpoint", () => {
    test("GET /health returns ok status", async () => {
      const res = await app.fetch(new Request("http://localhost/health"));
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.version).toBe("0.1.0");
      expect(data.timestamp).toBeDefined();
      expect(typeof data.orchestratorInitialized).toBe("boolean");
    });
  });

  describe("API routes", () => {
    test("GET /api returns API info with endpoints list", async () => {
      const res = await app.fetch(new Request("http://localhost/api"));
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.name).toBe("PokéRalph API");
      expect(data.version).toBe("0.1.0");
      expect(data.endpoints).toBeDefined();
      expect(data.endpoints.health).toBe("GET /health");
    });

    test("GET /api/config returns 503 when orchestrator not initialized", async () => {
      const res = await app.fetch(new Request("http://localhost/api/config"));
      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
      expect(data.message).toContain("Orchestrator not initialized");
    });

    test("PUT /api/config returns 503 when orchestrator not initialized", async () => {
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

    test("GET /api/prd returns 501 (not yet implemented)", async () => {
      const res = await app.fetch(new Request("http://localhost/api/prd"));
      expect(res.status).toBe(501);
    });

    test("GET /api/tasks returns 501 (not yet implemented)", async () => {
      const res = await app.fetch(new Request("http://localhost/api/tasks"));
      expect(res.status).toBe(501);
    });

    test("GET /api/tasks/:id returns 501 (not yet implemented)", async () => {
      const res = await app.fetch(new Request("http://localhost/api/tasks/task-001"));
      expect(res.status).toBe(501);
    });

    test("POST /api/planning/start returns 501 (not yet implemented)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/planning/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea: "test" }),
        })
      );
      expect(res.status).toBe(501);
    });

    test("POST /api/battle/start/:taskId returns 501 (not yet implemented)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/battle/start/task-001", {
          method: "POST",
        })
      );
      expect(res.status).toBe(501);
    });
  });

  describe("CORS", () => {
    test("OPTIONS request returns CORS headers", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api", {
          method: "OPTIONS",
          headers: {
            Origin: "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
          },
        })
      );

      // CORS preflight should succeed
      expect(res.status).toBeLessThan(400);
    });

    test("Response includes Access-Control-Allow-Origin header", async () => {
      const res = await app.fetch(
        new Request("http://localhost/health", {
          headers: { Origin: "http://localhost:5173" },
        })
      );

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    });
  });

  describe("Error handling", () => {
    test("GET unknown route returns 404 with JSON error", async () => {
      const res = await app.fetch(new Request("http://localhost/nonexistent"));
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("NOT_FOUND");
      expect(data.message).toContain("Route not found");
      expect(data.status).toBe(404);
      expect(data.timestamp).toBeDefined();
    });
  });

  describe("createApp", () => {
    test("creates a Hono app instance", () => {
      const testApp = createApp();
      expect(testApp).toBeDefined();
      expect(testApp.fetch).toBeDefined();
    });

    test("multiple createApp calls create independent apps", () => {
      const app1 = createApp();
      const app2 = createApp();
      expect(app1).not.toBe(app2);
    });
  });

  describe("Orchestrator integration", () => {
    let tempDir: string;

    beforeEach(() => {
      // Create unique temp directory for each test
      tempDir = join(tmpdir(), `pokeralph-server-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(tempDir, { recursive: true });

      // Reset server state
      resetServerState();
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

    test("initializeOrchestrator creates Orchestrator instance", () => {
      const orchestrator = initializeOrchestrator(tempDir);
      expect(orchestrator).toBeDefined();
      expect(getOrchestrator()).toBe(orchestrator);
    });

    test("getOrchestrator returns null before initialization", () => {
      expect(getOrchestrator()).toBeNull();
    });

    test("getServerState returns current state", () => {
      const state = getServerState();
      expect(state.orchestrator).toBeNull();
      expect(state.server).toBeNull();
      expect(state.isShuttingDown).toBe(false);
    });

    test("resetServerState clears state", () => {
      initializeOrchestrator(tempDir);
      expect(getOrchestrator()).not.toBeNull();

      resetServerState();
      expect(getOrchestrator()).toBeNull();
    });
  });

  describe("startServer", () => {
    let tempDir: string;
    let server: ReturnType<typeof Bun.serve> | null = null;

    beforeEach(() => {
      tempDir = join(tmpdir(), `pokeralph-server-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(tempDir, { recursive: true });
      resetServerState();
    });

    afterEach(() => {
      // Stop server if running
      if (server) {
        server.stop();
        server = null;
      }

      // Clean up
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }

      resetServerState();
    });

    test("starts server on specified port", async () => {
      const testPort = 3457 + Math.floor(Math.random() * 100);
      server = startServer({ port: testPort, workingDir: tempDir });

      expect(server).toBeDefined();
      expect(server.port).toBe(testPort);

      // Verify server is responding
      const res = await fetch(`http://localhost:${testPort}/health`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.orchestratorInitialized).toBe(true);
    });

    test("initializes orchestrator when starting server", async () => {
      const testPort = 3457 + Math.floor(Math.random() * 100);
      server = startServer({ port: testPort, workingDir: tempDir });

      const orchestrator = getOrchestrator();
      expect(orchestrator).not.toBeNull();
    });

    test("updates server state when started", () => {
      const testPort = 3457 + Math.floor(Math.random() * 100);
      server = startServer({ port: testPort, workingDir: tempDir });

      const state = getServerState();
      expect(state.server).not.toBeNull();
      expect(state.orchestrator).not.toBeNull();
      expect(state.isShuttingDown).toBe(false);
    });
  });
});

describe("routes/index", () => {
  test("createRoutes returns Hono instance", async () => {
    const { createRoutes } = await import("../src/routes/index.ts");
    const routes = createRoutes();
    expect(routes).toBeDefined();
    expect(routes.fetch).toBeDefined();
  });
});

describe("middleware/error-handler", () => {
  test("AppError has status and code", async () => {
    const { AppError } = await import("../src/middleware/error-handler.ts");
    const error = new AppError("Test error", 400, "TEST_ERROR");

    expect(error.message).toBe("Test error");
    expect(error.status).toBe(400);
    expect(error.code).toBe("TEST_ERROR");
    expect(error.name).toBe("AppError");
  });

  test("AppError uses defaults for status and code", async () => {
    const { AppError } = await import("../src/middleware/error-handler.ts");
    const error = new AppError("Test error");

    expect(error.status).toBe(500);
    expect(error.code).toBe("INTERNAL_ERROR");
  });
});
