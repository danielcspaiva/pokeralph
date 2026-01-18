/**
 * PromptBuilder service for PokéRalph
 *
 * Builds optimized prompts for Claude Code in different contexts:
 * - Planning mode: Initial idea refinement
 * - Task execution: Battle loop prompts
 * - PRD breakdown: Splitting PRD into tasks
 */

import type { Task, PRD, Progress } from "../types/index.ts";

/**
 * Context for task execution prompts
 *
 * @remarks
 * This provides Claude with all the context needed to execute a task effectively.
 */
export interface TaskContext {
  /**
   * Summarized version of the PRD (project overview)
   */
  prdSummary: string;

  /**
   * Current progress state for the task (if any)
   */
  currentProgress?: Progress;

  /**
   * List of relevant files that Claude should focus on
   */
  relevantFiles?: string[];

  /**
   * Feedback loops to run after implementation
   * @example ["test", "lint", "typecheck"]
   */
  feedbackLoops: string[];

  /**
   * Whether to auto-commit after successful iteration
   */
  autoCommit: boolean;

  /**
   * Maximum iterations allowed for this task
   */
  maxIterations: number;

  /**
   * Path to the progress.json file that Claude should update
   */
  progressFilePath: string;
}

/**
 * JSON schema for PRD output from planning phase
 */
export const PRD_OUTPUT_SCHEMA = {
  type: "object",
  required: ["name", "description", "createdAt", "tasks"],
  properties: {
    name: { type: "string", description: "Project name" },
    description: { type: "string", description: "Project description" },
    createdAt: { type: "string", format: "date-time", description: "ISO timestamp" },
    tasks: {
      type: "array",
      minItems: 1,
      description: "Array of tasks to complete the project",
      items: {
        type: "object",
        required: ["id", "title", "description", "priority", "acceptanceCriteria"],
        properties: {
          id: { type: "string", description: "Unique ID format: 001-task-name" },
          title: { type: "string", description: "Human-readable title" },
          description: { type: "string", description: "Detailed description" },
          priority: { type: "number", description: "Lower = higher priority (1 is highest)" },
          acceptanceCriteria: {
            type: "array",
            items: { type: "string" },
            description: "List of criteria for completion",
          },
        },
      },
    },
    metadata: {
      type: "object",
      properties: {
        version: { type: "string" },
        generatedBy: { type: "string" },
        originalIdea: { type: "string" },
      },
    },
  },
} as const;

/**
 * JSON schema for tasks output from breakdown phase
 */
export const TASKS_OUTPUT_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    required: ["id", "title", "description", "priority", "acceptanceCriteria"],
    properties: {
      id: { type: "string", description: "Unique ID format: 001-task-name" },
      title: { type: "string", description: "Human-readable title" },
      description: { type: "string", description: "Detailed description" },
      priority: { type: "number", description: "Lower = higher priority" },
      acceptanceCriteria: {
        type: "array",
        items: { type: "string" },
        description: "List of criteria for completion",
      },
    },
  },
} as const;

/**
 * JSON schema for progress.json updates
 */
export const PROGRESS_UPDATE_SCHEMA = {
  type: "object",
  required: ["taskId", "currentIteration", "status", "lastUpdate", "logs", "lastOutput", "completionDetected", "error", "feedbackResults"],
  properties: {
    taskId: { type: "string" },
    currentIteration: { type: "number" },
    status: { type: "string", enum: ["idle", "in_progress", "awaiting_approval", "completed", "failed"] },
    lastUpdate: { type: "string", format: "date-time" },
    logs: { type: "array", items: { type: "string" } },
    lastOutput: { type: "string" },
    completionDetected: { type: "boolean" },
    error: { type: ["string", "null"] },
    feedbackResults: { type: "object" },
  },
} as const;

/**
 * Completion sigil that Claude emits when task is complete
 */
export const COMPLETION_SIGIL = "<promise>COMPLETE</promise>";

/**
 * Template constants for building prompts
 */
const TEMPLATES = {
  /**
   * System context header for all prompts
   */
  SYSTEM_HEADER: `You are working within the PokéRalph autonomous development system.
Your goal is to complete tasks efficiently and accurately.`,

  /**
   * Planning phase introduction
   */
  PLANNING_INTRO: `You are in PLANNING MODE. Your goal is to help refine an idea into a well-structured PRD (Product Requirements Document).

IMPORTANT: Ask 2-5 clarifying questions FIRST before generating the PRD. Questions should cover:
- The scope and goals of the project
- Technical constraints and preferences
- Priority of features
- Any existing code or architecture to consider

Be thorough but efficient. Once you have enough information, generate a complete PRD.`,

  /**
   * Task execution introduction
   */
  TASK_INTRO: `You are in EXECUTION MODE. Your goal is to complete the following task as part of a "battle" in the PokéRalph system.

Work iteratively:
1. Understand the task and acceptance criteria
2. Explore relevant code
3. Implement the solution
4. Run feedback loops
5. Fix any issues
6. Commit when complete`,

  /**
   * PRD breakdown introduction
   */
  BREAKDOWN_INTRO: `Your goal is to break down the following PRD into individual, actionable tasks.

Each task should:
- Be completable in 1-10 iterations
- Have clear acceptance criteria
- Be independent when possible (minimize dependencies)
- Include a unique ID in format: XXX-task-name (e.g., 001-setup-monorepo)
- Have a priority number (lower = higher priority)`,

  /**
   * Progress update instructions
   */
  PROGRESS_INSTRUCTIONS: `IMPORTANT: You MUST update the progress.json file regularly during execution.

Update progress.json:
- At the start of each major step
- When running commands
- When encountering errors
- When completing the task

The progress file is located at: {progressFilePath}`,

  /**
   * Feedback loop instructions
   */
  FEEDBACK_INSTRUCTIONS: `After implementing changes, run the following feedback loops:
{feedbackLoops}

All feedback loops must pass before the task is considered complete.`,

  /**
   * Commit instructions
   */
  COMMIT_INSTRUCTIONS: `After all feedback loops pass:
1. Stage relevant files (excluding .pokeralph/battles/)
2. Commit with message format: [PokéRalph] {taskId}: {title}
3. Update progress.json to reflect completion`,

  /**
   * Completion instructions
   */
  COMPLETION_INSTRUCTIONS: `When you have successfully completed ALL acceptance criteria and all feedback loops pass:
1. Update progress.json with completionDetected: true
2. Output the completion sigil: ${COMPLETION_SIGIL}

DO NOT output the completion sigil until ALL criteria are met.`,
} as const;

/**
 * PromptBuilder - constructs optimized prompts for Claude Code
 *
 * @example
 * ```ts
 * const builder = new PromptBuilder();
 * const planningPrompt = builder.buildPlanningPrompt("Build a todo app");
 * const taskPrompt = builder.buildTaskPrompt(task, context);
 * ```
 */
export class PromptBuilder {
  /**
   * Builds a prompt to start planning mode
   *
   * @param idea - The initial idea to refine
   * @returns A prompt for Claude to enter plan mode
   *
   * @example
   * ```ts
   * const prompt = builder.buildPlanningPrompt("Build a React dashboard with real-time updates");
   * ```
   */
  buildPlanningPrompt(idea: string): string {
    return `${TEMPLATES.SYSTEM_HEADER}

${TEMPLATES.PLANNING_INTRO}

## Original Idea

${idea}

## Your Task

1. Ask 2-5 clarifying questions FIRST to understand the full scope
2. Help the user refine their idea through multi-turn conversation
3. When ready, generate a PRD with DETAILED TASKS in JSON format

IMPORTANT: Ask questions FIRST before generating the PRD.

## PRD Output Format

When you generate the final PRD, you MUST include a "tasks" array with at least one task.
Each task must have: id, title, description, priority, acceptanceCriteria.

Task ID format: XXX-short-name (e.g., 001-setup-project, 002-implement-auth)
Priority: Lower number = higher priority (1 is highest)

Output ONLY valid JSON matching this schema:

\`\`\`json
${JSON.stringify(PRD_OUTPUT_SCHEMA, null, 2)}
\`\`\`

Begin by asking your first clarifying question.`;
  }

  /**
   * Builds a prompt to execute a task in battle mode
   *
   * @param task - The task to execute
   * @param context - Additional context for execution
   * @returns A prompt for Claude to execute the task
   *
   * @example
   * ```ts
   * const prompt = builder.buildTaskPrompt(task, {
   *   prdSummary: "A todo app...",
   *   feedbackLoops: ["test", "lint"],
   *   autoCommit: true,
   *   maxIterations: 10,
   *   progressFilePath: ".pokeralph/battles/001-task/progress.json"
   * });
   * ```
   */
  buildTaskPrompt(task: Task, context: TaskContext): string {
    const sections: string[] = [];

    // Header
    sections.push(TEMPLATES.SYSTEM_HEADER);
    sections.push("");
    sections.push(TEMPLATES.TASK_INTRO);

    // Project context
    sections.push("");
    sections.push("## Project Context");
    sections.push("");
    sections.push(context.prdSummary);

    // Task details
    sections.push("");
    sections.push("## Current Task");
    sections.push("");
    sections.push(`**ID:** ${task.id}`);
    sections.push(`**Title:** ${task.title}`);
    sections.push(`**Priority:** ${task.priority}`);
    sections.push("");
    sections.push("### Description");
    sections.push("");
    sections.push(task.description);
    sections.push("");
    sections.push("### Acceptance Criteria");
    sections.push("");
    for (const criterion of task.acceptanceCriteria) {
      sections.push(`- [ ] ${criterion}`);
    }

    // Relevant files
    if (context.relevantFiles && context.relevantFiles.length > 0) {
      sections.push("");
      sections.push("### Relevant Files");
      sections.push("");
      for (const file of context.relevantFiles) {
        sections.push(`- ${file}`);
      }
    }

    // Current progress (if resuming)
    if (context.currentProgress && context.currentProgress.currentIteration > 0) {
      sections.push("");
      sections.push("### Current Progress");
      sections.push("");
      sections.push(`**Iteration:** ${context.currentProgress.currentIteration} / ${context.maxIterations}`);
      sections.push(`**Status:** ${context.currentProgress.status}`);
      if (context.currentProgress.lastOutput) {
        sections.push(`**Last Output:** ${context.currentProgress.lastOutput}`);
      }
      if (context.currentProgress.error) {
        sections.push(`**Previous Error:** ${context.currentProgress.error}`);
      }
    }

    // Progress update instructions
    sections.push("");
    sections.push("## Progress Tracking");
    sections.push("");
    sections.push(TEMPLATES.PROGRESS_INSTRUCTIONS.replace("{progressFilePath}", context.progressFilePath));
    sections.push("");
    sections.push("Progress JSON schema:");
    sections.push("");
    sections.push("```json");
    sections.push(JSON.stringify(PROGRESS_UPDATE_SCHEMA, null, 2));
    sections.push("```");

    // Feedback loop instructions
    if (context.feedbackLoops.length > 0) {
      sections.push("");
      sections.push("## Feedback Loops");
      sections.push("");
      const loopsList = context.feedbackLoops.map(loop => `- \`bun run ${loop}\``).join("\n");
      sections.push(TEMPLATES.FEEDBACK_INSTRUCTIONS.replace("{feedbackLoops}", loopsList));
    }

    // Commit instructions
    if (context.autoCommit) {
      sections.push("");
      sections.push("## Commit");
      sections.push("");
      sections.push(TEMPLATES.COMMIT_INSTRUCTIONS
        .replace("{taskId}", task.id)
        .replace("{title}", task.title));
    }

    // Completion instructions
    sections.push("");
    sections.push("## Completion");
    sections.push("");
    sections.push(TEMPLATES.COMPLETION_INSTRUCTIONS);

    // Constraints
    sections.push("");
    sections.push("## Constraints");
    sections.push("");
    sections.push(`- Maximum iterations: ${context.maxIterations}`);
    sections.push(`- Current iteration: ${context.currentProgress?.currentIteration ?? 1}`);
    sections.push("- Only modify files necessary for this task");
    sections.push("- Follow existing code patterns and conventions");
    sections.push("- Do not introduce breaking changes to unrelated code");

    return sections.join("\n");
  }

  /**
   * Builds a prompt to break down a PRD into tasks
   *
   * @param prd - The PRD content (as string or PRD object)
   * @returns A prompt for Claude to generate tasks
   *
   * @example
   * ```ts
   * const prompt = builder.buildBreakdownPrompt(prdContent);
   * // Claude will output JSON array of tasks
   * ```
   */
  buildBreakdownPrompt(prd: string | PRD): string {
    const prdContent = typeof prd === "string" ? prd : this.formatPRDForPrompt(prd);

    return `${TEMPLATES.SYSTEM_HEADER}

${TEMPLATES.BREAKDOWN_INTRO}

## PRD to Break Down

${prdContent}

## Task Guidelines

1. **Ordering:** Tasks should be ordered by dependency and priority
2. **Granularity:** Each task should be achievable in 1-10 Claude iterations
3. **Independence:** Minimize dependencies between tasks when possible
4. **IDs:** Use format XXX-short-name (e.g., 001-setup-monorepo, 002-define-types)
5. **Acceptance Criteria:** Be specific and testable

## Output Format

Output ONLY valid JSON matching this schema:

\`\`\`json
${JSON.stringify(TASKS_OUTPUT_SCHEMA, null, 2)}
\`\`\`

Generate the tasks now.`;
  }

  /**
   * Formats a PRD object into a readable string for prompts
   *
   * @param prd - The PRD object to format
   * @returns A formatted string representation
   */
  private formatPRDForPrompt(prd: PRD): string {
    const sections: string[] = [];

    sections.push(`# ${prd.name}`);
    sections.push("");
    sections.push(prd.description);

    if (prd.metadata?.originalIdea) {
      sections.push("");
      sections.push("## Original Idea");
      sections.push("");
      sections.push(prd.metadata.originalIdea);
    }

    if (prd.tasks.length > 0) {
      sections.push("");
      sections.push("## Existing Tasks");
      sections.push("");
      for (const task of prd.tasks) {
        sections.push(`- **${task.id}:** ${task.title} (${task.status})`);
      }
    }

    return sections.join("\n");
  }

  /**
   * Creates a summary of a PRD for use in task context
   *
   * @param prd - The PRD to summarize
   * @returns A concise summary string
   */
  summarizePRD(prd: PRD): string {
    const taskStats = {
      total: prd.tasks.length,
      completed: prd.tasks.filter(t => t.status === "completed").length,
      pending: prd.tasks.filter(t => t.status === "pending").length,
      inProgress: prd.tasks.filter(t => t.status === "in_progress").length,
    };

    return `**Project:** ${prd.name}

**Description:** ${prd.description}

**Tasks:** ${taskStats.total} total (${taskStats.completed} completed, ${taskStats.pending} pending, ${taskStats.inProgress} in progress)`;
  }

  /**
   * Gets the completion sigil constant
   *
   * @returns The completion sigil string
   */
  getCompletionSigil(): string {
    return COMPLETION_SIGIL;
  }
}
