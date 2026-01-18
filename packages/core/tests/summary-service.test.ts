/**
 * Tests for SummaryService
 *
 * Per spec 05-history.md lines 427-531: Learning Tool Features
 */

import { describe, test, expect } from "bun:test";
import {
  parseClaudeActions,
  parseDiffSummary,
  extractReasoning,
  extractLearnings,
  generateHeadline,
  summarizeFeedbackResults,
  buildFileSummariesFromIteration,
  generateIterationSummary,
  generateBattleSummaries,
  type ClaudeAction,
} from "../src/services/summary-service.ts";
import type { Iteration } from "../src/types/iteration.ts";
import type { FeedbackResults } from "../src/types/progress.ts";

// ==========================================================================
// parseClaudeActions tests
// ==========================================================================

describe("parseClaudeActions", () => {
  test("parses 'I'll create' actions", () => {
    const output = "I'll create a new middleware for authentication.";
    const actions = parseClaudeActions(output);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]?.type).toBe("create");
    expect(actions[0]?.description).toContain("middleware");
  });

  test("parses 'Let me implement' actions", () => {
    const output = "Let me implement the JWT validation logic.";
    const actions = parseClaudeActions(output);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]?.type).toBe("implement");
    expect(actions[0]?.description).toContain("JWT validation");
  });

  test("parses 'I will fix' actions", () => {
    const output = "I will fix the type error in the auth handler.";
    const actions = parseClaudeActions(output);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]?.type).toBe("fix");
    expect(actions[0]?.description).toContain("type error");
  });

  test("parses 'Now I'll add' actions", () => {
    const output = "Now I'll add the error handling middleware.";
    const actions = parseClaudeActions(output);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]?.type).toBe("add");
    expect(actions[0]?.description).toContain("error handling");
  });

  test("parses past tense actions", () => {
    const output = "Created the new user model. Implemented password hashing.";
    const actions = parseClaudeActions(output);
    expect(actions.length).toBe(2);
  });

  test("parses multiple actions in one output", () => {
    const output = `
      I'll create a new middleware for authentication.
      Let me implement the JWT validation logic.
      I will add the error handling.
    `;
    const actions = parseClaudeActions(output);
    expect(actions.length).toBe(3);
  });

  test("limits actions to 10", () => {
    const output = Array(15)
      .fill("I'll create something new.")
      .join(" ");
    const actions = parseClaudeActions(output);
    expect(actions.length).toBeLessThanOrEqual(10);
  });

  test("deduplicates similar actions", () => {
    const output = `
      I'll create a middleware.
      I'll create a middleware.
      Let me create a middleware.
    `;
    const actions = parseClaudeActions(output);
    expect(actions.length).toBe(1);
  });

  test("returns empty array for output with no actions", () => {
    const output = "This is just a comment without any action verbs.";
    const actions = parseClaudeActions(output);
    expect(actions).toEqual([]);
  });
});

// ==========================================================================
// parseDiffSummary tests
// ==========================================================================

describe("parseDiffSummary", () => {
  test("parses created file", () => {
    const diff = `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,5 @@
+export function hello() {
+  return "world";
+}`;
    const summaries = parseDiffSummary(diff);
    expect(summaries.length).toBe(1);
    expect(summaries[0]?.path).toBe("src/new-file.ts");
    expect(summaries[0]?.action).toBe("created");
    expect(summaries[0]?.linesChanged).toBe(3); // 3 addition lines
  });

  test("parses modified file", () => {
    const diff = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,5 @@
+import { newThing } from "./new";
+
 export function main() {
-  console.log("old");
+  console.log("new");
 }`;
    const summaries = parseDiffSummary(diff);
    expect(summaries.length).toBe(1);
    expect(summaries[0]?.path).toBe("src/index.ts");
    expect(summaries[0]?.action).toBe("modified");
    expect(summaries[0]?.linesChanged).toBe(4); // 3 additions + 1 deletion
  });

  test("parses deleted file", () => {
    const diff = `diff --git a/src/old-file.ts b/src/old-file.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old-file.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-export function hello() {
-  return "world";
-}`;
    const summaries = parseDiffSummary(diff);
    expect(summaries.length).toBe(1);
    expect(summaries[0]?.path).toBe("src/old-file.ts");
    expect(summaries[0]?.action).toBe("deleted");
    expect(summaries[0]?.linesChanged).toBe(3);
  });

  test("parses multiple files", () => {
    const diff = `diff --git a/src/a.ts b/src/a.ts
index 1111..2222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-old
+new
diff --git a/src/b.ts b/src/b.ts
new file mode 100644
--- /dev/null
+++ b/src/b.ts
@@ -0,0 +1 @@
+new file`;
    const summaries = parseDiffSummary(diff);
    expect(summaries.length).toBe(2);
    expect(summaries[0]?.path).toBe("src/a.ts");
    expect(summaries[1]?.path).toBe("src/b.ts");
  });

  test("returns empty array for empty diff", () => {
    expect(parseDiffSummary("")).toEqual([]);
    expect(parseDiffSummary("")).toEqual([]);
  });
});

// ==========================================================================
// extractReasoning tests
// ==========================================================================

describe("extractReasoning", () => {
  test("extracts 'because' reasoning", () => {
    const output = "I chose this approach because it provides better type safety.";
    const reasoning = extractReasoning(output);
    expect(reasoning).toContain("type safety");
  });

  test("extracts 'to ensure' reasoning", () => {
    const output = "I added the check to ensure the user is authenticated.";
    const reasoning = extractReasoning(output);
    expect(reasoning).toContain("authenticated");
  });

  test("extracts 'I chose' reasoning", () => {
    const output = "I chose middleware approach for clean separation of concerns.";
    const reasoning = extractReasoning(output);
    expect(reasoning).toContain("middleware");
  });

  test("returns default for output with no reasoning", () => {
    const output = "Just some code without reasoning.";
    const reasoning = extractReasoning(output);
    expect(reasoning).toBe("Continuing task implementation based on requirements.");
  });
});

// ==========================================================================
// extractLearnings tests
// ==========================================================================

describe("extractLearnings", () => {
  test("extracts 'Note:' learnings", () => {
    const output = "Note: Always validate user input before processing.";
    const learnings = extractLearnings(output, "success");
    expect(learnings.length).toBeGreaterThan(0);
    expect(learnings[0]).toContain("validate");
  });

  test("extracts 'using X for Y' patterns", () => {
    // Pattern must extract learning with > 10 chars to pass filter
    const output = "Using bcrypt password hashing library for secure authentication.";
    const learnings = extractLearnings(output, "success");
    expect(learnings.length).toBeGreaterThan(0);
  });

  test("extracts failure insights on failure result", () => {
    const output = "Error: Type mismatch in authentication handler.";
    const learnings = extractLearnings(output, "failure");
    expect(learnings.length).toBeGreaterThan(0);
    expect(learnings.some((l) => l.includes("Issue encountered"))).toBe(true);
  });

  test("returns empty for output with no learnings", () => {
    const output = "Just implementing the feature.";
    const learnings = extractLearnings(output, "success");
    expect(learnings).toEqual([]);
  });

  test("limits learnings to 5", () => {
    const output = `
      Note: Learning 1.
      Note: Learning 2.
      Note: Learning 3.
      Note: Learning 4.
      Note: Learning 5.
      Note: Learning 6.
      Note: Learning 7.
    `;
    const learnings = extractLearnings(output, "success");
    expect(learnings.length).toBeLessThanOrEqual(5);
  });
});

// ==========================================================================
// generateHeadline tests
// ==========================================================================

describe("generateHeadline", () => {
  test("generates success headline with action", () => {
    const actions: ClaudeAction[] = [
      { type: "implement", description: "JWT validation middleware" },
    ];
    const headline = generateHeadline(actions, "success");
    expect(headline).toBe("Implement: JWT validation middleware");
  });

  test("generates failure headline with 'Attempted'", () => {
    const actions: ClaudeAction[] = [
      { type: "fix", description: "authentication bug" },
    ];
    const headline = generateHeadline(actions, "failure");
    expect(headline).toContain("Attempted");
    expect(headline).toContain("feedback failed");
  });

  test("generates timeout headline", () => {
    const actions: ClaudeAction[] = [
      { type: "create", description: "complex module" },
    ];
    const headline = generateHeadline(actions, "timeout");
    expect(headline).toContain("Timed out");
  });

  test("generates cancelled headline", () => {
    const actions: ClaudeAction[] = [
      { type: "update", description: "configuration" },
    ];
    const headline = generateHeadline(actions, "cancelled");
    expect(headline).toContain("Cancelled");
  });

  test("generates default headline without actions (success)", () => {
    const headline = generateHeadline([], "success");
    expect(headline).toBe("Completed iteration successfully");
  });

  test("generates default headline without actions (failure)", () => {
    const headline = generateHeadline([], "failure");
    expect(headline).toContain("failed");
  });

  test("truncates long descriptions", () => {
    const longDesc = "a".repeat(100);
    const actions: ClaudeAction[] = [
      { type: "implement", description: longDesc },
    ];
    const headline = generateHeadline(actions, "success");
    expect(headline.length).toBeLessThan(100);
  });
});

// ==========================================================================
// summarizeFeedbackResults tests
// ==========================================================================

describe("summarizeFeedbackResults", () => {
  test("summarizes passed tests", () => {
    const results: FeedbackResults = {
      test: { passed: true, output: "12 tests passed", duration: 2300 },
    };
    const summaries = summarizeFeedbackResults(results);
    expect(summaries.length).toBe(1);
    expect(summaries[0]?.loop).toBe("test");
    expect(summaries[0]?.passed).toBe(true);
    expect(summaries[0]?.summary).toContain("12");
    expect(summaries[0]?.durationMs).toBe(2300);
  });

  test("summarizes failed tests", () => {
    const results: FeedbackResults = {
      test: { passed: false, output: "5 tests failed", duration: 1000 },
    };
    const summaries = summarizeFeedbackResults(results);
    expect(summaries[0]?.passed).toBe(false);
    expect(summaries[0]?.summary).toContain("5");
  });

  test("summarizes multiple loops", () => {
    const results: FeedbackResults = {
      test: { passed: true, output: "10 tests passed", duration: 1000 },
      lint: { passed: true, output: "No errors", duration: 500 },
      typecheck: { passed: false, output: "3 errors found", duration: 1500 },
    };
    const summaries = summarizeFeedbackResults(results);
    expect(summaries.length).toBe(3);
  });

  test("returns empty for undefined results", () => {
    expect(summarizeFeedbackResults(undefined)).toEqual([]);
  });

  test("returns empty for empty results", () => {
    expect(summarizeFeedbackResults({})).toEqual([]);
  });
});

// ==========================================================================
// buildFileSummariesFromIteration tests
// ==========================================================================

describe("buildFileSummariesFromIteration", () => {
  test("builds summaries from filesChanged", () => {
    const iteration: Iteration = {
      number: 1,
      startedAt: "2025-01-15T10:00:00Z",
      output: "",
      result: "success",
      filesChanged: ["src/index.ts", "tests/index.test.ts"],
    };
    const summaries = buildFileSummariesFromIteration(iteration);
    expect(summaries.length).toBe(2);
    expect(summaries[0]?.path).toBe("src/index.ts");
    expect(summaries[0]?.action).toBe("modified");
  });

  test("identifies test files", () => {
    const iteration: Iteration = {
      number: 1,
      startedAt: "2025-01-15T10:00:00Z",
      output: "",
      result: "success",
      filesChanged: ["src/auth.test.ts"],
    };
    const summaries = buildFileSummariesFromIteration(iteration);
    expect(summaries[0]?.summary).toContain("Test file");
  });

  test("identifies config files", () => {
    const iteration: Iteration = {
      number: 1,
      startedAt: "2025-01-15T10:00:00Z",
      output: "",
      result: "success",
      filesChanged: ["tsconfig.json", "vite.config.ts"],
    };
    const summaries = buildFileSummariesFromIteration(iteration);
    expect(summaries[0]?.summary).toContain("Configuration");
  });

  test("returns empty for no files changed", () => {
    const iteration: Iteration = {
      number: 1,
      startedAt: "2025-01-15T10:00:00Z",
      output: "",
      result: "success",
      filesChanged: [],
    };
    expect(buildFileSummariesFromIteration(iteration)).toEqual([]);
  });
});

// ==========================================================================
// generateIterationSummary tests
// ==========================================================================

describe("generateIterationSummary", () => {
  test("generates complete summary", () => {
    const iteration: Iteration = {
      number: 1,
      startedAt: "2025-01-15T10:00:00Z",
      endedAt: "2025-01-15T10:05:00Z",
      output: "I'll create the auth middleware.",
      result: "success",
      filesChanged: ["src/auth.ts"],
      feedbackResults: {
        test: { passed: true, output: "5 tests passed", duration: 1000 },
      },
    };

    const summary = generateIterationSummary({
      iteration,
      output: iteration.output,
    });

    expect(summary.iterationNumber).toBe(1);
    expect(summary.headline).toBeTruthy();
    expect(summary.whyItHappened).toBeTruthy();
    expect(summary.filesAffected.length).toBe(1);
    expect(summary.feedbackResults.length).toBe(1);
  });

  test("handles iteration with no output", () => {
    const iteration: Iteration = {
      number: 1,
      startedAt: "2025-01-15T10:00:00Z",
      output: "",
      result: "success",
      filesChanged: [],
    };

    const summary = generateIterationSummary({
      iteration,
      output: "",
    });

    expect(summary.iterationNumber).toBe(1);
    expect(summary.headline).toBe("Completed iteration successfully");
    expect(summary.whatChanged).toEqual([]);
  });

  test("uses diff when provided", () => {
    const iteration: Iteration = {
      number: 1,
      startedAt: "2025-01-15T10:00:00Z",
      output: "",
      result: "success",
      filesChanged: [],
    };

    const diff = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
+++ b/src/new.ts
+new content`;

    const summary = generateIterationSummary({
      iteration,
      output: "",
      diff,
    });

    expect(summary.filesAffected.length).toBe(1);
    expect(summary.filesAffected[0]?.action).toBe("created");
  });
});

// ==========================================================================
// generateBattleSummaries tests
// ==========================================================================

describe("generateBattleSummaries", () => {
  test("generates summaries for all iterations", () => {
    const iterations: Iteration[] = [
      {
        number: 1,
        startedAt: "2025-01-15T10:00:00Z",
        output: "Created initial implementation.",
        result: "success",
        filesChanged: ["src/index.ts"],
      },
      {
        number: 2,
        startedAt: "2025-01-15T10:05:00Z",
        output: "Fixed type errors.",
        result: "success",
        filesChanged: ["src/types.ts"],
      },
    ];

    const outputs = new Map([
      [1, "Created initial implementation."],
      [2, "Fixed type errors."],
    ]);

    const summaries = generateBattleSummaries(iterations, outputs);

    expect(summaries.length).toBe(2);
    expect(summaries[0]?.iterationNumber).toBe(1);
    expect(summaries[1]?.iterationNumber).toBe(2);
  });

  test("handles empty iterations", () => {
    const summaries = generateBattleSummaries([], new Map());
    expect(summaries).toEqual([]);
  });

  test("falls back to iteration.output when no output in map", () => {
    const iterations: Iteration[] = [
      {
        number: 1,
        startedAt: "2025-01-15T10:00:00Z",
        output: "Fallback output.",
        result: "success",
        filesChanged: [],
      },
    ];

    const summaries = generateBattleSummaries(iterations, new Map());

    expect(summaries.length).toBe(1);
    // Should use iteration.output as fallback
    expect(summaries[0]?.headline).toBeTruthy();
  });

  test("uses diffs when provided", () => {
    const iterations: Iteration[] = [
      {
        number: 1,
        startedAt: "2025-01-15T10:00:00Z",
        output: "",
        result: "success",
        filesChanged: [],
      },
    ];

    const outputs = new Map([[1, ""]]);
    const diffs = new Map([
      [1, "diff --git a/new.ts b/new.ts\nnew file mode 100644\n+new"],
    ]);

    const summaries = generateBattleSummaries(iterations, outputs, diffs);

    expect(summaries[0]?.filesAffected.length).toBe(1);
  });
});
