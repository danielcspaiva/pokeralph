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
