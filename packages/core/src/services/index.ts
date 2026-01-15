/**
 * Services module for @pokeralph/core
 *
 * This module exports all services used by the PokéRalph orchestrator.
 */

// FileManager - handles all file I/O for .pokeralph/ folder
export { FileManager } from "./file-manager.ts";

// PromptBuilder - constructs optimized prompts for Claude Code
export {
  PromptBuilder,
  type TaskContext,
  PRD_OUTPUT_SCHEMA,
  TASKS_OUTPUT_SCHEMA,
  PROGRESS_UPDATE_SCHEMA,
  COMPLETION_SIGIL,
} from "./prompt-builder.ts";

// ClaudeBridge - spawns and monitors Claude Code CLI
export {
  ClaudeBridge,
  type ClaudeBridgeOptions,
  type ClaudeMode,
  type ExitCallback,
  type OutputCallback,
} from "./claude-bridge.ts";

// ProgressWatcher - polls progress.json and emits events
export {
  ProgressWatcher,
  type ProgressWatcherOptions,
  type ProgressWatcherEvents,
} from "./progress-watcher.ts";

// FeedbackRunner - executes feedback loops (test, lint, typecheck)
export {
  FeedbackRunner,
  type FeedbackRunnerOptions,
  type FeedbackLoopResult,
  STANDARD_LOOPS,
  type StandardLoop,
} from "./feedback-runner.ts";

// GitService - manages Git operations (commit, status, revert)
export {
  GitService,
  type GitServiceOptions,
  type FileStatus,
  type GitStatus,
  type CommitInfo,
} from "./git-service.ts";

// Custom error classes
export { FileNotFoundError, ValidationError } from "./errors.ts";

// Zod schemas for validation
export {
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
} from "./schemas.ts";
