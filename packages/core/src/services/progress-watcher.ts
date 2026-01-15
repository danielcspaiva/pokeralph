/**
 * ProgressWatcher service for PokéRalph
 *
 * Monitors progress.json files via polling and emits events when changes are detected.
 * Uses file content hashing to detect real changes and avoid duplicate events.
 */

import { EventEmitter } from "node:events";
import type { FileManager } from "./file-manager.ts";
import type { Progress, FeedbackResults } from "../types/index.ts";

/**
 * Events emitted by ProgressWatcher
 */
export interface ProgressWatcherEvents {
  /**
   * Emitted when progress.json changes (includes full Progress object)
   */
  progress: [Progress];

  /**
   * Emitted when progress.completionDetected === true
   */
  complete: [Progress];

  /**
   * Emitted when progress.error !== null
   */
  error: [Progress];

  /**
   * Emitted when progress.feedbackResults changes
   */
  feedback: [Progress];

  /**
   * Emitted when watching starts
   */
  watch_start: [string];

  /**
   * Emitted when watching stops
   */
  watch_stop: [string];
}

/**
 * Configuration options for ProgressWatcher
 */
export interface ProgressWatcherOptions {
  /**
   * FileManager instance for reading progress files
   */
  fileManager: FileManager;

  /**
   * Polling interval in milliseconds
   * @default 2000
   */
  intervalMs?: number;
}

/**
 * Internal state for tracking a watched task
 */
interface WatchState {
  taskId: string;
  intervalId: ReturnType<typeof setInterval> | null;
  lastHash: string | null;
  lastProgress: Progress | null;
  lastFeedbackHash: string | null;
}

/**
 * ProgressWatcher - monitors progress files via polling and emits events
 *
 * @remarks
 * This service polls progress.json files at a configurable interval.
 * It uses content hashing to detect real changes and avoid emitting
 * duplicate events.
 *
 * @example
 * ```ts
 * const watcher = new ProgressWatcher({ fileManager, intervalMs: 1000 });
 *
 * watcher.on("progress", (progress) => {
 *   console.log("Progress updated:", progress.status);
 * });
 *
 * watcher.on("complete", (progress) => {
 *   console.log("Task completed!");
 * });
 *
 * watcher.watch("001-my-task");
 *
 * // Later...
 * watcher.stop();
 * ```
 */
export class ProgressWatcher extends EventEmitter {
  private readonly fileManager: FileManager;
  private readonly intervalMs: number;
  private watchState: WatchState | null = null;

  /**
   * Creates a new ProgressWatcher instance
   *
   * @param options - Configuration options
   */
  constructor(options: ProgressWatcherOptions) {
    super();
    this.fileManager = options.fileManager;
    this.intervalMs = options.intervalMs ?? 2000;
  }

  /**
   * Starts watching a task's progress.json file
   *
   * @param taskId - The task ID to watch
   * @throws Error if already watching a task
   */
  watch(taskId: string): void {
    if (this.watchState !== null) {
      throw new Error(
        `Already watching task "${this.watchState.taskId}". Call stop() first.`
      );
    }

    this.watchState = {
      taskId,
      intervalId: null,
      lastHash: null,
      lastProgress: null,
      lastFeedbackHash: null,
    };

    // Emit watch_start event
    this.emit("watch_start", taskId);

    // Start polling
    this.watchState.intervalId = setInterval(() => {
      this.poll().catch((err) => {
        // Silently ignore file not found errors during initial polling
        // The file might not exist yet
        if (err?.name !== "FileNotFoundError") {
          // Re-emit error for unexpected errors
          console.error("ProgressWatcher poll error:", err);
        }
      });
    }, this.intervalMs);

    // Do an initial poll immediately
    this.poll().catch(() => {
      // Ignore initial poll errors (file might not exist yet)
    });
  }

  /**
   * Stops watching the current task
   */
  stop(): void {
    if (this.watchState === null) {
      return;
    }

    const taskId = this.watchState.taskId;

    if (this.watchState.intervalId !== null) {
      clearInterval(this.watchState.intervalId);
    }

    this.watchState = null;

    // Emit watch_stop event
    this.emit("watch_stop", taskId);
  }

  /**
   * Checks if currently watching a task
   */
  isWatching(): boolean {
    return this.watchState !== null;
  }

  /**
   * Gets the currently watched task ID
   */
  getWatchedTaskId(): string | null {
    return this.watchState?.taskId ?? null;
  }

  /**
   * Gets the polling interval in milliseconds
   */
  getIntervalMs(): number {
    return this.intervalMs;
  }

  /**
   * Performs a single poll of the progress file
   */
  private async poll(): Promise<void> {
    if (this.watchState === null) {
      return;
    }

    const { taskId } = this.watchState;

    // Load progress from file
    const progress = await this.fileManager.loadProgress(taskId);

    // Check again after async operation - stop() may have been called
    if (this.watchState === null) {
      return;
    }

    // Compute hash of the entire progress object
    const currentHash = this.computeHash(progress);

    // Check if progress has changed
    if (currentHash !== this.watchState.lastHash) {
      const previousProgress = this.watchState.lastProgress;
      const isFirstPoll = previousProgress === null;

      // Update state
      this.watchState.lastHash = currentHash;
      this.watchState.lastProgress = progress;

      // Always emit progress event on change
      this.emit("progress", progress);

      // Check for completion detection
      // Only emit 'complete' if completionDetected transitioned from false to true
      // (not on first poll where we don't know the previous state)
      if (
        progress.completionDetected &&
        !isFirstPoll &&
        !previousProgress?.completionDetected
      ) {
        this.emit("complete", progress);
      }

      // Check for error
      // Only emit 'error' if error transitioned from null to non-null
      // (not on first poll where we don't know the previous state)
      if (
        progress.error !== null &&
        !isFirstPoll &&
        previousProgress?.error === null
      ) {
        this.emit("error", progress);
      }

      // Check for feedback changes
      const currentFeedbackHash = this.computeFeedbackHash(
        progress.feedbackResults
      );
      if (
        currentFeedbackHash !== this.watchState.lastFeedbackHash &&
        this.watchState.lastFeedbackHash !== null
      ) {
        this.emit("feedback", progress);
      }
      this.watchState.lastFeedbackHash = currentFeedbackHash;
    }
  }

  /**
   * Computes a hash of a Progress object for change detection
   */
  private computeHash(progress: Progress): string {
    // Use JSON.stringify as a simple hashing mechanism
    // This works well for small objects like Progress
    return JSON.stringify(progress);
  }

  /**
   * Computes a hash of feedback results for change detection
   */
  private computeFeedbackHash(feedbackResults: FeedbackResults): string {
    return JSON.stringify(feedbackResults);
  }

  // Type-safe event emitter methods

  /**
   * Registers a listener for the specified event
   */
  override on<K extends keyof ProgressWatcherEvents>(
    event: K,
    listener: (...args: ProgressWatcherEvents[K]) => void
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  /**
   * Registers a one-time listener for the specified event
   */
  override once<K extends keyof ProgressWatcherEvents>(
    event: K,
    listener: (...args: ProgressWatcherEvents[K]) => void
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  /**
   * Removes the specified listener for the event
   */
  override off<K extends keyof ProgressWatcherEvents>(
    event: K,
    listener: (...args: ProgressWatcherEvents[K]) => void
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  /**
   * Emits the specified event with the given arguments
   */
  override emit<K extends keyof ProgressWatcherEvents>(
    event: K,
    ...args: ProgressWatcherEvents[K]
  ): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Removes all listeners for the specified event
   */
  override removeAllListeners<K extends keyof ProgressWatcherEvents>(
    event?: K
  ): this {
    return super.removeAllListeners(event);
  }
}
