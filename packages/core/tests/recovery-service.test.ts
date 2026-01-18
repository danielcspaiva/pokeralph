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
  FeedbackLoopError,
  TimeoutError,
  ClaudeError,
  SystemError,
  CancellationError,
  CrashError,
  type BattleContext,
  type FailureType,
  type RecoveryAction,
} from "../src/services/recovery-service.ts";
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
