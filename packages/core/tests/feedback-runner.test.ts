import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
  FeedbackRunner,
  STANDARD_LOOPS,
  type FeedbackLoopResult,
} from "../src/services/feedback-runner.ts";

// Create a unique temp directory for each test
const getTempDir = () =>
  join(import.meta.dir, `.tmp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Helper to create a package.json with scripts
 */
function createPackageJson(tempDir: string, scripts: Record<string, string>): void {
  const pkgPath = join(tempDir, "package.json");
  const content = JSON.stringify(
    {
      name: "test-project",
      version: "1.0.0",
      scripts,
    },
    null,
    2
  );
  writeFileSync(pkgPath, content);
}

/**
 * Helper to create a FeedbackRunner instance
 */
function createRunner(
  tempDir: string,
  options: { timeoutMs?: number } = {}
): FeedbackRunner {
  return new FeedbackRunner({
    workingDir: tempDir,
    ...options,
  });
}

describe("FeedbackRunner", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = getTempDir();
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================================
  // Constructor
  // ============================================================================

  describe("constructor", () => {
    test("sets working directory", () => {
      const runner = new FeedbackRunner({ workingDir: tempDir });
      expect(runner.getWorkingDir()).toBe(tempDir);
    });

    test("sets default timeout to 5 minutes", () => {
      const runner = new FeedbackRunner({ workingDir: tempDir });
      expect(runner.getTimeoutMs()).toBe(300000);
    });

    test("accepts custom timeout", () => {
      const runner = new FeedbackRunner({
        workingDir: tempDir,
        timeoutMs: 60000,
      });
      expect(runner.getTimeoutMs()).toBe(60000);
    });
  });

  // ============================================================================
  // detectAvailableLoops
  // ============================================================================

  describe("detectAvailableLoops", () => {
    test("returns empty array when no package.json exists", async () => {
      const runner = createRunner(tempDir);
      const loops = await runner.detectAvailableLoops();
      expect(loops).toEqual([]);
    });

    test("returns empty array when package.json has no scripts", async () => {
      createPackageJson(tempDir, {});
      const runner = createRunner(tempDir);
      const loops = await runner.detectAvailableLoops();
      expect(loops).toEqual([]);
    });

    test("detects test script", async () => {
      createPackageJson(tempDir, {
        test: "bun test",
      });
      const runner = createRunner(tempDir);
      const loops = await runner.detectAvailableLoops();
      expect(loops).toContain("test");
    });

    test("detects lint script", async () => {
      createPackageJson(tempDir, {
        lint: "biome lint",
      });
      const runner = createRunner(tempDir);
      const loops = await runner.detectAvailableLoops();
      expect(loops).toContain("lint");
    });

    test("detects typecheck script", async () => {
      createPackageJson(tempDir, {
        typecheck: "tsc --noEmit",
      });
      const runner = createRunner(tempDir);
      const loops = await runner.detectAvailableLoops();
      expect(loops).toContain("typecheck");
    });

    test("detects format:check script", async () => {
      createPackageJson(tempDir, {
        "format:check": "biome format --check",
      });
      const runner = createRunner(tempDir);
      const loops = await runner.detectAvailableLoops();
      expect(loops).toContain("format:check");
    });

    test("detects multiple standard loops", async () => {
      createPackageJson(tempDir, {
        test: "bun test",
        lint: "biome lint",
        typecheck: "tsc --noEmit",
        "format:check": "biome format --check",
      });
      const runner = createRunner(tempDir);
      const loops = await runner.detectAvailableLoops();
      expect(loops).toContain("test");
      expect(loops).toContain("lint");
      expect(loops).toContain("typecheck");
      expect(loops).toContain("format:check");
      expect(loops.length).toBe(4);
    });

    test("ignores non-standard scripts", async () => {
      createPackageJson(tempDir, {
        test: "bun test",
        dev: "bun run dev",
        build: "bun build",
        custom: "echo custom",
      });
      const runner = createRunner(tempDir);
      const loops = await runner.detectAvailableLoops();
      expect(loops).toEqual(["test"]);
    });

    test("preserves order of standard loops", async () => {
      createPackageJson(tempDir, {
        typecheck: "tsc",
        lint: "biome lint",
        test: "bun test",
      });
      const runner = createRunner(tempDir);
      const loops = await runner.detectAvailableLoops();
      // Should be in STANDARD_LOOPS order: test, lint, typecheck
      expect(loops[0]).toBe("test");
      expect(loops[1]).toBe("lint");
      expect(loops[2]).toBe("typecheck");
    });
  });

  // ============================================================================
  // isLoopAvailable
  // ============================================================================

  describe("isLoopAvailable", () => {
    test("returns false when no package.json exists", async () => {
      const runner = createRunner(tempDir);
      const available = await runner.isLoopAvailable("test");
      expect(available).toBe(false);
    });

    test("returns false when script does not exist", async () => {
      createPackageJson(tempDir, {
        dev: "bun dev",
      });
      const runner = createRunner(tempDir);
      const available = await runner.isLoopAvailable("test");
      expect(available).toBe(false);
    });

    test("returns true when script exists", async () => {
      createPackageJson(tempDir, {
        test: "bun test",
      });
      const runner = createRunner(tempDir);
      const available = await runner.isLoopAvailable("test");
      expect(available).toBe(true);
    });

    test("works with any script name", async () => {
      createPackageJson(tempDir, {
        "custom:script": "echo custom",
      });
      const runner = createRunner(tempDir);
      const available = await runner.isLoopAvailable("custom:script");
      expect(available).toBe(true);
    });
  });

  // ============================================================================
  // runLoop
  // ============================================================================

  describe("runLoop", () => {
    test("returns error result when script not found", async () => {
      createPackageJson(tempDir, {});
      const runner = createRunner(tempDir);
      const result = await runner.runLoop("test");

      expect(result.name).toBe("test");
      expect(result.passed).toBe(false);
      expect(result.output).toContain("not found");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    test("runs successful script and returns passed=true", async () => {
      createPackageJson(tempDir, {
        test: "echo 'All tests passed'",
      });
      const runner = createRunner(tempDir);
      const result = await runner.runLoop("test");

      expect(result.name).toBe("test");
      expect(result.passed).toBe(true);
      expect(result.output).toContain("All tests passed");
      expect(result.duration).toBeGreaterThan(0);
    });

    test("runs failing script and returns passed=false", async () => {
      createPackageJson(tempDir, {
        test: "exit 1",
      });
      const runner = createRunner(tempDir);
      const result = await runner.runLoop("test");

      expect(result.name).toBe("test");
      expect(result.passed).toBe(false);
      expect(result.duration).toBeGreaterThan(0);
    });

    test("captures stdout output", async () => {
      createPackageJson(tempDir, {
        test: "echo 'stdout line 1' && echo 'stdout line 2'",
      });
      const runner = createRunner(tempDir);
      const result = await runner.runLoop("test");

      expect(result.output).toContain("stdout line 1");
      expect(result.output).toContain("stdout line 2");
    });

    test("captures stderr output", async () => {
      createPackageJson(tempDir, {
        test: "echo 'stderr message' >&2",
      });
      const runner = createRunner(tempDir);
      const result = await runner.runLoop("test");

      expect(result.output).toContain("stderr message");
    });

    test("combines stdout and stderr", async () => {
      createPackageJson(tempDir, {
        test: "echo 'stdout' && echo 'stderr' >&2",
      });
      const runner = createRunner(tempDir);
      const result = await runner.runLoop("test");

      expect(result.output).toContain("stdout");
      expect(result.output).toContain("stderr");
    });

    test("handles timeout", async () => {
      createPackageJson(tempDir, {
        test: "sleep 10",
      });
      const runner = createRunner(tempDir, { timeoutMs: 100 });
      const result = await runner.runLoop("test");

      expect(result.passed).toBe(false);
      expect(result.output).toContain("Timeout");
    });

    test("allows per-loop timeout override", async () => {
      createPackageJson(tempDir, {
        test: "sleep 10",
      });
      const runner = createRunner(tempDir, { timeoutMs: 60000 });
      const result = await runner.runLoop("test", 100);

      expect(result.passed).toBe(false);
      expect(result.output).toContain("Timeout");
    });

    test("measures duration accurately", async () => {
      createPackageJson(tempDir, {
        test: "sleep 0.1",
      });
      const runner = createRunner(tempDir);
      const result = await runner.runLoop("test");

      // Should be around 100ms, but allow some variance
      expect(result.duration).toBeGreaterThanOrEqual(50);
      expect(result.duration).toBeLessThan(500);
    });

    test("handles script with exit code 2", async () => {
      createPackageJson(tempDir, {
        lint: "exit 2",
      });
      const runner = createRunner(tempDir);
      const result = await runner.runLoop("lint");

      expect(result.passed).toBe(false);
    });

    test("trims output whitespace", async () => {
      createPackageJson(tempDir, {
        test: "echo '  trimmed  '",
      });
      const runner = createRunner(tempDir);
      const result = await runner.runLoop("test");

      // Output is trimmed at the end, though echo may include leading/trailing spaces
      expect(result.output).toContain("trimmed");
    });
  });

  // ============================================================================
  // runAll
  // ============================================================================

  describe("runAll", () => {
    test("returns empty array for empty loops list", async () => {
      createPackageJson(tempDir, { test: "echo test" });
      const runner = createRunner(tempDir);
      const results = await runner.runAll([]);
      expect(results).toEqual([]);
    });

    test("runs single loop", async () => {
      createPackageJson(tempDir, { test: "echo 'passed'" });
      const runner = createRunner(tempDir);
      const results = await runner.runAll(["test"]);

      expect(results.length).toBe(1);
      expect(results[0]?.name).toBe("test");
      expect(results[0]?.passed).toBe(true);
    });

    test("runs multiple loops sequentially", async () => {
      createPackageJson(tempDir, {
        test: "echo 'test passed'",
        lint: "echo 'lint passed'",
        typecheck: "echo 'typecheck passed'",
      });
      const runner = createRunner(tempDir);
      const results = await runner.runAll(["test", "lint", "typecheck"]);

      expect(results.length).toBe(3);
      expect(results[0]?.name).toBe("test");
      expect(results[1]?.name).toBe("lint");
      expect(results[2]?.name).toBe("typecheck");
      expect(results.every((r) => r.passed)).toBe(true);
    });

    test("continues running even if earlier loop fails", async () => {
      createPackageJson(tempDir, {
        test: "exit 1",
        lint: "echo 'lint passed'",
      });
      const runner = createRunner(tempDir);
      const results = await runner.runAll(["test", "lint"]);

      expect(results.length).toBe(2);
      expect(results[0]?.passed).toBe(false);
      expect(results[1]?.passed).toBe(true);
    });

    test("applies timeout to each loop", async () => {
      createPackageJson(tempDir, {
        test: "sleep 10",
        lint: "echo 'lint passed'",
      });
      const runner = createRunner(tempDir);
      const results = await runner.runAll(["test", "lint"], 100);

      expect(results[0]?.passed).toBe(false);
      expect(results[0]?.output).toContain("Timeout");
      expect(results[1]?.passed).toBe(true);
    });
  });

  // ============================================================================
  // runAvailable
  // ============================================================================

  describe("runAvailable", () => {
    test("returns empty array when no loops available", async () => {
      createPackageJson(tempDir, { dev: "echo dev" });
      const runner = createRunner(tempDir);
      const results = await runner.runAvailable();
      expect(results).toEqual([]);
    });

    test("runs all available standard loops", async () => {
      createPackageJson(tempDir, {
        test: "echo 'test'",
        lint: "echo 'lint'",
        build: "echo 'build'", // not a standard loop
      });
      const runner = createRunner(tempDir);
      const results = await runner.runAvailable();

      expect(results.length).toBe(2);
      expect(results.map((r) => r.name)).toContain("test");
      expect(results.map((r) => r.name)).toContain("lint");
    });
  });

  // ============================================================================
  // Static helper methods
  // ============================================================================

  describe("toFeedbackResults", () => {
    test("converts array to record", () => {
      const results: FeedbackLoopResult[] = [
        { name: "test", passed: true, output: "ok", duration: 100 },
        { name: "lint", passed: false, output: "fail", duration: 200 },
      ];

      const record = FeedbackRunner.toFeedbackResults(results);

      expect(record.test).toEqual({ passed: true, output: "ok", duration: 100 });
      expect(record.lint).toEqual({ passed: false, output: "fail", duration: 200 });
    });

    test("returns empty record for empty array", () => {
      const record = FeedbackRunner.toFeedbackResults([]);
      expect(record).toEqual({});
    });
  });

  describe("allPassed", () => {
    test("returns true when all passed", () => {
      const results: FeedbackLoopResult[] = [
        { name: "test", passed: true, output: "", duration: 0 },
        { name: "lint", passed: true, output: "", duration: 0 },
      ];
      expect(FeedbackRunner.allPassed(results)).toBe(true);
    });

    test("returns false when any failed", () => {
      const results: FeedbackLoopResult[] = [
        { name: "test", passed: true, output: "", duration: 0 },
        { name: "lint", passed: false, output: "", duration: 0 },
      ];
      expect(FeedbackRunner.allPassed(results)).toBe(false);
    });

    test("returns true for empty array", () => {
      expect(FeedbackRunner.allPassed([])).toBe(true);
    });
  });

  describe("summarize", () => {
    test("summarizes all passed", () => {
      const results: FeedbackLoopResult[] = [
        { name: "test", passed: true, output: "", duration: 0 },
        { name: "lint", passed: true, output: "", duration: 0 },
      ];
      const summary = FeedbackRunner.summarize(results);
      expect(summary).toBe("All 2 passed (test, lint)");
    });

    test("summarizes all failed", () => {
      const results: FeedbackLoopResult[] = [
        { name: "test", passed: false, output: "", duration: 0 },
        { name: "lint", passed: false, output: "", duration: 0 },
      ];
      const summary = FeedbackRunner.summarize(results);
      expect(summary).toBe("All 2 failed (test, lint)");
    });

    test("summarizes mixed results", () => {
      const results: FeedbackLoopResult[] = [
        { name: "test", passed: true, output: "", duration: 0 },
        { name: "lint", passed: false, output: "", duration: 0 },
        { name: "typecheck", passed: true, output: "", duration: 0 },
      ];
      const summary = FeedbackRunner.summarize(results);
      expect(summary).toBe("2/3 passed (test, typecheck), failed: lint");
    });

    test("handles single loop", () => {
      const results: FeedbackLoopResult[] = [
        { name: "test", passed: true, output: "", duration: 0 },
      ];
      const summary = FeedbackRunner.summarize(results);
      expect(summary).toBe("All 1 passed (test)");
    });
  });

  // ============================================================================
  // STANDARD_LOOPS constant
  // ============================================================================

  describe("STANDARD_LOOPS", () => {
    test("contains expected loop names", () => {
      expect(STANDARD_LOOPS).toContain("test");
      expect(STANDARD_LOOPS).toContain("lint");
      expect(STANDARD_LOOPS).toContain("typecheck");
      expect(STANDARD_LOOPS).toContain("format:check");
    });

    test("has correct length", () => {
      expect(STANDARD_LOOPS.length).toBe(4);
    });
  });
});
