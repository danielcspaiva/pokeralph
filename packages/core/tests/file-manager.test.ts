import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { rmSync, mkdirSync, existsSync } from "node:fs";
import { FileManager } from "../src/services/file-manager.ts";
import { FileNotFoundError, ValidationError } from "../src/services/errors.ts";
import { DEFAULT_CONFIG, TaskStatus, createInitialProgress, createBattle, createIteration } from "../src/types/index.ts";
import type { Config, PRD } from "../src/types/index.ts";

// Create a unique temp directory for each test
const getTempDir = () => join(import.meta.dir, `.tmp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

describe("FileManager", () => {
  let tempDir: string;
  let fm: FileManager;

  beforeEach(() => {
    tempDir = getTempDir();
    mkdirSync(tempDir, { recursive: true });
    fm = new FileManager(tempDir);
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================================
  // Path helpers
  // ============================================================================

  describe("getPokeRalphPath", () => {
    test("returns correct path to .pokeralph folder", () => {
      expect(fm.getPokeRalphPath()).toBe(join(tempDir, ".pokeralph"));
    });
  });

  // ============================================================================
  // Initialization
  // ============================================================================

  describe("exists", () => {
    test("returns false when .pokeralph does not exist", async () => {
      expect(await fm.exists()).toBe(false);
    });

    test("returns true when .pokeralph exists", async () => {
      await fm.init();
      expect(await fm.exists()).toBe(true);
    });
  });

  describe("init", () => {
    test("creates .pokeralph folder structure", async () => {
      await fm.init();

      const pokeralphPath = fm.getPokeRalphPath();
      const battlesPath = join(pokeralphPath, "battles");

      expect(existsSync(pokeralphPath)).toBe(true);
      expect(existsSync(battlesPath)).toBe(true);
    });

    test("creates default config.json", async () => {
      await fm.init();

      const configPath = join(fm.getPokeRalphPath(), "config.json");
      expect(await Bun.file(configPath).exists()).toBe(true);

      const config = await fm.loadConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    test("does not overwrite existing config.json", async () => {
      await fm.init();

      // Modify the config
      const customConfig: Config = {
        ...DEFAULT_CONFIG,
        maxIterationsPerTask: 20,
      };
      await fm.saveConfig(customConfig);

      // Init again
      await fm.init();

      // Config should still be custom
      const config = await fm.loadConfig();
      expect(config.maxIterationsPerTask).toBe(20);
    });
  });

  // ============================================================================
  // Config operations
  // ============================================================================

  describe("loadConfig", () => {
    test("throws FileNotFoundError when config.json does not exist", async () => {
      try {
        await fm.loadConfig();
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(FileNotFoundError);
        expect((error as FileNotFoundError).path).toContain("config.json");
      }
    });

    test("throws ValidationError for invalid config", async () => {
      await fm.init();
      const configPath = join(fm.getPokeRalphPath(), "config.json");
      await Bun.write(configPath, JSON.stringify({ invalid: "config" }));

      try {
        await fm.loadConfig();
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
      }
    });

    test("loads valid config", async () => {
      await fm.init();
      const config = await fm.loadConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe("saveConfig", () => {
    test("saves config as formatted JSON", async () => {
      await fm.init();
      const customConfig: Config = {
        ...DEFAULT_CONFIG,
        maxIterationsPerTask: 25,
        mode: "yolo",
      };

      await fm.saveConfig(customConfig);

      const configPath = join(fm.getPokeRalphPath(), "config.json");
      const content = await Bun.file(configPath).text();
      expect(content).toContain("\n"); // Formatted with newlines
      expect(JSON.parse(content)).toEqual(customConfig);
    });
  });

  // ============================================================================
  // PRD operations
  // ============================================================================

  describe("loadPRD", () => {
    test("throws FileNotFoundError when prd.json does not exist", async () => {
      await fm.init();
      try {
        await fm.loadPRD();
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(FileNotFoundError);
        expect((error as FileNotFoundError).path).toContain("prd.json");
      }
    });

    test("loads valid PRD", async () => {
      await fm.init();
      const prd = createTestPRD();
      await fm.savePRD(prd);

      const loaded = await fm.loadPRD();
      expect(loaded.name).toBe(prd.name);
      expect(loaded.tasks).toHaveLength(1);
    });
  });

  describe("savePRD", () => {
    test("saves PRD as formatted JSON", async () => {
      await fm.init();
      const prd = createTestPRD();

      await fm.savePRD(prd);

      const prdPath = join(fm.getPokeRalphPath(), "prd.json");
      const content = await Bun.file(prdPath).text();
      expect(JSON.parse(content).name).toBe(prd.name);
    });
  });

  // ============================================================================
  // Battle folder operations
  // ============================================================================

  describe("createBattleFolder", () => {
    test("creates battle folder with logs subfolder", async () => {
      await fm.init();
      const taskId = "001-test-task";

      await fm.createBattleFolder(taskId);

      const battlePath = join(fm.getPokeRalphPath(), "battles", taskId);
      const logsPath = join(battlePath, "logs");

      expect(existsSync(battlePath)).toBe(true);
      expect(existsSync(logsPath)).toBe(true);
    });
  });

  // ============================================================================
  // Progress operations
  // ============================================================================

  describe("loadProgress", () => {
    test("throws FileNotFoundError when progress.json does not exist", async () => {
      await fm.init();
      try {
        await fm.loadProgress("non-existent-task");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(FileNotFoundError);
      }
    });

    test("loads valid progress", async () => {
      await fm.init();
      const taskId = "001-test-task";
      await fm.createBattleFolder(taskId);

      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      const loaded = await fm.loadProgress(taskId);
      expect(loaded.taskId).toBe(taskId);
      expect(loaded.status).toBe("idle");
    });
  });

  describe("saveProgress", () => {
    test("saves progress to correct location", async () => {
      await fm.init();
      const taskId = "002-another-task";
      await fm.createBattleFolder(taskId);

      const progress = createInitialProgress(taskId);
      progress.status = "in_progress";
      progress.currentIteration = 1;

      await fm.saveProgress(taskId, progress);

      const loaded = await fm.loadProgress(taskId);
      expect(loaded.status).toBe("in_progress");
      expect(loaded.currentIteration).toBe(1);
    });
  });

  // ============================================================================
  // Battle history operations
  // ============================================================================

  describe("loadBattleHistory", () => {
    test("throws FileNotFoundError when history.json does not exist", async () => {
      await fm.init();
      try {
        await fm.loadBattleHistory("non-existent-task");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(FileNotFoundError);
      }
    });

    test("loads valid battle history", async () => {
      await fm.init();
      const taskId = "001-test-task";
      await fm.createBattleFolder(taskId);

      const battle = createBattle(taskId);
      await fm.saveBattleHistory(taskId, battle);

      const loaded = await fm.loadBattleHistory(taskId);
      expect(loaded.taskId).toBe(taskId);
      expect(loaded.status).toBe("pending");
    });
  });

  describe("appendIteration", () => {
    test("appends iteration to battle history", async () => {
      await fm.init();
      const taskId = "001-test-task";
      await fm.createBattleFolder(taskId);

      const battle = createBattle(taskId);
      await fm.saveBattleHistory(taskId, battle);

      const iteration1 = createIteration(1);
      iteration1.output = "First iteration";
      await fm.appendIteration(taskId, iteration1);

      const iteration2 = createIteration(2);
      iteration2.output = "Second iteration";
      await fm.appendIteration(taskId, iteration2);

      const loaded = await fm.loadBattleHistory(taskId);
      expect(loaded.iterations).toHaveLength(2);
      expect(loaded.iterations[0]?.number).toBe(1);
      expect(loaded.iterations[1]?.number).toBe(2);
    });
  });

  // ============================================================================
  // Iteration log operations
  // ============================================================================

  describe("writeIterationLog", () => {
    test("writes iteration log to correct location", async () => {
      await fm.init();
      const taskId = "001-test-task";
      await fm.createBattleFolder(taskId);

      const log = "This is the log output from iteration 1";
      await fm.writeIterationLog(taskId, 1, log);

      const logPath = join(
        fm.getPokeRalphPath(),
        "battles",
        taskId,
        "logs",
        "iteration-1.txt"
      );
      const content = await Bun.file(logPath).text();
      expect(content).toBe(log);
    });
  });

  describe("readIterationLog", () => {
    test("throws FileNotFoundError when log does not exist", async () => {
      await fm.init();
      const taskId = "001-test-task";
      await fm.createBattleFolder(taskId);

      try {
        await fm.readIterationLog(taskId, 99);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(FileNotFoundError);
      }
    });

    test("reads iteration log content", async () => {
      await fm.init();
      const taskId = "001-test-task";
      await fm.createBattleFolder(taskId);

      const log = "Log content for iteration 3";
      await fm.writeIterationLog(taskId, 3, log);

      const content = await fm.readIterationLog(taskId, 3);
      expect(content).toBe(log);
    });
  });

  // ============================================================================
  // Validation edge cases
  // ============================================================================

  describe("validation", () => {
    test("throws ValidationError for malformed JSON", async () => {
      await fm.init();
      const configPath = join(fm.getPokeRalphPath(), "config.json");
      await Bun.write(configPath, "{ invalid json }");

      try {
        await fm.loadConfig();
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain("parse JSON");
      }
    });

    test("throws ValidationError for missing required fields", async () => {
      await fm.init();
      const configPath = join(fm.getPokeRalphPath(), "config.json");
      await Bun.write(configPath, JSON.stringify({
        maxIterationsPerTask: 10,
        // Missing other required fields
      }));

      try {
        await fm.loadConfig();
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
      }
    });

    test("throws ValidationError for wrong types", async () => {
      await fm.init();
      const configPath = join(fm.getPokeRalphPath(), "config.json");
      await Bun.write(configPath, JSON.stringify({
        maxIterationsPerTask: "not a number", // Should be number
        mode: "hitl",
        feedbackLoops: ["test"],
        timeoutMinutes: 30,
        pollingIntervalMs: 2000,
        autoCommit: true,
      }));

      try {
        await fm.loadConfig();
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
      }
    });
  });
});

// ============================================================================
// Test helpers
// ============================================================================

function createTestPRD(): PRD {
  const now = new Date().toISOString();
  return {
    name: "Test Project",
    description: "A test project for unit tests",
    createdAt: now,
    tasks: [
      {
        id: "001-test-task",
        title: "Test Task",
        description: "A test task",
        status: TaskStatus.Pending,
        priority: 1,
        acceptanceCriteria: ["Criterion 1"],
        iterations: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}
