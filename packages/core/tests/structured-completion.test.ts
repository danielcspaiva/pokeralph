/**
 * Tests for structured completion protocol
 *
 * Per spec 03-battles.md (lines 1232-1342)
 */

import { describe, test, expect } from "bun:test";
import {
  extractCompletionBlock,
  parseCompletionSignal,
  isCompletionSignal,
  validateCompletion,
  isCompletionValid,
  detectCompletion,
  isStructuredCompletion,
  isSigilCompletion,
  getStructuredCompletionInstructions,
  createSampleCompletionSignal,
  COMPLETION_BLOCK_START,
  COMPLETION_BLOCK_END,
  SIMPLE_COMPLETION_SIGIL,
  COMPLETION_PROTOCOL_VERSION,
  type CompletionSignal,
} from "../src/services/structured-completion.ts";
import type { Task } from "../src/types/task.ts";
import { TaskStatus } from "../src/types/task.ts";
import type { FeedbackResults } from "../src/types/progress.ts";

// =============================================================================
// Test Fixtures
// =============================================================================

const createTestTask = (overrides: Partial<Task> = {}): Task => ({
  id: "001-test-task",
  title: "Test Task",
  description: "A test task",
  priority: 1,
  status: TaskStatus.Pending,
  acceptanceCriteria: [
    "First criterion",
    "Second criterion",
  ],
  iterations: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createTestCompletionSignal = (overrides: Partial<CompletionSignal> = {}): CompletionSignal => ({
  type: "BATTLE_COMPLETE",
  version: COMPLETION_PROTOCOL_VERSION,
  taskId: "001-test-task",
  summary: "Task completed successfully",
  acceptanceCriteriaMet: [
    { criterion: "First criterion", met: true, evidence: "file1.ts" },
    { criterion: "Second criterion", met: true, evidence: "file2.ts" },
  ],
  filesChanged: ["file1.ts", "file2.ts"],
  testsAdded: 5,
  confidence: "high",
  ...overrides,
});

const createTestFeedbackResults = (allPassing = true): FeedbackResults => ({
  test: { passed: allPassing, output: "All tests passed", duration: 1000 },
  lint: { passed: allPassing, output: "No lint errors", duration: 500 },
  typecheck: { passed: allPassing, output: "No type errors", duration: 800 },
});

// =============================================================================
// extractCompletionBlock Tests
// =============================================================================

describe("extractCompletionBlock", () => {
  test("extracts JSON from valid completion block", () => {
    const output = `Some output...
${COMPLETION_BLOCK_START}
{"type": "BATTLE_COMPLETE", "version": 1}
${COMPLETION_BLOCK_END}
More output...`;

    const result = extractCompletionBlock(output);
    expect(result).toBe('{"type": "BATTLE_COMPLETE", "version": 1}');
  });

  test("returns null when no completion block present", () => {
    const output = "Some output without completion block";
    expect(extractCompletionBlock(output)).toBeNull();
  });

  test("returns null when only start tag present", () => {
    const output = `${COMPLETION_BLOCK_START} incomplete`;
    expect(extractCompletionBlock(output)).toBeNull();
  });

  test("returns null when only end tag present", () => {
    const output = `incomplete ${COMPLETION_BLOCK_END}`;
    expect(extractCompletionBlock(output)).toBeNull();
  });

  test("returns null when tags are in wrong order", () => {
    const output = `${COMPLETION_BLOCK_END} content ${COMPLETION_BLOCK_START}`;
    expect(extractCompletionBlock(output)).toBeNull();
  });

  test("handles multiline JSON", () => {
    const json = `{
  "type": "BATTLE_COMPLETE",
  "version": 1,
  "taskId": "001-test"
}`;
    const output = `${COMPLETION_BLOCK_START}
${json}
${COMPLETION_BLOCK_END}`;

    const result = extractCompletionBlock(output);
    expect(result).toBe(json.trim());
  });
});

// =============================================================================
// parseCompletionSignal Tests
// =============================================================================

describe("parseCompletionSignal", () => {
  test("parses valid completion signal JSON", () => {
    const signal = createTestCompletionSignal();
    const json = JSON.stringify(signal);

    const result = parseCompletionSignal(json);
    expect(result).toEqual(signal);
  });

  test("returns null for invalid JSON", () => {
    expect(parseCompletionSignal("not valid json")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseCompletionSignal("")).toBeNull();
  });

  test("returns null when required fields missing", () => {
    expect(parseCompletionSignal('{"type": "BATTLE_COMPLETE"}')).toBeNull();
  });

  test("returns null when type is wrong", () => {
    const signal = { ...createTestCompletionSignal(), type: "WRONG_TYPE" };
    expect(parseCompletionSignal(JSON.stringify(signal))).toBeNull();
  });
});

// =============================================================================
// isCompletionSignal Tests
// =============================================================================

describe("isCompletionSignal", () => {
  test("returns true for valid signal", () => {
    expect(isCompletionSignal(createTestCompletionSignal())).toBe(true);
  });

  test("returns false for null", () => {
    expect(isCompletionSignal(null)).toBe(false);
  });

  test("returns false for non-object", () => {
    expect(isCompletionSignal("string")).toBe(false);
    expect(isCompletionSignal(123)).toBe(false);
    expect(isCompletionSignal(undefined)).toBe(false);
  });

  test("returns false when type is wrong", () => {
    const signal = { ...createTestCompletionSignal(), type: "WRONG" };
    expect(isCompletionSignal(signal)).toBe(false);
  });

  test("returns false when version is not number", () => {
    const signal = { ...createTestCompletionSignal(), version: "1" };
    expect(isCompletionSignal(signal)).toBe(false);
  });

  test("returns false when taskId is not string", () => {
    const signal = { ...createTestCompletionSignal(), taskId: 123 };
    expect(isCompletionSignal(signal)).toBe(false);
  });

  test("returns false when summary is not string", () => {
    const signal = { ...createTestCompletionSignal(), summary: null };
    expect(isCompletionSignal(signal)).toBe(false);
  });

  test("returns false when acceptanceCriteriaMet is not array", () => {
    const signal = { ...createTestCompletionSignal(), acceptanceCriteriaMet: "not array" };
    expect(isCompletionSignal(signal)).toBe(false);
  });

  test("returns false when criterion in acceptanceCriteriaMet is invalid", () => {
    const signal = {
      ...createTestCompletionSignal(),
      acceptanceCriteriaMet: [{ criterion: 123, met: true }],
    };
    expect(isCompletionSignal(signal)).toBe(false);
  });

  test("returns false when filesChanged is not array", () => {
    const signal = { ...createTestCompletionSignal(), filesChanged: "file.ts" };
    expect(isCompletionSignal(signal)).toBe(false);
  });

  test("returns false when testsAdded is not number", () => {
    const signal = { ...createTestCompletionSignal(), testsAdded: "5" };
    expect(isCompletionSignal(signal)).toBe(false);
  });

  test("returns false when confidence is invalid", () => {
    const signal = { ...createTestCompletionSignal(), confidence: "very_high" };
    expect(isCompletionSignal(signal)).toBe(false);
  });

  test("accepts valid confidence levels", () => {
    for (const confidence of ["high", "medium", "low"]) {
      const signal = { ...createTestCompletionSignal(), confidence };
      expect(isCompletionSignal(signal)).toBe(true);
    }
  });

  test("accepts optional notes field", () => {
    const signal = { ...createTestCompletionSignal(), notes: "Some notes" };
    expect(isCompletionSignal(signal)).toBe(true);
  });

  test("returns false when notes is not string", () => {
    const signal = { ...createTestCompletionSignal(), notes: 123 };
    expect(isCompletionSignal(signal)).toBe(false);
  });
});

// =============================================================================
// validateCompletion Tests
// =============================================================================

describe("validateCompletion", () => {
  test("returns valid for correct completion", () => {
    const signal = createTestCompletionSignal();
    const task = createTestTask();
    const feedback = createTestFeedbackResults(true);

    const result = validateCompletion(signal, task, feedback);

    expect(result.signalValid).toBe(true);
    expect(result.criteriaFullyMet).toBe(true);
    expect(result.feedbackPassing).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("reports task ID mismatch", () => {
    const signal = createTestCompletionSignal({ taskId: "002-other-task" });
    const task = createTestTask();
    const feedback = createTestFeedbackResults(true);

    const result = validateCompletion(signal, task, feedback);

    expect(result.errors).toContain("Task ID mismatch: expected 001-test-task, got 002-other-task");
  });

  test("reports unmet criteria", () => {
    const signal = createTestCompletionSignal({
      acceptanceCriteriaMet: [
        { criterion: "First criterion", met: true },
        { criterion: "Second criterion", met: false },
      ],
    });
    const task = createTestTask();
    const feedback = createTestFeedbackResults(true);

    const result = validateCompletion(signal, task, feedback);

    expect(result.criteriaFullyMet).toBe(false);
    expect(result.errors).toContain("1 acceptance criteria not met");
  });

  test("reports missing criteria", () => {
    const signal = createTestCompletionSignal({
      acceptanceCriteriaMet: [
        { criterion: "First criterion", met: true },
        // Missing "Second criterion"
      ],
    });
    const task = createTestTask();
    const feedback = createTestFeedbackResults(true);

    const result = validateCompletion(signal, task, feedback);

    expect(result.errors).toContain("1 criteria not addressed in completion signal");
  });

  test("reports failing feedback loops", () => {
    const signal = createTestCompletionSignal();
    const task = createTestTask();
    const feedback = createTestFeedbackResults(false);

    const result = validateCompletion(signal, task, feedback);

    expect(result.feedbackPassing).toBe(false);
    expect(result.errors).toContain("Feedback loops not all passing");
  });

  test("reports multiple errors", () => {
    const signal = createTestCompletionSignal({
      taskId: "wrong-task",
      acceptanceCriteriaMet: [],
    });
    const task = createTestTask();
    const feedback = createTestFeedbackResults(false);

    const result = validateCompletion(signal, task, feedback);

    expect(result.errors.length).toBeGreaterThan(2);
  });
});

// =============================================================================
// isCompletionValid Tests
// =============================================================================

describe("isCompletionValid", () => {
  test("returns true when all checks pass", () => {
    const validation = {
      signalValid: true,
      criteriaFullyMet: true,
      feedbackPassing: true,
      errors: [],
    };

    expect(isCompletionValid(validation)).toBe(true);
  });

  test("returns false when signalValid is false", () => {
    const validation = {
      signalValid: false,
      criteriaFullyMet: true,
      feedbackPassing: true,
      errors: [],
    };

    expect(isCompletionValid(validation)).toBe(false);
  });

  test("returns false when criteriaFullyMet is false", () => {
    const validation = {
      signalValid: true,
      criteriaFullyMet: false,
      feedbackPassing: true,
      errors: [],
    };

    expect(isCompletionValid(validation)).toBe(false);
  });

  test("returns false when feedbackPassing is false", () => {
    const validation = {
      signalValid: true,
      criteriaFullyMet: true,
      feedbackPassing: false,
      errors: [],
    };

    expect(isCompletionValid(validation)).toBe(false);
  });

  test("returns false when errors exist", () => {
    const validation = {
      signalValid: true,
      criteriaFullyMet: true,
      feedbackPassing: true,
      errors: ["Some error"],
    };

    expect(isCompletionValid(validation)).toBe(false);
  });
});

// =============================================================================
// detectCompletion Tests
// =============================================================================

describe("detectCompletion", () => {
  test("detects structured completion", () => {
    const signal = createTestCompletionSignal();
    const output = `${COMPLETION_BLOCK_START}
${JSON.stringify(signal)}
${COMPLETION_BLOCK_END}`;

    const result = detectCompletion(output);

    expect(result.detected).toBe(true);
    expect(result.type).toBe("structured");
    expect(result.signal).toEqual(signal);
  });

  test("detects simple sigil completion for backward compatibility", () => {
    const output = `Some work done... ${SIMPLE_COMPLETION_SIGIL}`;

    const result = detectCompletion(output);

    expect(result.detected).toBe(true);
    expect(result.type).toBe("sigil");
    expect(result.signal).toBeUndefined();
  });

  test("prefers structured completion over sigil", () => {
    const signal = createTestCompletionSignal();
    const output = `${COMPLETION_BLOCK_START}
${JSON.stringify(signal)}
${COMPLETION_BLOCK_END}
Also has sigil: ${SIMPLE_COMPLETION_SIGIL}`;

    const result = detectCompletion(output);

    expect(result.type).toBe("structured");
  });

  test("returns none when no completion detected", () => {
    const output = "Regular output without completion";

    const result = detectCompletion(output);

    expect(result.detected).toBe(false);
    expect(result.type).toBe("none");
  });

  test("returns none when completion block has invalid JSON", () => {
    const output = `${COMPLETION_BLOCK_START}
not valid json
${COMPLETION_BLOCK_END}`;

    const result = detectCompletion(output);

    expect(result.detected).toBe(false);
    expect(result.type).toBe("none");
    expect(result.rawBlock).toBe("not valid json");
  });

  test("validates when task and feedback provided", () => {
    const signal = createTestCompletionSignal();
    const task = createTestTask();
    const feedback = createTestFeedbackResults(true);
    const output = `${COMPLETION_BLOCK_START}
${JSON.stringify(signal)}
${COMPLETION_BLOCK_END}`;

    const result = detectCompletion(output, task, feedback);

    expect(result.validation).toBeDefined();
    expect(result.validation?.signalValid).toBe(true);
    expect(result.validation?.errors).toHaveLength(0);
  });

  test("skips validation when task not provided", () => {
    const signal = createTestCompletionSignal();
    const output = `${COMPLETION_BLOCK_START}
${JSON.stringify(signal)}
${COMPLETION_BLOCK_END}`;

    const result = detectCompletion(output);

    expect(result.validation).toBeUndefined();
  });
});

// =============================================================================
// Helper Function Tests
// =============================================================================

describe("isStructuredCompletion", () => {
  test("returns true for structured completion", () => {
    const result = { detected: true, type: "structured" as const };
    expect(isStructuredCompletion(result)).toBe(true);
  });

  test("returns false for sigil completion", () => {
    const result = { detected: true, type: "sigil" as const };
    expect(isStructuredCompletion(result)).toBe(false);
  });

  test("returns false for no completion", () => {
    const result = { detected: false, type: "none" as const };
    expect(isStructuredCompletion(result)).toBe(false);
  });
});

describe("isSigilCompletion", () => {
  test("returns true for sigil completion", () => {
    const result = { detected: true, type: "sigil" as const };
    expect(isSigilCompletion(result)).toBe(true);
  });

  test("returns false for structured completion", () => {
    const result = { detected: true, type: "structured" as const };
    expect(isSigilCompletion(result)).toBe(false);
  });

  test("returns false for no completion", () => {
    const result = { detected: false, type: "none" as const };
    expect(isSigilCompletion(result)).toBe(false);
  });
});

// =============================================================================
// Prompt Helper Tests
// =============================================================================

describe("getStructuredCompletionInstructions", () => {
  test("includes task ID in instructions", () => {
    const task = createTestTask({ id: "042-specific-task" });
    const instructions = getStructuredCompletionInstructions(task);

    expect(instructions).toContain("042-specific-task");
  });

  test("includes acceptance criteria", () => {
    const task = createTestTask({
      acceptanceCriteria: ["Criterion A", "Criterion B"],
    });
    const instructions = getStructuredCompletionInstructions(task);

    expect(instructions).toContain("Criterion A");
    expect(instructions).toContain("Criterion B");
  });

  test("includes completion block tags", () => {
    const task = createTestTask();
    const instructions = getStructuredCompletionInstructions(task);

    expect(instructions).toContain(COMPLETION_BLOCK_START);
    expect(instructions).toContain(COMPLETION_BLOCK_END);
  });

  test("includes confidence level explanations", () => {
    const task = createTestTask();
    const instructions = getStructuredCompletionInstructions(task);

    expect(instructions).toContain("high");
    expect(instructions).toContain("medium");
    expect(instructions).toContain("low");
  });

  test("mentions simple sigil for backward compatibility", () => {
    const task = createTestTask();
    const instructions = getStructuredCompletionInstructions(task);

    expect(instructions).toContain(SIMPLE_COMPLETION_SIGIL);
    expect(instructions).toContain("backward compatibility");
  });
});

describe("createSampleCompletionSignal", () => {
  test("creates valid signal with taskId", () => {
    const signal = createSampleCompletionSignal("123-my-task");

    expect(signal.taskId).toBe("123-my-task");
    expect(signal.type).toBe("BATTLE_COMPLETE");
    expect(signal.version).toBe(COMPLETION_PROTOCOL_VERSION);
    expect(isCompletionSignal(signal)).toBe(true);
  });

  test("applies overrides", () => {
    const signal = createSampleCompletionSignal("001-task", {
      summary: "Custom summary",
      confidence: "low",
      testsAdded: 10,
    });

    expect(signal.summary).toBe("Custom summary");
    expect(signal.confidence).toBe("low");
    expect(signal.testsAdded).toBe(10);
  });

  test("provides sensible defaults", () => {
    const signal = createSampleCompletionSignal("001-task");

    expect(signal.summary).toBeTruthy();
    expect(signal.acceptanceCriteriaMet).toEqual([]);
    expect(signal.filesChanged).toEqual([]);
    expect(signal.testsAdded).toBe(0);
    expect(signal.confidence).toBe("high");
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe("Constants", () => {
  test("COMPLETION_BLOCK_START is correct", () => {
    expect(COMPLETION_BLOCK_START).toBe("<completion>");
  });

  test("COMPLETION_BLOCK_END is correct", () => {
    expect(COMPLETION_BLOCK_END).toBe("</completion>");
  });

  test("SIMPLE_COMPLETION_SIGIL is correct", () => {
    expect(SIMPLE_COMPLETION_SIGIL).toBe("<promise>COMPLETE</promise>");
  });

  test("COMPLETION_PROTOCOL_VERSION is 1", () => {
    expect(COMPLETION_PROTOCOL_VERSION).toBe(1);
  });
});
