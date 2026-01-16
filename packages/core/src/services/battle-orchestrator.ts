/**
 * BattleOrchestrator service for PokéRalph
 *
 * Orchestrates the complete Battle Loop for a task.
 * The Battle Loop: prompt → execute → poll → feedback → commit → repeat
 *
 * This is the runtime orchestration that users interact with (distinct from
 * the Build Loop used to develop PokéRalph itself).
 */

import { EventEmitter } from "node:events";
import type { FileManager } from "./file-manager.ts";
import type { ClaudeBridge } from "./claude-bridge.ts";
import type { ProgressWatcher } from "./progress-watcher.ts";
import type { FeedbackRunner, FeedbackLoopResult } from "./feedback-runner.ts";
import { GitService } from "./git-service.ts";
import type { PromptBuilder, TaskContext } from "./prompt-builder.ts";
import { COMPLETION_SIGIL } from "./prompt-builder.ts";
import type {
  Task,
  Config,
  Battle,
  BattleStatus,
  Progress,
  Iteration,
  ExecutionMode,
  PRD,
} from "../types/index.ts";
import {
  TaskStatus,
  createBattle,
  createIteration,
  createInitialProgress,
} from "../types/index.ts";

/**
 * Dependencies required by BattleOrchestrator
 */
export interface BattleOrchestratorDependencies {
  fileManager: FileManager;
  claudeBridge: ClaudeBridge;
  progressWatcher: ProgressWatcher;
  feedbackRunner: FeedbackRunner;
  gitService: GitService;
  promptBuilder: PromptBuilder;
}

/**
 * Events emitted by BattleOrchestrator
 */
export interface BattleOrchestratorEvents {
  /** Emitted when a battle starts */
  battle_start: [{ taskId: string; task: Task }];
  /** Emitted when an iteration starts */
  iteration_start: [{ taskId: string; iteration: number }];
  /** Emitted when an iteration ends */
  iteration_end: [{ taskId: string; iteration: number; result: Iteration["result"] }];
  /** Emitted with iteration output */
  iteration_output: [{ taskId: string; iteration: number; output: string }];
  /** Emitted when a feedback loop result is available */
  feedback_result: [{ taskId: string; loop: string; result: FeedbackLoopResult }];
  /** Emitted when a battle completes successfully */
  battle_complete: [{ taskId: string; battle: Battle }];
  /** Emitted when a battle fails */
  battle_failed: [{ taskId: string; error: string; battle: Battle }];
  /** Emitted in HITL mode when waiting for approval */
  await_approval: [{ taskId: string; iteration: number; summary: string }];
  /** Emitted when approval is received */
  approval_received: [{ taskId: string; approved: boolean }];
  /** Emitted when a battle is paused */
  battle_pause: [{ taskId: string; iteration: number }];
  /** Emitted when a battle is resumed */
  battle_resume: [{ taskId: string }];
  /** Emitted when a battle is cancelled */
  battle_cancel: [{ taskId: string; reason?: string }];
  /** Emitted when progress changes */
  progress_update: [{ taskId: string; progress: Progress }];
  /** Emitted when completion is detected */
  completion_detected: [{ taskId: string }];
  /** Emitted on error */
  error: [{ message: string; code?: string; details?: unknown }];
}

/**
 * Internal state for managing a running battle
 */
interface BattleState {
  taskId: string;
  task: Task;
  battle: Battle;
  config: Config;
  prd: PRD;
  mode: ExecutionMode;
  currentIteration: number;
  isPaused: boolean;
  isCancelled: boolean;
  isAwaitingApproval: boolean;
  approvalResolver: (() => void) | null;
}

/**
 * BattleOrchestrator - orchestrates the Battle Loop for tasks
 *
 * @remarks
 * The Battle Loop implements the Ralph technique for autonomous development:
 * 1. Build prompt with task context
 * 2. Execute Claude Code with prompt
 * 3. Poll progress.json for updates
 * 4. Run feedback loops (test, lint, typecheck)
 * 5. Commit changes if successful
 * 6. Repeat until completion or max iterations
 *
 * Supports two execution modes:
 * - HITL (Human in the Loop): Pauses after each iteration for approval
 * - YOLO: Runs automatically until completion sigil or max iterations
 *
 * @example
 * ```ts
 * const orchestrator = new BattleOrchestrator({
 *   fileManager,
 *   claudeBridge,
 *   progressWatcher,
 *   feedbackRunner,
 *   gitService,
 *   promptBuilder,
 * });
 *
 * orchestrator.on("battle_complete", ({ taskId, battle }) => {
 *   console.log(`Task ${taskId} completed in ${battle.iterations.length} iterations`);
 * });
 *
 * await orchestrator.startBattle("001-my-task", "yolo");
 * ```
 */
export class BattleOrchestrator extends EventEmitter {
  private readonly deps: BattleOrchestratorDependencies;
  private state: BattleState | null = null;

  /**
   * Creates a new BattleOrchestrator instance
   *
   * @param dependencies - All required service dependencies
   */
  constructor(dependencies: BattleOrchestratorDependencies) {
    super();
    this.deps = dependencies;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Starts a battle for the given task
   *
   * @param taskId - The ID of the task to execute
   * @param mode - Execution mode: "hitl" or "yolo"
   * @throws Error if a battle is already in progress
   */
  async startBattle(taskId: string, mode: ExecutionMode): Promise<void> {
    if (this.state !== null) {
      throw new Error(
        `Battle already in progress for task "${this.state.taskId}". Call cancel() first to start a new battle.`
      );
    }

    // Load required data
    const config = await this.deps.fileManager.loadConfig();
    const prd = await this.deps.fileManager.loadPRD();
    const task = prd.tasks.find((t) => t.id === taskId);

    if (!task) {
      throw new Error(`Task "${taskId}" not found in PRD`);
    }

    // Create battle folder structure
    await this.deps.fileManager.createBattleFolder(taskId);

    // Try to recover existing battle or create new one
    let battle: Battle;
    let currentIteration: number;

    try {
      battle = await this.deps.fileManager.loadBattleHistory(taskId);
      currentIteration = battle.iterations.length;

      // If battle was previously completed or failed, reset it
      if (battle.status === "completed" || battle.status === "failed") {
        battle = createBattle(taskId);
        currentIteration = 0;
      }
    } catch {
      // No existing battle, create new one
      battle = createBattle(taskId);
      currentIteration = 0;
    }

    // Update battle status
    battle.status = "running";

    // Initialize state
    this.state = {
      taskId,
      task,
      battle,
      config,
      prd,
      mode,
      currentIteration,
      isPaused: false,
      isCancelled: false,
      isAwaitingApproval: false,
      approvalResolver: null,
    };

    // Save initial battle state
    await this.deps.fileManager.saveBattleHistory(taskId, battle);

    // Create initial progress file
    const initialProgress = createInitialProgress(taskId);
    initialProgress.status = "in_progress";
    await this.deps.fileManager.saveProgress(taskId, initialProgress);

    // Update task status in PRD
    await this.updateTaskStatus(taskId, TaskStatus.InProgress);

    // Emit battle_start event
    this.emit("battle_start", { taskId, task });

    // Set up progress watcher
    this.setupProgressWatcher(taskId);

    // Start the battle loop
    await this.runBattleLoop();
  }

  /**
   * Pauses the current battle after the current iteration
   */
  pause(): void {
    if (this.state === null) {
      return;
    }

    this.state.isPaused = true;
    this.state.battle.status = "paused";

    this.emit("battle_pause", {
      taskId: this.state.taskId,
      iteration: this.state.currentIteration,
    });
  }

  /**
   * Resumes a paused battle
   */
  async resume(): Promise<void> {
    if (this.state === null) {
      throw new Error("No battle to resume");
    }

    if (!this.state.isPaused) {
      return; // Already running
    }

    this.state.isPaused = false;
    this.state.battle.status = "running";

    this.emit("battle_resume", { taskId: this.state.taskId });

    // Continue the battle loop
    await this.runBattleLoop();
  }

  /**
   * Cancels the current battle
   *
   * @param reason - Optional reason for cancellation
   */
  async cancel(reason?: string): Promise<void> {
    if (this.state === null) {
      return;
    }

    const { taskId, battle } = this.state;

    this.state.isCancelled = true;
    battle.status = "cancelled";
    battle.completedAt = new Date().toISOString();
    battle.error = reason ?? "Cancelled by user";

    // Kill any running Claude process
    this.deps.claudeBridge.kill();

    // Stop progress watcher
    this.deps.progressWatcher.stop();

    // Save final state
    await this.deps.fileManager.saveBattleHistory(taskId, battle);

    // Update task status
    await this.updateTaskStatus(taskId, TaskStatus.Paused);

    // Update progress
    const progress = await this.loadOrCreateProgress(taskId);
    progress.status = "failed";
    progress.error = reason ?? "Cancelled by user";
    progress.lastUpdate = new Date().toISOString();
    await this.deps.fileManager.saveProgress(taskId, progress);

    this.emit("battle_cancel", { taskId, reason });

    // If awaiting approval, resolve it to unblock
    if (this.state.approvalResolver) {
      this.state.approvalResolver();
    }

    this.state = null;
  }

  /**
   * Approves the current iteration in HITL mode
   */
  approve(): void {
    if (this.state === null || !this.state.isAwaitingApproval) {
      return;
    }

    this.state.isAwaitingApproval = false;

    this.emit("approval_received", {
      taskId: this.state.taskId,
      approved: true,
    });

    // Resolve the approval promise to continue the loop
    if (this.state.approvalResolver) {
      this.state.approvalResolver();
      this.state.approvalResolver = null;
    }
  }

  /**
   * Checks if a battle is currently running
   */
  isRunning(): boolean {
    return this.state !== null && !this.state.isPaused && !this.state.isCancelled;
  }

  /**
   * Checks if a battle is paused
   */
  isPaused(): boolean {
    return this.state?.isPaused ?? false;
  }

  /**
   * Checks if a battle is awaiting approval
   */
  isAwaitingApproval(): boolean {
    return this.state?.isAwaitingApproval ?? false;
  }

  /**
   * Gets the current battle state (for debugging/UI)
   */
  getCurrentState(): {
    taskId: string;
    iteration: number;
    status: BattleStatus;
    mode: ExecutionMode;
  } | null {
    if (this.state === null) {
      return null;
    }

    return {
      taskId: this.state.taskId,
      iteration: this.state.currentIteration,
      status: this.state.battle.status,
      mode: this.state.mode,
    };
  }

  /**
   * Full cleanup - cancels any running battle and clears all state
   *
   * @remarks
   * Use this when switching repositories or shutting down the orchestrator.
   * After calling cleanup(), the BattleOrchestrator is ready to be discarded.
   */
  async cleanup(): Promise<void> {
    // Cancel any running battle
    if (this.state !== null) {
      await this.cancel("Repository switch - cleanup");
    }

    // Stop progress watcher if running
    this.deps.progressWatcher.stop();

    // Remove all event listeners
    this.removeAllListeners();

    // Clear state
    this.state = null;
  }

  // ==========================================================================
  // Battle Loop
  // ==========================================================================

  /**
   * Main battle loop implementation
   */
  private async runBattleLoop(): Promise<void> {
    if (this.state === null) {
      return;
    }

    const { taskId, config, battle } = this.state;
    const maxIterations = config.maxIterationsPerTask;

    while (
      this.state !== null &&
      !this.state.isPaused &&
      !this.state.isCancelled &&
      this.state.currentIteration < maxIterations
    ) {
      // Increment iteration
      this.state.currentIteration++;
      const iterationNum = this.state.currentIteration;

      // Update progress
      const progress = await this.loadOrCreateProgress(taskId);
      progress.currentIteration = iterationNum;
      progress.status = "in_progress";
      progress.lastUpdate = new Date().toISOString();
      await this.deps.fileManager.saveProgress(taskId, progress);

      // Create iteration record
      const iteration = createIteration(iterationNum);

      // Emit iteration_start event
      this.emit("iteration_start", { taskId, iteration: iterationNum });

      try {
        // Execute the iteration
        const result = await this.executeIteration(iteration);

        // Check if we should stop
        if (this.state === null || this.state.isCancelled) {
          break;
        }

        // Update iteration with result
        iteration.endedAt = new Date().toISOString();
        iteration.result = result.success ? "success" : "failure";
        iteration.output = result.output;
        iteration.filesChanged = result.filesChanged;
        iteration.commitHash = result.commitHash;
        if (result.error) {
          iteration.error = result.error;
        }

        // Add iteration to battle history
        battle.iterations.push(iteration);
        await this.deps.fileManager.saveBattleHistory(taskId, battle);

        // Write iteration log
        await this.deps.fileManager.writeIterationLog(taskId, iterationNum, result.output);

        // Emit iteration_end event
        this.emit("iteration_end", {
          taskId,
          iteration: iterationNum,
          result: iteration.result,
        });

        // Check for completion
        if (result.completionDetected) {
          await this.completeBattle();
          return;
        }

        // Check for failure
        if (!result.success) {
          // Load progress to check error state
          const currentProgress = await this.loadOrCreateProgress(taskId);
          if (currentProgress.error) {
            await this.failBattle(currentProgress.error);
            return;
          }
        }

        // In HITL mode, wait for approval
        if (this.state.mode === "hitl") {
          await this.waitForApproval(iterationNum, result.output);

          // Check if cancelled while waiting
          if (this.state === null || this.state.isCancelled) {
            break;
          }
        }
      } catch (error) {
        // Handle unexpected errors
        const errorMessage = error instanceof Error ? error.message : String(error);

        iteration.endedAt = new Date().toISOString();
        iteration.result = "failure";
        iteration.error = errorMessage;

        battle.iterations.push(iteration);
        await this.deps.fileManager.saveBattleHistory(taskId, battle);

        this.emit("error", {
          message: errorMessage,
          code: "ITERATION_ERROR",
          details: error,
        });
      }
    }

    // Check if we hit max iterations without completion
    if (
      this.state !== null &&
      !this.state.isCancelled &&
      this.state.currentIteration >= maxIterations
    ) {
      await this.failBattle(`Maximum iterations (${maxIterations}) reached without completion`);
    }
  }

  /**
   * Executes a single iteration
   */
  private async executeIteration(
    iteration: Iteration
  ): Promise<{
    success: boolean;
    output: string;
    completionDetected: boolean;
    filesChanged: string[];
    commitHash?: string;
    error?: string;
  }> {
    if (this.state === null) {
      return {
        success: false,
        output: "",
        completionDetected: false,
        filesChanged: [],
        error: "No active battle",
      };
    }

    const { taskId, task, config, prd } = this.state;

    // Build the task prompt
    const progressFilePath = this.deps.fileManager
      .getPokeRalphPath()
      .concat(`/battles/${taskId}/progress.json`);

    const context: TaskContext = {
      prdSummary: this.deps.promptBuilder.summarizePRD(prd),
      currentProgress: await this.loadOrCreateProgress(taskId),
      feedbackLoops: config.feedbackLoops,
      autoCommit: config.autoCommit,
      maxIterations: config.maxIterationsPerTask,
      progressFilePath,
    };

    const prompt = this.deps.promptBuilder.buildTaskPrompt(task, context);

    // Execute Claude Code
    const claudeResult = await this.runClaude(prompt);

    // Emit iteration output
    this.emit("iteration_output", {
      taskId,
      iteration: iteration.number,
      output: claudeResult.output,
    });

    // Check for completion sigil in output
    const completionDetected = claudeResult.output.includes(COMPLETION_SIGIL);

    if (completionDetected) {
      this.emit("completion_detected", { taskId });

      // Update progress
      const progress = await this.loadOrCreateProgress(taskId);
      progress.completionDetected = true;
      progress.lastUpdate = new Date().toISOString();
      await this.deps.fileManager.saveProgress(taskId, progress);
    }

    // Run feedback loops
    const feedbackResults = await this.runFeedbackLoops(taskId);
    const allPassed = feedbackResults.every((r) => r.passed);

    // Get changed files from git
    const gitStatus = await this.deps.gitService.status();
    const filesChanged = [
      ...gitStatus.staged.map((f) => f.path),
      ...gitStatus.unstaged.map((f) => f.path),
      ...gitStatus.untracked.map((f) => f.path),
    ];

    // Auto-commit if enabled and feedback passed
    let commitHash: string | undefined;
    if (config.autoCommit && allPassed && gitStatus.isDirty) {
      try {
        // Filter out .pokeralph files from commit (they contain app state, not project code)
        const filesToCommit = filesChanged.filter((f) => !f.startsWith(".pokeralph/"));
        if (filesToCommit.length > 0) {
          await this.deps.gitService.add(filesToCommit);
          const commitMessage = GitService.formatCommitMessage(taskId, task.title);
          commitHash = await this.deps.gitService.commit(commitMessage);
        }
      } catch {
        // Commit failed - not fatal
      }
    }

    return {
      success: claudeResult.exitCode === 0 && allPassed,
      output: claudeResult.output,
      completionDetected,
      filesChanged,
      commitHash,
      error: claudeResult.error,
    };
  }

  /**
   * Runs Claude Code with the given prompt
   */
  private async runClaude(
    prompt: string
  ): Promise<{ output: string; exitCode: number; error?: string }> {
    return new Promise((resolve) => {
      let output = "";

      this.deps.claudeBridge.onOutput((data) => {
        output += data;
      });

      this.deps.claudeBridge.onError((data) => {
        output += data;
      });

      this.deps.claudeBridge.onExit((code, signal) => {
        this.deps.claudeBridge.clearCallbacks();

        if (signal === "TIMEOUT") {
          resolve({
            output,
            exitCode: -1,
            error: "Claude execution timed out",
          });
        } else {
          resolve({
            output: output || this.deps.claudeBridge.getCombinedOutput(),
            exitCode: code ?? 0,
          });
        }
      });

      this.deps.claudeBridge.spawnExecutionMode(prompt);
    });
  }

  /**
   * Runs all configured feedback loops
   */
  private async runFeedbackLoops(taskId: string): Promise<FeedbackLoopResult[]> {
    if (this.state === null) {
      return [];
    }

    const { config } = this.state;
    const results: FeedbackLoopResult[] = [];

    for (const loop of config.feedbackLoops) {
      const result = await this.deps.feedbackRunner.runLoop(loop);
      results.push(result);

      // Emit feedback_result event
      this.emit("feedback_result", { taskId, loop, result });

      // Update progress with feedback results
      const progress = await this.loadOrCreateProgress(taskId);
      progress.feedbackResults[loop] = {
        passed: result.passed,
        output: result.output,
        duration: result.duration,
      };
      progress.lastUpdate = new Date().toISOString();
      await this.deps.fileManager.saveProgress(taskId, progress);
    }

    return results;
  }

  /**
   * Waits for user approval in HITL mode
   */
  private async waitForApproval(iterationNum: number, summary: string): Promise<void> {
    if (this.state === null) {
      return;
    }

    this.state.isAwaitingApproval = true;
    this.state.battle.status = "awaiting_approval";

    await this.deps.fileManager.saveBattleHistory(this.state.taskId, this.state.battle);

    // Update progress
    const progress = await this.loadOrCreateProgress(this.state.taskId);
    progress.status = "awaiting_approval";
    progress.lastUpdate = new Date().toISOString();
    await this.deps.fileManager.saveProgress(this.state.taskId, progress);

    this.emit("await_approval", {
      taskId: this.state.taskId,
      iteration: iterationNum,
      summary: summary.slice(0, 500), // Truncate for event
    });

    // Wait for approve() to be called
    await new Promise<void>((resolve) => {
      if (this.state) {
        this.state.approvalResolver = resolve;
      } else {
        resolve();
      }
    });

    // Restore running status if not cancelled
    if (this.state !== null && !this.state.isCancelled) {
      this.state.battle.status = "running";

      const updatedProgress = await this.loadOrCreateProgress(this.state.taskId);
      updatedProgress.status = "in_progress";
      updatedProgress.lastUpdate = new Date().toISOString();
      await this.deps.fileManager.saveProgress(this.state.taskId, updatedProgress);
    }
  }

  /**
   * Completes the battle successfully
   */
  private async completeBattle(): Promise<void> {
    if (this.state === null) {
      return;
    }

    const { taskId, battle } = this.state;

    battle.status = "completed";
    battle.completedAt = new Date().toISOString();
    battle.durationMs = Date.now() - new Date(battle.startedAt).getTime();

    // Save final battle state
    await this.deps.fileManager.saveBattleHistory(taskId, battle);

    // Update progress
    const progress = await this.loadOrCreateProgress(taskId);
    progress.status = "completed";
    progress.completionDetected = true;
    progress.lastUpdate = new Date().toISOString();
    await this.deps.fileManager.saveProgress(taskId, progress);

    // Update task status in PRD
    await this.updateTaskStatus(taskId, TaskStatus.Completed);

    // Stop progress watcher
    this.deps.progressWatcher.stop();

    // Emit completion event
    this.emit("battle_complete", { taskId, battle });

    // Clear state
    this.state = null;
  }

  /**
   * Fails the battle with an error
   */
  private async failBattle(error: string): Promise<void> {
    if (this.state === null) {
      return;
    }

    const { taskId, battle } = this.state;

    battle.status = "failed";
    battle.completedAt = new Date().toISOString();
    battle.durationMs = Date.now() - new Date(battle.startedAt).getTime();
    battle.error = error;

    // Save final battle state
    await this.deps.fileManager.saveBattleHistory(taskId, battle);

    // Update progress
    const progress = await this.loadOrCreateProgress(taskId);
    progress.status = "failed";
    progress.error = error;
    progress.lastUpdate = new Date().toISOString();
    await this.deps.fileManager.saveProgress(taskId, progress);

    // Update task status in PRD
    await this.updateTaskStatus(taskId, TaskStatus.Failed);

    // Stop progress watcher
    this.deps.progressWatcher.stop();

    // Emit failure event
    this.emit("battle_failed", { taskId, error, battle });

    // Clear state
    this.state = null;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Sets up the progress watcher for the current battle
   */
  private setupProgressWatcher(taskId: string): void {
    // Forward progress events
    this.deps.progressWatcher.on("progress", (progress) => {
      this.emit("progress_update", { taskId, progress });
    });

    this.deps.progressWatcher.on("complete", () => {
      this.emit("completion_detected", { taskId });
    });

    this.deps.progressWatcher.on("error", (progress) => {
      if (progress.error && this.state !== null) {
        // Don't automatically fail - let the loop handle it
        this.emit("error", {
          message: progress.error,
          code: "PROGRESS_ERROR",
        });
      }
    });

    // Start watching
    this.deps.progressWatcher.watch(taskId);
  }

  /**
   * Loads existing progress or creates initial progress
   */
  private async loadOrCreateProgress(taskId: string): Promise<Progress> {
    try {
      return await this.deps.fileManager.loadProgress(taskId);
    } catch {
      const progress = createInitialProgress(taskId);
      await this.deps.fileManager.saveProgress(taskId, progress);
      return progress;
    }
  }

  /**
   * Updates task status in the PRD
   */
  private async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    try {
      const prd = await this.deps.fileManager.loadPRD();
      const task = prd.tasks.find((t) => t.id === taskId);

      if (task) {
        task.status = status;
        task.updatedAt = new Date().toISOString();
        await this.deps.fileManager.savePRD(prd);
      }
    } catch {
      // Non-fatal - PRD update failure shouldn't stop the battle
    }
  }

  // ==========================================================================
  // Type-safe event emitter methods
  // ==========================================================================

  override on<K extends keyof BattleOrchestratorEvents>(
    event: K,
    listener: (...args: BattleOrchestratorEvents[K]) => void
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override once<K extends keyof BattleOrchestratorEvents>(
    event: K,
    listener: (...args: BattleOrchestratorEvents[K]) => void
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends keyof BattleOrchestratorEvents>(
    event: K,
    listener: (...args: BattleOrchestratorEvents[K]) => void
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof BattleOrchestratorEvents>(
    event: K,
    ...args: BattleOrchestratorEvents[K]
  ): boolean {
    return super.emit(event, ...args);
  }

  override removeAllListeners<K extends keyof BattleOrchestratorEvents>(event?: K): this {
    return super.removeAllListeners(event);
  }
}
