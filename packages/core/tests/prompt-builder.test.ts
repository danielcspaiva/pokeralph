import { test, expect, describe, beforeEach } from "bun:test";
import {
  PromptBuilder,
  COMPLETION_SIGIL,
  PRD_OUTPUT_SCHEMA,
  TASKS_OUTPUT_SCHEMA,
  PROGRESS_UPDATE_SCHEMA,
} from "../src/services/prompt-builder.ts";
import { TaskStatus, createInitialProgress } from "../src/types/index.ts";
import type { Task, PRD, TaskContext } from "../src/index.ts";

describe("PromptBuilder", () => {
  let builder: PromptBuilder;

  beforeEach(() => {
    builder = new PromptBuilder();
  });

  // ============================================================================
  // buildPlanningPrompt
  // ============================================================================

  describe("buildPlanningPrompt", () => {
    test("includes the original idea", () => {
      const idea = "Build a real-time dashboard for monitoring server metrics";
      const prompt = builder.buildPlanningPrompt(idea);

      expect(prompt).toContain(idea);
    });

    test("includes planning mode context", () => {
      const prompt = builder.buildPlanningPrompt("Any idea");

      expect(prompt).toContain("PLANNING MODE");
      expect(prompt).toContain("PRD");
    });

    test("includes instructions to ask clarifying questions", () => {
      const prompt = builder.buildPlanningPrompt("Build a todo app");

      expect(prompt).toContain("clarifying question");
    });

    test("includes PRD JSON schema", () => {
      const prompt = builder.buildPlanningPrompt("Build something");

      expect(prompt).toContain('"name"');
      expect(prompt).toContain('"description"');
      expect(prompt).toContain("schema");
    });

    test("instructs to output valid JSON", () => {
      const prompt = builder.buildPlanningPrompt("Build an API");

      expect(prompt).toContain("valid JSON");
    });
  });

  // ============================================================================
  // buildTaskPrompt
  // ============================================================================

  describe("buildTaskPrompt", () => {
    const createTestTask = (overrides?: Partial<Task>): Task => ({
      id: "001-test-task",
      title: "Test Task Title",
      description: "This is a test task description",
      status: TaskStatus.Pending,
      priority: 1,
      acceptanceCriteria: [
        "Criterion 1: Do something",
        "Criterion 2: Do something else",
      ],
      iterations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    });

    const createTestContext = (overrides?: Partial<TaskContext>): TaskContext => ({
      prdSummary: "This is a test project for building awesome things",
      feedbackLoops: ["test", "lint", "typecheck"],
      autoCommit: true,
      maxIterations: 10,
      progressFilePath: ".pokeralph/battles/001-test-task/progress.json",
      ...overrides,
    });

    test("includes task details", () => {
      const task = createTestTask();
      const context = createTestContext();
      const prompt = builder.buildTaskPrompt(task, context);

      expect(prompt).toContain(task.id);
      expect(prompt).toContain(task.title);
      expect(prompt).toContain(task.description);
      expect(prompt).toContain(`Priority:** ${task.priority}`);
    });

    test("includes acceptance criteria", () => {
      const task = createTestTask();
      const context = createTestContext();
      const prompt = builder.buildTaskPrompt(task, context);

      for (const criterion of task.acceptanceCriteria) {
        expect(prompt).toContain(criterion);
      }
    });

    test("includes project context (PRD summary)", () => {
      const task = createTestTask();
      const context = createTestContext({
        prdSummary: "Building a multi-tenant SaaS platform",
      });
      const prompt = builder.buildTaskPrompt(task, context);

      expect(prompt).toContain("multi-tenant SaaS platform");
    });

    test("includes feedback loop instructions", () => {
      const task = createTestTask();
      const context = createTestContext({
        feedbackLoops: ["test", "lint", "typecheck"],
      });
      const prompt = builder.buildTaskPrompt(task, context);

      expect(prompt).toContain("bun run test");
      expect(prompt).toContain("bun run lint");
      expect(prompt).toContain("bun run typecheck");
    });

    test("includes progress file path", () => {
      const task = createTestTask();
      const context = createTestContext({
        progressFilePath: ".pokeralph/battles/003-custom-task/progress.json",
      });
      const prompt = builder.buildTaskPrompt(task, context);

      expect(prompt).toContain(".pokeralph/battles/003-custom-task/progress.json");
    });

    test("includes completion sigil instructions", () => {
      const task = createTestTask();
      const context = createTestContext();
      const prompt = builder.buildTaskPrompt(task, context);

      expect(prompt).toContain(COMPLETION_SIGIL);
    });

    test("includes commit instructions when autoCommit is true", () => {
      const task = createTestTask({ id: "005-commit-task", title: "Commit Test" });
      const context = createTestContext({ autoCommit: true });
      const prompt = builder.buildTaskPrompt(task, context);

      expect(prompt).toContain("[PokéRalph] 005-commit-task: Commit Test");
    });

    test("excludes commit instructions when autoCommit is false", () => {
      const task = createTestTask();
      const context = createTestContext({ autoCommit: false });
      const prompt = builder.buildTaskPrompt(task, context);

      expect(prompt).not.toContain("## Commit");
    });

    test("includes relevant files when provided", () => {
      const task = createTestTask();
      const context = createTestContext({
        relevantFiles: [
          "src/services/my-service.ts",
          "tests/my-service.test.ts",
        ],
      });
      const prompt = builder.buildTaskPrompt(task, context);

      expect(prompt).toContain("src/services/my-service.ts");
      expect(prompt).toContain("tests/my-service.test.ts");
    });

    test("excludes relevant files section when not provided", () => {
      const task = createTestTask();
      const context = createTestContext({ relevantFiles: undefined });
      const prompt = builder.buildTaskPrompt(task, context);

      expect(prompt).not.toContain("### Relevant Files");
    });

    test("includes current progress when resuming", () => {
      const task = createTestTask();
      const progress = createInitialProgress(task.id);
      progress.currentIteration = 3;
      progress.status = "in_progress";
      progress.lastOutput = "Running typecheck...";

      const context = createTestContext({
        currentProgress: progress,
        maxIterations: 10,
      });
      const prompt = builder.buildTaskPrompt(task, context);

      expect(prompt).toContain("Iteration:** 3 / 10");
      expect(prompt).toContain("in_progress");
      expect(prompt).toContain("Running typecheck...");
    });

    test("includes error from previous iteration when present", () => {
      const task = createTestTask();
      const progress = createInitialProgress(task.id);
      progress.currentIteration = 2;
      progress.error = "Type error in file.ts";

      const context = createTestContext({ currentProgress: progress });
      const prompt = builder.buildTaskPrompt(task, context);

      expect(prompt).toContain("Type error in file.ts");
    });

    test("includes max iterations constraint", () => {
      const task = createTestTask();
      const context = createTestContext({ maxIterations: 15 });
      const prompt = builder.buildTaskPrompt(task, context);

      expect(prompt).toContain("Maximum iterations: 15");
    });

    test("includes progress JSON schema", () => {
      const task = createTestTask();
      const context = createTestContext();
      const prompt = builder.buildTaskPrompt(task, context);

      expect(prompt).toContain('"currentIteration"');
      expect(prompt).toContain('"completionDetected"');
    });
  });

  // ============================================================================
  // buildBreakdownPrompt
  // ============================================================================

  describe("buildBreakdownPrompt", () => {
    test("includes PRD content when given as string", () => {
      const prdContent = `# My Project

A fantastic project that does amazing things.

## Features
- Feature 1
- Feature 2`;

      const prompt = builder.buildBreakdownPrompt(prdContent);

      expect(prompt).toContain("My Project");
      expect(prompt).toContain("fantastic project");
      expect(prompt).toContain("Feature 1");
    });

    test("formats PRD object correctly", () => {
      const prd: PRD = {
        name: "Test PRD Project",
        description: "A project for testing PRD breakdown",
        createdAt: new Date().toISOString(),
        tasks: [],
        metadata: {
          version: "1.0.0",
          originalIdea: "Build something cool",
        },
      };

      const prompt = builder.buildBreakdownPrompt(prd);

      expect(prompt).toContain("Test PRD Project");
      expect(prompt).toContain("testing PRD breakdown");
      expect(prompt).toContain("Build something cool");
    });

    test("includes task ID format guidelines", () => {
      const prompt = builder.buildBreakdownPrompt("Any PRD");

      expect(prompt).toContain("XXX-");
      expect(prompt).toContain("001-");
    });

    test("includes tasks JSON schema", () => {
      const prompt = builder.buildBreakdownPrompt("Any PRD");

      expect(prompt).toContain('"acceptanceCriteria"');
      expect(prompt).toContain('"priority"');
      expect(prompt).toContain("schema");
    });

    test("instructs to output valid JSON", () => {
      const prompt = builder.buildBreakdownPrompt("Any PRD");

      expect(prompt).toContain("valid JSON");
    });

    test("includes existing tasks when PRD has tasks", () => {
      const prd: PRD = {
        name: "Existing Project",
        description: "Project with existing tasks",
        createdAt: new Date().toISOString(),
        tasks: [
          {
            id: "001-existing-task",
            title: "Existing Task",
            description: "Already exists",
            status: TaskStatus.Completed,
            priority: 1,
            acceptanceCriteria: ["Done"],
            iterations: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      const prompt = builder.buildBreakdownPrompt(prd);

      expect(prompt).toContain("001-existing-task");
      expect(prompt).toContain("Existing Task");
      expect(prompt).toContain("completed");
    });
  });

  // ============================================================================
  // summarizePRD
  // ============================================================================

  describe("summarizePRD", () => {
    test("includes project name and description", () => {
      const prd: PRD = {
        name: "My Awesome Project",
        description: "This project does awesome things",
        createdAt: new Date().toISOString(),
        tasks: [],
      };

      const summary = builder.summarizePRD(prd);

      expect(summary).toContain("My Awesome Project");
      expect(summary).toContain("awesome things");
    });

    test("calculates task statistics correctly", () => {
      const prd: PRD = {
        name: "Stats Project",
        description: "Testing stats",
        createdAt: new Date().toISOString(),
        tasks: [
          createTaskWithStatus(TaskStatus.Completed),
          createTaskWithStatus(TaskStatus.Completed),
          createTaskWithStatus(TaskStatus.Pending),
          createTaskWithStatus(TaskStatus.InProgress),
          createTaskWithStatus(TaskStatus.Pending),
        ],
      };

      const summary = builder.summarizePRD(prd);

      expect(summary).toContain("5 total");
      expect(summary).toContain("2 completed");
      expect(summary).toContain("2 pending");
      expect(summary).toContain("1 in progress");
    });

    test("handles empty tasks array", () => {
      const prd: PRD = {
        name: "Empty Project",
        description: "No tasks yet",
        createdAt: new Date().toISOString(),
        tasks: [],
      };

      const summary = builder.summarizePRD(prd);

      expect(summary).toContain("0 total");
      expect(summary).toContain("0 completed");
    });
  });

  // ============================================================================
  // getCompletionSigil
  // ============================================================================

  describe("getCompletionSigil", () => {
    test("returns the correct completion sigil", () => {
      expect(builder.getCompletionSigil()).toBe("<promise>COMPLETE</promise>");
    });

    test("matches exported constant", () => {
      expect(builder.getCompletionSigil()).toBe(COMPLETION_SIGIL);
    });
  });

  // ============================================================================
  // Schema exports
  // ============================================================================

  describe("schema exports", () => {
    test("PRD_OUTPUT_SCHEMA has required fields", () => {
      expect(PRD_OUTPUT_SCHEMA.type).toBe("object");
      expect(PRD_OUTPUT_SCHEMA.required).toContain("name");
      expect(PRD_OUTPUT_SCHEMA.required).toContain("description");
    });

    test("TASKS_OUTPUT_SCHEMA is an array type", () => {
      expect(TASKS_OUTPUT_SCHEMA.type).toBe("array");
      expect(TASKS_OUTPUT_SCHEMA.items.type).toBe("object");
    });

    test("PROGRESS_UPDATE_SCHEMA has all required fields", () => {
      expect(PROGRESS_UPDATE_SCHEMA.required).toContain("taskId");
      expect(PROGRESS_UPDATE_SCHEMA.required).toContain("currentIteration");
      expect(PROGRESS_UPDATE_SCHEMA.required).toContain("completionDetected");
    });
  });
});

// ============================================================================
// Test helpers
// ============================================================================

function createTaskWithStatus(status: TaskStatus): Task {
  const now = new Date().toISOString();
  return {
    id: `task-${Math.random().toString(36).slice(2)}`,
    title: "Test Task",
    description: "A test task",
    status,
    priority: 1,
    acceptanceCriteria: ["Test criterion"],
    iterations: [],
    createdAt: now,
    updatedAt: now,
  };
}
