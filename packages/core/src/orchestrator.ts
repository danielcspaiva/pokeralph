/**
 * Main Orchestrator class for PokéRalph
 *
 * This is the main facade that unifies all services and exposes a clean API.
 * Use this class as the primary entry point for interacting with PokéRalph.
 *
 * @remarks
 * The Orchestrator:
 * - Initializes and manages all underlying services
 * - Provides a simplified API for common operations
 * - Handles configuration, PRD, and task management
 * - Delegates battle and planning operations to specialized services
 *
 * @example
 * ```ts
 * import { Orchestrator } from "@pokeralph/core";
 *
 * const orchestrator = new Orchestrator("/path/to/project");
 * await orchestrator.init();
 *
 * // Get configuration
 * const config = await orchestrator.getConfig();
 *
 * // Add a task
 * const task = await orchestrator.addTask({
 *   title: "Build feature X",
 *   description: "Implement the X feature",
 *   priority: 1,
 *   acceptanceCriteria: ["Feature works", "Tests pass"],
 * });
 *
 * // Start a battle
 * orchestrator.onBattleEvent("battle_complete", ({ taskId }) => {
 *   console.log(`Task ${taskId} completed!`);
 * });
 * await orchestrator.startBattle(task.id);
 * ```
 */

import { FileManager } from "./services/file-manager.ts";
import { PromptBuilder } from "./services/prompt-builder.ts";
import { ClaudeBridge } from "./services/claude-bridge.ts";
import { ProgressWatcher } from "./services/progress-watcher.ts";
import { FeedbackRunner } from "./services/feedback-runner.ts";
import { GitService } from "./services/git-service.ts";
import {
  BattleOrchestrator,
  type BattleOrchestratorEvents,
} from "./services/battle-orchestrator.ts";
import { PlanService } from "./services/plan-service.ts";
import type {
  Config,
  PRD,
  Task,
  Progress,
  Battle,
  ExecutionMode,
} from "./types/index.ts";
import { TaskStatus, DEFAULT_CONFIG } from "./types/index.ts";

/**
 * Input type for adding a new task (without auto-generated fields)
 */
export interface AddTaskInput {
  /** Task title */
  title: string;
  /** Task description */
  description: string;
  /** Task priority (lower = higher priority) */
  priority: number;
  /** Acceptance criteria for the task */
  acceptanceCriteria: string[];
}

/**
 * Input type for updating an existing task
 */
export interface UpdateTaskInput {
  /** Updated title */
  title?: string;
  /** Updated description */
  description?: string;
  /** Updated status */
  status?: TaskStatus;
  /** Updated priority */
  priority?: number;
  /** Updated acceptance criteria */
  acceptanceCriteria?: string[];
}

/**
 * Orchestrator - Main facade for PokéRalph
 *
 * This class unifies all services and provides a clean API for:
 * - Configuration management
 * - PRD and task management
 * - Battle execution (via BattleOrchestrator)
 * - Planning phase (via PlanService)
 */
export class Orchestrator {
  private readonly workingDir: string;
  private readonly fileManager: FileManager;
  private readonly promptBuilder: PromptBuilder;
  private readonly claudeBridge: ClaudeBridge;
  private readonly progressWatcher: ProgressWatcher;
  private readonly feedbackRunner: FeedbackRunner;
  private readonly gitService: GitService;
  private readonly battleOrchestrator: BattleOrchestrator;
  private readonly planService: PlanService;

  /**
   * Creates a new Orchestrator instance
   *
   * @param workingDir - The working directory (project root)
   */
  constructor(workingDir: string) {
    this.workingDir = workingDir;

    // Initialize all services
    this.fileManager = new FileManager(workingDir);
    this.promptBuilder = new PromptBuilder();
    this.claudeBridge = new ClaudeBridge({ workingDir });
    this.feedbackRunner = new FeedbackRunner({ workingDir });
    this.gitService = new GitService({ workingDir });

    // ProgressWatcher needs FileManager
    this.progressWatcher = new ProgressWatcher({
      fileManager: this.fileManager,
      intervalMs: DEFAULT_CONFIG.pollingIntervalMs,
    });

    // BattleOrchestrator needs all services
    this.battleOrchestrator = new BattleOrchestrator({
      fileManager: this.fileManager,
      claudeBridge: this.claudeBridge,
      progressWatcher: this.progressWatcher,
      feedbackRunner: this.feedbackRunner,
      gitService: this.gitService,
      promptBuilder: this.promptBuilder,
    });

    // PlanService needs Claude bridge, prompt builder, and file manager
    this.planService = new PlanService({
      claudeBridge: this.claudeBridge,
      promptBuilder: this.promptBuilder,
      fileManager: this.fileManager,
    });
  }

  // ==========================================================================
  // Static Factory
  // ==========================================================================

  /**
   * Creates a new Orchestrator instance (factory method)
   *
   * @param workingDir - The working directory (project root)
   * @returns A new Orchestrator instance
   */
  static create(workingDir: string): Orchestrator {
    return new Orchestrator(workingDir);
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initializes the .pokeralph folder structure
   *
   * Creates the folder if it doesn't exist and sets up default config.
   * Safe to call multiple times - won't overwrite existing data.
   */
  async init(): Promise<void> {
    // Create folder structure
    await this.fileManager.init();

    // Create default config if none exists
    if (!await this.hasConfig()) {
      await this.fileManager.saveConfig(DEFAULT_CONFIG);
    }
  }

  /**
   * Checks if config exists
   */
  private async hasConfig(): Promise<boolean> {
    try {
      await this.fileManager.loadConfig();
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Configuration Management
  // ==========================================================================

  /**
   * Gets the current configuration
   *
   * @returns The current Config object
   * @throws Error if .pokeralph is not initialized
   */
  async getConfig(): Promise<Config> {
    return await this.fileManager.loadConfig();
  }

  /**
   * Updates the configuration with partial values
   *
   * @param partial - Partial config to merge with existing config
   */
  async updateConfig(partial: Partial<Config>): Promise<void> {
    // Ensure .pokeralph folder exists before updating
    if (!(await this.fileManager.exists())) {
      await this.fileManager.init();
    }

    let current: Config;
    try {
      current = await this.fileManager.loadConfig();
    } catch {
      // If config doesn't exist, use defaults
      current = DEFAULT_CONFIG;
    }

    const updated: Config = {
      ...current,
      ...partial,
    };
    await this.fileManager.saveConfig(updated);
  }

  // ==========================================================================
  // PRD Management
  // ==========================================================================

  /**
   * Gets the current PRD
   *
   * @returns The PRD or null if none exists
   */
  async getPRD(): Promise<PRD | null> {
    try {
      return await this.fileManager.loadPRD();
    } catch {
      return null;
    }
  }

  /**
   * Saves a PRD to the file system
   *
   * @param prd - The PRD to save
   */
  async savePRD(prd: PRD): Promise<void> {
    await this.fileManager.savePRD(prd);
  }

  // ==========================================================================
  // Task Management
  // ==========================================================================

  /**
   * Gets all tasks from the PRD
   *
   * @returns Array of tasks (empty if no PRD)
   */
  async getTasks(): Promise<Task[]> {
    const prd = await this.getPRD();
    return prd?.tasks ?? [];
  }

  /**
   * Gets a specific task by ID
   *
   * @param id - The task ID
   * @returns The task or null if not found
   */
  async getTask(id: string): Promise<Task | null> {
    const tasks = await this.getTasks();
    return tasks.find((t) => t.id === id) ?? null;
  }

  /**
   * Adds a new task to the PRD
   *
   * @param input - Task data (without id, status, timestamps)
   * @returns The created task with generated id
   * @throws Error if no PRD exists
   */
  async addTask(input: AddTaskInput): Promise<Task> {
    const prd = await this.getPRD();
    if (!prd) {
      throw new Error("No PRD exists. Create a PRD first.");
    }

    // Generate task ID
    const taskNumber = prd.tasks.length + 1;
    const taskId = this.generateTaskId(taskNumber, input.title);

    const now = new Date().toISOString();
    const newTask: Task = {
      id: taskId,
      title: input.title,
      description: input.description,
      status: TaskStatus.Pending,
      priority: input.priority,
      acceptanceCriteria: input.acceptanceCriteria,
      iterations: [],
      createdAt: now,
      updatedAt: now,
    };

    // Add to PRD and save
    prd.tasks.push(newTask);
    await this.fileManager.savePRD(prd);

    return newTask;
  }

  /**
   * Updates an existing task
   *
   * @param id - The task ID
   * @param partial - Fields to update
   * @returns The updated task
   * @throws Error if task not found
   */
  async updateTask(id: string, partial: UpdateTaskInput): Promise<Task> {
    const prd = await this.getPRD();
    if (!prd) {
      throw new Error("No PRD exists");
    }

    const task = prd.tasks.find((t) => t.id === id);
    if (!task) {
      throw new Error(`Task "${id}" not found`);
    }

    const taskIndex = prd.tasks.indexOf(task);
    const updated: Task = {
      id: task.id,
      title: partial.title ?? task.title,
      description: partial.description ?? task.description,
      status: partial.status ?? task.status,
      priority: partial.priority ?? task.priority,
      acceptanceCriteria: partial.acceptanceCriteria ?? task.acceptanceCriteria,
      iterations: task.iterations,
      createdAt: task.createdAt,
      updatedAt: new Date().toISOString(),
    };

    prd.tasks[taskIndex] = updated;
    await this.fileManager.savePRD(prd);

    return updated;
  }

  /**
   * Generates a task ID from task number and title
   */
  private generateTaskId(taskNumber: number, title: string): string {
    const paddedNum = taskNumber.toString().padStart(3, "0");
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);
    return `${paddedNum}-${slug}`;
  }

  // ==========================================================================
  // Planning (delegates to PlanService)
  // ==========================================================================

  /**
   * Starts a new planning session
   *
   * @param idea - The initial idea to refine
   */
  async startPlanning(idea: string): Promise<void> {
    await this.planService.startPlanning(idea);
  }

  /**
   * Registers a callback for planning output
   *
   * @param callback - Called when Claude produces output
   */
  onPlanningOutput(callback: (data: { output: string }) => void): void {
    this.planService.on("output", callback);
  }

  /**
   * Registers a callback for planning questions
   *
   * @param callback - Called when Claude asks a question
   */
  onPlanningQuestion(callback: (data: { question: string }) => void): void {
    this.planService.on("question", callback);
  }

  /**
   * Registers a callback for planning keepalive events
   *
   * @param callback - Called periodically during long-running planning operations
   */
  onPlanningKeepalive(callback: (data: { timestamp: string; state: string }) => void): void {
    this.planService.on("keepalive", callback);
  }

  /**
   * Answers a planning question
   *
   * @param answer - The user's answer
   */
  async answerPlanningQuestion(answer: string): Promise<void> {
    await this.planService.answerQuestion(answer);
  }

  /**
   * Finishes the planning phase and extracts the PRD
   *
   * @returns The generated PRD
   */
  async finishPlanning(): Promise<PRD> {
    return await this.planService.finishPlanning();
  }

  /**
   * Gets the current planning state
   *
   * @returns The current planning state
   */
  getPlanningState(): "idle" | "planning" | "waiting_input" | "completed" {
    return this.planService.getState();
  }

  /**
   * Gets the pending question (if any)
   *
   * @returns The pending question or null
   */
  getPlanningQuestion(): string | null {
    return this.planService.getPendingQuestion();
  }

  /**
   * Checks if a planning session is currently in progress
   *
   * @returns True if planning is in progress
   */
  isPlanning(): boolean {
    return this.planService.isPlanning();
  }

  /**
   * Resets the planning service to idle state
   */
  resetPlanning(): void {
    this.planService.reset();
  }

  /**
   * Breaks down the PRD into refined tasks using Claude
   *
   * @param prd - The PRD to break down (defaults to current PRD)
   * @returns Array of generated tasks
   * @throws Error if no PRD exists
   */
  async breakIntoTasks(prd?: PRD): Promise<Task[]> {
    const targetPRD = prd ?? await this.getPRD();
    if (!targetPRD) {
      throw new Error("No PRD exists to break down");
    }
    return await this.planService.breakIntoTasks(targetPRD);
  }

  // ==========================================================================
  // Battle Management (delegates to BattleOrchestrator)
  // ==========================================================================

  /**
   * Starts a battle for the given task
   *
   * @param taskId - The task ID to execute
   * @param mode - Execution mode (defaults to config mode)
   */
  async startBattle(taskId: string, mode?: ExecutionMode): Promise<void> {
    // Verify task exists
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found`);
    }

    // Get mode from config if not specified
    const config = await this.getConfig();
    const executionMode = mode ?? config.mode;

    await this.battleOrchestrator.startBattle(taskId, executionMode);
  }

  /**
   * Pauses the current battle
   */
  pauseBattle(): void {
    this.battleOrchestrator.pause();
  }

  /**
   * Resumes a paused battle
   */
  async resumeBattle(): Promise<void> {
    await this.battleOrchestrator.resume();
  }

  /**
   * Cancels the current battle
   *
   * @param reason - Optional cancellation reason
   */
  async cancelBattle(reason?: string): Promise<void> {
    await this.battleOrchestrator.cancel(reason);
  }

  /**
   * Approves the current iteration in HITL mode
   */
  approveBattle(): void {
    this.battleOrchestrator.approve();
  }

  /**
   * Checks if a battle is currently running
   *
   * @returns True if a battle is in progress and not paused
   */
  isBattleRunning(): boolean {
    return this.battleOrchestrator.isRunning();
  }

  /**
   * Checks if a battle is currently paused
   *
   * @returns True if a battle is paused
   */
  isBattlePaused(): boolean {
    return this.battleOrchestrator.isPaused();
  }

  /**
   * Checks if a battle is awaiting HITL approval
   *
   * @returns True if awaiting approval
   */
  isBattleAwaitingApproval(): boolean {
    return this.battleOrchestrator.isAwaitingApproval();
  }

  /**
   * Gets the current battle state
   *
   * @returns Battle state info or null if no battle running
   */
  getCurrentBattleState(): {
    taskId: string;
    iteration: number;
    status: string;
    mode: ExecutionMode;
  } | null {
    return this.battleOrchestrator.getCurrentState();
  }

  /**
   * Registers a listener for battle events
   *
   * @param event - The event name
   * @param callback - The callback function
   */
  onBattleEvent<K extends keyof BattleOrchestratorEvents>(
    event: K,
    callback: (...args: BattleOrchestratorEvents[K]) => void
  ): void {
    this.battleOrchestrator.on(event, callback);
  }

  // ==========================================================================
  // Battle Progress and History
  // ==========================================================================

  /**
   * Gets the current progress for a battle
   *
   * @param taskId - The task ID
   * @returns The progress or null if none exists
   */
  async getBattleProgress(taskId: string): Promise<Progress | null> {
    try {
      return await this.fileManager.loadProgress(taskId);
    } catch {
      return null;
    }
  }

  /**
   * Gets the battle history for a task
   *
   * @param taskId - The task ID
   * @returns The battle history or null if none exists
   */
  async getBattleHistory(taskId: string): Promise<Battle | null> {
    try {
      return await this.fileManager.loadBattleHistory(taskId);
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // Lifecycle Management
  // ==========================================================================

  /**
   * Gets the working directory for this orchestrator
   *
   * @returns The working directory path
   */
  getWorkingDir(): string {
    return this.workingDir;
  }

  /**
   * Full cleanup - stops all running operations and clears all state
   *
   * @remarks
   * Use this when switching repositories or shutting down.
   * After calling cleanup(), the Orchestrator should be discarded.
   */
  async cleanup(): Promise<void> {
    // Stop any running battle
    await this.battleOrchestrator.cleanup();

    // Cleanup Claude bridge (kills any running process)
    this.claudeBridge.cleanup();

    // Stop progress watcher
    this.progressWatcher.stop();

    // Reset planning state
    this.planService.reset();
  }
}
