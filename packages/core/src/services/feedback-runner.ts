/**
 * FeedbackRunner service for PokéRalph
 *
 * Executes feedback loops (test, lint, typecheck) and reports results.
 * Uses Bun.spawn() to run npm scripts from package.json.
 */

import type { FeedbackResult } from "../types/progress.ts";

/**
 * Options for creating a FeedbackRunner instance
 */
export interface FeedbackRunnerOptions {
  /**
   * Working directory containing package.json
   */
  workingDir: string;

  /**
   * Default timeout per loop in milliseconds
   * @default 300000 (5 minutes)
   */
  timeoutMs?: number;
}

/**
 * Extended FeedbackResult with name field for runAll results
 */
export interface FeedbackLoopResult extends FeedbackResult {
  /**
   * Name of the feedback loop that was run
   */
  name: string;
}

/**
 * Standard feedback loop names
 */
export const STANDARD_LOOPS = ["test", "lint", "typecheck", "format:check"] as const;
export type StandardLoop = (typeof STANDARD_LOOPS)[number];

/**
 * FeedbackRunner - executes feedback loops and reports results
 *
 * @remarks
 * This service handles running feedback loops defined in package.json:
 * - Detects available scripts in package.json
 * - Executes scripts with timeout
 * - Captures stdout/stderr output
 * - Reports pass/fail based on exit code
 *
 * @example
 * ```ts
 * const runner = new FeedbackRunner({
 *   workingDir: "/path/to/repo"
 * });
 *
 * const available = await runner.detectAvailableLoops();
 * // ["test", "lint", "typecheck"]
 *
 * const result = await runner.runLoop("test");
 * // { name: "test", passed: true, output: "5 tests passed", duration: 1234 }
 * ```
 */
export class FeedbackRunner {
  /** Options for this runner instance */
  private readonly options: Required<FeedbackRunnerOptions>;

  /**
   * Creates a new FeedbackRunner instance
   *
   * @param options - Configuration options for the runner
   */
  constructor(options: FeedbackRunnerOptions) {
    this.options = {
      workingDir: options.workingDir,
      timeoutMs: options.timeoutMs ?? 300000, // 5 minutes default
    };
  }

  /**
   * Gets the working directory
   */
  getWorkingDir(): string {
    return this.options.workingDir;
  }

  /**
   * Gets the default timeout in milliseconds
   */
  getTimeoutMs(): number {
    return this.options.timeoutMs;
  }

  // ==========================================================================
  // Detection methods
  // ==========================================================================

  /**
   * Detects available feedback loops by scanning package.json scripts
   *
   * @returns Array of available loop names (e.g., ["test", "lint", "typecheck"])
   *
   * @remarks
   * Looks for standard loop names: test, lint, typecheck, format:check
   * Only returns loops that have corresponding scripts in package.json
   */
  async detectAvailableLoops(): Promise<string[]> {
    const scripts = await this.readPackageJsonScripts();
    if (!scripts) {
      return [];
    }

    const available: string[] = [];

    for (const loop of STANDARD_LOOPS) {
      if (scripts[loop]) {
        available.push(loop);
      }
    }

    return available;
  }

  /**
   * Checks if a specific loop is available
   *
   * @param name - Name of the loop to check
   * @returns true if the loop exists in package.json
   */
  async isLoopAvailable(name: string): Promise<boolean> {
    const scripts = await this.readPackageJsonScripts();
    return scripts !== null && name in scripts;
  }

  // ==========================================================================
  // Execution methods
  // ==========================================================================

  /**
   * Runs a single feedback loop
   *
   * @param name - Name of the loop to run (e.g., "test", "lint")
   * @param timeoutMs - Optional timeout override in milliseconds
   * @returns FeedbackLoopResult with pass/fail status and output
   *
   * @remarks
   * Uses `bun run <name>` to execute the script.
   * Exit code 0 = passed, non-zero = failed.
   */
  async runLoop(name: string, timeoutMs?: number): Promise<FeedbackLoopResult> {
    const timeout = timeoutMs ?? this.options.timeoutMs;
    const startTime = Date.now();

    try {
      // Check if loop exists
      const isAvailable = await this.isLoopAvailable(name);
      if (!isAvailable) {
        return {
          name,
          passed: false,
          output: `Script "${name}" not found in package.json`,
          duration: Date.now() - startTime,
        };
      }

      // Spawn the process
      const proc = Bun.spawn(["bun", "run", name], {
        cwd: this.options.workingDir,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          // Force color output for better logs
          FORCE_COLOR: "1",
        },
      });

      // Set up timeout
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, timeout);

      // Collect output
      const [stdout, stderr, exitCode] = await Promise.all([
        this.readStream(proc.stdout),
        this.readStream(proc.stderr),
        proc.exited,
      ]);

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      if (timedOut) {
        return {
          name,
          passed: false,
          output: `Timeout after ${timeout}ms\n${stdout}\n${stderr}`.trim(),
          duration,
        };
      }

      // Combine output, preferring stdout but including stderr if present
      let output = stdout;
      if (stderr) {
        output = output ? `${output}\n${stderr}` : stderr;
      }

      return {
        name,
        passed: exitCode === 0,
        output: output.trim(),
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        name,
        passed: false,
        output: `Error running loop: ${errorMessage}`,
        duration,
      };
    }
  }

  /**
   * Runs multiple feedback loops sequentially
   *
   * @param loops - Array of loop names to run
   * @param timeoutMs - Optional timeout per loop in milliseconds
   * @returns Array of FeedbackLoopResult for each loop
   *
   * @remarks
   * Loops are run in sequence, not parallel.
   * All loops will run even if earlier ones fail.
   */
  async runAll(loops: string[], timeoutMs?: number): Promise<FeedbackLoopResult[]> {
    const results: FeedbackLoopResult[] = [];

    for (const loop of loops) {
      const result = await this.runLoop(loop, timeoutMs);
      results.push(result);
    }

    return results;
  }

  /**
   * Runs all available loops
   *
   * @param timeoutMs - Optional timeout per loop in milliseconds
   * @returns Array of FeedbackLoopResult for each available loop
   */
  async runAvailable(timeoutMs?: number): Promise<FeedbackLoopResult[]> {
    const available = await this.detectAvailableLoops();
    return this.runAll(available, timeoutMs);
  }

  // ==========================================================================
  // Helper methods
  // ==========================================================================

  /**
   * Converts FeedbackLoopResult[] to FeedbackResults record
   *
   * @param results - Array of loop results
   * @returns Record keyed by loop name
   */
  static toFeedbackResults(results: FeedbackLoopResult[]): Record<string, FeedbackResult> {
    const record: Record<string, FeedbackResult> = {};

    for (const result of results) {
      record[result.name] = {
        passed: result.passed,
        output: result.output,
        duration: result.duration,
      };
    }

    return record;
  }

  /**
   * Checks if all results passed
   *
   * @param results - Array of loop results
   * @returns true if all loops passed
   */
  static allPassed(results: FeedbackLoopResult[]): boolean {
    return results.every((r) => r.passed);
  }

  /**
   * Gets summary of results
   *
   * @param results - Array of loop results
   * @returns Summary string like "3/4 passed (test, lint, typecheck)"
   */
  static summarize(results: FeedbackLoopResult[]): string {
    const passed = results.filter((r) => r.passed);
    const failed = results.filter((r) => !r.passed);

    const passedNames = passed.map((r) => r.name).join(", ");
    const failedNames = failed.map((r) => r.name).join(", ");

    if (failed.length === 0) {
      return `All ${results.length} passed (${passedNames})`;
    }

    if (passed.length === 0) {
      return `All ${results.length} failed (${failedNames})`;
    }

    return `${passed.length}/${results.length} passed (${passedNames}), failed: ${failedNames}`;
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Reads package.json and returns scripts object
   */
  private async readPackageJsonScripts(): Promise<Record<string, string> | null> {
    try {
      const pkgPath = `${this.options.workingDir}/package.json`;
      const file = Bun.file(pkgPath);
      const exists = await file.exists();

      if (!exists) {
        return null;
      }

      const content = await file.json();
      return content.scripts ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Reads a stream to string
   */
  private async readStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
    if (!stream) {
      return "";
    }

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value, { stream: true }));
      }
    } finally {
      reader.releaseLock();
    }

    return chunks.join("");
  }
}
