/**
 * Configuration types for PokéRalph
 *
 * Configuration is stored in `.pokeralph/config.json` in the user's repository.
 */

/**
 * Execution mode for battles
 *
 * @remarks
 * - `hitl` - Human in the Loop: pauses after each iteration for approval
 * - `yolo` - Runs automatically until completion or max iterations
 */
export type ExecutionMode = "hitl" | "yolo";

/**
 * Configuration for a PokéRalph project
 *
 * @remarks
 * This configuration controls how battles are executed.
 *
 * @example
 * ```json
 * {
 *   "maxIterationsPerTask": 10,
 *   "mode": "hitl",
 *   "feedbackLoops": ["test", "lint", "typecheck"],
 *   "timeoutMinutes": 30,
 *   "pollingIntervalMs": 2000,
 *   "autoCommit": true
 * }
 * ```
 */
export interface Config {
  /**
   * Maximum iterations allowed per task before failure
   * @default 10
   */
  maxIterationsPerTask: number;

  /**
   * Execution mode: "hitl" (Human in the Loop) or "yolo" (automatic)
   * @default "hitl"
   */
  mode: ExecutionMode;

  /**
   * Feedback loops to run after each iteration
   * @default ["test", "lint", "typecheck"]
   * @example ["test", "lint", "typecheck", "format:check"]
   */
  feedbackLoops: string[];

  /**
   * Timeout in minutes for each iteration
   * @default 30
   */
  timeoutMinutes: number;

  /**
   * Interval in milliseconds for polling progress.json
   * @default 2000
   */
  pollingIntervalMs: number;

  /**
   * Whether to automatically commit after successful iterations
   * @default true
   */
  autoCommit: boolean;
}

/**
 * Default configuration values for new projects
 */
export const DEFAULT_CONFIG: Config = {
  maxIterationsPerTask: 10,
  mode: "hitl",
  feedbackLoops: ["test", "lint", "typecheck"],
  timeoutMinutes: 30,
  pollingIntervalMs: 2000,
  autoCommit: true,
};
