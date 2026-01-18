/**
 * Core types for PokéRalph
 *
 * This module re-exports all types from the types directory.
 * Import from this file for a clean API:
 *
 * @example
 * ```ts
 * import { Task, TaskStatus, Config, PRD } from "@pokeralph/core";
 * ```
 */

// Configuration types
export { type Config, type ExecutionMode, DEFAULT_CONFIG } from "./config.ts";

// Task types
export { type Task, TaskStatus } from "./task.ts";

// PRD types
export type { PRD, PRDMetadata, DraftPRD, ConversationTurn, PartialPRD, PartialTask } from "./prd.ts";

// Progress types
export {
  type Progress,
  type ProgressStatus,
  type FeedbackResult,
  type FeedbackResults,
  createInitialProgress,
} from "./progress.ts";

// Iteration types
export {
  type Iteration,
  type IterationResult,
  createIteration,
} from "./iteration.ts";

// Battle types
export {
  type Battle,
  type BattleStatus,
  createBattle,
} from "./battle.ts";

// Event types
export {
  type EventType,
  type BaseEvent,
  type PokéRalphEvent,
  createEvent,
  // Planning events
  type PlanningStartedEvent,
  type PlanningOutputEvent,
  type PlanningQuestionEvent,
  type PlanningCompletedEvent,
  type PlanningStartedPayload,
  type PlanningOutputPayload,
  type PlanningQuestionPayload,
  type PlanningCompletedPayload,
  // Battle events
  type BattleStartEvent,
  type BattlePauseEvent,
  type BattleResumeEvent,
  type BattleCancelEvent,
  type BattleCompleteEvent,
  type BattleFailedEvent,
  type BattleStartPayload,
  type BattlePausePayload,
  type BattleResumePayload,
  type BattleCancelPayload,
  type BattleCompletePayload,
  type BattleFailedPayload,
  // Iteration events
  type IterationStartEvent,
  type IterationEndEvent,
  type IterationOutputEvent,
  type IterationStartPayload,
  type IterationEndPayload,
  type IterationOutputPayload,
  // Progress events
  type ProgressUpdateEvent,
  type CompletionDetectedEvent,
  type ProgressUpdatePayload,
  type CompletionDetectedPayload,
  // Feedback events
  type FeedbackStartEvent,
  type FeedbackResultEvent,
  type FeedbackStartPayload,
  type FeedbackResultPayload,
  // Approval events
  type AwaitApprovalEvent,
  type ApprovalReceivedEvent,
  type AwaitApprovalPayload,
  type ApprovalReceivedPayload,
  // System events
  type ErrorEvent,
  type WarningEvent,
  type ErrorPayload,
  type WarningPayload,
} from "./events.ts";
