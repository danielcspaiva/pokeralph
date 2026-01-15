/**
 * Battle types for PokéRalph
 *
 * A Battle is the execution of a single task through the Battle Loop.
 * Battle history is stored in `.pokeralph/battles/{task-id}/history.json`.
 */

import type { Iteration } from "./iteration.ts";

/**
 * Status of a battle
 */
export type BattleStatus =
  | "pending"
  | "running"
  | "paused"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * A battle representing the execution of a single task
 *
 * @remarks
 * The Battle Loop: prompt → execute → poll → feedback → commit → repeat
 * Each iteration is one Claude Code execution within the battle.
 *
 * @example
 * ```json
 * {
 *   "taskId": "001-monorepo-setup",
 *   "status": "completed",
 *   "iterations": [...],
 *   "startedAt": "2025-01-15T10:00:00Z",
 *   "completedAt": "2025-01-15T10:30:00Z"
 * }
 * ```
 */
export interface Battle {
  /**
   * ID of the task this battle is executing
   */
  taskId: string;

  /**
   * Current status of the battle
   */
  status: BattleStatus;

  /**
   * Array of iterations executed in this battle
   */
  iterations: Iteration[];

  /**
   * ISO timestamp when the battle started
   */
  startedAt: string;

  /**
   * ISO timestamp when the battle completed (undefined if still running)
   */
  completedAt?: string;

  /**
   * Total duration in milliseconds
   */
  durationMs?: number;

  /**
   * Error message if the battle failed
   */
  error?: string;
}

/**
 * Creates a new battle object
 */
export function createBattle(taskId: string): Battle {
  return {
    taskId,
    status: "pending",
    iterations: [],
    startedAt: new Date().toISOString(),
  };
}
