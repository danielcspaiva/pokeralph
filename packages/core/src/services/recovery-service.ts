/**
 * Recovery Service for PokéRalph
 *
 * Handles failure classification, recovery suggestions, and battle recovery.
 * Based on spec 11-recovery.md.
 */

import type { Config } from "../types/config.ts";

/**
 * Failure types per spec (11-recovery.md lines 59-66)
 */
export type FailureType =
  | "feedback_failure"
  | "timeout"
  | "claude_error"
  | "system_error"
  | "cancellation"
  | "crash";

/**
 * Recovery actions suggested based on failure type (11-recovery.md lines 89-94)
 */
export type RecoveryAction =
  | "retry_iteration"
  | "fix_and_continue"
  | "rollback"
  | "restart"
  | "manual_resolution";

/**
 * Battle failure information per spec (11-recovery.md lines 71-79)
 */
export interface BattleFailure {
  type: FailureType;
  timestamp: string;
  iteration: number;
  message: string;
  details?: string;
  recoverable: boolean;
  suggestedAction: RecoveryAction;
}

/**
 * Context for classifying failures
 */
export interface BattleContext {
  currentIteration: number;
  config: Config;
}

/**
 * Custom error for feedback loop failures
 */
export class FeedbackLoopError extends Error {
  readonly loop: string;
  readonly output: string;

  constructor(loop: string, output: string) {
    super(`Feedback loop '${loop}' failed`);
    this.name = "FeedbackLoopError";
    this.loop = loop;
    this.output = output;
  }
}

/**
 * Custom error for timeout failures
 */
export class TimeoutError extends Error {
  readonly timeoutMinutes: number;

  constructor(timeoutMinutes: number) {
    super(`Iteration timed out after ${timeoutMinutes} minutes`);
    this.name = "TimeoutError";
    this.timeoutMinutes = timeoutMinutes;
  }
}

/**
 * Custom error for Claude API/CLI errors
 */
export class ClaudeError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = "ClaudeError";
    this.retryable = retryable;
  }
}

/**
 * Custom error for system errors (disk full, permissions, etc.)
 */
export class SystemError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "SystemError";
    this.code = code;
  }
}

/**
 * Custom error for cancellation
 */
export class CancellationError extends Error {
  readonly reason?: string;

  constructor(reason?: string) {
    super(reason ?? "Cancelled by user");
    this.name = "CancellationError";
    this.reason = reason;
  }
}

/**
 * Custom error for crashes
 */
export class CrashError extends Error {
  readonly signal?: string;

  constructor(message: string, signal?: string) {
    super(message);
    this.name = "CrashError";
    this.signal = signal;
  }
}

/**
 * Failure severity levels for UI display
 */
export type FailureSeverity = "low" | "medium" | "high";

/**
 * Get the severity of a failure type per spec (11-recovery.md lines 59-66)
 */
export function getFailureSeverity(type: FailureType): FailureSeverity {
  switch (type) {
    case "feedback_failure":
    case "cancellation":
      return "low";
    case "timeout":
    case "claude_error":
      return "medium";
    case "system_error":
    case "crash":
      return "high";
  }
}

/**
 * Get recovery options for a failure type per spec (11-recovery.md lines 59-66)
 */
export function getRecoveryOptions(type: FailureType): RecoveryAction[] {
  switch (type) {
    case "feedback_failure":
      return ["retry_iteration", "fix_and_continue", "rollback"];
    case "timeout":
      return ["retry_iteration", "rollback"];
    case "claude_error":
      return ["retry_iteration", "manual_resolution"];
    case "system_error":
      return ["manual_resolution", "restart"];
    case "cancellation":
      return ["restart", "rollback"];
    case "crash":
      return ["restart", "rollback", "manual_resolution"];
  }
}

/**
 * Classify an error into a BattleFailure per spec (11-recovery.md lines 96-146)
 */
export function classifyFailure(error: Error, context: BattleContext): BattleFailure {
  const timestamp = new Date().toISOString();

  // Feedback loop failures
  if (error instanceof FeedbackLoopError) {
    return {
      type: "feedback_failure",
      timestamp,
      iteration: context.currentIteration,
      message: `Feedback loop '${error.loop}' failed`,
      details: error.output,
      recoverable: true,
      suggestedAction: "retry_iteration",
    };
  }

  // Timeout
  if (error instanceof TimeoutError) {
    return {
      type: "timeout",
      timestamp,
      iteration: context.currentIteration,
      message: "Iteration timed out",
      details: `Exceeded ${context.config.timeoutMinutes} minutes`,
      recoverable: true,
      suggestedAction: "retry_iteration",
    };
  }

  // Claude API/CLI errors
  if (error instanceof ClaudeError) {
    return {
      type: "claude_error",
      timestamp,
      iteration: context.currentIteration,
      message: error.message,
      details: error.stack,
      recoverable: error.retryable,
      suggestedAction: error.retryable ? "retry_iteration" : "manual_resolution",
    };
  }

  // Cancellation
  if (error instanceof CancellationError) {
    return {
      type: "cancellation",
      timestamp,
      iteration: context.currentIteration,
      message: error.message,
      details: error.reason,
      recoverable: true,
      suggestedAction: "restart",
    };
  }

  // Crash
  if (error instanceof CrashError) {
    return {
      type: "crash",
      timestamp,
      iteration: context.currentIteration,
      message: error.message,
      details: error.signal ? `Signal: ${error.signal}` : error.stack,
      recoverable: true,
      suggestedAction: "restart",
    };
  }

  // System errors (catch specific error patterns)
  if (isSystemError(error)) {
    return {
      type: "system_error",
      timestamp,
      iteration: context.currentIteration,
      message: error.message,
      details: error.stack,
      recoverable: false,
      suggestedAction: "manual_resolution",
    };
  }

  // Default to system_error for unknown errors
  return {
    type: "system_error",
    timestamp,
    iteration: context.currentIteration,
    message: error.message,
    details: error.stack,
    recoverable: false,
    suggestedAction: "manual_resolution",
  };
}

/**
 * Check if an error is a system-level error (disk, permissions, etc.)
 */
function isSystemError(error: Error): boolean {
  if (error instanceof SystemError) {
    return true;
  }

  const systemErrorPatterns = [
    /ENOSPC/i,         // Disk full
    /EACCES/i,         // Permission denied
    /EPERM/i,          // Operation not permitted
    /EMFILE/i,         // Too many open files
    /ENOMEM/i,         // Out of memory
    /ENFILE/i,         // File table overflow
    /disk full/i,
    /permission denied/i,
    /out of memory/i,
    /no space left/i,
  ];

  const message = error.message.toLowerCase();
  return systemErrorPatterns.some((pattern) => pattern.test(message));
}

/**
 * Create a user-friendly message for a failure
 */
export function getFailureMessage(failure: BattleFailure): string {
  switch (failure.type) {
    case "feedback_failure":
      return `Build/test failed: ${failure.message}`;
    case "timeout":
      return `Iteration timed out: ${failure.details}`;
    case "claude_error":
      return `Claude error: ${failure.message}`;
    case "system_error":
      return `System error: ${failure.message}`;
    case "cancellation":
      return `Cancelled: ${failure.message}`;
    case "crash":
      return `Process crashed: ${failure.message}`;
  }
}

/**
 * Get recovery suggestion text for a failure
 */
export function getRecoverySuggestion(failure: BattleFailure): string {
  switch (failure.suggestedAction) {
    case "retry_iteration":
      return "Retry the iteration with the error context included";
    case "fix_and_continue":
      return "Fix the issue manually, then continue the battle";
    case "rollback":
      return "Roll back changes and retry from a clean state";
    case "restart":
      return "Start the battle fresh from the beginning";
    case "manual_resolution":
      return "Manual intervention required to fix the underlying issue";
  }
}

/**
 * Get all available recovery suggestions for a failure
 */
export function getAllRecoverySuggestions(
  failure: BattleFailure
): Array<{ action: RecoveryAction; description: string; recommended: boolean }> {
  const options = getRecoveryOptions(failure.type);

  return options.map((action) => ({
    action,
    description: getRecoverySuggestion({ ...failure, suggestedAction: action }),
    recommended: action === failure.suggestedAction,
  }));
}
