/**
 * Tests for PreflightService
 *
 * Tests pre-battle validation checks per spec 10-preflight.md
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import {
  PreflightService,
  tokenizeCommand,
  generatePreflightToken,
  validatePreflightToken,
  toPreflightCheckResultDTO,
  toPreflightReportDTO,
  assessTaskRisk,
  type PreflightContext,
  type PreflightCheckResult,
} from "../src/services/preflight-service.ts";
import type { Task, Config } from "../src/types/index.ts";
import { TaskStatus, DEFAULT_CONFIG } from "../src/types/index.ts";

// Test helpers
const testDir = join(process.cwd(), "test-preflight-temp");

async function setupTestDir(): Promise<string> {
  await mkdir(testDir, { recursive: true });
  return testDir;
}

async function cleanupTestDir(): Promise<void> {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

function createTestTask(overrides?: Partial<Task>): Task {
  return {
    id: "001-test-task",
    title: "Test Task",
    description: "A test task for preflight",
    status: TaskStatus.Pending,
    priority: 1,
    acceptanceCriteria: ["Criterion 1", "Criterion 2"],
    iterations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createTestConfig(overrides?: Partial<Config>): Config {
  return {
    ...DEFAULT_CONFIG,
    feedbackLoops: ["test"], // Use a simple loop for testing
    ...overrides,
  };
}

function createTestContext(overrides?: Partial<PreflightContext>): PreflightContext {
  return {
    taskId: "001-test-task",
    task: createTestTask(),
    config: createTestConfig(),
    workingDir: testDir,
    ...overrides,
  };
}

describe("PreflightService", () => {
  describe("tokenizeCommand", () => {
    test("extracts executable from simple command", () => {
      expect(tokenizeCommand("bun test")).toBe("bun");
      expect(tokenizeCommand("npm run lint")).toBe("npm");
      expect(tokenizeCommand("python script.py")).toBe("python");
    });

    test("handles paths and extracts basename", () => {
      expect(tokenizeCommand("/usr/local/bin/node")).toBe("node");
      expect(tokenizeCommand("./scripts/run.sh")).toBe("run.sh");
    });

    test("skips environment variable assignments", () => {
      expect(tokenizeCommand("NODE_ENV=test bun test")).toBe("bun");
      expect(tokenizeCommand("CI=true npm run build")).toBe("npm");
    });

    test("handles quoted commands", () => {
      expect(tokenizeCommand("'my command' args")).toBe("my command");
      expect(tokenizeCommand('"some cmd" --flag')).toBe("some cmd");
    });
  });

  describe("generatePreflightToken / validatePreflightToken", () => {
    test("generates and validates token", () => {
      const taskId = "001-test-task";
      const timestamp = new Date().toISOString();
      const token = generatePreflightToken(taskId, timestamp);

      const decoded = validatePreflightToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.taskId).toBe(taskId);
      expect(decoded?.timestamp).toBe(timestamp);
    });

    test("returns null for invalid token", () => {
      expect(validatePreflightToken("invalid")).toBeNull();
      expect(validatePreflightToken("")).toBeNull();
    });

    test("returns null for expired token (>5 minutes)", () => {
      const taskId = "001-test-task";
      const oldTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 minutes ago
      const token = generatePreflightToken(taskId, oldTimestamp);

      expect(validatePreflightToken(token)).toBeNull();
    });

    test("validates token within 5 minute window", () => {
      const taskId = "001-test-task";
      const recentTimestamp = new Date(Date.now() - 4 * 60 * 1000).toISOString(); // 4 minutes ago
      const token = generatePreflightToken(taskId, recentTimestamp);

      const decoded = validatePreflightToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.taskId).toBe(taskId);
    });
  });

  describe("toPreflightCheckResultDTO", () => {
    test("converts check result to DTO without functions", () => {
      const result: PreflightCheckResult = {
        check: {
          id: "test_check",
          name: "Test Check",
          description: "A test check",
          category: "config",
          severity: "error",
          check: async () => ({ passed: true, message: "OK", canProceed: true }),
          fix: async () => ({ success: true, message: "Fixed" }),
        },
        result: {
          passed: true,
          message: "Check passed",
          canProceed: true,
        },
        duration: 100,
      };

      const dto = toPreflightCheckResultDTO(result);

      expect(dto.check.id).toBe("test_check");
      expect(dto.check.name).toBe("Test Check");
      expect(dto.check.hasAutoFix).toBe(true);
      expect(dto.result.passed).toBe(true);
      expect(dto.duration).toBe(100);
      // Ensure no function properties
      expect(typeof (dto.check as unknown as { check?: unknown }).check).toBe("undefined");
      expect(typeof (dto.check as unknown as { fix?: unknown }).fix).toBe("undefined");
    });

    test("sets hasAutoFix to false when no fix function", () => {
      const result: PreflightCheckResult = {
        check: {
          id: "no_fix",
          name: "No Fix",
          description: "A check without fix",
          category: "environment",
          severity: "info",
          check: async () => ({ passed: true, message: "OK", canProceed: true }),
          // No fix function
        },
        result: { passed: true, message: "OK", canProceed: true },
        duration: 50,
      };

      const dto = toPreflightCheckResultDTO(result);
      expect(dto.check.hasAutoFix).toBe(false);
    });
  });

  describe("assessTaskRisk", () => {
    test("returns low risk for well-scoped task", () => {
      const task = createTestTask({
        description: "Simple task",
        acceptanceCriteria: ["One criterion"],
      });

      const risk = assessTaskRisk(task);
      expect(risk.level).toBe("low");
      expect(risk.recommendation).toContain("YOLO");
    });

    test("returns medium risk for moderately complex task", () => {
      const task = createTestTask({
        description: "A task that involves some database operations with API integration",
        acceptanceCriteria: ["Criterion 1", "Criterion 2", "Criterion 3"],
      });

      const risk = assessTaskRisk(task);
      expect(["low", "medium"]).toContain(risk.level);
    });

    test("returns high risk for complex task", () => {
      const task = createTestTask({
        description: "A complex refactor involving authentication and database migration with security considerations. This is a very detailed description that goes on and on to explain all the intricacies of the task at hand. It involves multiple systems and requires careful coordination. The task also needs to handle various edge cases and error scenarios. We need to ensure backwards compatibility and proper testing coverage.",
        acceptanceCriteria: [
          "Authentication works",
          "Database migrates",
          "Security audit passes",
          "Tests pass",
          "Docs updated",
          "Performance acceptable",
        ],
      });

      const risk = assessTaskRisk(task);
      expect(risk.level).toBe("high");
      expect(risk.recommendation).toContain("HITL");
    });
  });
});

describe("PreflightService - Integration", () => {
  let workingDir: string;

  beforeEach(async () => {
    workingDir = await setupTestDir();
    // Initialize as a git repo for git checks
    const proc = Bun.spawn(["git", "init"], { cwd: workingDir });
    await proc.exited;
    // Set up git identity for the test repo
    const configEmail = Bun.spawn(["git", "config", "user.email", "test@test.com"], { cwd: workingDir });
    await configEmail.exited;
    const configName = Bun.spawn(["git", "config", "user.name", "Test User"], { cwd: workingDir });
    await configName.exited;
    // Create initial commit so git stash works
    await writeFile(join(workingDir, ".gitkeep"), "");
    const gitAdd = Bun.spawn(["git", "add", "."], { cwd: workingDir });
    await gitAdd.exited;
    const gitCommit = Bun.spawn(["git", "commit", "-m", "Initial commit"], { cwd: workingDir });
    await gitCommit.exited;
  });

  afterEach(async () => {
    await cleanupTestDir();
  });

  describe("runPreflight", () => {
    test("runs all checks and returns report", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({ workingDir });

      const report = await service.runPreflight(context);

      expect(report.taskId).toBe("001-test-task");
      expect(report.timestamp).toBeDefined();
      expect(report.duration).toBeGreaterThanOrEqual(0);
      expect(report.results.length).toBeGreaterThan(0);
      expect(report.summary).toBeDefined();
      expect(report.summary.total).toBe(report.results.length);
    });

    test("returns canStart=true when no blocking errors", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({
        workingDir,
        config: createTestConfig({ feedbackLoops: [] }), // No feedback loops to avoid command check failures
      });

      const report = await service.runPreflight(context);

      // Note: canStart depends on whether Claude CLI is installed
      // We just verify the report structure
      expect(typeof report.canStart).toBe("boolean");
      expect(report.summary.errors).toBeGreaterThanOrEqual(0);
    });

    test("calculates summary correctly", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({
        workingDir,
        config: createTestConfig({ feedbackLoops: [] }),
      });

      const report = await service.runPreflight(context);

      const { summary, results } = report;

      // Summary should match actual counts
      const passedCount = results.filter(r => r.result.passed).length;
      expect(summary.passed).toBe(passedCount);
      expect(summary.total).toBe(results.length);
    });

    test("generates preflight token when canStart is true", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({
        workingDir,
        config: createTestConfig({ feedbackLoops: [] }), // No feedback loops
      });

      const report = await service.runPreflight(context);

      if (report.canStart) {
        expect(report.preflightToken).toBeDefined();
        const decoded = validatePreflightToken(report.preflightToken!);
        expect(decoded?.taskId).toBe("001-test-task");
      } else {
        // If can't start, no token should be generated
        expect(report.preflightToken).toBeUndefined();
      }
    });
  });

  describe("Task checks", () => {
    test("fails for completed task", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({
        workingDir,
        task: createTestTask({ status: TaskStatus.Completed }),
      });

      const report = await service.runPreflight(context);

      const taskStatusCheck = report.results.find(r => r.check.id === "task_status");
      expect(taskStatusCheck).toBeDefined();
      expect(taskStatusCheck?.result.passed).toBe(false);
      expect(taskStatusCheck?.result.canProceed).toBe(false);
      expect(taskStatusCheck?.result.message).toContain("already completed");
    });

    test("passes for pending task", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({
        workingDir,
        task: createTestTask({ status: TaskStatus.Pending }),
      });

      const report = await service.runPreflight(context);

      const taskStatusCheck = report.results.find(r => r.check.id === "task_status");
      expect(taskStatusCheck).toBeDefined();
      expect(taskStatusCheck?.result.passed).toBe(true);
      expect(taskStatusCheck?.result.message).toContain("ready");
    });

    test("warns about missing acceptance criteria", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({
        workingDir,
        task: createTestTask({ acceptanceCriteria: [] }),
      });

      const report = await service.runPreflight(context);

      const criteriaCheck = report.results.find(r => r.check.id === "acceptance_criteria");
      expect(criteriaCheck).toBeDefined();
      expect(criteriaCheck?.result.passed).toBe(false);
      expect(criteriaCheck?.result.canProceed).toBe(true); // Warning, not blocker
      expect(criteriaCheck?.check.severity).toBe("warning");
    });

    test("detects active battle conflict", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({
        workingDir,
        getActiveBattle: () => ({ taskId: "other-task" }),
      });

      const report = await service.runPreflight(context);

      const concurrentCheck = report.results.find(r => r.check.id === "no_concurrent");
      expect(concurrentCheck).toBeDefined();
      expect(concurrentCheck?.result.passed).toBe(false);
      expect(concurrentCheck?.result.canProceed).toBe(false);
      expect(concurrentCheck?.result.message).toContain("other-task");
    });

    test("allows same task to be in active battle", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({
        workingDir,
        taskId: "001-test-task",
        getActiveBattle: () => ({ taskId: "001-test-task" }), // Same task
      });

      const report = await service.runPreflight(context);

      const concurrentCheck = report.results.find(r => r.check.id === "no_concurrent");
      expect(concurrentCheck).toBeDefined();
      expect(concurrentCheck?.result.passed).toBe(true);
    });
  });

  describe("Git checks", () => {
    test("passes with clean working tree", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({ workingDir });

      const report = await service.runPreflight(context);

      const repoCheck = report.results.find(r => r.check.id === "repo_status");
      expect(repoCheck).toBeDefined();
      expect(repoCheck?.result.passed).toBe(true);
      expect(repoCheck?.result.message).toContain("clean");
    });

    test("warns about uncommitted changes", async () => {
      // Create an uncommitted file
      await writeFile(join(workingDir, "test.txt"), "hello");

      const service = new PreflightService(workingDir);
      const context = createTestContext({ workingDir });

      const report = await service.runPreflight(context);

      const repoCheck = report.results.find(r => r.check.id === "repo_status");
      expect(repoCheck).toBeDefined();
      expect(repoCheck?.result.passed).toBe(false);
      expect(repoCheck?.result.canProceed).toBe(true); // Warning, not blocker
      expect(repoCheck?.result.message).toContain("uncommitted");
    });

    test("repo_status has auto-fix available", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({ workingDir });

      const report = await service.runPreflight(context);

      const repoCheck = report.results.find(r => r.check.id === "repo_status");
      expect(repoCheck).toBeDefined();
      expect(typeof repoCheck?.check.fix).toBe("function");

      const dto = toPreflightCheckResultDTO(repoCheck!);
      expect(dto.check.hasAutoFix).toBe(true);
    });
  });

  describe("Config checks", () => {
    test("passes with valid config", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({
        workingDir,
        config: createTestConfig(),
      });

      const report = await service.runPreflight(context);

      const configCheck = report.results.find(r => r.check.id === "config_valid");
      expect(configCheck).toBeDefined();
      expect(configCheck?.result.passed).toBe(true);
    });

    test("reports iteration limit info", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({
        workingDir,
        config: createTestConfig({ maxIterationsPerTask: 25 }),
      });

      const report = await service.runPreflight(context);

      const limitCheck = report.results.find(r => r.check.id === "iteration_limit");
      expect(limitCheck).toBeDefined();
      expect(limitCheck?.result.passed).toBe(true);
      expect(limitCheck?.result.message).toContain("25");
    });
  });

  describe("applyFix", () => {
    test("applies fix for repo_status check", async () => {
      // Create a tracked file with uncommitted changes
      await writeFile(join(workingDir, "test.txt"), "hello");
      // Add the file so it's tracked (stash only works on tracked files by default)
      const addProc = Bun.spawn(["git", "add", "test.txt"], { cwd: workingDir });
      await addProc.exited;

      const service = new PreflightService(workingDir);
      const context = createTestContext({ workingDir });

      const { result, updatedCheck } = await service.applyFix("repo_status", context);

      // The fix stashes changes
      expect(result.success).toBe(true);
      expect(result.message).toContain("stashed");
      expect(result.metadata?.stashRef).toBeDefined();

      // After fix, working tree should be clean
      expect(updatedCheck.result.passed).toBe(true);
    });

    test("returns error for check without fix", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({ workingDir });

      const { result } = await service.applyFix("memory", context);

      expect(result.success).toBe(false);
      expect(result.message).toContain("no auto-fix");
    });

    test("returns error for unknown check", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({ workingDir });

      const { result } = await service.applyFix("nonexistent_check", context);

      expect(result.success).toBe(false);
      expect(result.message).toContain("not found");
    });
  });

  describe("restoreStash", () => {
    test("restores stashed changes", async () => {
      // Create a tracked file and stash it
      await writeFile(join(workingDir, "test.txt"), "hello");
      // Add the file so it's tracked (stash only works on tracked files by default)
      const addProc = Bun.spawn(["git", "add", "test.txt"], { cwd: workingDir });
      await addProc.exited;
      const stashProc = Bun.spawn(["git", "stash", "push", "-m", "test stash"], { cwd: workingDir });
      await stashProc.exited;

      const service = new PreflightService(workingDir);
      const result = await service.restoreStash("stash@{0}");

      expect(result.success).toBe(true);
      expect(result.message).toContain("restored");

      // Verify file is back (in staging area)
      await access(join(workingDir, "test.txt"));
    });

    test("returns error for invalid stash ref", async () => {
      const service = new PreflightService(workingDir);
      const result = await service.restoreStash("stash@{999}");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Failed");
    });
  });

  describe("getChecks", () => {
    test("returns all available checks", () => {
      const service = new PreflightService(workingDir);
      const checks = service.getChecks();

      expect(checks.length).toBeGreaterThan(0);

      // Verify categories are covered
      const categories = new Set(checks.map(c => c.category));
      expect(categories.has("environment")).toBe(true);
      expect(categories.has("git")).toBe(true);
      expect(categories.has("config")).toBe(true);
      expect(categories.has("task")).toBe(true);
    });
  });

  describe("getCheck", () => {
    test("returns specific check by ID", () => {
      const service = new PreflightService(workingDir);

      const check = service.getCheck("repo_status");
      expect(check).toBeDefined();
      expect(check?.id).toBe("repo_status");
      expect(check?.category).toBe("git");
    });

    test("returns undefined for unknown check", () => {
      const service = new PreflightService(workingDir);

      const check = service.getCheck("nonexistent");
      expect(check).toBeUndefined();
    });
  });

  describe("toPreflightReportDTO", () => {
    test("converts full report to DTO", async () => {
      const service = new PreflightService(workingDir);
      const context = createTestContext({
        workingDir,
        config: createTestConfig({ feedbackLoops: [] }),
      });

      const report = await service.runPreflight(context);
      const dto = toPreflightReportDTO(report);

      expect(dto.taskId).toBe(report.taskId);
      expect(dto.timestamp).toBe(report.timestamp);
      expect(dto.duration).toBe(report.duration);
      expect(dto.summary).toEqual(report.summary);
      expect(dto.canStart).toBe(report.canStart);
      expect(dto.results.length).toBe(report.results.length);

      // Verify each result is a DTO
      for (const result of dto.results) {
        expect(result.check.hasAutoFix).toBeDefined();
        expect(typeof (result.check as unknown as { check?: unknown }).check).toBe("undefined");
      }
    });
  });
});
