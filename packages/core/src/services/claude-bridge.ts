/**
 * ClaudeBridge service for PokéRalph
 *
 * Bridge that spawns Claude Code CLI and monitors execution.
 * Uses Bun.spawn() for child process management.
 */

import type { Subprocess } from "bun";

/**
 * Options for creating a ClaudeBridge instance
 */
export interface ClaudeBridgeOptions {
  /**
   * Working directory for Claude Code execution
   */
  workingDir: string;

  /**
   * Timeout in milliseconds before killing the process
   * @default 1800000 (30 minutes)
   */
  timeoutMs?: number;

  /**
   * Path to the Claude CLI executable
   * @default "claude"
   */
  claudePath?: string;

  /**
   * Whether to allow edits automatically in execution mode
   * @default true
   */
  acceptEdits?: boolean;
}

/**
 * Execution mode for Claude Code
 */
export type ClaudeMode = "plan" | "execute";

/**
 * Callback type for process exit handler
 */
export type ExitCallback = (exitCode: number | null, signal: string | null) => void;

/**
 * Callback type for output handler
 */
export type OutputCallback = (data: string) => void;

/**
 * ClaudeBridge - spawns and monitors Claude Code CLI
 *
 * @remarks
 * This service handles the lifecycle of Claude Code CLI processes:
 * - Spawning in plan or execution mode
 * - Capturing stdout/stderr
 * - Managing timeouts
 * - Killing processes when needed
 *
 * @example
 * ```ts
 * const bridge = new ClaudeBridge({
 *   workingDir: "/path/to/repo",
 *   timeoutMs: 1800000
 * });
 *
 * const process = bridge.spawnExecutionMode("Implement the feature...");
 * bridge.onOutput((data) => console.log(data));
 * bridge.onExit((code) => console.log(`Exited with ${code}`));
 * ```
 */
export class ClaudeBridge {
  /** Options for this bridge instance */
  private readonly options: Required<ClaudeBridgeOptions>;

  /** Current running process, if any */
  private currentProcess: Subprocess | null = null;

  /** Timeout timer ID */
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  /** Whether we're waiting for timeout-triggered exit (to prevent double callbacks) */
  private exitHandledByTimeout = false;

  /** Accumulated stdout data */
  private stdoutBuffer = "";

  /** Accumulated stderr data */
  private stderrBuffer = "";

  /** Exit callbacks */
  private exitCallbacks: ExitCallback[] = [];

  /** Output callbacks (for stdout) */
  private outputCallbacks: OutputCallback[] = [];

  /** Error output callbacks (for stderr) */
  private errorCallbacks: OutputCallback[] = [];

  /**
   * Creates a new ClaudeBridge instance
   *
   * @param options - Configuration options for the bridge
   */
  constructor(options: ClaudeBridgeOptions) {
    this.options = {
      workingDir: options.workingDir,
      timeoutMs: options.timeoutMs ?? 1800000, // 30 minutes default
      claudePath: options.claudePath ?? "claude",
      acceptEdits: options.acceptEdits ?? true,
    };
  }

  // ==========================================================================
  // Spawn methods
  // ==========================================================================

  /**
   * Spawns Claude Code in plan mode
   *
   * @param prompt - The prompt to send to Claude
   * @returns The spawned subprocess
   *
   * @remarks
   * Plan mode allows Claude to explore and plan without making edits.
   */
  spawnPlanMode(prompt: string): Subprocess {
    const args = this.buildCommand("plan", prompt);
    return this.spawnProcess(args);
  }

  /**
   * Spawns Claude Code in execution mode
   *
   * @param prompt - The prompt to send to Claude
   * @returns The spawned subprocess
   *
   * @remarks
   * Execution mode allows Claude to make edits to files.
   * Uses --dangerously-skip-permissions to accept all edits automatically.
   */
  spawnExecutionMode(prompt: string): Subprocess {
    const args = this.buildCommand("execute", prompt);
    return this.spawnProcess(args);
  }

  /**
   * Builds the command array for spawning Claude
   *
   * @param mode - The execution mode (plan or execute)
   * @param prompt - The prompt to send
   * @returns Array of command arguments
   */
  buildCommand(mode: ClaudeMode, prompt: string): string[] {
    // Split the claudePath on spaces to handle paths like "bun /path/to/script"
    // This allows for multi-part commands while preserving argument integrity
    const args: string[] = this.options.claudePath.split(" ");

    // Add mode-specific flags
    if (mode === "plan") {
      // Use --permission-mode plan to allow Claude to explore without making edits
      args.push("--permission-mode", "plan");
    } else if (mode === "execute" && this.options.acceptEdits) {
      // In execution mode, we accept all edits automatically
      args.push("--dangerously-skip-permissions");
    }

    // Add the prompt using --print flag for non-interactive mode
    args.push("--print");
    args.push(prompt);

    return args;
  }

  // ==========================================================================
  // Process management
  // ==========================================================================

  /**
   * Kills the current running process
   *
   * @returns true if a process was killed, false if no process was running
   */
  kill(): boolean {
    this.clearTimeout();

    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
      return true;
    }

    return false;
  }

  /**
   * Checks if a process is currently running
   *
   * @returns true if a process is running
   */
  isRunning(): boolean {
    return this.currentProcess !== null;
  }

  /**
   * Registers a callback for when the process exits
   *
   * @param callback - Function to call on exit with exit code and signal
   */
  onExit(callback: ExitCallback): void {
    this.exitCallbacks.push(callback);
  }

  /**
   * Registers a callback for stdout output
   *
   * @param callback - Function to call with output data
   */
  onOutput(callback: OutputCallback): void {
    this.outputCallbacks.push(callback);
  }

  /**
   * Registers a callback for stderr output
   *
   * @param callback - Function to call with error output data
   */
  onError(callback: OutputCallback): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Gets the accumulated stdout output
   *
   * @returns All stdout data captured so far
   */
  getStdout(): string {
    return this.stdoutBuffer;
  }

  /**
   * Gets the accumulated stderr output
   *
   * @returns All stderr data captured so far
   */
  getStderr(): string {
    return this.stderrBuffer;
  }

  /**
   * Gets the combined output (stdout + stderr)
   *
   * @returns Combined output string
   */
  getCombinedOutput(): string {
    return this.stdoutBuffer + this.stderrBuffer;
  }

  /**
   * Clears all registered callbacks
   */
  clearCallbacks(): void {
    this.exitCallbacks = [];
    this.outputCallbacks = [];
    this.errorCallbacks = [];
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Spawns a process with the given arguments
   */
  private spawnProcess(args: string[]): Subprocess {
    // Kill any existing process first
    if (this.currentProcess) {
      this.kill();
    }

    // Reset buffers and flags
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
    this.exitHandledByTimeout = false;

    // Spawn the process
    const [cmd, ...cmdArgs] = args;
    if (!cmd) {
      throw new Error("Command cannot be empty");
    }
    const proc = Bun.spawn([cmd, ...cmdArgs], {
      cwd: this.options.workingDir,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        // Ensure Claude knows it's running non-interactively
        CI: "true",
      },
    });

    this.currentProcess = proc;

    // Set up timeout
    this.setupTimeout();

    // Set up stream readers
    this.setupStreamReaders(proc);

    // Handle process exit
    proc.exited.then((exitCode) => {
      this.clearTimeout();
      const wasKilled = this.currentProcess === null;
      this.currentProcess = null;

      // Don't notify callbacks if timeout already handled this exit
      if (this.exitHandledByTimeout) {
        this.exitHandledByTimeout = false;
        return;
      }

      // Notify exit callbacks
      for (const callback of this.exitCallbacks) {
        callback(exitCode, wasKilled ? "SIGTERM" : null);
      }
    });

    return proc;
  }

  /**
   * Sets up the timeout timer
   */
  private setupTimeout(): void {
    this.clearTimeout();

    if (this.options.timeoutMs > 0) {
      this.timeoutId = setTimeout(() => {
        if (this.currentProcess) {
          // Mark that timeout handled this exit to prevent double callbacks
          this.exitHandledByTimeout = true;

          // Notify callbacks with timeout signal
          for (const callback of this.exitCallbacks) {
            callback(null, "TIMEOUT");
          }
          this.kill();
        }
      }, this.options.timeoutMs);
    }
  }

  /**
   * Clears the timeout timer
   */
  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Sets up stream readers for stdout and stderr
   */
  private async setupStreamReaders(proc: Subprocess): Promise<void> {
    // Read stdout (when using "pipe", stdout is a ReadableStream)
    if (proc.stdout && typeof proc.stdout !== "number") {
      this.readStream(proc.stdout, (data) => {
        this.stdoutBuffer += data;
        for (const callback of this.outputCallbacks) {
          callback(data);
        }
      });
    }

    // Read stderr (when using "pipe", stderr is a ReadableStream)
    if (proc.stderr && typeof proc.stderr !== "number") {
      this.readStream(proc.stderr, (data) => {
        this.stderrBuffer += data;
        for (const callback of this.errorCallbacks) {
          callback(data);
        }
      });
    }
  }

  /**
   * Reads from a ReadableStream and calls callback with chunks
   */
  private async readStream(
    stream: ReadableStream<Uint8Array>,
    callback: (data: string) => void
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        callback(text);
      }
    } catch {
      // Stream closed or error - ignore
    } finally {
      reader.releaseLock();
    }
  }
}
