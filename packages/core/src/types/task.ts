/**
 * Task types for PokéRalph
 *
 * A Task represents a unit of work to be executed as a "battle".
 * Tasks are defined in the PRD and executed by the BattleOrchestrator.
 */

/**
 * Status of a task in the PokéRalph system
 *
 * @remarks
 * - `pending` - Task has not been started yet
 * - `planning` - Task is being planned/refined
 * - `in_progress` - Task is currently being executed in a battle
 * - `paused` - Task execution was paused (HITL mode or manual)
 * - `completed` - Task finished successfully
 * - `failed` - Task failed after max iterations or error
 */
export enum TaskStatus {
  /** Task has not been started yet */
  Pending = "pending",
  /** Task is being planned/refined */
  Planning = "planning",
  /** Task is currently being executed in a battle */
  InProgress = "in_progress",
  /** Task execution was paused (HITL mode or manual) */
  Paused = "paused",
  /** Task finished successfully */
  Completed = "completed",
  /** Task failed after max iterations or error */
  Failed = "failed",
}

/**
 * A task to be executed by the Battle Loop
 *
 * @remarks
 * Tasks are stored in `prd.json` with their definitions.
 * Runtime iteration data is stored separately in `battles/{task-id}/history.json`.
 */
export interface Task {
  /**
   * Unique identifier for the task
   * @example "001-monorepo-setup"
   */
  id: string;

  /**
   * Human-readable title of the task
   * @example "Monorepo setup with Bun workspaces"
   */
  title: string;

  /**
   * Detailed description of what the task involves
   */
  description: string;

  /**
   * Current status of the task
   */
  status: TaskStatus;

  /**
   * Priority level (lower number = higher priority)
   * @example 1 for highest priority
   */
  priority: number;

  /**
   * List of criteria that must be met for task completion
   */
  acceptanceCriteria: string[];

  /**
   * Runtime iteration data (populated during battle execution)
   * @remarks Stored separately in `battles/{task-id}/history.json`
   */
  iterations: Iteration[];

  /**
   * ISO timestamp when the task was created
   */
  createdAt: string;

  /**
   * ISO timestamp when the task was last updated
   */
  updatedAt: string;
}

/**
 * Iteration data referenced by Task
 * @remarks Full interface defined in iteration.ts
 */
import type { Iteration } from "./iteration.ts";
