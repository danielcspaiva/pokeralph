/**
 * Event types for PokéRalph
 *
 * Events are emitted by the Orchestrator and services,
 * then broadcast via WebSocket to connected clients.
 */

import type { Battle } from "./battle.ts";
import type { FeedbackResult, Progress } from "./progress.ts";
import type { PRD } from "./prd.ts";
import type { Task } from "./task.ts";

/**
 * All possible event types in the system
 */
export type EventType =
  // Planning events
  | "planning_started"
  | "planning_output"
  | "planning_question"
  | "planning_completed"
  // Battle events
  | "battle_start"
  | "battle_pause"
  | "battle_resume"
  | "battle_cancel"
  | "battle_complete"
  | "battle_failed"
  // Iteration events
  | "iteration_start"
  | "iteration_end"
  | "iteration_output"
  // Progress events
  | "progress_update"
  | "completion_detected"
  // Feedback events
  | "feedback_start"
  | "feedback_result"
  // Approval events (HITL)
  | "await_approval"
  | "approval_received"
  // System events
  | "error"
  | "warning";

/**
 * Base event structure
 */
export interface BaseEvent<T extends EventType, P = unknown> {
  /**
   * Type of the event
   */
  type: T;

  /**
   * Event payload
   */
  payload: P;

  /**
   * ISO timestamp when the event was created
   */
  timestamp: string;
}

// Planning event payloads

export interface PlanningStartedPayload {
  idea: string;
}

export interface PlanningOutputPayload {
  output: string;
}

export interface PlanningQuestionPayload {
  question: string;
}

export interface PlanningCompletedPayload {
  prd: PRD;
}

// Battle event payloads

export interface BattleStartPayload {
  taskId: string;
  task: Task;
}

export interface BattlePausePayload {
  taskId: string;
  iteration: number;
}

export interface BattleResumePayload {
  taskId: string;
}

export interface BattleCancelPayload {
  taskId: string;
  reason?: string;
}

export interface BattleCompletePayload {
  taskId: string;
  battle: Battle;
}

export interface BattleFailedPayload {
  taskId: string;
  error: string;
  battle: Battle;
}

// Iteration event payloads

export interface IterationStartPayload {
  taskId: string;
  iteration: number;
}

export interface IterationEndPayload {
  taskId: string;
  iteration: number;
  result: "success" | "failure" | "timeout" | "cancelled";
}

export interface IterationOutputPayload {
  taskId: string;
  iteration: number;
  output: string;
}

// Progress event payloads

export interface ProgressUpdatePayload {
  taskId: string;
  progress: Progress;
}

export interface CompletionDetectedPayload {
  taskId: string;
}

// Feedback event payloads

export interface FeedbackStartPayload {
  taskId: string;
  loop: string;
}

export interface FeedbackResultPayload {
  taskId: string;
  loop: string;
  result: FeedbackResult;
}

// Approval event payloads

export interface AwaitApprovalPayload {
  taskId: string;
  iteration: number;
  summary: string;
}

export interface ApprovalReceivedPayload {
  taskId: string;
  approved: boolean;
}

// System event payloads

export interface ErrorPayload {
  message: string;
  code?: string;
  details?: unknown;
}

export interface WarningPayload {
  message: string;
  code?: string;
}

// Typed event definitions

export type PlanningStartedEvent = BaseEvent<
  "planning_started",
  PlanningStartedPayload
>;
export type PlanningOutputEvent = BaseEvent<
  "planning_output",
  PlanningOutputPayload
>;
export type PlanningQuestionEvent = BaseEvent<
  "planning_question",
  PlanningQuestionPayload
>;
export type PlanningCompletedEvent = BaseEvent<
  "planning_completed",
  PlanningCompletedPayload
>;

export type BattleStartEvent = BaseEvent<"battle_start", BattleStartPayload>;
export type BattlePauseEvent = BaseEvent<"battle_pause", BattlePausePayload>;
export type BattleResumeEvent = BaseEvent<"battle_resume", BattleResumePayload>;
export type BattleCancelEvent = BaseEvent<"battle_cancel", BattleCancelPayload>;
export type BattleCompleteEvent = BaseEvent<
  "battle_complete",
  BattleCompletePayload
>;
export type BattleFailedEvent = BaseEvent<"battle_failed", BattleFailedPayload>;

export type IterationStartEvent = BaseEvent<
  "iteration_start",
  IterationStartPayload
>;
export type IterationEndEvent = BaseEvent<"iteration_end", IterationEndPayload>;
export type IterationOutputEvent = BaseEvent<
  "iteration_output",
  IterationOutputPayload
>;

export type ProgressUpdateEvent = BaseEvent<
  "progress_update",
  ProgressUpdatePayload
>;
export type CompletionDetectedEvent = BaseEvent<
  "completion_detected",
  CompletionDetectedPayload
>;

export type FeedbackStartEvent = BaseEvent<
  "feedback_start",
  FeedbackStartPayload
>;
export type FeedbackResultEvent = BaseEvent<
  "feedback_result",
  FeedbackResultPayload
>;

export type AwaitApprovalEvent = BaseEvent<
  "await_approval",
  AwaitApprovalPayload
>;
export type ApprovalReceivedEvent = BaseEvent<
  "approval_received",
  ApprovalReceivedPayload
>;

export type ErrorEvent = BaseEvent<"error", ErrorPayload>;
export type WarningEvent = BaseEvent<"warning", WarningPayload>;

/**
 * Union of all possible events
 */
export type PokéRalphEvent =
  | PlanningStartedEvent
  | PlanningOutputEvent
  | PlanningQuestionEvent
  | PlanningCompletedEvent
  | BattleStartEvent
  | BattlePauseEvent
  | BattleResumeEvent
  | BattleCancelEvent
  | BattleCompleteEvent
  | BattleFailedEvent
  | IterationStartEvent
  | IterationEndEvent
  | IterationOutputEvent
  | ProgressUpdateEvent
  | CompletionDetectedEvent
  | FeedbackStartEvent
  | FeedbackResultEvent
  | AwaitApprovalEvent
  | ApprovalReceivedEvent
  | ErrorEvent
  | WarningEvent;

/**
 * Helper to create a typed event
 */
export function createEvent<T extends EventType, P>(
  type: T,
  payload: P
): BaseEvent<T, P> {
  return {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
}
