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

describe("Onboarding Routes", () => {
  let tempDir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = join(
      tmpdir(),
      `pokeralph-onboarding-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(tempDir, { recursive: true });

    // Reset server state and initialize orchestrator
    resetServerState();
    initializeOrchestrator(tempDir);

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

  // ============================================================================
  // POST /api/onboarding/detect
  // ============================================================================

  describe("POST /api/onboarding/detect", () => {
    test("detects Bun project with bun.lock", async () => {
      // Create package.json and bun.lock
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" })
      );
      await Bun.write(join(tempDir, "bun.lock"), "text lockfile");

      const res = await app.fetch(
        new Request("http://localhost/api/onboarding/detect", {
          method: "POST",
        })
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.detection).toBeDefined();
      expect(data.detection.type).toBe("bun");
      expect(data.detection.packageManager).toBe("bun");
      expect(data.suggestedConfig).toBeDefined();
      expect(data.suggestedConfig.feedbackLoops).toEqual([
        "test",
        "lint",
        "typecheck",
      ]);
    });

    test("detects Bun project with bun.lockb", async () => {
      // Create package.json and bun.lockb (binary)
      await Bun.write(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" })
      );
      await Bun.write(join(tempDir, "bun.lockb"), "binary lockfile");

      const res = await app.fetch(
        new Request("http://localhost/api/onboarding/detect", {
          method: "POST",
        })
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.detection.type).toBe("bun");
      expect(data.detection.packageManager).toBe("bun");
    });

    test("detects Python project", async () => {
      await Bun.write(
        join(tempDir, "pyproject.toml"),
        '[project]\nname = "test"'
      );

      const res = await app.fetch(
        new Request("http://localhost/api/onboarding/detect", {
          method: "POST",
        })
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.detection.type).toBe("python");
      expect(data.suggestedConfig.feedbackLoops).toEqual([
        "pytest",
        "ruff",
        "mypy",
      ]);
    });

    test("detects Go project", async () => {
      await Bun.write(join(tempDir, "go.mod"), "module example.com/test");

      const res = await app.fetch(
        new Request("http://localhost/api/onboarding/detect", {
          method: "POST",
        })
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.detection.type).toBe("go");
      expect(data.suggestedConfig.feedbackLoops).toEqual([
        "go test",
        "golangci-lint",
      ]);
    });

    test("detects Rust project", async () => {
      await Bun.write(
        join(tempDir, "Cargo.toml"),
        '[package]\nname = "test"'
      );

      const res = await app.fetch(
        new Request("http://localhost/api/onboarding/detect", {
          method: "POST",
        })
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.detection.type).toBe("rust");
      expect(data.suggestedConfig.feedbackLoops).toEqual([
        "cargo test",
        "cargo clippy",
      ]);
    });

    test("returns unknown type for empty directory", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/onboarding/detect", {
          method: "POST",
        })
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.detection.type).toBe("unknown");
      expect(data.suggestedConfig.feedbackLoops).toEqual([]);
      expect(data.suggestedConfig.autoCommit).toBe(false); // Conservative default
    });

    test("detects existing .pokeralph folder", async () => {
      mkdirSync(join(tempDir, ".pokeralph"), { recursive: true });

      const res = await app.fetch(
        new Request("http://localhost/api/onboarding/detect", {
          method: "POST",
        })
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.detection.existingPokeralph).toBe(true);
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/onboarding/detect", {
          method: "POST",
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ============================================================================
  // POST /api/onboarding/complete
  // ============================================================================

  describe("POST /api/onboarding/complete", () => {
    test("saves configuration and completes onboarding", async () => {
      const config = {
        ...DEFAULT_CONFIG,
        maxIterationsPerTask: 15,
      };

      const res = await app.fetch(
        new Request("http://localhost/api/onboarding/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config,
            skipFirstPRD: true,
          }),
        })
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.configPath).toContain(".pokeralph/config.json");

      // Verify config was saved
      const orchestrator = getOrchestrator();
      const savedConfig = await orchestrator!.getConfig();
      expect(savedConfig.maxIterationsPerTask).toBe(15);
    });

    test("returns 400 for invalid config", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/onboarding/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config: {
              maxIterationsPerTask: 200, // Invalid: max is 100
              mode: "hitl",
              feedbackLoops: [],
              timeoutMinutes: 30,
              pollingIntervalMs: 2000,
              autoCommit: true,
            },
            skipFirstPRD: true,
          }),
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    test("returns 400 for invalid JSON", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/onboarding/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not json",
        })
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("INVALID_JSON");
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/onboarding/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config: DEFAULT_CONFIG,
            skipFirstPRD: true,
          }),
        })
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // ============================================================================
  // GET /api/onboarding/status
  // ============================================================================

  describe("GET /api/onboarding/status", () => {
    test("returns not completed when no config exists", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/onboarding/status")
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.completed).toBe(false);
      expect(data.existingConfig).toBe(false);
      expect(data.existingPRD).toBe(false);
    });

    test("returns completed when config exists", async () => {
      // Initialize the .pokeralph folder with config
      const orchestrator = getOrchestrator();
      await orchestrator!.init();

      const res = await app.fetch(
        new Request("http://localhost/api/onboarding/status")
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.completed).toBe(true);
      expect(data.existingConfig).toBe(true);
    });

    test("returns 503 when orchestrator is not initialized", async () => {
      resetServerState();

      const res = await app.fetch(
        new Request("http://localhost/api/onboarding/status")
      );

      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });
});
