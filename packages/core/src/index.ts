/**
 * @pokeralph/core
 *
 * Core business logic for PokéRalph - the autonomous development orchestrator.
 * This package contains types, services, and the main orchestrator.
 * It has zero UI dependencies and runs in any environment.
 */

// Version export for debugging
export const VERSION = "0.1.0";

// Re-export services
export {
  FileManager,
  FileNotFoundError,
  ValidationError,
  // PromptBuilder
  PromptBuilder,
  type TaskContext,
  PRD_OUTPUT_SCHEMA,
  TASKS_OUTPUT_SCHEMA,
  PROGRESS_UPDATE_SCHEMA,
  COMPLETION_SIGIL,
  // ClaudeBridge
  ClaudeBridge,
  type ClaudeBridgeOptions,
  type ClaudeMode,
  type ExitCallback,
  type OutputCallback,
  // ProgressWatcher
  ProgressWatcher,
  type ProgressWatcherOptions,
  type ProgressWatcherEvents,
  // FeedbackRunner
  FeedbackRunner,
  type FeedbackRunnerOptions,
  type FeedbackLoopResult,
  STANDARD_LOOPS,
  type StandardLoop,
  // Zod schemas
  ConfigSchema,
  TaskSchema,
  PRDSchema,
  ProgressSchema,
  BattleSchema,
  IterationSchema,
  ExecutionModeSchema,
  TaskStatusSchema,
  ProgressStatusSchema,
  BattleStatusSchema,
  FeedbackResultSchema,
  FeedbackResultsSchema,
  PRDMetadataSchema,
} from "./services/index.ts";

// Re-export all types
export {
  // Configuration
  type Config,
  type ExecutionMode,
  DEFAULT_CONFIG,
  // Task
  type Task,
  TaskStatus,
  // PRD
  type PRD,
  type PRDMetadata,
  // Progress
  type Progress,
  type ProgressStatus,
  type FeedbackResult,
  type FeedbackResults,
  createInitialProgress,
  // Iteration
  type Iteration,
  type IterationResult,
  createIteration,
  // Battle
  type Battle,
  type BattleStatus,
  createBattle,
  // Events
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
} from "./types/index.ts";
