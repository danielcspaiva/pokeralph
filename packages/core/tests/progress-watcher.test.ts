import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { rmSync, mkdirSync } from "node:fs";
import { FileManager } from "../src/services/file-manager.ts";
import { ProgressWatcher } from "../src/services/progress-watcher.ts";
import { createInitialProgress } from "../src/types/index.ts";
import type { Progress } from "../src/types/index.ts";

// Create a unique temp directory for each test
const getTempDir = () =>
  join(
    import.meta.dir,
    `.tmp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

describe("ProgressWatcher", () => {
  let tempDir: string;
  let fm: FileManager;
  let watcher: ProgressWatcher;
  const taskId = "001-test-task";

  beforeEach(async () => {
    tempDir = getTempDir();
    mkdirSync(tempDir, { recursive: true });
    fm = new FileManager(tempDir);
    await fm.init();
    await fm.createBattleFolder(taskId);
    // Use a short interval for tests
    watcher = new ProgressWatcher({ fileManager: fm, intervalMs: 50 });
  });

  afterEach(() => {
    // Make sure to stop watcher to clear intervals
    watcher.stop();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================================
  // Constructor and configuration
  // ============================================================================

  describe("constructor", () => {
    test("creates instance with default interval", () => {
      const defaultWatcher = new ProgressWatcher({ fileManager: fm });
      expect(defaultWatcher.getIntervalMs()).toBe(2000);
    });

    test("creates instance with custom interval", () => {
      const customWatcher = new ProgressWatcher({
        fileManager: fm,
        intervalMs: 500,
      });
      expect(customWatcher.getIntervalMs()).toBe(500);
    });
  });

  // ============================================================================
  // Watch lifecycle
  // ============================================================================

  describe("watch", () => {
    test("starts watching a task", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      let watchStarted = false;
      watcher.on("watch_start", (id) => {
        watchStarted = true;
        expect(id).toBe(taskId);
      });

      watcher.watch(taskId);

      expect(watcher.isWatching()).toBe(true);
      expect(watcher.getWatchedTaskId()).toBe(taskId);
      expect(watchStarted).toBe(true);
    });

    test("throws when already watching a task", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      watcher.watch(taskId);

      expect(() => watcher.watch("002-another-task")).toThrow(
        /Already watching task/
      );
    });

    test("emits progress event on initial poll", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      const progressEvents: Progress[] = [];
      watcher.on("progress", (p) => progressEvents.push(p));

      watcher.watch(taskId);

      // Wait for initial poll
      await sleep(100);

      expect(progressEvents.length).toBeGreaterThanOrEqual(1);
      expect(progressEvents[0]?.taskId).toBe(taskId);
    });
  });

  describe("stop", () => {
    test("stops watching and emits watch_stop event", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      let watchStopped = false;
      watcher.on("watch_stop", (id) => {
        watchStopped = true;
        expect(id).toBe(taskId);
      });

      watcher.watch(taskId);
      expect(watcher.isWatching()).toBe(true);

      watcher.stop();

      expect(watcher.isWatching()).toBe(false);
      expect(watcher.getWatchedTaskId()).toBe(null);
      expect(watchStopped).toBe(true);
    });

    test("does nothing when not watching", () => {
      // Should not throw
      watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });

    test("stops polling after stop is called", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      const progressEvents: Progress[] = [];
      watcher.on("progress", (p) => progressEvents.push(p));

      watcher.watch(taskId);
      await sleep(100);

      const countBeforeStop = progressEvents.length;
      watcher.stop();

      // Update progress after stop
      progress.currentIteration = 5;
      await fm.saveProgress(taskId, progress);

      await sleep(100);

      // Should not have received any new events
      expect(progressEvents.length).toBe(countBeforeStop);
    });
  });

  describe("isWatching", () => {
    test("returns false when not watching", () => {
      expect(watcher.isWatching()).toBe(false);
    });

    test("returns true when watching", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      watcher.watch(taskId);
      expect(watcher.isWatching()).toBe(true);
    });
  });

  describe("getWatchedTaskId", () => {
    test("returns null when not watching", () => {
      expect(watcher.getWatchedTaskId()).toBe(null);
    });

    test("returns task ID when watching", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      watcher.watch(taskId);
      expect(watcher.getWatchedTaskId()).toBe(taskId);
    });
  });

  // ============================================================================
  // Progress change detection
  // ============================================================================

  describe("progress event", () => {
    test("emits progress event when file changes", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      const progressEvents: Progress[] = [];
      watcher.on("progress", (p) => progressEvents.push(p));

      watcher.watch(taskId);
      await sleep(100);

      // Clear events from initial poll
      progressEvents.length = 0;

      // Update progress
      progress.currentIteration = 2;
      progress.status = "in_progress";
      progress.lastUpdate = new Date().toISOString();
      await fm.saveProgress(taskId, progress);

      await sleep(100);

      expect(progressEvents.length).toBeGreaterThanOrEqual(1);
      expect(progressEvents[0]?.currentIteration).toBe(2);
      expect(progressEvents[0]?.status).toBe("in_progress");
    });

    test("does not emit duplicate events when file unchanged", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      const progressEvents: Progress[] = [];
      watcher.on("progress", (p) => progressEvents.push(p));

      watcher.watch(taskId);
      await sleep(200);

      // Should have emitted exactly one event (from initial poll)
      // No more events should be emitted since file hasn't changed
      expect(progressEvents.length).toBe(1);
    });

    test("detects changes to logs array", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      const progressEvents: Progress[] = [];
      watcher.on("progress", (p) => progressEvents.push(p));

      watcher.watch(taskId);
      await sleep(100);
      progressEvents.length = 0;

      // Add logs
      progress.logs.push("Starting task...");
      progress.logs.push("Working on step 1...");
      await fm.saveProgress(taskId, progress);

      await sleep(100);

      expect(progressEvents.length).toBeGreaterThanOrEqual(1);
      expect(progressEvents[0]?.logs).toContain("Starting task...");
    });
  });

  // ============================================================================
  // Completion detection
  // ============================================================================

  describe("complete event", () => {
    test("emits complete event when completionDetected becomes true", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      const completeEvents: Progress[] = [];
      watcher.on("complete", (p) => completeEvents.push(p));

      watcher.watch(taskId);
      await sleep(100);

      // Set completion detected
      progress.completionDetected = true;
      progress.status = "completed";
      await fm.saveProgress(taskId, progress);

      await sleep(100);

      expect(completeEvents.length).toBe(1);
      expect(completeEvents[0]?.completionDetected).toBe(true);
    });

    test("does not emit complete event if already completed on initial poll", async () => {
      // When a file already has completionDetected=true at first poll,
      // we should NOT emit complete event (we only emit on transition)
      const progress = createInitialProgress(taskId);
      progress.completionDetected = true;
      await fm.saveProgress(taskId, progress);

      const completeEvents: Progress[] = [];
      watcher.on("complete", (p) => completeEvents.push(p));

      watcher.watch(taskId);
      await sleep(100);

      // Should not emit complete event on initial poll
      expect(completeEvents.length).toBe(0);
    });

    test("does not emit complete event again after completion detected", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      const completeEvents: Progress[] = [];
      watcher.on("complete", (p) => completeEvents.push(p));

      watcher.watch(taskId);
      await sleep(100);

      // First transition to completed
      progress.completionDetected = true;
      await fm.saveProgress(taskId, progress);
      await sleep(100);

      expect(completeEvents.length).toBe(1);

      // Update something else while keeping completionDetected true
      progress.lastOutput = "Already done";
      await fm.saveProgress(taskId, progress);
      await sleep(100);

      // Should still be only 1 complete event (no additional emission)
      expect(completeEvents.length).toBe(1);
    });
  });

  // ============================================================================
  // Error detection
  // ============================================================================

  describe("error event", () => {
    test("emits error event when error becomes non-null", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      const errorEvents: Progress[] = [];
      watcher.on("error", (p) => errorEvents.push(p));

      watcher.watch(taskId);
      await sleep(100);

      // Set error
      progress.error = "Task failed due to timeout";
      progress.status = "failed";
      await fm.saveProgress(taskId, progress);

      await sleep(100);

      expect(errorEvents.length).toBe(1);
      expect(errorEvents[0]?.error).toBe("Task failed due to timeout");
    });

    test("does not emit error event if already in error state on initial poll", async () => {
      // When a file already has error at first poll,
      // we should NOT emit error event (we only emit on transition)
      const progress = createInitialProgress(taskId);
      progress.error = "Initial error";
      await fm.saveProgress(taskId, progress);

      const errorEvents: Progress[] = [];
      watcher.on("error", (p) => errorEvents.push(p));

      watcher.watch(taskId);
      await sleep(100);

      // Should not emit error event on initial poll
      expect(errorEvents.length).toBe(0);
    });

    test("does not emit error event again after error detected", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      const errorEvents: Progress[] = [];
      watcher.on("error", (p) => errorEvents.push(p));

      watcher.watch(taskId);
      await sleep(100);

      // First transition to error
      progress.error = "Initial error";
      await fm.saveProgress(taskId, progress);
      await sleep(100);

      expect(errorEvents.length).toBe(1);

      // Update error message (error is still non-null)
      progress.error = "Updated error message";
      await fm.saveProgress(taskId, progress);
      await sleep(100);

      // Should still be only 1 error event (no additional emission)
      expect(errorEvents.length).toBe(1);
    });
  });

  // ============================================================================
  // Feedback detection
  // ============================================================================

  describe("feedback event", () => {
    test("emits feedback event when feedbackResults changes", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      const feedbackEvents: Progress[] = [];
      watcher.on("feedback", (p) => feedbackEvents.push(p));

      watcher.watch(taskId);
      await sleep(100);

      // Initial update to establish baseline
      progress.lastOutput = "Running feedback...";
      await fm.saveProgress(taskId, progress);
      await sleep(100);

      // Add feedback results
      progress.feedbackResults = {
        test: { passed: true, output: "5 tests passed" },
        lint: { passed: false, output: "2 errors found" },
      };
      await fm.saveProgress(taskId, progress);

      await sleep(100);

      expect(feedbackEvents.length).toBeGreaterThanOrEqual(1);
      expect(feedbackEvents[0]?.feedbackResults.test?.passed).toBe(true);
      expect(feedbackEvents[0]?.feedbackResults.lint?.passed).toBe(false);
    });

    test("emits feedback event when feedback result changes", async () => {
      const progress = createInitialProgress(taskId);
      progress.feedbackResults = {
        test: { passed: false, output: "3 tests failed" },
      };
      await fm.saveProgress(taskId, progress);

      const feedbackEvents: Progress[] = [];
      watcher.on("feedback", (p) => feedbackEvents.push(p));

      watcher.watch(taskId);
      await sleep(100);
      feedbackEvents.length = 0;

      // Update feedback results
      progress.feedbackResults = {
        test: { passed: true, output: "All tests passed" },
      };
      await fm.saveProgress(taskId, progress);

      await sleep(100);

      expect(feedbackEvents.length).toBeGreaterThanOrEqual(1);
      expect(feedbackEvents[0]?.feedbackResults.test?.passed).toBe(true);
    });
  });

  // ============================================================================
  // Edge cases
  // ============================================================================

  describe("edge cases", () => {
    test("handles file not existing yet gracefully", async () => {
      // Don't create the progress file
      const anotherTaskId = "002-nonexistent";
      await fm.createBattleFolder(anotherTaskId);

      const progressEvents: Progress[] = [];
      watcher.on("progress", (p) => progressEvents.push(p));

      // Should not throw
      watcher.watch(anotherTaskId);

      await sleep(100);

      // No events emitted since file doesn't exist
      expect(progressEvents.length).toBe(0);

      // Now create the file
      const progress = createInitialProgress(anotherTaskId);
      await fm.saveProgress(anotherTaskId, progress);

      await sleep(100);

      // Should now detect the file
      expect(progressEvents.length).toBeGreaterThanOrEqual(1);
    });

    test("handles rapid file changes", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      const progressEvents: Progress[] = [];
      watcher.on("progress", (p) => progressEvents.push(p));

      watcher.watch(taskId);
      await sleep(100);
      progressEvents.length = 0;

      // Make rapid changes
      for (let i = 1; i <= 5; i++) {
        progress.currentIteration = i;
        progress.lastUpdate = new Date().toISOString();
        await fm.saveProgress(taskId, progress);
      }

      await sleep(150);

      // Should have detected at least one change
      expect(progressEvents.length).toBeGreaterThanOrEqual(1);
      // Final value should be 5
      const lastEvent = progressEvents[progressEvents.length - 1];
      expect(lastEvent?.currentIteration).toBe(5);
    });

    test("can restart watching after stop", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      const watchStartEvents: string[] = [];
      watcher.on("watch_start", (id) => watchStartEvents.push(id));

      watcher.watch(taskId);
      await sleep(50);
      watcher.stop();

      // Start watching again
      watcher.watch(taskId);
      await sleep(50);

      expect(watchStartEvents.length).toBe(2);
      expect(watcher.isWatching()).toBe(true);
    });

    test("can watch different task after stopping", async () => {
      const progress1 = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress1);

      const secondTaskId = "002-second-task";
      await fm.createBattleFolder(secondTaskId);
      const progress2 = createInitialProgress(secondTaskId);
      await fm.saveProgress(secondTaskId, progress2);

      watcher.watch(taskId);
      expect(watcher.getWatchedTaskId()).toBe(taskId);

      watcher.stop();

      watcher.watch(secondTaskId);
      expect(watcher.getWatchedTaskId()).toBe(secondTaskId);
    });
  });

  // ============================================================================
  // Multiple event types
  // ============================================================================

  describe("multiple events in sequence", () => {
    test("emits progress, feedback, and complete events in order", async () => {
      const progress = createInitialProgress(taskId);
      await fm.saveProgress(taskId, progress);

      const events: { type: string; progress: Progress }[] = [];

      watcher.on("progress", (p) => events.push({ type: "progress", progress: p }));
      watcher.on("feedback", (p) => events.push({ type: "feedback", progress: p }));
      watcher.on("complete", (p) => events.push({ type: "complete", progress: p }));

      watcher.watch(taskId);
      await sleep(100);
      events.length = 0;

      // Update with feedback and completion
      progress.status = "completed";
      progress.feedbackResults = {
        test: { passed: true, output: "All tests passed" },
        lint: { passed: true, output: "No issues" },
        typecheck: { passed: true, output: "No errors" },
      };
      progress.completionDetected = true;
      await fm.saveProgress(taskId, progress);

      await sleep(100);

      // Should have progress event
      const progressEvent = events.find((e) => e.type === "progress");
      expect(progressEvent).toBeDefined();

      // Should have complete event
      const completeEvent = events.find((e) => e.type === "complete");
      expect(completeEvent).toBeDefined();

      // Should have feedback event
      const feedbackEvent = events.find((e) => e.type === "feedback");
      expect(feedbackEvent).toBeDefined();
    });
  });
});

// ============================================================================
// Test helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
