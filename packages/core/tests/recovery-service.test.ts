/**
 * Tests for RecoveryService
 *
 * Verifies failure classification, recovery suggestions,
 * and error type handling per spec 11-recovery.md.
 */

import { test, expect, describe } from "bun:test";
import {
  classifyFailure,
  getFailureSeverity,
  getRecoveryOptions,
  getFailureMessage,
  getRecoverySuggestion,
  getAllRecoverySuggestions,
  // Resume strategy functions
  buildRetryPrompt,
  prepareIterationForRetry,
  buildResumeContext,
  isValidResumeStrategy,
  getDefaultResumeStrategy,
  // Error classes
  FeedbackLoopError,
  TimeoutError,
  ClaudeError,
  SystemError,
  CancellationError,
  CrashError,
  type BattleContext,
  type FailureType,
  type RecoveryAction,
  type BattleFailure,
} from "../src/services/recovery-service.ts";
import { createBattle } from "../src/types/battle.ts";
import { DEFAULT_CONFIG } from "../src/types/config.ts";

// Test context for all tests
const createTestContext = (iteration = 3): BattleContext => ({
  currentIteration: iteration,
  config: { ...DEFAULT_CONFIG, timeoutMinutes: 30 },
});

// =============================================================================
// Failure Type Tests
// =============================================================================

describe("classifyFailure", () => {
  describe("FeedbackLoopError", () => {
    test("classifies as feedback_failure", () => {
      const error = new FeedbackLoopError("typecheck", "2 type errors found");
      const context = createTestContext();

      const failure = classifyFailure(error, context);

      expect(failure.type).toBe("feedback_failure");
      expect(failure.iteration).toBe(3);
      expect(failure.message).toContain("typecheck");
      expect(failure.details).toBe("2 type errors found");
      expect(failure.recoverable).toBe(true);
      expect(failure.suggestedAction).toBe("retry_iteration");
    });

    test("includes loop name in message", () => {
      const error = new FeedbackLoopError("lint", "ESLint errors");
      const context = createTestContext();

      const failure = classifyFailure(error, context);

      expect(failure.message).toBe("Feedback loop 'lint' failed");
    });
  });

  describe("TimeoutError", () => {
    test("classifies as timeout", () => {
      const error = new TimeoutError(30);
      const context = createTestContext();

      const failure = classifyFailure(error, context);

      expect(failure.type).toBe("timeout");
      expect(failure.message).toBe("Iteration timed out");
      expect(failure.details).toContain("30 minutes");
      expect(failure.recoverable).toBe(true);
      expect(failure.suggestedAction).toBe("retry_iteration");
    });
  });

  describe("ClaudeError", () => {
    test("classifies retryable error correctly", () => {
      const error = new ClaudeError("API rate limit exceeded", true);
      const context = createTestContext();

      const failure = classifyFailure(error, context);

      expect(failure.type).toBe("claude_error");
      expect(failure.message).toBe("API rate limit exceeded");
      expect(failure.recoverable).toBe(true);
      expect(failure.suggestedAction).toBe("retry_iteration");
    });

    test("classifies non-retryable error correctly", () => {
      const error = new ClaudeError("Invalid API key", false);
      const context = createTestContext();

      const failure = classifyFailure(error, context);

      expect(failure.type).toBe("claude_error");
      expect(failure.recoverable).toBe(false);
      expect(failure.suggestedAction).toBe("manual_resolution");
    });
  });

  describe("SystemError", () => {
    test("classifies as system_error", () => {
      const error = new SystemError("Permission denied", "EACCES");
      const context = createTestContext();

      const failure = classifyFailure(error, context);

      expect(failure.type).toBe("system_error");
      expect(failure.message).toBe("Permission denied");
      expect(failure.recoverable).toBe(false);
      expect(failure.suggestedAction).toBe("manual_resolution");
    });
  });

  describe("CancellationError", () => {
    test("classifies as cancellation", () => {
      const error = new CancellationError("User requested stop");
      const context = createTestContext();

      const failure = classifyFailure(error, context);

      expect(failure.type).toBe("cancellation");
      expect(failure.message).toBe("User requested stop");
      expect(failure.details).toBe("User requested stop");
      expect(failure.recoverable).toBe(true);
      expect(failure.suggestedAction).toBe("restart");
    });

    test("handles default message", () => {
      const error = new CancellationError();
      const context = createTestContext();

      const failure = classifyFailure(error, context);

      expect(failure.message).toBe("Cancelled by user");
    });
  });

  describe("CrashError", () => {
    test("classifies as crash", () => {
      const error = new CrashError("Process killed", "SIGKILL");
      const context = createTestContext();

      const failure = classifyFailure(error, context);

      expect(failure.type).toBe("crash");
      expect(failure.message).toBe("Process killed");
      expect(failure.details).toContain("SIGKILL");
      expect(failure.recoverable).toBe(true);
      expect(failure.suggestedAction).toBe("restart");
    });
  });

  describe("system error patterns", () => {
    test("detects disk full error (ENOSPC)", () => {
      const error = new Error("ENOSPC: no space left on device");
      const context = createTestContext();

      const failure = classifyFailure(error, context);

      expect(failure.type).toBe("system_error");
      expect(failure.recoverable).toBe(false);
    });

    test("detects permission denied error (EACCES)", () => {
      const error = new Error("EACCES: permission denied");
      const context = createTestContext();

      const failure = classifyFailure(error, context);

      expect(failure.type).toBe("system_error");
    });

    test("detects out of memory error", () => {
      const error = new Error("JavaScript heap out of memory");
      const context = createTestContext();

      const failure = classifyFailure(error, context);

      expect(failure.type).toBe("system_error");
    });

    test("detects too many open files (EMFILE)", () => {
      const error = new Error("EMFILE: too many open files");
      const context = createTestContext();

      const failure = classifyFailure(error, context);

      expect(failure.type).toBe("system_error");
    });
  });

  describe("unknown errors", () => {
    test("defaults to system_error for unknown errors", () => {
      const error = new Error("Something unexpected happened");
      const context = createTestContext();

      const failure = classifyFailure(error, context);

      expect(failure.type).toBe("system_error");
      expect(failure.recoverable).toBe(false);
      expect(failure.suggestedAction).toBe("manual_resolution");
    });
  });

  describe("timestamp and iteration", () => {
    test("includes correct iteration number", () => {
      const error = new FeedbackLoopError("test", "failed");
      const context = createTestContext(5);

      const failure = classifyFailure(error, context);

      expect(failure.iteration).toBe(5);
    });

    test("includes valid ISO timestamp", () => {
      const error = new FeedbackLoopError("test", "failed");
      const context = createTestContext();

      const failure = classifyFailure(error, context);

      // Verify it's a valid ISO timestamp
      const date = new Date(failure.timestamp);
      expect(date.toISOString()).toBe(failure.timestamp);
    });
  });
});

// =============================================================================
// Failure Severity Tests
// =============================================================================

describe("getFailureSeverity", () => {
  test("feedback_failure is low severity", () => {
    expect(getFailureSeverity("feedback_failure")).toBe("low");
  });

  test("cancellation is low severity", () => {
    expect(getFailureSeverity("cancellation")).toBe("low");
  });

  test("timeout is medium severity", () => {
    expect(getFailureSeverity("timeout")).toBe("medium");
  });

  test("claude_error is medium severity", () => {
    expect(getFailureSeverity("claude_error")).toBe("medium");
  });

  test("system_error is high severity", () => {
    expect(getFailureSeverity("system_error")).toBe("high");
  });

  test("crash is high severity", () => {
    expect(getFailureSeverity("crash")).toBe("high");
  });
});

// =============================================================================
// Recovery Options Tests
// =============================================================================

describe("getRecoveryOptions", () => {
  test("feedback_failure allows retry, fix, rollback", () => {
    const options = getRecoveryOptions("feedback_failure");

    expect(options).toContain("retry_iteration");
    expect(options).toContain("fix_and_continue");
    expect(options).toContain("rollback");
    expect(options).not.toContain("restart");
  });

  test("timeout allows retry, rollback", () => {
    const options = getRecoveryOptions("timeout");

    expect(options).toContain("retry_iteration");
    expect(options).toContain("rollback");
  });

  test("claude_error allows retry, manual_resolution", () => {
    const options = getRecoveryOptions("claude_error");

    expect(options).toContain("retry_iteration");
    expect(options).toContain("manual_resolution");
  });

  test("system_error allows manual_resolution, restart", () => {
    const options = getRecoveryOptions("system_error");

    expect(options).toContain("manual_resolution");
    expect(options).toContain("restart");
    expect(options).not.toContain("retry_iteration");
  });

  test("cancellation allows restart, rollback", () => {
    const options = getRecoveryOptions("cancellation");

    expect(options).toContain("restart");
    expect(options).toContain("rollback");
  });

  test("crash allows restart, rollback, manual_resolution", () => {
    const options = getRecoveryOptions("crash");

    expect(options).toContain("restart");
    expect(options).toContain("rollback");
    expect(options).toContain("manual_resolution");
  });
});

// =============================================================================
// Message Generation Tests
// =============================================================================

describe("getFailureMessage", () => {
  const baseFailure = {
    timestamp: new Date().toISOString(),
    iteration: 1,
    recoverable: true,
    suggestedAction: "retry_iteration" as RecoveryAction,
  };

  test("formats feedback_failure message", () => {
    const failure = {
      ...baseFailure,
      type: "feedback_failure" as FailureType,
      message: "typecheck failed",
      details: "2 errors",
    };

    expect(getFailureMessage(failure)).toBe("Build/test failed: typecheck failed");
  });

  test("formats timeout message", () => {
    const failure = {
      ...baseFailure,
      type: "timeout" as FailureType,
      message: "Timed out",
      details: "Exceeded 30 minutes",
    };

    expect(getFailureMessage(failure)).toBe("Iteration timed out: Exceeded 30 minutes");
  });

  test("formats claude_error message", () => {
    const failure = {
      ...baseFailure,
      type: "claude_error" as FailureType,
      message: "API error",
    };

    expect(getFailureMessage(failure)).toBe("Claude error: API error");
  });

  test("formats system_error message", () => {
    const failure = {
      ...baseFailure,
      type: "system_error" as FailureType,
      message: "Disk full",
    };

    expect(getFailureMessage(failure)).toBe("System error: Disk full");
  });

  test("formats cancellation message", () => {
    const failure = {
      ...baseFailure,
      type: "cancellation" as FailureType,
      message: "User cancelled",
    };

    expect(getFailureMessage(failure)).toBe("Cancelled: User cancelled");
  });

  test("formats crash message", () => {
    const failure = {
      ...baseFailure,
      type: "crash" as FailureType,
      message: "Process killed",
    };

    expect(getFailureMessage(failure)).toBe("Process crashed: Process killed");
  });
});

// =============================================================================
// Recovery Suggestion Tests
// =============================================================================

describe("getRecoverySuggestion", () => {
  const baseFailure = {
    type: "feedback_failure" as FailureType,
    timestamp: new Date().toISOString(),
    iteration: 1,
    message: "test",
    recoverable: true,
  };

  test("suggests retry for retry_iteration action", () => {
    const suggestion = getRecoverySuggestion({
      ...baseFailure,
      suggestedAction: "retry_iteration",
    });

    expect(suggestion).toContain("Retry");
    expect(suggestion).toContain("error context");
  });

  test("suggests fix for fix_and_continue action", () => {
    const suggestion = getRecoverySuggestion({
      ...baseFailure,
      suggestedAction: "fix_and_continue",
    });

    expect(suggestion).toContain("Fix");
    expect(suggestion).toContain("manually");
  });

  test("suggests rollback for rollback action", () => {
    const suggestion = getRecoverySuggestion({
      ...baseFailure,
      suggestedAction: "rollback",
    });

    expect(suggestion).toContain("Roll back");
    expect(suggestion).toContain("clean state");
  });

  test("suggests restart for restart action", () => {
    const suggestion = getRecoverySuggestion({
      ...baseFailure,
      suggestedAction: "restart",
    });

    expect(suggestion).toContain("Start");
    expect(suggestion).toContain("fresh");
  });

  test("suggests manual resolution for manual_resolution action", () => {
    const suggestion = getRecoverySuggestion({
      ...baseFailure,
      suggestedAction: "manual_resolution",
    });

    expect(suggestion).toContain("Manual intervention");
  });
});

// =============================================================================
// All Recovery Suggestions Tests
// =============================================================================

describe("getAllRecoverySuggestions", () => {
  test("returns all options for feedback_failure", () => {
    const error = new FeedbackLoopError("test", "failed");
    const failure = classifyFailure(error, createTestContext());

    const suggestions = getAllRecoverySuggestions(failure);

    expect(suggestions.length).toBe(3);
    expect(suggestions.some((s) => s.action === "retry_iteration")).toBe(true);
    expect(suggestions.some((s) => s.action === "fix_and_continue")).toBe(true);
    expect(suggestions.some((s) => s.action === "rollback")).toBe(true);
  });

  test("marks recommended action", () => {
    const error = new FeedbackLoopError("test", "failed");
    const failure = classifyFailure(error, createTestContext());

    const suggestions = getAllRecoverySuggestions(failure);
    const recommended = suggestions.find((s) => s.recommended);

    expect(recommended).toBeDefined();
    expect(recommended?.action).toBe("retry_iteration");
  });

  test("includes descriptions for all options", () => {
    const error = new TimeoutError(30);
    const failure = classifyFailure(error, createTestContext());

    const suggestions = getAllRecoverySuggestions(failure);

    for (const suggestion of suggestions) {
      expect(suggestion.description).toBeTruthy();
      expect(typeof suggestion.description).toBe("string");
    }
  });

  test("only one option is recommended", () => {
    const error = new CrashError("crashed", "SIGKILL");
    const failure = classifyFailure(error, createTestContext());

    const suggestions = getAllRecoverySuggestions(failure);
    const recommendedCount = suggestions.filter((s) => s.recommended).length;

    expect(recommendedCount).toBe(1);
  });
});

// =============================================================================
// Custom Error Class Tests
// =============================================================================

describe("custom error classes", () => {
  describe("FeedbackLoopError", () => {
    test("has correct name", () => {
      const error = new FeedbackLoopError("test", "output");
      expect(error.name).toBe("FeedbackLoopError");
    });

    test("stores loop and output", () => {
      const error = new FeedbackLoopError("lint", "5 warnings");
      expect(error.loop).toBe("lint");
      expect(error.output).toBe("5 warnings");
    });
  });

  describe("TimeoutError", () => {
    test("has correct name", () => {
      const error = new TimeoutError(30);
      expect(error.name).toBe("TimeoutError");
    });

    test("stores timeout value", () => {
      const error = new TimeoutError(45);
      expect(error.timeoutMinutes).toBe(45);
    });

    test("formats message correctly", () => {
      const error = new TimeoutError(30);
      expect(error.message).toContain("30 minutes");
    });
  });

  describe("ClaudeError", () => {
    test("has correct name", () => {
      const error = new ClaudeError("error");
      expect(error.name).toBe("ClaudeError");
    });

    test("defaults to retryable=true", () => {
      const error = new ClaudeError("error");
      expect(error.retryable).toBe(true);
    });

    test("respects retryable parameter", () => {
      const error = new ClaudeError("error", false);
      expect(error.retryable).toBe(false);
    });
  });

  describe("SystemError", () => {
    test("has correct name", () => {
      const error = new SystemError("error");
      expect(error.name).toBe("SystemError");
    });

    test("stores error code", () => {
      const error = new SystemError("error", "ENOSPC");
      expect(error.code).toBe("ENOSPC");
    });

    test("code is optional", () => {
      const error = new SystemError("error");
      expect(error.code).toBeUndefined();
    });
  });

  describe("CancellationError", () => {
    test("has correct name", () => {
      const error = new CancellationError();
      expect(error.name).toBe("CancellationError");
    });

    test("stores reason", () => {
      const error = new CancellationError("user clicked stop");
      expect(error.reason).toBe("user clicked stop");
    });

    test("uses default message when no reason", () => {
      const error = new CancellationError();
      expect(error.message).toBe("Cancelled by user");
    });
  });

  describe("CrashError", () => {
    test("has correct name", () => {
      const error = new CrashError("crashed");
      expect(error.name).toBe("CrashError");
    });

    test("stores signal", () => {
      const error = new CrashError("crashed", "SIGTERM");
      expect(error.signal).toBe("SIGTERM");
    });

    test("signal is optional", () => {
      const error = new CrashError("crashed");
      expect(error.signal).toBeUndefined();
    });
  });
});

// =============================================================================
// Resume Strategy Tests (11-recovery.md lines 180-318)
// =============================================================================

// Helper to create test failure
const createTestFailure = (
  type: FailureType = "feedback_failure",
  iteration = 3,
  recoverable = true
): BattleFailure => ({
  type,
  timestamp: new Date().toISOString(),
  iteration,
  message: "Test failure message",
  details: "Test failure details",
  recoverable,
  suggestedAction: "retry_iteration",
});

describe("buildRetryPrompt", () => {
  test("returns base prompt when no context or instructions", () => {
    const basePrompt = "Implement feature X";
    const result = buildRetryPrompt(basePrompt, {
      includeErrorContext: false,
    });

    expect(result).toBe(basePrompt);
  });

  test("adds error context when includeErrorContext is true", () => {
    const basePrompt = "Implement feature X";
    const result = buildRetryPrompt(basePrompt, {
      includeErrorContext: true,
      errorContext: "Type error on line 42",
    });

    expect(result).toContain(basePrompt);
    expect(result).toContain("## Previous Attempt Failed");
    expect(result).toContain("Type error on line 42");
  });

  test("adds additional instructions when provided", () => {
    const basePrompt = "Implement feature X";
    const result = buildRetryPrompt(basePrompt, {
      includeErrorContext: false,
      additionalInstructions: "Focus on edge cases",
    });

    expect(result).toContain(basePrompt);
    expect(result).toContain("## Additional Instructions");
    expect(result).toContain("Focus on edge cases");
  });

  test("includes both error context and instructions", () => {
    const basePrompt = "Implement feature X";
    const result = buildRetryPrompt(basePrompt, {
      includeErrorContext: true,
      errorContext: "Test failed",
      additionalInstructions: "Use a different approach",
    });

    expect(result).toContain("## Previous Attempt Failed");
    expect(result).toContain("Test failed");
    expect(result).toContain("## Additional Instructions");
    expect(result).toContain("Use a different approach");
  });

  test("does not add error context when context is undefined", () => {
    const basePrompt = "Implement feature X";
    const result = buildRetryPrompt(basePrompt, {
      includeErrorContext: true,
      errorContext: undefined,
    });

    expect(result).toBe(basePrompt);
    expect(result).not.toContain("## Previous Attempt Failed");
  });
});

describe("prepareIterationForRetry", () => {
  test("creates iteration with pending result", () => {
    const battle = createBattle("001-test");
    const iteration = prepareIterationForRetry(battle, 1);

    expect(iteration.number).toBe(1);
    expect(iteration.result).toBe("pending");
    expect(iteration.startedAt).toBeTruthy();
  });

  test("increments retry count from existing iteration", () => {
    const battle = createBattle("001-test");
    battle.iterations = [
      {
        number: 1,
        startedAt: new Date().toISOString(),
        output: "failed",
        result: "failure",
        filesChanged: [],
        retryCount: 2,
      },
    ];

    const iteration = prepareIterationForRetry(battle, 1);

    expect(iteration.retryCount).toBe(3);
  });

  test("starts retry count at 1 when no existing iteration", () => {
    const battle = createBattle("001-test");
    const iteration = prepareIterationForRetry(battle, 1);

    expect(iteration.retryCount).toBe(1);
  });

  test("starts retry count at 1 when existing iteration has no retry count", () => {
    const battle = createBattle("001-test");
    battle.iterations = [
      {
        number: 1,
        startedAt: new Date().toISOString(),
        output: "failed",
        result: "failure",
        filesChanged: [],
      },
    ];

    const iteration = prepareIterationForRetry(battle, 1);

    expect(iteration.retryCount).toBe(1);
  });
});

describe("buildResumeContext", () => {
  test("builds context for retry_same strategy", () => {
    const failure = createTestFailure("feedback_failure", 3);
    const result = buildResumeContext("retry_same", failure);

    expect(result.success).toBe(true);
    expect(result.strategy).toBe("retry_same");
    expect(result.iteration).toBe(3);
    expect(result.message).toContain("iteration 3");
    expect(result.errorContext).toBeUndefined();
  });

  test("builds context for retry_with_context strategy", () => {
    const failure = createTestFailure("feedback_failure", 3);
    const result = buildResumeContext("retry_with_context", failure, "Try a different approach");

    expect(result.success).toBe(true);
    expect(result.strategy).toBe("retry_with_context");
    expect(result.iteration).toBe(3);
    expect(result.errorContext).toBe("Test failure details");
    expect(result.additionalInstructions).toBe("Try a different approach");
  });

  test("uses message when details not available for retry_with_context", () => {
    const failure: BattleFailure = {
      type: "timeout",
      timestamp: new Date().toISOString(),
      iteration: 2,
      message: "Timed out",
      recoverable: true,
      suggestedAction: "retry_iteration",
    };
    const result = buildResumeContext("retry_with_context", failure);

    expect(result.errorContext).toBe("Timed out");
  });

  test("builds context for rollback_and_retry strategy", () => {
    const failure = createTestFailure("feedback_failure", 4);
    const result = buildResumeContext("rollback_and_retry", failure);

    expect(result.success).toBe(true);
    expect(result.strategy).toBe("rollback_and_retry");
    expect(result.iteration).toBe(4);
    expect(result.message).toContain("Rolling back");
    expect(result.errorContext).toContain("Previous attempt failed");
  });

  test("builds context for continue_next strategy", () => {
    const failure = createTestFailure("feedback_failure", 3);
    const result = buildResumeContext("continue_next", failure);

    expect(result.success).toBe(true);
    expect(result.strategy).toBe("continue_next");
    expect(result.iteration).toBe(4); // Next iteration
    expect(result.message).toContain("iteration 4");
  });

  test("builds context for manual_then_continue strategy", () => {
    const failure = createTestFailure("system_error", 3);
    const result = buildResumeContext("manual_then_continue", failure);

    expect(result.success).toBe(true);
    expect(result.strategy).toBe("manual_then_continue");
    expect(result.iteration).toBe(3);
    expect(result.message).toContain("manual fix");
  });
});

describe("isValidResumeStrategy", () => {
  describe("for recoverable failures", () => {
    test("allows retry_same for feedback_failure", () => {
      const failure = createTestFailure("feedback_failure");
      expect(isValidResumeStrategy("retry_same", failure)).toBe(true);
    });

    test("allows retry_with_context for feedback_failure", () => {
      const failure = createTestFailure("feedback_failure");
      expect(isValidResumeStrategy("retry_with_context", failure)).toBe(true);
    });

    test("allows rollback_and_retry for feedback_failure", () => {
      const failure = createTestFailure("feedback_failure");
      expect(isValidResumeStrategy("rollback_and_retry", failure)).toBe(true);
    });

    test("allows manual_then_continue for feedback_failure", () => {
      const failure = createTestFailure("feedback_failure");
      expect(isValidResumeStrategy("manual_then_continue", failure)).toBe(true);
    });

    test("allows retry strategies for timeout", () => {
      const failure = createTestFailure("timeout");
      expect(isValidResumeStrategy("retry_same", failure)).toBe(true);
      expect(isValidResumeStrategy("retry_with_context", failure)).toBe(true);
    });
  });

  describe("for non-recoverable failures", () => {
    test("only allows manual_then_continue for non-recoverable", () => {
      const failure = createTestFailure("system_error", 3, false);

      expect(isValidResumeStrategy("manual_then_continue", failure)).toBe(true);
      expect(isValidResumeStrategy("retry_same", failure)).toBe(false);
      expect(isValidResumeStrategy("retry_with_context", failure)).toBe(false);
      expect(isValidResumeStrategy("rollback_and_retry", failure)).toBe(false);
      expect(isValidResumeStrategy("continue_next", failure)).toBe(false);
    });
  });
});

describe("getDefaultResumeStrategy", () => {
  test("returns retry_with_context for retry_iteration suggestion", () => {
    const failure: BattleFailure = {
      ...createTestFailure("feedback_failure"),
      suggestedAction: "retry_iteration",
    };

    expect(getDefaultResumeStrategy(failure)).toBe("retry_with_context");
  });

  test("returns manual_then_continue for fix_and_continue suggestion", () => {
    const failure: BattleFailure = {
      ...createTestFailure("feedback_failure"),
      suggestedAction: "fix_and_continue",
    };

    expect(getDefaultResumeStrategy(failure)).toBe("manual_then_continue");
  });

  test("returns rollback_and_retry for rollback suggestion", () => {
    const failure: BattleFailure = {
      ...createTestFailure("feedback_failure"),
      suggestedAction: "rollback",
    };

    expect(getDefaultResumeStrategy(failure)).toBe("rollback_and_retry");
  });

  test("returns retry_same for restart suggestion", () => {
    const failure: BattleFailure = {
      ...createTestFailure("cancellation"),
      suggestedAction: "restart",
    };

    expect(getDefaultResumeStrategy(failure)).toBe("retry_same");
  });

  test("returns manual_then_continue for manual_resolution suggestion", () => {
    const failure: BattleFailure = {
      ...createTestFailure("system_error"),
      suggestedAction: "manual_resolution",
    };

    expect(getDefaultResumeStrategy(failure)).toBe("manual_then_continue");
  });

  test("returns manual_then_continue for non-recoverable failures", () => {
    const failure = createTestFailure("system_error", 3, false);
    failure.suggestedAction = "retry_iteration"; // Even if suggestion is retry

    expect(getDefaultResumeStrategy(failure)).toBe("manual_then_continue");
  });
});
