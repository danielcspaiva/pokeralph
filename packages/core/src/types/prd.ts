/**
 * PRD (Product Requirements Document) types for PokéRalph
 *
 * The PRD is the main document that defines a project's tasks.
 * It is stored in `.pokeralph/prd.json` in the user's repository.
 */

import type { Task, TaskStatus } from "./task.ts";

/**
 * A turn in the planning conversation between user and Claude
 */
export interface ConversationTurn {
  /**
   * Who produced this turn
   */
  role: "user" | "assistant";

  /**
   * The content of the turn
   */
  content: string;

  /**
   * ISO timestamp when this turn was added
   */
  timestamp: string;
}

/**
 * Partial task for draft PRD - allows incomplete task data
 */
export interface PartialTask {
  id?: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: number;
  acceptanceCriteria?: string[];
  iterations?: Task["iterations"];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Partial PRD for drafts - allows incomplete data
 */
export interface PartialPRD {
  name?: string;
  description?: string;
  tasks?: PartialTask[];
  metadata?: PRDMetadata;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Draft PRD for auto-save during planning sessions
 *
 * @remarks
 * Stored in `.pokeralph/prd.draft.json` to prevent data loss
 * during long planning sessions. Recovered on page reload or disconnect.
 */
export interface DraftPRD {
  /**
   * The original idea that started the planning session
   */
  idea: string;

  /**
   * The conversation history between user and Claude
   */
  conversation: ConversationTurn[];

  /**
   * Partial PRD extracted from the conversation (if available)
   */
  partialPRD?: PartialPRD;

  /**
   * ISO timestamp when the draft was last saved
   */
  lastSavedAt: string;

  /**
   * Incrementing version number for conflict detection
   */
  version: number;
}

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
