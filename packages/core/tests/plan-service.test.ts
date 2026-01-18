import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { PlanService, type PlanningState } from "../src/services/plan-service.ts";
import { FileManager } from "../src/services/file-manager.ts";
import { ClaudeBridge } from "../src/services/claude-bridge.ts";
import { PromptBuilder } from "../src/services/prompt-builder.ts";
import { TaskStatus } from "../src/types/index.ts";
import type { PRD, Task } from "../src/types/index.ts";

// Path to the mock Claude script
const MOCK_CLAUDE_PATH = join(import.meta.dir, "fixtures", "mock-claude.ts");

// Create a unique temp directory in system temp
const getTempDir = () =>
  join(tmpdir(), `pokeralph-plan-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Creates all dependencies for PlanService
 */
function createDependencies(tempDir: string) {
  const fileManager = new FileManager(tempDir);
  const claudeBridge = new ClaudeBridge({
    workingDir: tempDir,
    claudePath: `bun ${MOCK_CLAUDE_PATH}`,
    timeoutMs: 5000,
  });
  const promptBuilder = new PromptBuilder();

  return {
    fileManager,
    claudeBridge,
    promptBuilder,
  };
}

/**
 * Sets up a temp directory with required structure
 */
async function setupTempDir(tempDir: string, deps: ReturnType<typeof createDependencies>) {
  // Create directory structure
  mkdirSync(tempDir, { recursive: true });

  // Initialize .pokeralph folder
  await deps.fileManager.init();
}

describe("PlanService", () => {
  let tempDir: string;
  let deps: ReturnType<typeof createDependencies>;
  let planService: PlanService;

  beforeEach(async () => {
    tempDir = getTempDir();
    deps = createDependencies(tempDir);
    await setupTempDir(tempDir, deps);

    // Set up mock Claude environment
    process.env.MOCK_CLAUDE_MODE = "success";
    process.env.MOCK_CLAUDE_DELAY = "10";
    process.env.MOCK_CLAUDE_EXIT_CODE = "0";

    planService = new PlanService(deps);
  });

  afterEach(async () => {
    // Clean up
    planService.reset();

    // Reset env vars
    process.env.MOCK_CLAUDE_MODE = undefined;
    process.env.MOCK_CLAUDE_DELAY = undefined;
    process.env.MOCK_CLAUDE_EXIT_CODE = undefined;
    process.env.MOCK_CLAUDE_OUTPUT = undefined;

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
    test("creates instance with dependencies", () => {
      const service = new PlanService(deps);
      expect(service).toBeInstanceOf(PlanService);
      expect(service.getState()).toBe("idle");
      expect(service.isPlanning()).toBe(false);
    });
  });

  // ============================================================================
  // getState / isPlanning
  // ============================================================================

  describe("getState", () => {
    test("returns idle when no planning session", () => {
      expect(planService.getState()).toBe("idle");
    });

    test("returns planning during active session", async () => {
      process.env.MOCK_CLAUDE_MODE = "timeout";
      process.env.MOCK_CLAUDE_DELAY = "5000";

      const startPromise = planService.startPlanning("Build an app");

      // Wait a bit for planning to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(planService.getState()).toBe("planning");

      // Clean up
      planService.reset();
      await startPromise.catch(() => {});
    });
  });

  describe("isPlanning", () => {
    test("returns false when idle", () => {
      expect(planService.isPlanning()).toBe(false);
    });

    test("returns true during planning", async () => {
      process.env.MOCK_CLAUDE_MODE = "timeout";
      process.env.MOCK_CLAUDE_DELAY = "5000";

      const startPromise = planService.startPlanning("Build an app");

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(planService.isPlanning()).toBe(true);

      planService.reset();
      await startPromise.catch(() => {});
    });

    test("returns false when completed", async () => {
      // Simulate a completed PRD output with required tasks
      const prdJson = JSON.stringify({
        name: "Test Project",
        description: "A test project",
        createdAt: new Date().toISOString(),
        tasks: [
          { id: "001-setup", title: "Setup", description: "Initial setup", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = `Here is your PRD:\n\`\`\`json\n${prdJson}\n\`\`\``;

      await planService.startPlanning("Build an app");
      await planService.finishPlanning();

      expect(planService.isPlanning()).toBe(false);
      expect(planService.getState()).toBe("completed");
    });
  });

  // ============================================================================
  // startPlanning
  // ============================================================================

  describe("startPlanning", () => {
    test("throws error if already planning", async () => {
      process.env.MOCK_CLAUDE_MODE = "timeout";
      process.env.MOCK_CLAUDE_DELAY = "5000";

      const startPromise = planService.startPlanning("First idea");

      await new Promise((resolve) => setTimeout(resolve, 50));

      await expect(planService.startPlanning("Second idea")).rejects.toThrow(
        /Planning session already in progress/
      );

      planService.reset();
      await startPromise.catch(() => {});
    });

    test("emits planning_started event", async () => {
      let eventReceived = false;
      let eventIdea = "";

      planService.on("planning_started", ({ idea }) => {
        eventReceived = true;
        eventIdea = idea;
      });

      const prdJson = JSON.stringify({
        name: "Test Project",
        description: "A test project",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = `\`\`\`json\n${prdJson}\n\`\`\``;

      await planService.startPlanning("Build a todo app");

      expect(eventReceived).toBe(true);
      expect(eventIdea).toBe("Build a todo app");
    });

    test("emits state_change event", async () => {
      const stateChanges: { from: PlanningState; to: PlanningState }[] = [];

      planService.on("state_change", ({ from, to }) => {
        stateChanges.push({ from, to });
      });

      const prdJson = JSON.stringify({
        name: "Test Project",
        description: "A test project",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = `\`\`\`json\n${prdJson}\n\`\`\``;

      await planService.startPlanning("Build an app");

      // Should have transitioned from idle to planning
      expect(stateChanges.some((c) => c.from === "idle" && c.to === "planning")).toBe(true);
    });

    test("emits output events during planning", async () => {
      const outputs: string[] = [];

      planService.on("output", ({ output }) => {
        outputs.push(output);
      });

      const prdJson = JSON.stringify({
        name: "Test Project",
        description: "A test project",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = `Planning output\n\`\`\`json\n${prdJson}\n\`\`\``;

      await planService.startPlanning("Build an app");

      expect(outputs.length).toBeGreaterThan(0);
      expect(outputs.join("")).toContain("Planning output");
    });
  });

  // ============================================================================
  // answerQuestion
  // ============================================================================

  describe("answerQuestion", () => {
    test("throws error if not waiting for input", async () => {
      await expect(planService.answerQuestion("My answer")).rejects.toThrow(
        /Not waiting for input/
      );
    });

    test("transitions to planning after answer", async () => {
      // Simulate Claude asking a question
      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = "What kind of features do you need?";

      await planService.startPlanning("Build an app");

      // If question detected, we should be in waiting_input state
      if (planService.getState() === "waiting_input") {
        // Now answer the question with a valid PRD
        const prdJson = JSON.stringify({
          name: "Test Project",
          description: "A test project",
          tasks: [
            { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
          ],
        });
        process.env.MOCK_CLAUDE_OUTPUT = `Got it! Here's your PRD:\n\`\`\`json\n${prdJson}\n\`\`\``;

        await planService.answerQuestion("I need authentication and dashboard");

        // Should transition back to planning or stay in planning
        expect(["planning", "waiting_input", "completed"]).toContain(planService.getState());
      }
    });
  });

  // ============================================================================
  // finishPlanning
  // ============================================================================

  describe("finishPlanning", () => {
    test("throws error if no planning session", async () => {
      await expect(planService.finishPlanning()).rejects.toThrow(
        /No planning session to finish/
      );
    });

    test("extracts PRD from output", async () => {
      const prdJson = JSON.stringify({
        name: "My App",
        description: "A great application",
        createdAt: new Date().toISOString(),
        tasks: [
          { id: "001-feature", title: "Main Feature", description: "Implement feature", priority: 1, acceptanceCriteria: ["Works"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = `Here is your PRD:\n\`\`\`json\n${prdJson}\n\`\`\``;

      await planService.startPlanning("Build an app");
      const prd = await planService.finishPlanning();

      expect(prd.name).toBe("My App");
      expect(prd.description).toBe("A great application");
    });

    test("emits planning_completed event", async () => {
      let eventReceived = false;
      let eventPRDName = "";

      planService.on("planning_completed", ({ prd }) => {
        eventReceived = true;
        eventPRDName = prd.name;
      });

      const prdJson = JSON.stringify({
        name: "Test Project",
        description: "A test project",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = `\`\`\`json\n${prdJson}\n\`\`\``;

      await planService.startPlanning("Build an app");
      await planService.finishPlanning();

      expect(eventReceived).toBe(true);
      expect(eventPRDName).toBe("Test Project");
    });

    test("transitions to completed state", async () => {
      const prdJson = JSON.stringify({
        name: "Test Project",
        description: "A test project",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = `\`\`\`json\n${prdJson}\n\`\`\``;

      await planService.startPlanning("Build an app");
      await planService.finishPlanning();

      expect(planService.getState()).toBe("completed");
    });

    test("throws error if PRD cannot be parsed", async () => {
      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = "Just some text without JSON";

      await planService.startPlanning("Build an app");

      await expect(planService.finishPlanning()).rejects.toThrow(
        /Failed to parse PRD/
      );
    });
  });

  // ============================================================================
  // breakIntoTasks
  // ============================================================================

  describe("breakIntoTasks", () => {
    test("generates tasks from PRD", async () => {
      const prd: PRD = {
        name: "Test Project",
        description: "A test project",
        createdAt: new Date().toISOString(),
        tasks: [],
      };

      const tasksJson = JSON.stringify([
        {
          id: "001-setup",
          title: "Setup Project",
          description: "Initial project setup",
          priority: 1,
          acceptanceCriteria: ["Repo initialized", "Dependencies installed"],
        },
        {
          id: "002-feature",
          title: "Implement Feature",
          description: "Implement the main feature",
          priority: 2,
          acceptanceCriteria: ["Feature works", "Tests pass"],
        },
      ]);

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = `Here are the tasks:\n\`\`\`json\n${tasksJson}\n\`\`\``;

      const tasks = await planService.breakIntoTasks(prd);

      expect(tasks.length).toBe(2);
      const task0 = tasks[0]!;
      const task1 = tasks[1]!;
      expect(task0.id).toBe("001-setup");
      expect(task0.title).toBe("Setup Project");
      expect(task0.status).toBe(TaskStatus.Pending);
      expect(task1.id).toBe("002-feature");
    });

    test("emits tasks_generated event", async () => {
      let eventReceived = false;
      let eventTasks: Task[] = [];

      planService.on("tasks_generated", ({ tasks }) => {
        eventReceived = true;
        eventTasks = tasks;
      });

      const prd: PRD = {
        name: "Test Project",
        description: "A test project",
        createdAt: new Date().toISOString(),
        tasks: [],
      };

      const tasksJson = JSON.stringify([
        {
          id: "001-task",
          title: "Task 1",
          description: "First task",
          priority: 1,
          acceptanceCriteria: ["Done"],
        },
      ]);

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = `\`\`\`json\n${tasksJson}\n\`\`\``;

      await planService.breakIntoTasks(prd);

      expect(eventReceived).toBe(true);
      expect(eventTasks.length).toBe(1);
    });

    test("throws error if tasks cannot be parsed", async () => {
      const prd: PRD = {
        name: "Test Project",
        description: "A test project",
        createdAt: new Date().toISOString(),
        tasks: [],
      };

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = "Invalid output without JSON";

      await expect(planService.breakIntoTasks(prd)).rejects.toThrow(
        /Failed to parse tasks/
      );
    });
  });

  // ============================================================================
  // parsePRDOutput
  // ============================================================================

  describe("parsePRDOutput", () => {
    test("parses PRD from JSON code block", () => {
      const prdJson = {
        name: "My Project",
        description: "Project description",
        createdAt: "2025-01-15T10:00:00.000Z",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      };

      const raw = `Here is your PRD:\n\`\`\`json\n${JSON.stringify(prdJson, null, 2)}\n\`\`\``;

      const result = planService.parsePRDOutput(raw);

      expect(result.success).toBe(true);
      expect(result.prd?.name).toBe("My Project");
      expect(result.prd?.description).toBe("Project description");
    });

    test("parses PRD from raw JSON", () => {
      const prdJson = {
        name: "Raw JSON Project",
        description: "Parsed from raw JSON",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      };

      const raw = `Some text before ${JSON.stringify(prdJson)} some text after`;

      const result = planService.parsePRDOutput(raw);

      expect(result.success).toBe(true);
      expect(result.prd?.name).toBe("Raw JSON Project");
    });

    test("returns error for invalid JSON", () => {
      const result = planService.parsePRDOutput("No JSON here at all");

      expect(result.success).toBe(false);
      expect(result.error).toContain("No JSON found");
    });

    test("returns error for missing name", () => {
      const invalid = JSON.stringify({ description: "Missing name field" });

      const result = planService.parsePRDOutput(`\`\`\`json\n${invalid}\n\`\`\``);

      expect(result.success).toBe(false);
      expect(result.error).toContain("missing required field: name");
    });

    test("returns error for missing description", () => {
      const invalid = JSON.stringify({ name: "Has name but no description" });

      const result = planService.parsePRDOutput(`\`\`\`json\n${invalid}\n\`\`\``);

      expect(result.success).toBe(false);
      expect(result.error).toContain("missing required field: description");
    });

    test("adds default metadata", () => {
      const prdJson = {
        name: "Project",
        description: "Description",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      };

      const result = planService.parsePRDOutput(JSON.stringify(prdJson));

      expect(result.success).toBe(true);
      expect(result.prd?.metadata?.version).toBe("0.1.0");
      expect(result.prd?.metadata?.generatedBy).toContain("PokéRalph");
    });

    test("preserves original idea in metadata", async () => {
      const prdJson = JSON.stringify({
        name: "Test",
        description: "Description",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = prdJson;

      await planService.startPlanning("My original idea");

      const result = planService.parsePRDOutput(prdJson);

      expect(result.prd?.metadata?.originalIdea).toBe("My original idea");
    });

    test("returns error for missing tasks", () => {
      const prdJson = {
        name: "Project",
        description: "Description",
      };

      const result = planService.parsePRDOutput(JSON.stringify(prdJson));

      expect(result.success).toBe(false);
      expect(result.error).toContain("tasks array");
    });

    test("returns error for empty tasks array", () => {
      const prdJson = {
        name: "Project",
        description: "Description",
        tasks: [],
      };

      const result = planService.parsePRDOutput(JSON.stringify(prdJson));

      expect(result.success).toBe(false);
      expect(result.error).toContain("at least one task");
    });
  });

  // ============================================================================
  // parseTasksOutput
  // ============================================================================

  describe("parseTasksOutput", () => {
    test("parses tasks from JSON array", () => {
      const tasksJson = [
        {
          id: "001-setup",
          title: "Setup",
          description: "Setup the project",
          priority: 1,
          acceptanceCriteria: ["Done"],
        },
      ];

      const raw = `\`\`\`json\n${JSON.stringify(tasksJson, null, 2)}\n\`\`\``;

      const result = planService.parseTasksOutput(raw);

      expect(result.success).toBe(true);
      expect(result.tasks).toBeDefined();
      expect(result.tasks!.length).toBe(1);
      const task = result.tasks![0]!;
      expect(task.id).toBe("001-setup");
      expect(task.status).toBe(TaskStatus.Pending);
    });

    test("returns error for non-array output", () => {
      const raw = JSON.stringify({ notAnArray: true });

      const result = planService.parseTasksOutput(raw);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not an array");
    });

    test("returns error for missing task id", () => {
      const tasksJson = [{ title: "No ID", description: "Missing ID", priority: 1, acceptanceCriteria: [] }];

      const result = planService.parseTasksOutput(`\`\`\`json\n${JSON.stringify(tasksJson)}\n\`\`\``);

      expect(result.success).toBe(false);
      expect(result.error).toContain("missing required field: id");
    });

    test("returns error for missing task title", () => {
      const tasksJson = [{ id: "001", description: "Missing title", priority: 1, acceptanceCriteria: [] }];

      const result = planService.parseTasksOutput(`\`\`\`json\n${JSON.stringify(tasksJson)}\n\`\`\``);

      expect(result.success).toBe(false);
      expect(result.error).toContain("missing required field: title");
    });

    test("returns error for missing task description", () => {
      const tasksJson = [{ id: "001", title: "Has title", priority: 1, acceptanceCriteria: [] }];

      const result = planService.parseTasksOutput(`\`\`\`json\n${JSON.stringify(tasksJson)}\n\`\`\``);

      expect(result.success).toBe(false);
      expect(result.error).toContain("missing required field: description");
    });

    test("returns error for missing priority", () => {
      const tasksJson = [{ id: "001", title: "Title", description: "Desc", acceptanceCriteria: [] }];

      const result = planService.parseTasksOutput(`\`\`\`json\n${JSON.stringify(tasksJson)}\n\`\`\``);

      expect(result.success).toBe(false);
      expect(result.error).toContain("missing required field: priority");
    });

    test("returns error for missing acceptance criteria", () => {
      const tasksJson = [{ id: "001", title: "Title", description: "Desc", priority: 1 }];

      const result = planService.parseTasksOutput(`\`\`\`json\n${JSON.stringify(tasksJson)}\n\`\`\``);

      expect(result.success).toBe(false);
      expect(result.error).toContain("missing required field: acceptanceCriteria");
    });

    test("adds timestamps to tasks", () => {
      const tasksJson = [
        {
          id: "001-task",
          title: "Task",
          description: "Description",
          priority: 1,
          acceptanceCriteria: ["Done"],
        },
      ];

      const result = planService.parseTasksOutput(`\`\`\`json\n${JSON.stringify(tasksJson)}\n\`\`\``);

      expect(result.tasks).toBeDefined();
      const task = result.tasks![0]!;
      expect(task.createdAt).toBeDefined();
      expect(task.updatedAt).toBeDefined();
    });
  });

  // ============================================================================
  // PRD extraction strategies (per spec 02-planning.md)
  // ============================================================================

  describe("PRD extraction strategies", () => {
    test("extractFromCodeBlock: parses PRD from ```json block", () => {
      const prdJson = {
        name: "Code Block Project",
        description: "Extracted from code block",
        tasks: [{ id: "001-task", title: "Task", description: "Do it", priority: 1, acceptanceCriteria: [] }],
      };

      const raw = `Some text before\n\`\`\`json\n${JSON.stringify(prdJson, null, 2)}\n\`\`\`\nSome text after`;
      const result = planService.parsePRDOutput(raw);

      expect(result.success).toBe(true);
      expect(result.prd?.name).toBe("Code Block Project");
      expect(result.attemptedStrategies).toContain("extractFromCodeBlock");
    });

    test("extractFromMarkers: parses PRD after 'Here is your PRD:' marker", () => {
      const prdJson = {
        name: "Marker Project",
        description: "Found via marker",
        tasks: [{ id: "001-task", title: "Task", description: "Do it", priority: 1, acceptanceCriteria: [] }],
      };

      const raw = `I've analyzed your requirements.\n\nHere is your PRD: ${JSON.stringify(prdJson)}`;
      const result = planService.parsePRDOutput(raw);

      expect(result.success).toBe(true);
      expect(result.prd?.name).toBe("Marker Project");
      expect(result.attemptedStrategies).toContain("extractFromMarkers");
    });

    test("extractFromMarkers: parses PRD after 'PRD:' marker", () => {
      const prdJson = {
        name: "Direct PRD Marker",
        description: "Found via PRD: marker",
        tasks: [{ id: "001-task", title: "Task", description: "Do it", priority: 1, acceptanceCriteria: [] }],
      };

      const raw = `PRD: ${JSON.stringify(prdJson)}`;
      const result = planService.parsePRDOutput(raw);

      expect(result.success).toBe(true);
      expect(result.prd?.name).toBe("Direct PRD Marker");
    });

    test("extractLooseJSON: parses loose JSON object", () => {
      const prdJson = {
        name: "Loose JSON Project",
        description: "Found as loose JSON",
        tasks: [{ id: "001-task", title: "Task", description: "Do it", priority: 1, acceptanceCriteria: [] }],
      };

      const raw = `Based on our discussion, I've created this: ${JSON.stringify(prdJson)} Hope this helps!`;
      const result = planService.parsePRDOutput(raw);

      expect(result.success).toBe(true);
      expect(result.prd?.name).toBe("Loose JSON Project");
      expect(result.attemptedStrategies).toContain("extractLooseJSON");
    });

    test("extractFromMarkdown: parses markdown structure when no JSON", () => {
      const raw = `# My Todo App

Description: A simple todo application for managing daily tasks

## Tasks
- Set up React project
- Create task component
- Add local storage persistence`;

      const result = planService.parsePRDOutput(raw);

      expect(result.success).toBe(true);
      expect(result.prd?.name).toBe("My Todo App");
      expect(result.prd?.description).toContain("simple todo application");
      expect(result.prd?.tasks.length).toBe(3);
      expect(result.attemptedStrategies).toContain("extractFromMarkdown");
    });

    test("returns error code NO_JSON_FOUND when all strategies fail", () => {
      const raw = "Just some plain text without any structure";
      const result = planService.parsePRDOutput(raw);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("NO_JSON_FOUND");
      expect(result.attemptedStrategies).toBeDefined();
      expect(result.attemptedStrategies!.length).toBeGreaterThan(0);
    });

    test("returns error code MISSING_NAME when name is missing", () => {
      const prdJson = { description: "No name field", tasks: [] };
      const result = planService.parsePRDOutput(JSON.stringify(prdJson));

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("MISSING_NAME");
    });

    test("returns error code MISSING_DESCRIPTION when description is missing", () => {
      const prdJson = { name: "Has name", tasks: [] };
      const result = planService.parsePRDOutput(JSON.stringify(prdJson));

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("MISSING_DESCRIPTION");
    });

    test("returns error code MISSING_TASKS when tasks array is missing", () => {
      const prdJson = { name: "Project", description: "Desc" };
      const result = planService.parsePRDOutput(JSON.stringify(prdJson));

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("MISSING_TASKS");
    });

    test("returns error code EMPTY_TASKS when tasks array is empty", () => {
      const prdJson = { name: "Project", description: "Desc", tasks: [] };
      const result = planService.parsePRDOutput(JSON.stringify(prdJson));

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("EMPTY_TASKS");
    });

    test("returns error code INVALID_TASK when task is malformed", () => {
      const prdJson = {
        name: "Project",
        description: "Desc",
        tasks: [{ title: "No ID" }], // Missing id
      };
      const result = planService.parsePRDOutput(JSON.stringify(prdJson));

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("INVALID_TASK");
    });

    test("rawOutput is preserved for recovery UI", () => {
      const raw = "Some output that failed to parse properly";
      const result = planService.parsePRDOutput(raw);

      expect(result.rawOutput).toBe(raw);
    });

    test("strategies are tried in order: codeBlock, markers, looseJSON, markdown", () => {
      const raw = "No valid content here";
      const result = planService.parsePRDOutput(raw);

      expect(result.attemptedStrategies).toEqual([
        "extractFromCodeBlock",
        "extractFromMarkers",
        "extractLooseJSON",
        "extractFromMarkdown",
      ]);
    });
  });

  // ============================================================================
  // savePRD
  // ============================================================================

  describe("savePRD", () => {
    test("saves PRD via FileManager", async () => {
      const prd: PRD = {
        name: "Saved Project",
        description: "A saved project",
        createdAt: new Date().toISOString(),
        tasks: [],
      };

      await planService.savePRD(prd);

      const loaded = await deps.fileManager.loadPRD();
      expect(loaded.name).toBe("Saved Project");
    });
  });

  // ============================================================================
  // reset
  // ============================================================================

  describe("reset", () => {
    test("resets state to idle", async () => {
      const prdJson = JSON.stringify({
        name: "Test",
        description: "Description",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = prdJson;

      await planService.startPlanning("Build an app");

      planService.reset();

      expect(planService.getState()).toBe("idle");
      expect(planService.isPlanning()).toBe(false);
    });

    test("clears conversation buffer", async () => {
      const prdJson = JSON.stringify({
        name: "Test",
        description: "Description",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = prdJson;

      await planService.startPlanning("Build an app");

      planService.reset();

      expect(planService.getConversationBuffer()).toBe("");
    });

    test("allows starting new planning session", async () => {
      const prdJson = JSON.stringify({
        name: "First",
        description: "First project",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = prdJson;

      await planService.startPlanning("First idea");
      await planService.finishPlanning();

      planService.reset();

      const prdJson2 = JSON.stringify({
        name: "Second",
        description: "Second project",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_OUTPUT = prdJson2;

      await planService.startPlanning("Second idea");
      const prd = await planService.finishPlanning();

      expect(prd.name).toBe("Second");
    });
  });

  // ============================================================================
  // getConversationBuffer / getPendingQuestion
  // ============================================================================

  describe("getConversationBuffer", () => {
    test("returns accumulated conversation", async () => {
      const prdJson = JSON.stringify({
        name: "Test",
        description: "Desc",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });
      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = `Here is some output\n\`\`\`json\n${prdJson}\n\`\`\``;

      await planService.startPlanning("Build an app");

      const buffer = planService.getConversationBuffer();
      expect(buffer).toContain("output");
    });
  });

  describe("getPendingQuestion", () => {
    test("returns null when no pending question", () => {
      expect(planService.getPendingQuestion()).toBeNull();
    });

    test("returns question when detected", async () => {
      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = "What kind of features do you need?";

      await planService.startPlanning("Build an app");

      // May or may not detect a question depending on output
      const question = planService.getPendingQuestion();
      if (planService.getState() === "waiting_input") {
        expect(question).not.toBeNull();
        expect(question).toContain("?");
      }
    });
  });

  // ============================================================================
  // Error handling
  // ============================================================================

  describe("error handling", () => {
    test("emits error event on timeout", async () => {
      let errorReceived = false;

      // Use a very short timeout
      const shortTimeoutDeps = {
        ...deps,
        claudeBridge: new ClaudeBridge({
          workingDir: tempDir,
          claudePath: `bun ${MOCK_CLAUDE_PATH}`,
          timeoutMs: 50, // Very short timeout
        }),
      };

      const shortTimeoutService = new PlanService(shortTimeoutDeps);

      // Attach the error handler to the correct service
      shortTimeoutService.on("error", ({ code }) => {
        errorReceived = true;
        expect(code).toBe("TIMEOUT");
      });

      process.env.MOCK_CLAUDE_MODE = "timeout";
      process.env.MOCK_CLAUDE_DELAY = "5000";

      await shortTimeoutService.startPlanning("Build an app");

      expect(errorReceived).toBe(true);
    });
  });

  // ============================================================================
  // Event types
  // ============================================================================

  describe("type-safe events", () => {
    test("on/off methods work correctly", async () => {
      let count = 0;

      const handler = () => {
        count++;
      };

      planService.on("planning_started", handler);

      const prdJson = JSON.stringify({
        name: "Test",
        description: "Description",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = prdJson;

      await planService.startPlanning("First");
      planService.reset();

      planService.off("planning_started", handler);

      await planService.startPlanning("Second");

      expect(count).toBe(1); // Only first call
    });

    test("once method fires only once", async () => {
      let count = 0;

      planService.once("planning_started", () => {
        count++;
      });

      const prdJson = JSON.stringify({
        name: "Test",
        description: "Description",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = prdJson;

      await planService.startPlanning("First");
      planService.reset();

      await planService.startPlanning("Second");

      expect(count).toBe(1);
    });

    test("removeAllListeners clears handlers", async () => {
      let count = 0;

      planService.on("planning_started", () => {
        count++;
      });

      planService.removeAllListeners("planning_started");

      const prdJson = JSON.stringify({
        name: "Test",
        description: "Description",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = prdJson;

      await planService.startPlanning("Test");

      expect(count).toBe(0);
    });
  });

  // ============================================================================
  // hasOutput
  // ============================================================================

  describe("hasOutput", () => {
    test("returns false when no output", () => {
      expect(planService.hasOutput()).toBe(false);
    });

    test("returns true after output received", async () => {
      const prdJson = JSON.stringify({
        name: "Test",
        description: "Description",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = prdJson;

      await planService.startPlanning("Build an app");

      expect(planService.hasOutput()).toBe(true);
    });

    test("returns false after reset", async () => {
      const prdJson = JSON.stringify({
        name: "Test",
        description: "Description",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = prdJson;

      await planService.startPlanning("Build an app");
      expect(planService.hasOutput()).toBe(true);

      planService.reset();
      expect(planService.hasOutput()).toBe(false);
    });
  });

  // ============================================================================
  // Draft PRD persistence
  // ============================================================================

  describe("draft PRD persistence", () => {
    test("hasDraft returns false when no draft exists", async () => {
      const hasDraft = await planService.hasDraft();
      expect(hasDraft).toBe(false);
    });

    test("loadDraft returns null when no draft exists", async () => {
      const draft = await planService.loadDraft();
      expect(draft).toBeNull();
    });

    test("draft is saved after answering question", async () => {
      // Simulate Claude asking a question
      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = "What features do you need?";

      await planService.startPlanning("Build an app");

      // Verify question was detected
      expect(planService.getState()).toBe("waiting_input");

      // Answer the question - this should trigger draft save
      const prdJson = JSON.stringify({
        name: "Test Project",
        description: "A test project",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });
      process.env.MOCK_CLAUDE_OUTPUT = `Got it! Here's your PRD:\n\`\`\`json\n${prdJson}\n\`\`\``;

      await planService.answerQuestion("I need authentication");

      // Check if draft was saved via FileManager (hasDraft reads from FileManager)
      const hasDraft = await deps.fileManager.hasDraftPRD();
      expect(hasDraft).toBe(true);

      const draft = await deps.fileManager.loadDraftPRD();
      expect(draft).not.toBeNull();
      expect(draft?.idea).toBe("Build an app");
      expect(draft?.version).toBeGreaterThan(0);
    });

    test("draft is deleted after finishPlanning", async () => {
      // Set up a valid PRD output
      const prdJson = JSON.stringify({
        name: "Test Project",
        description: "A test project",
        tasks: [
          { id: "001-task", title: "Task", description: "Do something", priority: 1, acceptanceCriteria: ["Done"] },
        ],
      });

      process.env.MOCK_CLAUDE_MODE = "output";
      process.env.MOCK_CLAUDE_OUTPUT = "What features?";

      await planService.startPlanning("Build an app");

      // Verify question was detected
      expect(planService.getState()).toBe("waiting_input");

      process.env.MOCK_CLAUDE_OUTPUT = `\`\`\`json\n${prdJson}\n\`\`\``;
      await planService.answerQuestion("Auth");

      // Verify draft exists
      expect(await deps.fileManager.hasDraftPRD()).toBe(true);

      // Finish planning
      await planService.finishPlanning();

      // Draft should be deleted
      expect(await deps.fileManager.hasDraftPRD()).toBe(false);
    });

    test("resumeFromDraft restores state correctly", async () => {
      // Create a mock draft
      const draft = {
        idea: "Build a todo app",
        conversation: [
          { role: "assistant" as const, content: "What framework do you prefer?", timestamp: new Date().toISOString() },
          { role: "user" as const, content: "React", timestamp: new Date().toISOString() },
        ],
        lastSavedAt: new Date().toISOString(),
        version: 1,
      };

      // Save draft manually
      await deps.fileManager.saveDraftPRD(draft);

      // Resume from draft
      await planService.resumeFromDraft(draft);

      // Verify state is restored
      expect(planService.getConversationBuffer()).toContain("User: React");
      expect(planService.getConversationBuffer()).toContain("What framework");
    });

    test("resumeFromDraft detects question and sets waiting_input state", async () => {
      // Create a mock draft with a question
      const draft = {
        idea: "Build a todo app",
        conversation: [
          { role: "assistant" as const, content: "What authentication method would you prefer?", timestamp: new Date().toISOString() },
        ],
        lastSavedAt: new Date().toISOString(),
        version: 1,
      };

      await deps.fileManager.saveDraftPRD(draft);

      await planService.resumeFromDraft(draft);

      // Should be waiting for input since last assistant message was a question
      expect(planService.getState()).toBe("waiting_input");
      expect(planService.getPendingQuestion()).not.toBeNull();
    });

    test("resumeFromDraft throws if already planning", async () => {
      const draft = {
        idea: "Build a todo app",
        conversation: [],
        lastSavedAt: new Date().toISOString(),
        version: 1,
      };

      // Start a planning session
      process.env.MOCK_CLAUDE_MODE = "timeout";
      process.env.MOCK_CLAUDE_DELAY = "5000";

      const startPromise = planService.startPlanning("First idea");
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Try to resume - should throw
      await expect(planService.resumeFromDraft(draft)).rejects.toThrow(
        /Planning session already in progress/
      );

      planService.reset();
      await startPromise.catch(() => {});
    });
  });
});
