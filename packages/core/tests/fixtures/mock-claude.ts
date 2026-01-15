#!/usr/bin/env bun
/**
 * Mock Claude Code CLI for testing ClaudeBridge
 *
 * This script simulates Claude Code behavior for deterministic tests.
 * It reads args and behaves differently based on environment variables:
 *
 * - MOCK_CLAUDE_MODE: "success" | "error" | "timeout" | "output"
 * - MOCK_CLAUDE_DELAY: milliseconds to wait before output
 * - MOCK_CLAUDE_OUTPUT: custom output to write
 * - MOCK_CLAUDE_EXIT_CODE: exit code to return
 *
 * Usage:
 *   bun tests/fixtures/mock-claude.ts --print "prompt"
 */

const args = process.argv.slice(2);
const mode = process.env.MOCK_CLAUDE_MODE ?? "success";
const delay = Number.parseInt(process.env.MOCK_CLAUDE_DELAY ?? "10", 10);
const customOutput = process.env.MOCK_CLAUDE_OUTPUT ?? "";
const exitCode = Number.parseInt(process.env.MOCK_CLAUDE_EXIT_CODE ?? "0", 10);

// Parse arguments
const hasPlan = args.includes("--plan");
const _hasPrint = args.includes("--print");
const hasSkipPermissions = args.includes("--dangerously-skip-permissions");

// Find the prompt (last arg after --print)
const printIndex = args.indexOf("--print");
const prompt = printIndex !== -1 ? (args[printIndex + 1] ?? "") : "";

// Simulate processing delay
await new Promise((resolve) => setTimeout(resolve, delay));

// Write output based on mode
switch (mode) {
  case "success": {
    console.log("Claude Code Mock - Processing...");
    console.log(`Mode: ${hasPlan ? "plan" : "execute"}`);
    console.log(`Skip permissions: ${hasSkipPermissions}`);
    console.log(`Prompt received: ${prompt.slice(0, 50)}...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    console.log("Task completed successfully.");
    console.log("<promise>COMPLETE</promise>");
    break;
  }
  case "error": {
    console.log("Claude Code Mock - Processing...");
    console.error("Error: Something went wrong");
    process.exit(exitCode || 1);
    break;
  }
  case "timeout": {
    console.log("Claude Code Mock - Starting long task...");
    // This will be killed by timeout before completing
    await new Promise((resolve) => setTimeout(resolve, 60000));
    break;
  }
  case "output": {
    // Custom output mode - just write what's specified
    if (customOutput) {
      console.log(customOutput);
    }
    break;
  }
  case "stderr": {
    console.log("stdout output");
    console.error("stderr output");
    break;
  }
  case "incremental": {
    // Simulate incremental output for stream testing
    console.log("Step 1: Analyzing...");
    await new Promise((resolve) => setTimeout(resolve, delay));
    console.log("Step 2: Implementing...");
    await new Promise((resolve) => setTimeout(resolve, delay));
    console.log("Step 3: Testing...");
    await new Promise((resolve) => setTimeout(resolve, delay));
    console.log("Done!");
    break;
  }
  default: {
    console.log(`Unknown mode: ${mode}`);
    process.exit(1);
  }
}

process.exit(exitCode);
