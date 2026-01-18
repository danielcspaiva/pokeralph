/**
 * Recovery Service for PokéRalph
 *
 * Handles failure classification, recovery suggestions, and battle recovery.
 * Based on spec 11-recovery.md.
 */

import type { Config } from "../types/config.ts";
import type { Battle } from "../types/battle.ts";
import type { Iteration } from "../types/iteration.ts";

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

// ==========================================================================
// Resume Strategies (11-recovery.md lines 180-318)
// ==========================================================================

/**
 * Resume strategy types per spec (11-recovery.md lines 188-193)
 */
export type ResumeStrategy =
  | "retry_same"          // Retry the failed iteration
  | "retry_with_context"  // Retry with error context added
  | "rollback_and_retry"  // Revert changes, retry
  | "continue_next"       // Skip to next iteration
  | "manual_then_continue"; // Wait for manual fix

/**
 * Options for resuming a battle per spec (11-recovery.md lines 180-186)
 */
export interface ResumeOptions {
  strategy: ResumeStrategy;
  fromIteration?: number;
  includeErrorContext: boolean;
  additionalInstructions?: string;
}

/**
 * Options for retrying an iteration
 */
export interface RetryOptions {
  includeErrorContext: boolean;
  errorContext?: string;
  additionalInstructions?: string;
}

/**
 * Result of a resume operation
 */
export interface ResumeResult {
  success: boolean;
  strategy: ResumeStrategy;
  iteration: number;
  message: string;
  errorContext?: string;
  additionalInstructions?: string;
}

/**
 * Builds the enhanced prompt for retry with context per spec (11-recovery.md lines 291-318)
 *
 * @param basePrompt - The original task prompt
 * @param options - Retry options with error context and instructions
 * @returns The enhanced prompt
 */
export function buildRetryPrompt(
  basePrompt: string,
  options: RetryOptions
): string {
  let prompt = basePrompt;

  if (options.includeErrorContext && options.errorContext) {
    prompt += `\n\n## Previous Attempt Failed\n\n${options.errorContext}`;
  }

  if (options.additionalInstructions) {
    prompt += `\n\n## Additional Instructions\n\n${options.additionalInstructions}`;
  }

  return prompt;
}

/**
 * Prepares an iteration for retry per spec (11-recovery.md lines 306-314)
 *
 * @param battle - The battle being resumed
 * @param iteration - The iteration to retry
 * @returns The reset iteration ready for retry
 */
export function prepareIterationForRetry(
  battle: Battle,
  iteration: number
): Iteration {
  const existingIteration = battle.iterations[iteration - 1];
  const retryCount = existingIteration?.retryCount ?? 0;

  return {
    number: iteration,
    startedAt: new Date().toISOString(),
    output: "",
    result: "pending",
    filesChanged: [],
    retryCount: retryCount + 1,
  };
}

/**
 * Builds resume context based on the strategy and failure
 *
 * @param strategy - The resume strategy
 * @param failure - The battle failure information
 * @param additionalInstructions - User-provided instructions
 * @returns ResumeResult with context for the resumption
 */
export function buildResumeContext(
  strategy: ResumeStrategy,
  failure: BattleFailure,
  additionalInstructions?: string
): ResumeResult {
  switch (strategy) {
    case "retry_same":
      return {
        success: true,
        strategy,
        iteration: failure.iteration,
        message: `Retrying iteration ${failure.iteration} without additional context`,
      };

    case "retry_with_context":
      return {
        success: true,
        strategy,
        iteration: failure.iteration,
        message: `Retrying iteration ${failure.iteration} with error context`,
        errorContext: failure.details ?? failure.message,
        additionalInstructions,
      };

    case "rollback_and_retry":
      return {
        success: true,
        strategy,
        iteration: failure.iteration,
        message: `Rolling back changes from iteration ${failure.iteration} and retrying`,
        errorContext: `Previous attempt failed: ${failure.message}`,
        additionalInstructions,
      };

    case "continue_next":
      return {
        success: true,
        strategy,
        iteration: failure.iteration + 1,
        message: `Skipping to iteration ${failure.iteration + 1}`,
        additionalInstructions,
      };

    case "manual_then_continue":
      return {
        success: true,
        strategy,
        iteration: failure.iteration,
        message: "Pausing for manual fix",
        additionalInstructions,
      };

    default:
      return {
        success: false,
        strategy,
        iteration: failure.iteration,
        message: `Unknown resume strategy: ${strategy}`,
      };
  }
}

/**
 * Validates if a resume strategy is valid for the given failure type
 *
 * @param strategy - The resume strategy to validate
 * @param failure - The battle failure
 * @returns True if the strategy is valid for this failure
 */
export function isValidResumeStrategy(
  strategy: ResumeStrategy,
  failure: BattleFailure
): boolean {
  // Non-recoverable failures only allow manual_resolution (which maps to manual_then_continue)
  if (!failure.recoverable) {
    return strategy === "manual_then_continue";
  }

  // Map resume strategies to recovery actions for validation
  const strategyToAction: Record<ResumeStrategy, RecoveryAction> = {
    retry_same: "retry_iteration",
    retry_with_context: "retry_iteration",
    rollback_and_retry: "rollback",
    continue_next: "retry_iteration", // Effectively skipping is a form of retry
    manual_then_continue: "fix_and_continue",
  };

  const mappedAction = strategyToAction[strategy];
  const validActions = getRecoveryOptions(failure.type);

  return validActions.includes(mappedAction);
}

/**
 * Gets the default resume strategy for a failure type
 *
 * @param failure - The battle failure
 * @returns The recommended default strategy
 */
export function getDefaultResumeStrategy(failure: BattleFailure): ResumeStrategy {
  if (!failure.recoverable) {
    return "manual_then_continue";
  }

  // Map suggested actions to resume strategies
  switch (failure.suggestedAction) {
    case "retry_iteration":
      return "retry_with_context"; // Default to retry with context for better recovery
    case "fix_and_continue":
      return "manual_then_continue";
    case "rollback":
      return "rollback_and_retry";
    case "restart":
      return "retry_same";
    case "manual_resolution":
      return "manual_then_continue";
    default:
      return "retry_with_context";
  }
}

// ==========================================================================
// Manual Fix Mode (11-recovery.md lines 322-588)
// ==========================================================================

import type { FeedbackResults } from "../types/progress.ts";
import { watch, type FSWatcher } from "node:fs";

/**
 * Status of a manual fix session
 */
export type ManualFixSessionStatus = "active" | "completed" | "aborted";

/**
 * Type of file change detected
 */
export type FileChangeType = "modified" | "created" | "deleted";

/**
 * Represents a file change detected during manual fix mode
 * Per spec (11-recovery.md lines 459-463)
 */
export interface FileChange {
  /** Path to the changed file (relative to working directory) */
  path: string;
  /** Type of change */
  type: FileChangeType;
  /** Git diff if available */
  diff?: string;
  /** Timestamp when change was detected */
  detectedAt: string;
}

/**
 * Manual fix session for tracking user's manual intervention
 * Per spec (11-recovery.md lines 447-457)
 */
export interface ManualFixSession {
  /** Unique session ID */
  id: string;
  /** Battle ID this session belongs to */
  battleId: string;
  /** Task ID this session belongs to */
  taskId: string;
  /** Working directory being watched */
  workingDir: string;
  /** ISO timestamp when session started */
  startedAt: string;
  /** The issue that triggered manual fix mode */
  issue: BattleFailure;
  /** Files changed during the session */
  detectedChanges: FileChange[];
  /** Last time a change was detected */
  lastChangeDetected?: string;
  /** Results of verification after manual fix */
  verificationResults: FeedbackResults | null;
  /** Whether the fix has been verified */
  verified: boolean;
  /** Current status of the session */
  status: ManualFixSessionStatus;
}

/**
 * Options for starting a manual fix session
 */
export interface StartManualFixOptions {
  /** Working directory to watch */
  workingDir: string;
  /** Battle ID */
  battleId: string;
  /** Task ID */
  taskId: string;
  /** The failure that triggered manual fix mode */
  failure: BattleFailure;
  /** Callback when file changes are detected */
  onChangeDetected?: (session: ManualFixSession, change: FileChange) => void;
}

/**
 * Result of verifying a manual fix
 */
export interface VerifyManualFixResult {
  /** Whether all feedback loops passed */
  verified: boolean;
  /** Results from each feedback loop */
  results: FeedbackResults;
  /** Summary message */
  message: string;
}

/**
 * Tracks active file watchers for cleanup
 * Per spec (11-recovery.md lines 466, 495-497)
 */
const activeWatchers = new Map<string, FSWatcher>();

/**
 * Tracks active sessions for management
 */
const activeSessions = new Map<string, ManualFixSession>();

/**
 * Generates a unique session ID
 */
function generateSessionId(): string {
  return `mfs-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Files and directories to ignore when watching for changes
 */
const IGNORED_PATTERNS = [
  /node_modules/,
  /\.git/,
  /\.pokeralph/,
  /\.next/,
  /\.nuxt/,
  /dist/,
  /build/,
  /coverage/,
  /\.cache/,
  /\.turbo/,
  /\.DS_Store/,
  /\.swp$/,
  /\.swo$/,
  /~$/,
];

/**
 * Check if a file path should be tracked for changes
 */
function shouldTrackChange(filename: string | null): boolean {
  if (!filename) return false;

  for (const pattern of IGNORED_PATTERNS) {
    if (pattern.test(filename)) {
      return false;
    }
  }

  return true;
}

/**
 * Starts a manual fix session with file watching
 * Per spec (11-recovery.md lines 468-499)
 *
 * @param options - Options for starting the session
 * @returns The created ManualFixSession
 */
export function startManualFixSession(options: StartManualFixOptions): ManualFixSession {
  const sessionId = generateSessionId();

  const session: ManualFixSession = {
    id: sessionId,
    battleId: options.battleId,
    taskId: options.taskId,
    workingDir: options.workingDir,
    startedAt: new Date().toISOString(),
    issue: options.failure,
    detectedChanges: [],
    verificationResults: null,
    verified: false,
    status: "active",
  };

  // Start file watcher
  const watcher = watch(
    options.workingDir,
    { recursive: true },
    (eventType, filename) => {
      if (session.status !== "active") return;

      if (shouldTrackChange(filename)) {
        const change: FileChange = {
          path: filename ?? "unknown",
          type: eventType === "rename" ? "created" : "modified",
          detectedAt: new Date().toISOString(),
        };

        // Avoid duplicate entries for the same file
        const existingIndex = session.detectedChanges.findIndex(
          (c) => c.path === change.path
        );

        if (existingIndex >= 0) {
          // Update existing entry
          session.detectedChanges[existingIndex] = change;
        } else {
          session.detectedChanges.push(change);
        }

        session.lastChangeDetected = change.detectedAt;

        // Notify callback if provided
        if (options.onChangeDetected) {
          options.onChangeDetected(session, change);
        }
      }
    }
  );

  // Track watcher and session for cleanup
  activeWatchers.set(sessionId, watcher);
  activeSessions.set(sessionId, session);

  return session;
}

/**
 * Gets an active manual fix session by ID
 *
 * @param sessionId - The session ID to look up
 * @returns The session or undefined if not found
 */
export function getManualFixSession(sessionId: string): ManualFixSession | undefined {
  return activeSessions.get(sessionId);
}

/**
 * Gets all active manual fix sessions
 *
 * @returns Array of active sessions
 */
export function getActiveManualFixSessions(): ManualFixSession[] {
  return Array.from(activeSessions.values()).filter(
    (s) => s.status === "active"
  );
}

/**
 * Cleans up a manual fix session's resources
 * MUST be called when session ends, whether completed, aborted, or on error.
 *
 * Lifecycle teardown occurs on:
 * - Session complete: User clicks "Continue Battle"
 * - Session abort: User clicks "Cancel Battle"
 * - Battle cancel: Battle cancelled externally
 * - Server shutdown: Graceful shutdown handler
 * - Error: Unhandled error in session
 *
 * Per spec (11-recovery.md lines 501-518)
 *
 * @param sessionId - The session ID to clean up
 */
export function cleanupManualFixSession(sessionId: string): void {
  const watcher = activeWatchers.get(sessionId);
  if (watcher) {
    watcher.close();
    activeWatchers.delete(sessionId);
  }
  activeSessions.delete(sessionId);
}

/**
 * Cleans up all active manual fix sessions
 * Called during server shutdown for graceful teardown.
 *
 * Per spec (11-recovery.md lines 520-529)
 */
export function cleanupAllManualFixSessions(): void {
  for (const [sessionId, watcher] of activeWatchers) {
    watcher.close();
    activeWatchers.delete(sessionId);
  }
  activeSessions.clear();
}

/**
 * Marks a manual fix session as verified with results
 * Per spec (11-recovery.md lines 531-539)
 *
 * @param sessionId - The session ID
 * @param results - Results from running feedback loops
 * @returns Whether verification passed
 */
export function setManualFixVerificationResults(
  sessionId: string,
  results: FeedbackResults
): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error(`Manual fix session not found: ${sessionId}`);
  }

  session.verificationResults = results;
  session.verified = Object.values(results).every((r) => r.passed);

  return session.verified;
}

/**
 * Completes a manual fix session successfully
 * Per spec (11-recovery.md lines 541-566)
 *
 * @param sessionId - The session ID to complete
 * @returns The context string to add to the next iteration
 * @throws Error if session is not verified
 */
export function completeManualFixSession(sessionId: string): string {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error(`Manual fix session not found: ${sessionId}`);
  }

  if (!session.verified) {
    throw new Error("Cannot complete manual fix session - fix not verified");
  }

  // Build context about the manual fix
  const context = buildManualFixContext(session);

  // Mark as completed and clean up
  session.status = "completed";
  cleanupManualFixSession(sessionId);

  return context;
}

/**
 * Aborts a manual fix session
 * Per spec (11-recovery.md lines 568-571)
 *
 * @param sessionId - The session ID to abort
 */
export function abortManualFixSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.status = "aborted";
  }
  cleanupManualFixSession(sessionId);
}

/**
 * Builds context about a manual fix for the next iteration
 * Per spec (11-recovery.md lines 573-587)
 *
 * @param session - The manual fix session
 * @returns Context string to include in the next prompt
 */
export function buildManualFixContext(session: ManualFixSession): string {
  const changes = session.detectedChanges
    .map((c) => `- ${c.type}: ${c.path}`)
    .join("\n");

  return `## Manual Fix Applied

The user manually fixed the following issue:
${session.issue.message}

Files changed:
${changes || "- No file changes detected"}

Continue building on these changes.`;
}

/**
 * Gets the number of active watchers (for testing/monitoring)
 */
export function getActiveWatcherCount(): number {
  return activeWatchers.size;
}

/**
 * Gets the number of active sessions (for testing/monitoring)
 */
export function getActiveSessionCount(): number {
  return activeSessions.size;
}
