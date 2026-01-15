/**
 * FileManager service for PokéRalph
 *
 * Handles all file I/O operations for the `.pokeralph/` folder.
 * Uses Bun.file() for file operations and Zod for validation.
 */

import { join } from "node:path";
import { stat } from "node:fs/promises";
import type { Config, PRD, Progress, Battle, Iteration } from "../types/index.ts";
import { DEFAULT_CONFIG } from "../types/index.ts";
import {
  ConfigSchema,
  PRDSchema,
  ProgressSchema,
  BattleSchema,
} from "./schemas.ts";
import { FileNotFoundError, ValidationError } from "./errors.ts";

/** Name of the PokéRalph folder in user's repository */
const POKERALPH_FOLDER = ".pokeralph";

/** Name of the battles subfolder */
const BATTLES_FOLDER = "battles";

/** Name of the logs subfolder within each battle */
const LOGS_FOLDER = "logs";

/**
 * FileManager - handles all file I/O for the `.pokeralph/` folder
 *
 * @remarks
 * This service provides methods to read and write all PokéRalph data files:
 * - config.json: Project configuration
 * - prd.json: PRD with tasks
 * - battles/{task-id}/progress.json: Current progress
 * - battles/{task-id}/history.json: Battle history
 * - battles/{task-id}/logs/: Iteration logs
 *
 * All reads are validated using Zod schemas.
 *
 * @example
 * ```ts
 * const fm = new FileManager("/path/to/repo");
 * await fm.init();
 * const config = await fm.loadConfig();
 * ```
 */
export class FileManager {
  /** Base path of the user's repository */
  private readonly basePath: string;

  /**
   * Creates a new FileManager instance
   * @param basePath - The root path of the user's repository
   */
  constructor(basePath: string) {
    this.basePath = basePath;
  }

  // ==========================================================================
  // Path helpers
  // ==========================================================================

  /**
   * Returns the path to the `.pokeralph/` folder
   */
  getPokeRalphPath(): string {
    return join(this.basePath, POKERALPH_FOLDER);
  }

  /**
   * Returns the path to a specific file or subfolder within `.pokeralph/`
   */
  private getPath(...segments: string[]): string {
    return join(this.getPokeRalphPath(), ...segments);
  }

  /**
   * Returns the path to a battle's folder
   */
  private getBattlePath(taskId: string, ...segments: string[]): string {
    return this.getPath(BATTLES_FOLDER, taskId, ...segments);
  }

  // ==========================================================================
  // Initialization and existence checks
  // ==========================================================================

  /**
   * Checks if the `.pokeralph/` folder exists
   */
  async exists(): Promise<boolean> {
    try {
      const stats = await stat(this.getPokeRalphPath());
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Initializes the `.pokeralph/` folder structure if it doesn't exist
   *
   * Creates:
   * - .pokeralph/
   * - .pokeralph/battles/
   * - .pokeralph/config.json (with defaults)
   */
  async init(): Promise<void> {
    const battlesPath = this.getPath(BATTLES_FOLDER);

    // Create directories using Bun.spawn for mkdir
    await Bun.spawn(["mkdir", "-p", battlesPath]).exited;

    // Create default config if it doesn't exist
    const configPath = this.getPath("config.json");
    const configFile = Bun.file(configPath);
    if (!(await configFile.exists())) {
      await this.saveConfig(DEFAULT_CONFIG);
    }
  }

  // ==========================================================================
  // Config operations
  // ==========================================================================

  /**
   * Loads and validates the configuration from `config.json`
   * @throws {FileNotFoundError} If config.json doesn't exist
   * @throws {ValidationError} If config.json is invalid
   */
  async loadConfig(): Promise<Config> {
    const path = this.getPath("config.json");
    return this.readAndValidate(path, ConfigSchema);
  }

  /**
   * Saves the configuration to `config.json`
   * @param config - The configuration to save
   */
  async saveConfig(config: Config): Promise<void> {
    const path = this.getPath("config.json");
    await this.writeJson(path, config);
  }

  // ==========================================================================
  // PRD operations
  // ==========================================================================

  /**
   * Loads and validates the PRD from `prd.json`
   * @throws {FileNotFoundError} If prd.json doesn't exist
   * @throws {ValidationError} If prd.json is invalid
   */
  async loadPRD(): Promise<PRD> {
    const path = this.getPath("prd.json");
    return this.readAndValidate(path, PRDSchema);
  }

  /**
   * Saves the PRD to `prd.json`
   * @param prd - The PRD to save
   */
  async savePRD(prd: PRD): Promise<void> {
    const path = this.getPath("prd.json");
    await this.writeJson(path, prd);
  }

  // ==========================================================================
  // Battle folder operations
  // ==========================================================================

  /**
   * Creates the folder structure for a new battle
   *
   * Creates:
   * - .pokeralph/battles/{taskId}/
   * - .pokeralph/battles/{taskId}/logs/
   *
   * @param taskId - The task ID to create a battle folder for
   */
  async createBattleFolder(taskId: string): Promise<void> {
    const logsPath = this.getBattlePath(taskId, LOGS_FOLDER);
    await Bun.spawn(["mkdir", "-p", logsPath]).exited;
  }

  // ==========================================================================
  // Progress operations
  // ==========================================================================

  /**
   * Loads and validates progress from `progress.json`
   * @param taskId - The task ID to load progress for
   * @throws {FileNotFoundError} If progress.json doesn't exist
   * @throws {ValidationError} If progress.json is invalid
   */
  async loadProgress(taskId: string): Promise<Progress> {
    const path = this.getBattlePath(taskId, "progress.json");
    return this.readAndValidate(path, ProgressSchema);
  }

  /**
   * Saves progress to `progress.json`
   * @param taskId - The task ID to save progress for
   * @param progress - The progress to save
   */
  async saveProgress(taskId: string, progress: Progress): Promise<void> {
    const path = this.getBattlePath(taskId, "progress.json");
    await this.writeJson(path, progress);
  }

  // ==========================================================================
  // Battle history operations
  // ==========================================================================

  /**
   * Loads and validates battle history from `history.json`
   * @param taskId - The task ID to load history for
   * @throws {FileNotFoundError} If history.json doesn't exist
   * @throws {ValidationError} If history.json is invalid
   */
  async loadBattleHistory(taskId: string): Promise<Battle> {
    const path = this.getBattlePath(taskId, "history.json");
    return this.readAndValidate(path, BattleSchema);
  }

  /**
   * Saves battle history to `history.json`
   * @param taskId - The task ID to save history for
   * @param battle - The battle to save
   */
  async saveBattleHistory(taskId: string, battle: Battle): Promise<void> {
    const path = this.getBattlePath(taskId, "history.json");
    await this.writeJson(path, battle);
  }

  /**
   * Appends an iteration to the battle history
   *
   * @param taskId - The task ID to append the iteration to
   * @param iteration - The iteration to append
   * @throws {FileNotFoundError} If history.json doesn't exist
   */
  async appendIteration(taskId: string, iteration: Iteration): Promise<void> {
    const battle = await this.loadBattleHistory(taskId);
    battle.iterations.push(iteration);
    await this.saveBattleHistory(taskId, battle);
  }

  // ==========================================================================
  // Iteration log operations
  // ==========================================================================

  /**
   * Writes an iteration log to the logs folder
   * @param taskId - The task ID
   * @param iterationNum - The iteration number
   * @param log - The log content to write
   */
  async writeIterationLog(
    taskId: string,
    iterationNum: number,
    log: string
  ): Promise<void> {
    const path = this.getBattlePath(taskId, LOGS_FOLDER, `iteration-${iterationNum}.txt`);
    await Bun.write(path, log);
  }

  /**
   * Reads an iteration log from the logs folder
   * @param taskId - The task ID
   * @param iterationNum - The iteration number
   * @throws {FileNotFoundError} If the log file doesn't exist
   */
  async readIterationLog(taskId: string, iterationNum: number): Promise<string> {
    const path = this.getBattlePath(taskId, LOGS_FOLDER, `iteration-${iterationNum}.txt`);
    const file = Bun.file(path);
    if (!(await file.exists())) {
      throw new FileNotFoundError(path);
    }
    return file.text();
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Reads a JSON file and validates it against a Zod schema
   */
  private async readAndValidate<T>(
    path: string,
    schema: { parse: (data: unknown) => T }
  ): Promise<T> {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      throw new FileNotFoundError(path);
    }

    const text = await file.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ValidationError(path, "Invalid JSON", `Failed to parse JSON: ${path}`);
    }

    try {
      return schema.parse(data);
    } catch (error) {
      throw new ValidationError(path, error, `Validation failed: ${path}`);
    }
  }

  /**
   * Writes data as formatted JSON to a file
   */
  private async writeJson(path: string, data: unknown): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    await Bun.write(path, content);
  }
}
