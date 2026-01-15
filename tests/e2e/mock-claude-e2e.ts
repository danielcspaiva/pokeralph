#!/usr/bin/env bun
/**
 * E2E Mock Claude Code CLI
 *
 * Enhanced mock Claude script for E2E tests that simulates the full battle loop
 * including progress file updates. This mock writes to the progress.json file
 * to allow testing of the complete polling/WebSocket flow.
 *
 * Environment Variables:
 * - E2E_MOCK_MODE: "success" | "error" | "timeout" | "incremental" | "fail_feedback"
 * - E2E_MOCK_DELAY: milliseconds to wait between steps (default: 20)
 * - E2E_MOCK_EXIT_CODE: exit code to return (default: 0)
 * - E2E_MOCK_PROGRESS_PATH: path to progress.json for updates
 * - E2E_MOCK_ERROR_MESSAGE: custom error message for error mode
 *
 * Usage:
 *   bun tests/e2e/mock-claude-e2e.ts --print "prompt"
 */

import { dirname } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const mode = process.env.E2E_MOCK_MODE ?? "success";
const delay = Number.parseInt(process.env.E2E_MOCK_DELAY ?? "20", 10);
const exitCode = Number.parseInt(process.env.E2E_MOCK_EXIT_CODE ?? "0", 10);
const progressPath = process.env.E2E_MOCK_PROGRESS_PATH ?? "";
const errorMessage = process.env.E2E_MOCK_ERROR_MESSAGE ?? "Mock error occurred";

// Parse arguments
const hasPlan = args.includes("--plan");
const hasSkipPermissions = args.includes("--dangerously-skip-permissions");

// Find the prompt
const printIndex = args.indexOf("--print");
const _prompt = printIndex !== -1 ? (args[printIndex + 1] ?? "") : "";

/**
 * Updates progress.json file to simulate Claude updating progress
 */
async function updateProgress(update: Partial<{
  status: string;
  currentIteration: number;
  lastOutput: string;
  logs: string[];
  completionDetected: boolean;
  error: string | null;
  feedbackResults: Record<string, { passed: boolean; output: string }>;
}>): Promise<void> {
  if (!progressPath) return;

  try {
    // Read current progress
    const progressFile = Bun.file(progressPath);
    const current = existsSync(progressPath) ? await progressFile.json() : {};

    // Merge updates
    const updated = {
      ...current,
      ...update,
      lastUpdate: new Date().toISOString(),
      logs: [...(current.logs ?? []), ...(update.logs ?? [])],
    };

    // Ensure directory exists
    const dir = dirname(progressPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write updated progress
    await Bun.write(progressPath, JSON.stringify(updated, null, 2));
  } catch (err) {
    console.error(`[Mock Claude] Failed to update progress: ${err}`);
  }
}

/**
 * Simulates delay
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Start execution
console.log("[Mock Claude E2E] Starting...");
console.log(`[Mock Claude E2E] Mode: ${mode}`);
console.log(`[Mock Claude E2E] Plan mode: ${hasPlan}`);
console.log(`[Mock Claude E2E] Skip permissions: ${hasSkipPermissions}`);

await sleep(delay);

switch (mode) {
  case "success": {
    // Simulate successful task completion
    console.log("[Mock Claude E2E] Analyzing task...");
    await updateProgress({
      status: "in_progress",
      lastOutput: "Analyzing task requirements...",
      logs: ["Analyzing task requirements..."],
    });
    await sleep(delay);

    console.log("[Mock Claude E2E] Implementing solution...");
    await updateProgress({
      lastOutput: "Implementing solution...",
      logs: ["Implementing solution..."],
    });
    await sleep(delay);

    console.log("[Mock Claude E2E] Running tests...");
    await updateProgress({
      lastOutput: "Running tests...",
      logs: ["Running tests..."],
    });
    await sleep(delay);

    console.log("[Mock Claude E2E] Task completed successfully.");
    console.log("<promise>COMPLETE</promise>");
    await updateProgress({
      status: "completed",
      lastOutput: "Task completed successfully.",
      logs: ["Task completed successfully."],
      completionDetected: true,
    });
    break;
  }

  case "error": {
    // Simulate an error during execution
    console.log("[Mock Claude E2E] Starting task...");
    await updateProgress({
      status: "in_progress",
      lastOutput: "Starting task...",
      logs: ["Starting task..."],
    });
    await sleep(delay);

    console.error(`[Mock Claude E2E] Error: ${errorMessage}`);
    await updateProgress({
      status: "failed",
      lastOutput: `Error: ${errorMessage}`,
      logs: [`Error: ${errorMessage}`],
      error: errorMessage,
    });
    process.exit(exitCode || 1);
    break;
  }

  case "timeout": {
    // Simulate a long-running task that will be killed by timeout
    console.log("[Mock Claude E2E] Starting long-running task...");
    await updateProgress({
      status: "in_progress",
      lastOutput: "Starting long-running task...",
      logs: ["Starting long-running task..."],
    });

    // Wait indefinitely (will be killed by timeout)
    await new Promise((resolve) => setTimeout(resolve, 60000));
    break;
  }

  case "incremental": {
    // Simulate incremental progress for streaming tests
    const steps = [
      "Step 1: Analyzing codebase...",
      "Step 2: Planning implementation...",
      "Step 3: Writing code...",
      "Step 4: Running tests...",
      "Step 5: Finalizing...",
    ];

    for (const step of steps) {
      console.log(`[Mock Claude E2E] ${step}`);
      await updateProgress({
        status: "in_progress",
        lastOutput: step,
        logs: [step],
      });
      await sleep(delay);
    }

    console.log("[Mock Claude E2E] All steps completed.");
    console.log("<promise>COMPLETE</promise>");
    await updateProgress({
      status: "completed",
      lastOutput: "All steps completed.",
      logs: ["All steps completed."],
      completionDetected: true,
    });
    break;
  }

  case "fail_feedback": {
    // Simulate completion but with failed feedback loops
    console.log("[Mock Claude E2E] Implementing feature...");
    await updateProgress({
      status: "in_progress",
      lastOutput: "Implementing feature...",
      logs: ["Implementing feature..."],
    });
    await sleep(delay);

    console.log("[Mock Claude E2E] Code written but tests will fail...");
    await updateProgress({
      lastOutput: "Code written, running feedback loops...",
      logs: ["Code written, running feedback loops..."],
      feedbackResults: {
        test: { passed: false, output: "2 tests failed" },
        lint: { passed: true, output: "No issues" },
        typecheck: { passed: false, output: "3 type errors" },
      },
    });
    await sleep(delay);

    // Does NOT output completion sigil since feedback failed
    console.log("[Mock Claude E2E] Feedback loops failed, task incomplete.");
    break;
  }

  case "no_sigil": {
    // Simulate completing work without the completion sigil (for HITL testing)
    console.log("[Mock Claude E2E] Working on task...");
    await updateProgress({
      status: "in_progress",
      lastOutput: "Working on task...",
      logs: ["Working on task..."],
    });
    await sleep(delay);

    console.log("[Mock Claude E2E] Iteration complete, awaiting review...");
    await updateProgress({
      lastOutput: "Iteration complete, awaiting review.",
      logs: ["Iteration complete, awaiting review."],
    });
    // No completion sigil - this triggers HITL approval wait
    break;
  }

  default: {
    console.error(`[Mock Claude E2E] Unknown mode: ${mode}`);
    process.exit(1);
  }
}

process.exit(exitCode);
