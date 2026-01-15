/**
 * PRD (Product Requirements Document) types for PokéRalph
 *
 * The PRD is the main document that defines a project's tasks.
 * It is stored in `.pokeralph/prd.json` in the user's repository.
 */

import type { Task } from "./task.ts";

/**
 * Metadata about the PRD
 */
export interface PRDMetadata {
  /**
   * Version of the PRD schema
   * @example "1.0.0"
   */
  version: string;

  /**
   * Name of the tool/author that generated the PRD
   * @example "claude-code"
   */
  generatedBy?: string;

  /**
   * Original idea/prompt that led to this PRD
   */
  originalIdea?: string;
}

/**
 * Product Requirements Document for a PokéRalph project
 *
 * @remarks
 * The PRD contains the project definition and all tasks.
 * Task runtime data (iterations) is stored separately in the battles folder.
 *
 * @example
 * ```json
 * {
 *   "name": "My Project",
 *   "description": "A cool project",
 *   "createdAt": "2025-01-15T10:00:00Z",
 *   "tasks": [...]
 * }
 * ```
 */
export interface PRD {
  /**
   * Name of the project
   * @example "PokéRalph"
   */
  name: string;

  /**
   * Description of the project
   */
  description: string;

  /**
   * Array of tasks that comprise the project
   */
  tasks: Task[];

  /**
   * Optional metadata about the PRD
   */
  metadata?: PRDMetadata;

  /**
   * ISO timestamp when the PRD was created
   */
  createdAt: string;

  /**
   * ISO timestamp when the PRD was last updated
   */
  updatedAt?: string;
}
