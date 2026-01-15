/**
 * Progress types for PokéRalph
 *
 * Progress is tracked in `.pokeralph/battles/{task-id}/progress.json`.
 * This file is polled by the ProgressWatcher to emit real-time updates.
 */

/**
 * Result of running a single feedback loop (test, lint, typecheck, etc.)
 */
export interface FeedbackResult {
  /**
   * Whether the feedback loop passed
   */
  passed: boolean;

  /**
   * Output from the feedback loop command
   */
  output: string;

  /**
   * Duration in milliseconds the feedback loop took
   */
  duration?: number;
}

/**
 * Map of feedback loop names to their results
 * @example { "test": { passed: true, output: "5 passed" }, "lint": { passed: false, output: "2 errors" } }
 */
export type FeedbackResults = Record<string, FeedbackResult>;

/**
 * Status of the current progress
 */
export type ProgressStatus =
  | "idle"
  | "in_progress"
  | "awaiting_approval"
  | "completed"
  | "failed";

/**
 * Current progress of a battle
 *
 * @remarks
 * This is stored in `progress.json` and updated by Claude during execution.
 * The ProgressWatcher polls this file to detect changes and emit events.
 *
 * @example
 * ```json
 * {
 *   "taskId": "001-task-name",
 *   "currentIteration": 3,
 *   "status": "in_progress",
 *   "lastUpdate": "2025-01-15T10:30:00Z",
 *   "logs": ["Exploring codebase...", "Implementing function X..."],
 *   "lastOutput": "Running tests... ✓ 5 passed",
 *   "completionDetected": false,
 *   "error": null,
 *   "feedbackResults": {
 *     "test": { "passed": true, "output": "5 passed" }
 *   }
 * }
 * ```
 */
export interface Progress {
  /**
   * ID of the task this progress is tracking
   */
  taskId: string;

  /**
   * Current iteration number (1-indexed)
   */
  currentIteration: number;

  /**
   * Current status of the progress
   */
  status: ProgressStatus;

  /**
   * ISO timestamp of the last update
   */
  lastUpdate: string;

  /**
   * Array of log messages from Claude's output
   */
  logs: string[];

  /**
   * Most recent line from Claude's output
   */
  lastOutput: string;

  /**
   * True if the completion sigil `<promise>COMPLETE</promise>` was detected
   */
  completionDetected: boolean;

  /**
   * Error message if the iteration failed, null otherwise
   */
  error: string | null;

  /**
   * Results of each feedback loop that was run
   */
  feedbackResults: FeedbackResults;
}

/**
 * Creates an initial progress object for a new battle
 */
export function createInitialProgress(taskId: string): Progress {
  return {
    taskId,
    currentIteration: 0,
    status: "idle",
    lastUpdate: new Date().toISOString(),
    logs: [],
    lastOutput: "",
    completionDetected: false,
    error: null,
    feedbackResults: {},
  };
}
