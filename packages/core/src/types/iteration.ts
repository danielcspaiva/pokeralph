/**
 * Iteration types for PokéRalph
 *
 * An Iteration represents a single Claude Code execution within a battle.
 * Iterations are stored in `.pokeralph/battles/{task-id}/history.json`.
 */

/**
 * Result of an iteration
 */
export type IterationResult = "success" | "failure" | "timeout" | "cancelled";

/**
 * A single iteration within a battle
 *
 * @remarks
 * Each iteration represents one Claude Code execution attempt.
 * The battle continues with new iterations until completion or max iterations.
 *
 * @example
 * ```json
 * {
 *   "number": 1,
 *   "startedAt": "2025-01-15T10:00:00Z",
 *   "endedAt": "2025-01-15T10:05:00Z",
 *   "output": "Implemented feature X...",
 *   "result": "success",
 *   "filesChanged": ["src/index.ts", "tests/index.test.ts"]
 * }
 * ```
 */
export interface Iteration {
  /**
   * Iteration number (1-indexed)
   */
  number: number;

  /**
   * ISO timestamp when the iteration started
   */
  startedAt: string;

  /**
   * ISO timestamp when the iteration ended (undefined if still running)
   */
  endedAt?: string;

  /**
   * Summary or relevant output from Claude's execution
   */
  output: string;

  /**
   * Result of the iteration
   */
  result: IterationResult;

  /**
   * List of files that were modified during this iteration
   */
  filesChanged: string[];

  /**
   * Git commit hash if auto-commit was enabled
   */
  commitHash?: string;

  /**
   * Error message if the iteration failed
   */
  error?: string;
}

/**
 * Creates a new iteration object
 */
export function createIteration(number: number): Iteration {
  return {
    number,
    startedAt: new Date().toISOString(),
    output: "",
    result: "success",
    filesChanged: [],
  };
}
