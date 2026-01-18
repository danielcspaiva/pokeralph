/**
 * PlanService for PokéRalph
 *
 * Manages the planning phase and PRD generation.
 * Handles the interaction with Claude Code in plan mode to refine ideas
 * and generate structured PRDs with tasks.
 */

import { EventEmitter } from "node:events";

// Strategic logging helper
const log = (action: string, data?: unknown) => {
  console.log(`[PokéRalph][PlanService] ${action}`, data ? JSON.stringify(data, null, 2) : "");
};
import type { ClaudeBridge } from "./claude-bridge.ts";
import type { PromptBuilder } from "./prompt-builder.ts";
import { PRD_OUTPUT_SCHEMA } from "./prompt-builder.ts";
import type { FileManager } from "./file-manager.ts";
import type { PRD, Task, DraftPRD, ConversationTurn, PartialPRD } from "../types/index.ts";
import { TaskStatus } from "../types/index.ts";

/**
 * Internal state for the planning phase
 */
export type PlanningState = "idle" | "planning" | "waiting_input" | "completed";

/**
 * Dependencies required by PlanService
 */
export interface PlanServiceDependencies {
  claudeBridge: ClaudeBridge;
  promptBuilder: PromptBuilder;
  fileManager: FileManager;
}

/**
 * Events emitted by PlanService
 */
export interface PlanServiceEvents {
  /** Emitted when planning starts */
  planning_started: [{ idea: string }];
  /** Emitted with Claude output during planning */
  output: [{ output: string }];
  /** Emitted when Claude asks a question */
  question: [{ question: string }];
  /** Emitted when planning state changes */
  state_change: [{ from: PlanningState; to: PlanningState }];
  /** Emitted when planning completes */
  planning_completed: [{ prd: PRD }];
  /** Emitted when tasks are generated from PRD */
  tasks_generated: [{ tasks: Task[] }];
  /** Emitted periodically during planning to keep connection alive */
  keepalive: [{ timestamp: string; state: PlanningState }];
  /** Emitted on error */
  error: [{ message: string; code?: string; details?: unknown }];
}

/**
 * Error codes for PRD extraction failures
 * Used to determine recovery options in UI
 */
export type PRDExtractionErrorCode =
  | "NO_JSON_FOUND"
  | "INVALID_JSON"
  | "MISSING_NAME"
  | "MISSING_DESCRIPTION"
  | "MISSING_TASKS"
  | "EMPTY_TASKS"
  | "INVALID_TASK";

/**
 * Result of parsing Claude's PRD output
 */
export interface PRDParseResult {
  success: boolean;
  prd?: PRD;
  error?: string;
  /** Error code for structured recovery in UI */
  errorCode?: PRDExtractionErrorCode;
  rawOutput: string;
  /** Strategies that were attempted before failure */
  attemptedStrategies?: string[];
}

/**
 * Result of parsing Claude's tasks output
 */
export interface TasksParseResult {
  success: boolean;
  tasks?: Task[];
  error?: string;
  rawOutput: string;
}

/**
 * PlanService - manages the planning phase and PRD generation
 *
 * @remarks
 * The planning phase involves:
 * 1. User describes an idea
 * 2. Claude asks clarifying questions
 * 3. User provides answers
 * 4. Claude generates a PRD
 * 5. PRD is broken into individual tasks
 *
 * @example
 * ```ts
 * const planService = new PlanService({
 *   claudeBridge,
 *   promptBuilder,
 *   fileManager,
 * });
 *
 * planService.on("output", ({ output }) => console.log(output));
 * planService.on("question", ({ question }) => {
 *   // Get user input and call answerQuestion()
 * });
 *
 * await planService.startPlanning("Build a todo app");
 * ```
 */
export class PlanService extends EventEmitter {
  private readonly deps: PlanServiceDependencies;
  private state: PlanningState = "idle";
  private currentIdea: string | null = null;
  private conversationBuffer = "";
  private outputBuffer = "";
  private pendingQuestion: string | null = null;
  /** Keepalive interval for long-running planning operations */
  private keepaliveInterval: Timer | null = null;
  /** Keepalive interval in milliseconds (30 seconds) */
  private readonly keepaliveIntervalMs = 30000;
  /** Conversation turns for draft saving */
  private conversationTurns: ConversationTurn[] = [];
  /** Draft version for conflict detection */
  private draftVersion = 0;

  /**
   * Creates a new PlanService instance
   *
   * @param dependencies - All required service dependencies
   */
  constructor(dependencies: PlanServiceDependencies) {
    super();
    this.deps = dependencies;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Gets the current planning state
   */
  getState(): PlanningState {
    return this.state;
  }

  /**
   * Checks if the service is in a planning session
   */
  isPlanning(): boolean {
    return this.state !== "idle" && this.state !== "completed";
  }

  /**
   * Checks if the service has accumulated output from Claude
   *
   * @returns True if there is output in the buffer
   */
  hasOutput(): boolean {
    return this.outputBuffer.length > 0;
  }

  /**
   * Starts a new planning session with the given idea
   *
   * @param idea - The initial idea to refine
   * @throws Error if already in a planning session
   */
  async startPlanning(idea: string): Promise<void> {
    log("startPlanning called", { idea: idea.substring(0, 100) + (idea.length > 100 ? "..." : "") });

    if (this.isPlanning()) {
      throw new Error(
        "Planning session already in progress. Call finishPlanning() or reset() first."
      );
    }

    // Reset state
    this.currentIdea = idea;
    this.conversationBuffer = "";
    this.outputBuffer = "";
    this.pendingQuestion = null;
    this.conversationTurns = [];
    this.draftVersion = 0;

    // Transition to planning state
    this.setState("planning");

    // Emit planning_started event
    this.emit("planning_started", { idea });

    // Build the planning prompt
    const prompt = this.deps.promptBuilder.buildPlanningPrompt(idea);
    log("Built planning prompt", { promptLength: prompt.length });

    // Start Claude in plan mode
    await this.runClaudePlanning(prompt);
    log("Claude planning session completed");
  }

  /**
   * Sends an answer to Claude's question during planning
   *
   * @param answer - The user's answer to the question
   * @throws Error if not waiting for input
   */
  async answerQuestion(answer: string): Promise<void> {
    // Accept either explicit waiting_input state OR presence of a pending question
    // This handles the race condition where pendingQuestion is set but state hasn't fully transitioned
    if (this.state !== "waiting_input" && !this.pendingQuestion) {
      throw new Error(`Not waiting for input. Current state: ${this.state}`);
    }

    // Track the user's answer in conversation turns
    this.conversationTurns.push({
      role: "user",
      content: answer,
      timestamp: new Date().toISOString(),
    });

    // Clear the pending question
    this.pendingQuestion = null;

    // Append to conversation
    this.conversationBuffer += `\n\nUser: ${answer}\n\nAssistant: `;

    // Transition back to planning
    this.setState("planning");

    // Continue the conversation with context
    const continuationPrompt = this.buildContinuationPrompt(answer);
    await this.runClaudePlanning(continuationPrompt);

    // Auto-save draft after Q&A turn
    await this.saveDraft();
  }

  /**
   * Finalizes the planning phase and extracts the PRD
   *
   * @returns The generated PRD
   * @throws Error if planning hasn't produced a valid PRD
   */
  async finishPlanning(): Promise<PRD> {
    if (this.state === "idle") {
      throw new Error("No planning session to finish");
    }

    // Parse PRD from the output
    const parseResult = this.parsePRDOutput(this.outputBuffer);

    if (!parseResult.success || !parseResult.prd) {
      throw new Error(
        `Failed to parse PRD from planning output: ${parseResult.error}`
      );
    }

    const prd = parseResult.prd;

    // Transition to completed
    this.setState("completed");

    // Delete draft on successful completion
    await this.deleteDraft();

    // Emit planning_completed event
    this.emit("planning_completed", { prd });

    return prd;
  }

  /**
   * Breaks a PRD into individual tasks
   *
   * @param prd - The PRD to break down (or uses current planning PRD)
   * @returns Array of generated tasks
   */
  async breakIntoTasks(prd: PRD): Promise<Task[]> {
    // Build the breakdown prompt
    const prompt = this.deps.promptBuilder.buildBreakdownPrompt(prd);

    // Run Claude to generate tasks
    const output = await this.runClaudeBreakdown(prompt);

    // Parse tasks from output
    const parseResult = this.parseTasksOutput(output);

    if (!parseResult.success || !parseResult.tasks) {
      throw new Error(
        `Failed to parse tasks from breakdown output: ${parseResult.error}`
      );
    }

    // Emit tasks_generated event
    this.emit("tasks_generated", { tasks: parseResult.tasks });

    return parseResult.tasks;
  }

  /**
   * Parses Claude's output to extract a PRD
   * Uses multiple extraction strategies per spec (02-planning.md):
   * 1. extractFromCodeBlock - Look for ```json blocks
   * 2. extractFromMarkers - Look for PRD: or similar markers
   * 3. extractLooseJSON - Try to find any JSON object
   * 4. extractFromMarkdown - Parse markdown structure
   *
   * @param raw - The raw output from Claude
   * @returns ParseResult with the PRD or error with recovery info
   */
  parsePRDOutput(raw: string): PRDParseResult {
    const result: PRDParseResult = {
      success: false,
      rawOutput: raw,
    };

    try {
      // Extract JSON using multiple strategies per spec
      const { json: jsonStr, strategies } = this.extractJSONWithStrategies(raw);
      result.attemptedStrategies = strategies;

      if (!jsonStr) {
        result.error = `No JSON found in output. Tried: ${strategies.join(", ")}`;
        result.errorCode = "NO_JSON_FOUND";
        return result;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseError) {
        result.error = `Invalid JSON: ${parseError instanceof Error ? parseError.message : "parse error"}`;
        result.errorCode = "INVALID_JSON";
        return result;
      }

      // Type guard for parsed object
      if (typeof parsed !== "object" || parsed === null) {
        result.error = "Parsed JSON is not an object";
        result.errorCode = "INVALID_JSON";
        return result;
      }

      const parsedObj = parsed as Record<string, unknown>;

      // Validate required fields
      if (!parsedObj.name || typeof parsedObj.name !== "string") {
        result.error = "PRD missing required field: name";
        result.errorCode = "MISSING_NAME";
        return result;
      }

      if (!parsedObj.description || typeof parsedObj.description !== "string") {
        result.error = "PRD missing required field: description";
        result.errorCode = "MISSING_DESCRIPTION";
        return result;
      }

      // Validate tasks array exists
      if (!Array.isArray(parsedObj.tasks)) {
        result.error = "PRD must contain a tasks array";
        result.errorCode = "MISSING_TASKS";
        return result;
      }

      // Validate tasks array has at least one item
      if (parsedObj.tasks.length === 0) {
        result.error = "PRD must contain at least one task";
        result.errorCode = "EMPTY_TASKS";
        return result;
      }

      // Validate each task has required fields and transform to Task objects
      const now = new Date().toISOString();
      const tasks: Task[] = [];

      for (let i = 0; i < parsedObj.tasks.length; i++) {
        const t = parsedObj.tasks[i] as Record<string, unknown>;

        if (!t.id || typeof t.id !== "string") {
          result.error = `Task ${i + 1} missing required field: id`;
          result.errorCode = "INVALID_TASK";
          return result;
        }

        if (!t.title || typeof t.title !== "string") {
          result.error = `Task ${i + 1} missing required field: title`;
          result.errorCode = "INVALID_TASK";
          return result;
        }

        if (!t.description || typeof t.description !== "string") {
          result.error = `Task ${i + 1} missing required field: description`;
          result.errorCode = "INVALID_TASK";
          return result;
        }

        // Transform to proper Task object with status
        tasks.push({
          id: t.id,
          title: t.title,
          description: t.description,
          status: TaskStatus.Pending,
          priority: typeof t.priority === "number" ? t.priority : 99,
          acceptanceCriteria: Array.isArray(t.acceptanceCriteria) ? t.acceptanceCriteria : [],
          iterations: [],
          createdAt: now,
          updatedAt: now,
        });
      }

      // Build PRD object with validated tasks
      const prd: PRD = {
        name: parsedObj.name,
        description: parsedObj.description,
        createdAt: typeof parsedObj.createdAt === "string" ? parsedObj.createdAt : now,
        tasks,
        metadata: {
          version: (parsedObj.metadata as Record<string, unknown>)?.version as string || "0.1.0",
          generatedBy: (parsedObj.metadata as Record<string, unknown>)?.generatedBy as string || "PokéRalph PlanService",
          originalIdea: this.currentIdea || (parsedObj.metadata as Record<string, unknown>)?.originalIdea as string,
        },
      };

      result.success = true;
      result.prd = prd;
    } catch (error) {
      result.error =
        error instanceof Error ? error.message : "Unknown parse error";
      result.errorCode = "INVALID_JSON";
    }

    return result;
  }

  /**
   * Parses Claude's output to extract tasks
   *
   * @param raw - The raw output from Claude
   * @returns ParseResult with tasks or error
   */
  parseTasksOutput(raw: string): TasksParseResult {
    const result: TasksParseResult = {
      success: false,
      rawOutput: raw,
    };

    try {
      // Extract JSON from the output
      const jsonStr = this.extractJSON(raw);

      if (!jsonStr) {
        result.error = "No JSON found in output";
        return result;
      }

      const parsed = JSON.parse(jsonStr);

      // Ensure it's an array
      if (!Array.isArray(parsed)) {
        result.error = "Tasks output is not an array";
        return result;
      }

      // Validate and transform each task
      const tasks: Task[] = [];
      const now = new Date().toISOString();

      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];

        // Validate required fields
        if (!item.id || typeof item.id !== "string") {
          result.error = `Task at index ${i} missing required field: id`;
          return result;
        }

        if (!item.title || typeof item.title !== "string") {
          result.error = `Task at index ${i} missing required field: title`;
          return result;
        }

        if (!item.description || typeof item.description !== "string") {
          result.error = `Task at index ${i} missing required field: description`;
          return result;
        }

        if (typeof item.priority !== "number") {
          result.error = `Task at index ${i} missing required field: priority`;
          return result;
        }

        if (!Array.isArray(item.acceptanceCriteria)) {
          result.error = `Task at index ${i} missing required field: acceptanceCriteria`;
          return result;
        }

        // Build task object
        const task: Task = {
          id: item.id,
          title: item.title,
          description: item.description,
          status: TaskStatus.Pending,
          priority: item.priority,
          acceptanceCriteria: item.acceptanceCriteria,
          iterations: [],
          createdAt: now,
          updatedAt: now,
        };

        tasks.push(task);
      }

      result.success = true;
      result.tasks = tasks;
    } catch (error) {
      result.error =
        error instanceof Error ? error.message : "Unknown parse error";
    }

    return result;
  }

  /**
   * Saves the PRD to the file system
   *
   * @param prd - The PRD to save
   */
  async savePRD(prd: PRD): Promise<void> {
    await this.deps.fileManager.savePRD(prd);
  }

  /**
   * Resets the planning service to idle state
   */
  reset(): void {
    // Kill any running Claude process
    this.deps.claudeBridge.kill();

    // Stop keepalive interval
    this.stopKeepalive();

    // Reset state
    this.currentIdea = null;
    this.conversationBuffer = "";
    this.outputBuffer = "";
    this.pendingQuestion = null;
    this.conversationTurns = [];
    this.draftVersion = 0;
    this.setState("idle");
  }

  /**
   * Gets the accumulated conversation buffer
   */
  getConversationBuffer(): string {
    return this.conversationBuffer;
  }

  /**
   * Gets the current pending question (if any)
   */
  getPendingQuestion(): string | null {
    return this.pendingQuestion;
  }

  // ==========================================================================
  // Private methods
  // ==========================================================================

  /**
   * Sets the planning state and emits state_change event
   */
  private setState(newState: PlanningState): void {
    const oldState = this.state;
    if (oldState !== newState) {
      log(`State transition: ${oldState} → ${newState}`);
      this.state = newState;
      this.emit("state_change", { from: oldState, to: newState });
    }
  }

  /**
   * Runs Claude in plan mode for the initial planning
   */
  private async runClaudePlanning(prompt: string): Promise<void> {
    return new Promise((resolve) => {
      let currentOutput = "";

      // Start keepalive interval to emit periodic events during long-running planning
      this.startKeepalive();

      this.deps.claudeBridge.onOutput((data) => {
        currentOutput += data;
        this.outputBuffer += data;
        this.conversationBuffer += data;
        this.emit("output", { output: data });
      });

      this.deps.claudeBridge.onError((data) => {
        currentOutput += data;
        this.outputBuffer += data;
        this.conversationBuffer += data;
        this.emit("output", { output: data });
      });

      this.deps.claudeBridge.onExit((_code, signal) => {
        // Stop keepalive when Claude exits
        this.stopKeepalive();
        this.deps.claudeBridge.clearCallbacks();

        if (signal === "TIMEOUT") {
          this.emit("error", {
            message: "Claude planning session timed out",
            code: "TIMEOUT",
          });
          resolve();
          return;
        }

        // Analyze output to detect if Claude is asking a question
        const question = this.detectQuestion(currentOutput);

        if (question) {
          this.pendingQuestion = question;
          this.setState("waiting_input");
          this.emit("question", { question });
        } else {
          // Check if we have a complete PRD in the output
          const hasValidPRD = this.hasCompletePRD(currentOutput);

          if (hasValidPRD) {
            // Planning produced a PRD, stay in planning state
            // User can call finishPlanning() to extract it
          }
        }

        resolve();
      });

      // Spawn Claude in plan mode
      this.deps.claudeBridge.spawnPlanMode(prompt);
    });
  }

  /**
   * Starts the keepalive interval to emit periodic events
   */
  private startKeepalive(): void {
    this.stopKeepalive(); // Clear any existing interval
    this.keepaliveInterval = setInterval(() => {
      this.emit("keepalive", {
        timestamp: new Date().toISOString(),
        state: this.state,
      });
    }, this.keepaliveIntervalMs);
  }

  /**
   * Stops the keepalive interval
   */
  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  /**
   * Runs Claude for task breakdown
   */
  private async runClaudeBreakdown(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      let output = "";

      this.deps.claudeBridge.onOutput((data) => {
        output += data;
      });

      this.deps.claudeBridge.onError((data) => {
        output += data;
      });

      this.deps.claudeBridge.onExit((_code, signal) => {
        this.deps.claudeBridge.clearCallbacks();

        if (signal === "TIMEOUT") {
          this.emit("error", {
            message: "Claude breakdown session timed out",
            code: "TIMEOUT",
          });
        }

        resolve(output || this.deps.claudeBridge.getCombinedOutput());
      });

      // Spawn Claude in execution mode for breakdown (doesn't need plan mode)
      this.deps.claudeBridge.spawnExecutionMode(prompt);
    });
  }

  /**
   * Builds a continuation prompt with conversation context
   */
  private buildContinuationPrompt(answer: string): string {
    return `Continue the planning conversation. The user has answered your question.

Previous conversation context:
${this.conversationBuffer}

User's answer: ${answer}

Continue helping the user refine their idea. If you have enough information, generate the PRD in JSON format.

PRD JSON Schema:
\`\`\`json
${JSON.stringify(PRD_OUTPUT_SCHEMA, null, 2)}
\`\`\``;
  }

  /**
   * Detects if Claude is asking a question in the output
   */
  private detectQuestion(output: string): string | null {
    log("detectQuestion - analyzing output", { outputLength: output.length });

    // Look for common question patterns
    const questionPatterns = [
      // Direct questions (with optional markdown bold around question word)
      /(?:^|\n)\**(?:What|How|Which|Could you|Can you|Would you|Do you|Does|Is|Are|Should|Will)\**[^?]*\?/gm,
      // Questions with follow-up
      /(?:I'd like to know|I need to understand|Could you clarify|Please tell me|Can you specify)[^?]*\?/gm,
      // Numbered questions with optional markdown bold (e.g., **1.** or 1.)
      /(?:^|\n)\**\d+\.\**\s*[^?]*\?/gm,
      // Any line containing a question mark after a dash or colon (common Claude formatting)
      /(?:^|\n)[^?\n]*[-:]\s*[^?\n]*\?/gm,
    ];

    // Get the last chunk of output (Claude's most recent response)
    const lines = output.trim().split("\n");
    const lastChunk = lines.slice(-20).join("\n"); // Last 20 lines

    for (const pattern of questionPatterns) {
      const matches = lastChunk.match(pattern);
      if (matches && matches.length > 0) {
        // Return the last question found
        const lastMatch = matches[matches.length - 1];
        if (lastMatch) {
          log("detectQuestion - found question", { question: lastMatch.trim().substring(0, 100) });
          return lastMatch.trim();
        }
      }
    }

    // Check if output ends with a question mark
    const trimmed = output.trim();
    if (trimmed.endsWith("?")) {
      // Extract the last sentence/question
      const sentences = trimmed.split(/[.!]\s+/);
      const lastSentence = sentences[sentences.length - 1];
      if (lastSentence?.includes("?")) {
        log("detectQuestion - found trailing question", { question: lastSentence.trim().substring(0, 100) });
        return lastSentence.trim();
      }
    }

    // Check for implicit question patterns (Claude asking for info without explicit ?)
    // These patterns indicate Claude is waiting for user input
    const implicitQuestionPatterns = [
      /(?:Here's what I need to understand|I need to understand|I'd like to understand|Let me understand)/i,
      /(?:Once you answer|After you answer|When you answer|Please answer|Please provide|Please tell me|Please clarify)/i,
      /(?:I have (?:some|a few|several) questions|Here are (?:my|some|a few) questions)/i,
      /(?:Could you (?:provide|share|tell|clarify|explain)|Would you (?:like|prefer))/i,
      /(?:What (?:would you|do you) prefer|Which (?:would you|do you) prefer)/i,
    ];

    for (const pattern of implicitQuestionPatterns) {
      if (pattern.test(lastChunk)) {
        // Extract a meaningful summary of what Claude is asking
        const summaryMatch = lastChunk.match(/(?:Here's what I need to understand|I need to understand|questions)[:\s]*(.*?)(?:\n\n|$)/is);
        const question = summaryMatch?.[1]?.trim() || "Claude is asking clarifying questions. Please review the conversation and provide your answers.";
        log("detectQuestion - found implicit question pattern", { question: question.substring(0, 100) });
        return question;
      }
    }

    log("detectQuestion - no question detected");
    return null;
  }

  /**
   * Checks if the output contains a complete PRD
   */
  private hasCompletePRD(output: string): boolean {
    const jsonStr = this.extractJSON(output);
    if (!jsonStr) return false;

    try {
      const parsed = JSON.parse(jsonStr);
      return (
        typeof parsed.name === "string" &&
        typeof parsed.description === "string"
      );
    } catch {
      return false;
    }
  }

  /**
   * Extracts JSON from output using multiple strategies per spec (02-planning.md)
   * Strategies are tried in order:
   * 1. extractFromCodeBlock - Look for ```json blocks
   * 2. extractFromMarkers - Look for PRD: or similar markers
   * 3. extractLooseJSON - Try to find any JSON object/array
   * 4. extractFromMarkdown - Parse markdown structure
   *
   * @returns Tuple of [json string, strategies attempted]
   */
  private extractJSONWithStrategies(text: string): { json: string | null; strategies: string[] } {
    const strategies: string[] = [];

    // Strategy 1: extractFromCodeBlock - Look for ```json blocks
    strategies.push("extractFromCodeBlock");
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch?.[1]) {
      const content = codeBlockMatch[1].trim();
      try {
        JSON.parse(content);
        return { json: content, strategies };
      } catch {
        // Not valid JSON, continue to other strategies
      }
    }

    // Strategy 2: extractFromMarkers - Look for PRD: or similar markers
    strategies.push("extractFromMarkers");
    const markerPatterns = [
      /PRD:\s*(\{[\s\S]*\})/i,
      /Project Document:\s*(\{[\s\S]*\})/i,
      /Here(?:'s| is) (?:the |your )?PRD:?\s*(\{[\s\S]*\})/i,
      /Generated PRD:?\s*(\{[\s\S]*\})/i,
    ];
    for (const pattern of markerPatterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        try {
          JSON.parse(match[1]);
          return { json: match[1], strategies };
        } catch {
          // Not valid JSON, try next pattern
        }
      }
    }

    // Strategy 3: extractLooseJSON - Try to find any JSON object/array
    strategies.push("extractLooseJSON");
    // Try to find a JSON object directly first (PRDs are objects)
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        JSON.parse(objectMatch[0]);
        return { json: objectMatch[0], strategies };
      } catch {
        // Not valid JSON
      }
    }

    // Try to find a JSON array directly (for task lists)
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        JSON.parse(arrayMatch[0]);
        return { json: arrayMatch[0], strategies };
      } catch {
        // Not valid JSON
      }
    }

    // Strategy 4: extractFromMarkdown - Parse markdown structure
    strategies.push("extractFromMarkdown");
    const markdownPRD = this.extractPRDFromMarkdown(text);
    if (markdownPRD) {
      return { json: markdownPRD, strategies };
    }

    return { json: null, strategies };
  }

  /**
   * Legacy method for backward compatibility
   */
  private extractJSON(text: string): string | null {
    return this.extractJSONWithStrategies(text).json;
  }

  /**
   * Attempts to extract PRD structure from markdown-formatted output
   * when JSON extraction fails
   */
  private extractPRDFromMarkdown(text: string): string | null {
    try {
      // Look for project name in headers
      const nameMatch = text.match(/^#\s+(?:Project:\s*)?(.+)$/m) ||
                        text.match(/(?:Project|Name):\s*(.+)$/mi);
      if (!nameMatch) return null;

      // Look for description
      const descMatch = text.match(/(?:Description|Overview):\s*(.+?)(?:\n\n|\n#|\n-)/is) ||
                        text.match(/^(?!#)(?!-\s)(.{20,}?)(?:\n\n|\n#|\n-)/m);
      if (!descMatch) return null;

      // Look for tasks (bullet points or numbered lists)
      const taskMatches = [...text.matchAll(/^(?:[-*]|\d+\.)\s+(.+?)(?:\n|$)/gm)];
      if (taskMatches.length === 0) return null;

      // Build PRD object - safely access match groups
      const projectName = nameMatch[1];
      const projectDesc = descMatch[1];
      if (!projectName || !projectDesc) return null;

      const prd = {
        name: projectName.trim(),
        description: projectDesc.trim(),
        tasks: taskMatches.map((match, index) => {
          const taskTitle = match[1] ?? "Untitled task";
          return {
            id: `${String(index + 1).padStart(3, "0")}-task`,
            title: taskTitle.trim(),
            description: taskTitle.trim(),
            priority: index + 1,
            acceptanceCriteria: [],
          };
        }),
      };

      return JSON.stringify(prd);
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // Draft PRD methods (session persistence)
  // ==========================================================================

  /**
   * Saves the current planning session as a draft
   * Called automatically after each Q&A turn
   */
  private async saveDraft(): Promise<void> {
    if (!this.currentIdea) {
      log("saveDraft - no current idea, skipping");
      return;
    }

    // Track assistant's output in conversation turns
    if (this.outputBuffer) {
      // Add the last assistant response if we have output
      const lastAssistantTurn = this.conversationTurns.find(
        (t, i) => t.role === "assistant" && i === this.conversationTurns.length - 1
      );
      if (!lastAssistantTurn) {
        this.conversationTurns.push({
          role: "assistant",
          content: this.outputBuffer,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Try to extract partial PRD from current output
    let partialPRD: PartialPRD | undefined;
    const jsonStr = this.extractJSON(this.outputBuffer);
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.name || parsed.description) {
          partialPRD = {
            name: parsed.name,
            description: parsed.description,
            tasks: parsed.tasks,
          };
        }
      } catch {
        // Ignore parse errors for partial PRD
      }
    }

    this.draftVersion++;
    const draft: DraftPRD = {
      idea: this.currentIdea,
      conversation: this.conversationTurns,
      partialPRD,
      lastSavedAt: new Date().toISOString(),
      version: this.draftVersion,
    };

    try {
      await this.deps.fileManager.saveDraftPRD(draft);
      log("saveDraft - draft saved", { version: this.draftVersion });
    } catch (error) {
      // Don't fail the planning flow if draft save fails
      log("saveDraft - failed to save draft", { error: error instanceof Error ? error.message : error });
    }
  }

  /**
   * Deletes the draft PRD file
   * Called when planning completes successfully
   */
  private async deleteDraft(): Promise<void> {
    try {
      await this.deps.fileManager.deleteDraftPRD();
      log("deleteDraft - draft deleted");
    } catch (error) {
      // Don't fail if draft deletion fails
      log("deleteDraft - failed to delete draft", { error: error instanceof Error ? error.message : error });
    }
  }

  /**
   * Checks if a draft PRD exists
   *
   * @returns True if a draft exists
   */
  async hasDraft(): Promise<boolean> {
    return this.deps.fileManager.hasDraftPRD();
  }

  /**
   * Loads and returns the draft PRD if it exists
   *
   * @returns The draft PRD or null if none exists
   */
  async loadDraft(): Promise<DraftPRD | null> {
    try {
      return await this.deps.fileManager.loadDraftPRD();
    } catch {
      return null;
    }
  }

  /**
   * Resumes a planning session from a saved draft
   *
   * @param draft - The draft to resume from
   */
  async resumeFromDraft(draft: DraftPRD): Promise<void> {
    if (this.isPlanning()) {
      throw new Error("Planning session already in progress");
    }

    log("resumeFromDraft - resuming from draft", { idea: draft.idea.substring(0, 50), version: draft.version });

    // Restore state from draft
    this.currentIdea = draft.idea;
    this.conversationTurns = [...draft.conversation];
    this.draftVersion = draft.version;

    // Rebuild conversation buffer from turns
    this.conversationBuffer = draft.conversation
      .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`)
      .join("\n\n");

    // Set output buffer if we have partial PRD or last assistant message
    const lastAssistantTurn = draft.conversation.filter((t) => t.role === "assistant").pop();
    this.outputBuffer = lastAssistantTurn?.content || "";

    // Set state based on conversation
    // If the last turn was from assistant with a question, go to waiting_input
    if (lastAssistantTurn) {
      const question = this.detectQuestion(lastAssistantTurn.content);
      if (question) {
        this.pendingQuestion = question;
        this.setState("waiting_input");
        this.emit("question", { question });
      } else {
        this.setState("planning");
      }
    } else {
      this.setState("planning");
    }
  }

  // ==========================================================================
  // Type-safe event emitter methods
  // ==========================================================================

  override on<K extends keyof PlanServiceEvents>(
    event: K,
    listener: (...args: PlanServiceEvents[K]) => void
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override once<K extends keyof PlanServiceEvents>(
    event: K,
    listener: (...args: PlanServiceEvents[K]) => void
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends keyof PlanServiceEvents>(
    event: K,
    listener: (...args: PlanServiceEvents[K]) => void
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof PlanServiceEvents>(
    event: K,
    ...args: PlanServiceEvents[K]
  ): boolean {
    return super.emit(event, ...args);
  }

  override removeAllListeners<K extends keyof PlanServiceEvents>(event?: K): this {
    return super.removeAllListeners(event);
  }
}
