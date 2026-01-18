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

// BattleOrchestrator - orchestrates the Battle Loop for tasks
export {
  BattleOrchestrator,
  type BattleOrchestratorDependencies,
  type BattleOrchestratorEvents,
} from "./battle-orchestrator.ts";

// PlanService - manages planning phase and PRD generation
export {
  PlanService,
  type PlanServiceDependencies,
  type PlanServiceEvents,
  type PlanningState,
  type PRDParseResult,
  type TasksParseResult,
  type PRDExtractionErrorCode,
} from "./plan-service.ts";


// ProjectDetection - detects project type and suggests configuration
export {
  detectProject,
  getSuggestedConfig,
  hasLowTrustDefaults,
  getDetectionGuidance,
  PROJECT_DEFAULTS,
  UNKNOWN_PROJECT_EXPLANATION,
  type ProjectType,
  type ProjectDetection,
} from "./project-detection.ts";

// PreflightService - runs pre-battle validation checks
export {
  PreflightService,
  tokenizeCommand,
  toPreflightCheckResultDTO,
  toPreflightReportDTO,
  generatePreflightToken,
  validatePreflightToken,
  assessTaskRisk,
  type PreflightCheckCategory,
  type PreflightCheckSeverity,
  type PreflightContext,
  type PreflightResult,
  type FixResult,
  type PreflightCheck,
  type PreflightCheckResult,
  type PreflightCheckResultDTO,
  type PreflightSummary,
  type PreflightReport,
  type PreflightReportDTO,
  type TaskRisk,
  type TaskRiskFactor,
} from "./preflight-service.ts";

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
