import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { ClaudeBridge } from "../src/services/claude-bridge.ts";
import type { ClaudeBridgeOptions } from "../src/services/claude-bridge.ts";

// Path to the mock Claude script
const MOCK_CLAUDE_PATH = join(import.meta.dir, "fixtures", "mock-claude.ts");

// Create a unique temp directory for each test
const getTempDir = () =>
  join(import.meta.dir, `.tmp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Helper to create a ClaudeBridge with mock Claude
 */
function createBridge(
  tempDir: string,
  overrides: Partial<ClaudeBridgeOptions> = {},
  envVars: Record<string, string> = {}
): ClaudeBridge {
  // Store env vars for the bridge to use
  for (const [key, value] of Object.entries(envVars)) {
    process.env[key] = value;
  }

  return new ClaudeBridge({
    workingDir: tempDir,
    claudePath: `bun ${MOCK_CLAUDE_PATH}`,
    timeoutMs: 5000, // Short timeout for tests
    ...overrides,
  });
}

/**
 * Helper to create a bridge with custom env for mock claude
 */
function createBridgeWithEnv(
  tempDir: string,
  envVars: Record<string, string>,
  overrides: Partial<ClaudeBridgeOptions> = {}
): ClaudeBridge {
  // Set env vars that the mock script will read
  for (const [key, value] of Object.entries(envVars)) {
    process.env[key] = value;
  }

  return new ClaudeBridge({
    workingDir: tempDir,
    claudePath: `bun ${MOCK_CLAUDE_PATH}`,
    timeoutMs: 5000,
    ...overrides,
  });
}

/**
 * Helper to wait for process exit with output collection
 */
async function waitForExit(
  bridge: ClaudeBridge
): Promise<{ exitCode: number | null; signal: string | null }> {
  return new Promise((resolve) => {
    bridge.onExit((exitCode, signal) => {
      resolve({ exitCode, signal });
    });
  });
}

describe("ClaudeBridge", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = getTempDir();
    mkdirSync(tempDir, { recursive: true });
    // Reset mock env vars to default mode
    process.env.MOCK_CLAUDE_MODE = "success";
    process.env.MOCK_CLAUDE_DELAY = "10";
    process.env.MOCK_CLAUDE_OUTPUT = "";
    process.env.MOCK_CLAUDE_EXIT_CODE = "0";
  });

  afterEach(() => {
    // Clean up env vars
    process.env.MOCK_CLAUDE_MODE = undefined;
    process.env.MOCK_CLAUDE_DELAY = undefined;
    process.env.MOCK_CLAUDE_OUTPUT = undefined;
    process.env.MOCK_CLAUDE_EXIT_CODE = undefined;

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
    test("sets default values for optional options", () => {
      const bridge = new ClaudeBridge({
        workingDir: tempDir,
      });

      // Can't directly check private fields, but we can verify behavior
      expect(bridge.isRunning()).toBe(false);
    });

    test("accepts custom options", () => {
      const bridge = new ClaudeBridge({
        workingDir: tempDir,
        timeoutMs: 60000,
        claudePath: "custom-claude",
        acceptEdits: false,
      });

      expect(bridge.isRunning()).toBe(false);
    });
  });

  // ============================================================================
  // buildCommand
  // ============================================================================

  describe("buildCommand", () => {
    test("builds plan mode command with --plan flag", () => {
      const bridge = new ClaudeBridge({
        workingDir: tempDir,
        claudePath: "claude",
      });

      const cmd = bridge.buildCommand("plan", "Test prompt");

      expect(cmd).toContain("claude");
      expect(cmd).toContain("--plan");
      expect(cmd).toContain("--print");
      expect(cmd).toContain("Test prompt");
    });

    test("builds execute mode command with --dangerously-skip-permissions", () => {
      const bridge = new ClaudeBridge({
        workingDir: tempDir,
        claudePath: "claude",
        acceptEdits: true,
      });

      const cmd = bridge.buildCommand("execute", "Test prompt");

      expect(cmd).toContain("claude");
      expect(cmd).toContain("--dangerously-skip-permissions");
      expect(cmd).toContain("--print");
      expect(cmd).toContain("Test prompt");
      expect(cmd).not.toContain("--plan");
    });

    test("execute mode without acceptEdits does not add skip permissions flag", () => {
      const bridge = new ClaudeBridge({
        workingDir: tempDir,
        claudePath: "claude",
        acceptEdits: false,
      });

      const cmd = bridge.buildCommand("execute", "Test prompt");

      expect(cmd).not.toContain("--dangerously-skip-permissions");
    });
  });

  // ============================================================================
  // spawnPlanMode
  // ============================================================================

  describe("spawnPlanMode", () => {
    test("spawns process in plan mode", async () => {
      const bridge = createBridge(tempDir);
      const exitPromise = waitForExit(bridge);

      bridge.spawnPlanMode("Create a todo app");

      expect(bridge.isRunning()).toBe(true);

      const { exitCode } = await exitPromise;
      expect(exitCode).toBe(0);
      expect(bridge.isRunning()).toBe(false);

      // Verify output includes plan mode info
      const output = bridge.getStdout();
      expect(output).toContain("Mode: plan");
    });

    test("passes prompt to mock", async () => {
      const bridge = createBridge(tempDir);
      const exitPromise = waitForExit(bridge);

      bridge.spawnPlanMode("Build a React dashboard");

      await exitPromise;

      const output = bridge.getStdout();
      expect(output).toContain("Prompt received: Build a React dashboard");
    });
  });

  // ============================================================================
  // spawnExecutionMode
  // ============================================================================

  describe("spawnExecutionMode", () => {
    test("spawns process in execution mode", async () => {
      const bridge = createBridge(tempDir);
      const exitPromise = waitForExit(bridge);

      bridge.spawnExecutionMode("Implement the feature");

      expect(bridge.isRunning()).toBe(true);

      const { exitCode } = await exitPromise;
      expect(exitCode).toBe(0);
      expect(bridge.isRunning()).toBe(false);

      // Verify output includes execute mode info
      const output = bridge.getStdout();
      expect(output).toContain("Mode: execute");
      expect(output).toContain("Skip permissions: true");
    });

    test("captures completion sigil in output", async () => {
      const bridge = createBridge(tempDir);
      const exitPromise = waitForExit(bridge);

      bridge.spawnExecutionMode("Complete the task");

      await exitPromise;

      const output = bridge.getStdout();
      expect(output).toContain("<promise>COMPLETE</promise>");
    });
  });

  // ============================================================================
  // Process management
  // ============================================================================

  describe("isRunning", () => {
    test("returns false before spawning", () => {
      const bridge = createBridge(tempDir);
      expect(bridge.isRunning()).toBe(false);
    });

    test("returns true while process is running", async () => {
      const bridge = createBridge(tempDir);

      bridge.spawnExecutionMode("Test");

      expect(bridge.isRunning()).toBe(true);

      await waitForExit(bridge);

      expect(bridge.isRunning()).toBe(false);
    });
  });

  describe("kill", () => {
    test("returns false when no process is running", () => {
      const bridge = createBridge(tempDir);
      expect(bridge.kill()).toBe(false);
    });

    test("kills running process and returns true", async () => {
      // Use longer delay so we can kill it
      const bridge = createBridgeWithEnv(tempDir, {
        MOCK_CLAUDE_MODE: "timeout",
        MOCK_CLAUDE_DELAY: "5000",
      });

      bridge.spawnExecutionMode("Long task");
      expect(bridge.isRunning()).toBe(true);

      const result = bridge.kill();
      expect(result).toBe(true);
      expect(bridge.isRunning()).toBe(false);
    });

    test("kills previous process when spawning new one", async () => {
      // Use longer delay for first process so it's definitely still running
      const bridge = createBridgeWithEnv(tempDir, {
        MOCK_CLAUDE_MODE: "timeout",
        MOCK_CLAUDE_DELAY: "5000",
      });

      // Spawn first process (long-running)
      bridge.spawnPlanMode("First task");
      expect(bridge.isRunning()).toBe(true);

      // Small delay to ensure first process is established
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Spawn second process (should kill first and use same env - still timeout mode)
      // This verifies the bridge kills the old process even when spawning a new one
      bridge.spawnExecutionMode("Second task");
      expect(bridge.isRunning()).toBe(true);

      // Kill the second process immediately (since it's also in timeout mode)
      bridge.kill();

      expect(bridge.isRunning()).toBe(false);
    });
  });

  describe("onExit", () => {
    test("calls callback with exit code on normal exit", async () => {
      const bridge = createBridge(tempDir);

      let capturedCode = -1;
      let capturedSignal: string | null = null;

      bridge.onExit((code, signal) => {
        capturedCode = code ?? -1;
        capturedSignal = signal;
      });

      bridge.spawnExecutionMode("Test");

      await waitForExit(bridge);

      expect(capturedCode).toBe(0);
      expect(capturedSignal).toBeNull();
    });

    test("calls callback with non-zero exit code on error", async () => {
      const bridge = createBridgeWithEnv(tempDir, {
        MOCK_CLAUDE_MODE: "error",
        MOCK_CLAUDE_EXIT_CODE: "1",
      });

      let capturedCode = -1;

      bridge.onExit((code) => {
        capturedCode = code ?? -1;
      });

      bridge.spawnExecutionMode("Test");

      await waitForExit(bridge);

      expect(capturedCode).toBe(1);
    });

    test("supports multiple callbacks", async () => {
      const bridge = createBridge(tempDir);

      let callback1Called = false;
      let callback2Called = false;

      bridge.onExit(() => {
        callback1Called = true;
      });
      bridge.onExit(() => {
        callback2Called = true;
      });

      bridge.spawnExecutionMode("Test");

      await waitForExit(bridge);

      expect(callback1Called).toBe(true);
      expect(callback2Called).toBe(true);
    });
  });

  // ============================================================================
  // Output capture
  // ============================================================================

  describe("output capture", () => {
    test("captures stdout in buffer", async () => {
      const bridge = createBridge(tempDir);

      bridge.spawnExecutionMode("Test");

      await waitForExit(bridge);

      const stdout = bridge.getStdout();
      expect(stdout).toContain("Claude Code Mock");
      expect(stdout).toContain("Task completed successfully");
    });

    test("captures stderr in buffer", async () => {
      const bridge = createBridgeWithEnv(tempDir, {
        MOCK_CLAUDE_MODE: "stderr",
      });

      bridge.spawnExecutionMode("Test");

      await waitForExit(bridge);

      const stderr = bridge.getStderr();
      expect(stderr).toContain("stderr output");
    });

    test("getCombinedOutput returns both stdout and stderr", async () => {
      const bridge = createBridgeWithEnv(tempDir, {
        MOCK_CLAUDE_MODE: "stderr",
      });

      bridge.spawnExecutionMode("Test");

      await waitForExit(bridge);

      const combined = bridge.getCombinedOutput();
      expect(combined).toContain("stdout output");
      expect(combined).toContain("stderr output");
    });

    test("onOutput callback receives stdout chunks", async () => {
      const bridge = createBridge(tempDir);
      const outputs: string[] = [];

      bridge.onOutput((data) => {
        outputs.push(data);
      });

      bridge.spawnExecutionMode("Test");

      await waitForExit(bridge);

      const combined = outputs.join("");
      expect(combined).toContain("Claude Code Mock");
    });

    test("onError callback receives stderr chunks", async () => {
      const bridge = createBridgeWithEnv(tempDir, {
        MOCK_CLAUDE_MODE: "error",
      });
      const errors: string[] = [];

      bridge.onError((data) => {
        errors.push(data);
      });

      bridge.spawnExecutionMode("Test");

      await waitForExit(bridge);

      const combined = errors.join("");
      expect(combined).toContain("Error: Something went wrong");
    });

    test("buffers are cleared when spawning new process", async () => {
      const bridge = createBridge(tempDir);

      // First spawn
      bridge.spawnExecutionMode("First");
      await waitForExit(bridge);

      const firstOutput = bridge.getStdout();
      expect(firstOutput).toContain("Task completed");

      // Second spawn - buffers should be cleared
      bridge.spawnPlanMode("Second");
      await waitForExit(bridge);

      const secondOutput = bridge.getStdout();
      // Should not contain doubled output
      expect(secondOutput.match(/Task completed/g)?.length).toBe(1);
    });
  });

  // ============================================================================
  // Timeout
  // ============================================================================

  describe("timeout", () => {
    test("kills process after timeout", async () => {
      const bridge = createBridgeWithEnv(
        tempDir,
        { MOCK_CLAUDE_MODE: "timeout", MOCK_CLAUDE_DELAY: "10000" },
        { timeoutMs: 100 } // Very short timeout for test
      );

      let capturedSignal = "";

      bridge.onExit((_, signal) => {
        capturedSignal = signal ?? "";
      });

      bridge.spawnExecutionMode("Long task");

      // Wait for timeout to trigger
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Process should have been killed
      expect(bridge.isRunning()).toBe(false);
      expect(capturedSignal).toBe("TIMEOUT");
    });

    test("timeout is cleared when process exits normally", async () => {
      const bridge = createBridge(tempDir, {
        timeoutMs: 5000,
      });

      bridge.spawnExecutionMode("Quick task");

      await waitForExit(bridge);

      // No timeout should fire
      expect(bridge.isRunning()).toBe(false);
    });

    test("timeout is cleared when kill is called", async () => {
      const bridge = createBridgeWithEnv(
        tempDir,
        { MOCK_CLAUDE_MODE: "timeout", MOCK_CLAUDE_DELAY: "10000" },
        { timeoutMs: 1000 }
      );

      bridge.spawnExecutionMode("Long task");

      // Kill immediately
      bridge.kill();

      expect(bridge.isRunning()).toBe(false);
    });
  });

  // ============================================================================
  // Callbacks management
  // ============================================================================

  describe("clearCallbacks", () => {
    test("removes all registered callbacks", async () => {
      const bridge = createBridge(tempDir);

      let exitCalled = false;
      let outputCalled = false;
      let errorCalled = false;

      bridge.onExit(() => {
        exitCalled = true;
      });
      bridge.onOutput(() => {
        outputCalled = true;
      });
      bridge.onError(() => {
        errorCalled = true;
      });

      bridge.clearCallbacks();

      bridge.spawnExecutionMode("Test");

      // Wait for process to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // None of the callbacks should have been called
      expect(exitCalled).toBe(false);
      expect(outputCalled).toBe(false);
      expect(errorCalled).toBe(false);
    });
  });

  // ============================================================================
  // Edge cases
  // ============================================================================

  describe("edge cases", () => {
    test("handles empty prompt", async () => {
      const bridge = createBridge(tempDir);

      bridge.spawnPlanMode("");

      await waitForExit(bridge);

      expect(bridge.getStdout()).toContain("Claude Code Mock");
    });

    test("handles prompt with special characters", async () => {
      const bridge = createBridge(tempDir);

      const specialPrompt = "Test with \"quotes\" and 'apostrophes' and $vars";
      bridge.spawnExecutionMode(specialPrompt);

      await waitForExit(bridge);

      // Should complete without errors
      const output = bridge.getStdout();
      expect(output).toContain("Task completed");
    });

    test("handles very long prompt", async () => {
      const bridge = createBridge(tempDir);

      const longPrompt = "A".repeat(10000);
      bridge.spawnExecutionMode(longPrompt);

      await waitForExit(bridge);

      // Should complete without errors
      expect(bridge.getStdout()).toContain("Claude Code Mock");
    });
  });
});
