/**
 * SummaryService - generates iteration summaries for battle history
 *
 * Per spec 05-history.md lines 427-531: Learning Tool Features (UX Enhancement)
 * Auto-generated iteration summaries help users quickly understand what happened
 * in each iteration without reading full logs.
 */

import type { Iteration } from "../types/iteration.ts";
import type { FeedbackResults } from "../types/progress.ts";

/**
 * Summary of a file affected in an iteration
 */
export interface FileSummary {
  path: string;
  action: "created" | "modified" | "deleted";
  linesChanged?: number;
  summary: string;
}

/**
 * Summary of a feedback loop result
 */
export interface FeedbackSummary {
  loop: string;
  passed: boolean;
  summary: string;
  durationMs?: number;
}

/**
 * Complete iteration summary per spec
 */
export interface IterationSummary {
  iterationNumber: number;
  headline: string;
  whatChanged: string[];
  whyItHappened: string;
  filesAffected: FileSummary[];
  feedbackResults: FeedbackSummary[];
  learnings?: string[];
}

/**
 * Represents an action parsed from Claude's output
 */
export interface ClaudeAction {
  type: "create" | "modify" | "delete" | "test" | "fix" | "implement" | "refactor" | "add" | "update" | "remove";
  description: string;
  target?: string;
}

/**
 * Context for summary generation
 */
export interface SummaryContext {
  iteration: Iteration;
  output: string;
  diff?: string;
}

// Action verb patterns for parsing Claude output
const ACTION_PATTERNS: Array<{ pattern: RegExp; type: ClaudeAction["type"] }> = [
  { pattern: /(?:I'll|I will|Let me|Going to|Now I'll)\s+(create|creating)\s+(.+?)(?:\.|$)/gi, type: "create" },
  { pattern: /(?:I'll|I will|Let me|Going to|Now I'll)\s+(implement|implementing)\s+(.+?)(?:\.|$)/gi, type: "implement" },
  { pattern: /(?:I'll|I will|Let me|Going to|Now I'll)\s+(add|adding)\s+(.+?)(?:\.|$)/gi, type: "add" },
  { pattern: /(?:I'll|I will|Let me|Going to|Now I'll)\s+(update|updating)\s+(.+?)(?:\.|$)/gi, type: "update" },
  { pattern: /(?:I'll|I will|Let me|Going to|Now I'll)\s+(fix|fixing)\s+(.+?)(?:\.|$)/gi, type: "fix" },
  { pattern: /(?:I'll|I will|Let me|Going to|Now I'll)\s+(modify|modifying)\s+(.+?)(?:\.|$)/gi, type: "modify" },
  { pattern: /(?:I'll|I will|Let me|Going to|Now I'll)\s+(refactor|refactoring)\s+(.+?)(?:\.|$)/gi, type: "refactor" },
  { pattern: /(?:I'll|I will|Let me|Going to|Now I'll)\s+(delete|deleting|remove|removing)\s+(.+?)(?:\.|$)/gi, type: "delete" },
  { pattern: /(?:I'll|I will|Let me|Going to|Now I'll)\s+(write|writing)\s+(.+?)\s+test/gi, type: "test" },
  { pattern: /(?:Created|Implemented|Added|Fixed|Modified|Updated|Refactored|Deleted|Removed)\s+(.+?)(?:\.|$)/gi, type: "modify" },
];

// Reasoning extraction patterns
const REASONING_PATTERNS = [
  /(?:because|since|due to|as|given that)\s+(.+?)(?:\.|$)/gi,
  /(?:the reason|this is|this will|this approach)\s+(.+?)(?:\.|$)/gi,
  /(?:I chose|I decided|I opted|choosing)\s+(.+?)(?:\.|$)/gi,
  /(?:to ensure|to make|to prevent|to avoid|to improve)\s+(.+?)(?:\.|$)/gi,
];

// Learning extraction patterns
const LEARNING_PATTERNS = [
  /(?:note:|important:|tip:|remember:|learned:)\s*(.+?)(?:\.|$)/gi,
  /(?:using|used)\s+(.+?)\s+(?:for|to|because)/gi,
  /(?:pattern|approach|strategy|technique):\s*(.+?)(?:\.|$)/gi,
  /(?:best practice|good practice):\s*(.+?)(?:\.|$)/gi,
  /(?:set|configured|using)\s+(.+?)\s+to\s+(.+?)(?:\.|$)/gi,
];

/**
 * Parse Claude's output for key actions taken
 */
export function parseClaudeActions(output: string): ClaudeAction[] {
  const actions: ClaudeAction[] = [];
  const seen = new Set<string>();

  for (const { pattern, type } of ACTION_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    let match = pattern.exec(output);

    while (match !== null) {
      // Get the description from the appropriate capture group
      const description = match[2] || match[1];

      if (description) {
        // Clean up the description
        const cleanDesc = description.trim().replace(/\s+/g, " ").slice(0, 100);

        // Deduplicate similar actions
        const key = `${type}:${cleanDesc.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);

          actions.push({
            type,
            description: cleanDesc,
          });

          // Limit to 10 actions max
          if (actions.length >= 10) break;
        }
      }

      // Get next match
      match = pattern.exec(output);
    }

    if (actions.length >= 10) break;
  }

  return actions;
}

/**
 * Parse diff to summarize file changes
 */
export function parseDiffSummary(diff: string): FileSummary[] {
  if (!diff) return [];

  const summaries: FileSummary[] = [];
  const diffLines = diff.split("\n");

  let currentFile: string | null = null;
  let currentAction: FileSummary["action"] = "modified";
  let additions = 0;
  let deletions = 0;

  for (const line of diffLines) {
    // Detect file header
    if (line.startsWith("diff --git")) {
      // Save previous file if exists
      if (currentFile) {
        summaries.push({
          path: currentFile,
          action: currentAction,
          linesChanged: additions + deletions,
          summary: summarizeFileChange(currentFile, currentAction, additions, deletions),
        });
      }

      // Extract new file path
      const match = line.match(/b\/(.+)$/);
      currentFile = match?.[1] ?? null;
      currentAction = "modified";
      additions = 0;
      deletions = 0;
    }

    // Detect new file
    if (line.startsWith("new file mode")) {
      currentAction = "created";
    }

    // Detect deleted file
    if (line.startsWith("deleted file mode")) {
      currentAction = "deleted";
    }

    // Count additions/deletions (but skip diff headers)
    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions++;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      deletions++;
    }
  }

  // Don't forget the last file
  if (currentFile) {
    summaries.push({
      path: currentFile,
      action: currentAction,
      linesChanged: additions + deletions,
      summary: summarizeFileChange(currentFile, currentAction, additions, deletions),
    });
  }

  return summaries;
}

/**
 * Generate a brief summary for a file change
 */
function summarizeFileChange(
  path: string,
  action: FileSummary["action"],
  additions: number,
  deletions: number
): string {
  const fileName = path.split("/").pop() || path;

  switch (action) {
    case "created":
      return `Created ${fileName} (${additions} lines)`;
    case "deleted":
      return `Deleted ${fileName} (${deletions} lines removed)`;
    case "modified":
      if (additions > 0 && deletions > 0) {
        return `Modified ${fileName} (+${additions}/-${deletions} lines)`;
      }
      if (additions > 0) {
        return `Added ${additions} lines to ${fileName}`;
      }
      if (deletions > 0) {
        return `Removed ${deletions} lines from ${fileName}`;
      }
      return `Modified ${fileName}`;
  }
}

/**
 * Extract reasoning from Claude's output
 */
export function extractReasoning(output: string): string {
  const reasons: string[] = [];

  for (const pattern of REASONING_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(output);

    while (match !== null) {
      const reason = match[1]?.trim();
      if (reason && reason.length > 10 && reason.length < 200) {
        reasons.push(reason);
      }
      if (reasons.length >= 3) break;
      match = pattern.exec(output);
    }

    if (reasons.length >= 3) break;
  }

  if (reasons.length === 0) {
    return "Continuing task implementation based on requirements.";
  }

  return reasons[0] ?? "Continuing task implementation based on requirements.";
}

/**
 * Extract learnings/patterns from Claude's output
 */
export function extractLearnings(output: string, result: string): string[] {
  const learnings: string[] = [];
  const seen = new Set<string>();

  for (const pattern of LEARNING_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(output);

    while (match !== null) {
      let learning = match[1]?.trim() ?? "";
      if (match[2]) {
        learning = `${match[1]?.trim() ?? ""} to ${match[2].trim()}`;
      }

      if (learning && learning.length > 10 && learning.length < 150) {
        const key = learning.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          learnings.push(learning);
        }
      }
      if (learnings.length >= 5) break;
      match = pattern.exec(output);
    }

    if (learnings.length >= 5) break;
  }

  // Add result-based learning if failure
  if (result === "failure" && learnings.length < 5) {
    const failureMatch = output.match(/(?:error|failed|issue):\s*(.+?)(?:\.|$)/i);
    if (failureMatch?.[1]) {
      learnings.push(`Issue encountered: ${failureMatch[1].trim().slice(0, 100)}`);
    }
  }

  return learnings;
}

/**
 * Generate headline based on actions and result
 */
export function generateHeadline(actions: ClaudeAction[], result: string): string {
  const primaryAction = actions[0];

  if (!primaryAction) {
    switch (result) {
      case "success":
        return "Completed iteration successfully";
      case "failure":
        return "Iteration failed - feedback checks did not pass";
      case "timeout":
        return "Iteration timed out";
      case "cancelled":
        return "Iteration was cancelled";
      default:
        return `Iteration ${result}`;
    }
  }

  const action = capitalizeFirst(primaryAction.type);
  const target = primaryAction.description.slice(0, 50);

  if (result === "success") {
    return `${action}: ${target}`;
  }
  if (result === "failure") {
    return `Attempted: ${target} (feedback failed)`;
  }
  if (result === "timeout") {
    return `Timed out while: ${target}`;
  }
  if (result === "cancelled") {
    return `Cancelled: ${target}`;
  }

  return `${action}: ${target}`;
}

/**
 * Capitalize first letter of a string
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert feedback results to summary format
 */
export function summarizeFeedbackResults(feedbackResults?: FeedbackResults): FeedbackSummary[] {
  if (!feedbackResults) return [];

  return Object.entries(feedbackResults).map(([loop, result]) => {
    let summary: string;
    if (result.passed) {
      summary = result.output
        ? extractTestSummary(result.output)
        : "Passed";
    } else {
      summary = result.output
        ? extractErrorSummary(result.output)
        : "Failed";
    }

    return {
      loop,
      passed: result.passed,
      summary,
      durationMs: result.duration,
    };
  });
}

/**
 * Extract a brief test summary from output
 */
function extractTestSummary(output: string): string {
  // Look for common test result patterns
  const patterns = [
    /(\d+)\s+(?:tests?|specs?)\s+passed/i,
    /✓\s*(\d+)\s+passed/i,
    /(\d+)\s+passing/i,
    /All\s+(\d+)\s+tests?\s+passed/i,
    /(\d+)\s+pass(?:ed)?/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return `${match[1]} tests passed`;
    }
  }

  // Check for "no errors" patterns
  if (/no\s+(?:errors?|issues?|problems?)/i.test(output)) {
    return "No errors";
  }

  return "Passed";
}

/**
 * Extract a brief error summary from output
 */
function extractErrorSummary(output: string): string {
  // Look for error count patterns
  const countPatterns = [
    /(\d+)\s+(?:errors?|failures?|failed)/i,
    /found\s+(\d+)\s+(?:errors?|issues?)/i,
    /(\d+)\s+(?:tests?|specs?)\s+failed/i,
  ];

  for (const pattern of countPatterns) {
    const match = output.match(pattern);
    if (match) {
      return `${match[1]} errors`;
    }
  }

  // Try to extract first error message
  const errorMatch = output.match(/(?:error|Error|ERROR):\s*(.+?)(?:\n|$)/);
  if (errorMatch?.[1]) {
    return errorMatch[1].trim().slice(0, 50);
  }

  return "Failed";
}

/**
 * Build file summaries from iteration data (without diff)
 */
export function buildFileSummariesFromIteration(iteration: Iteration): FileSummary[] {
  return iteration.filesChanged.map((path) => {
    // Infer action from file extension and context
    const isTest = /\.test\.|\.spec\.|__tests__/.test(path);
    const isConfig = /\.config\.|\.json$|\.yaml$|\.yml$|\.toml$/.test(path);

    let summary: string;
    if (isTest) {
      summary = "Test file updated";
    } else if (isConfig) {
      summary = "Configuration updated";
    } else {
      summary = "File modified";
    }

    return {
      path,
      action: "modified" as const,
      summary,
    };
  });
}

/**
 * Generate a complete iteration summary
 *
 * Per spec 05-history.md lines 458-484
 */
export function generateIterationSummary(context: SummaryContext): IterationSummary {
  const { iteration, output, diff } = context;

  // 1. Parse output for key actions
  const actions = parseClaudeActions(output);

  // 2. Analyze diff for file changes (or use iteration.filesChanged)
  const fileChanges = diff
    ? parseDiffSummary(diff)
    : buildFileSummariesFromIteration(iteration);

  // 3. Extract reasoning from output
  const reasoning = extractReasoning(output);

  // 4. Identify learnings
  const learnings = extractLearnings(output, iteration.result);

  // 5. Summarize feedback results
  const feedbackSummaries = summarizeFeedbackResults(iteration.feedbackResults);

  // 6. Generate headline
  const headline = generateHeadline(actions, iteration.result);

  return {
    iterationNumber: iteration.number,
    headline,
    whatChanged: actions.map((a) => `${capitalizeFirst(a.type)}: ${a.description}`),
    whyItHappened: reasoning,
    filesAffected: fileChanges,
    feedbackResults: feedbackSummaries,
    learnings: learnings.length > 0 ? learnings : undefined,
  };
}

/**
 * Generate summaries for multiple iterations
 */
export function generateBattleSummaries(
  iterations: Iteration[],
  outputs: Map<number, string>,
  diffs?: Map<number, string>
): IterationSummary[] {
  return iterations.map((iteration) => {
    const output = outputs.get(iteration.number) || iteration.output || "";
    const diff = diffs?.get(iteration.number);

    return generateIterationSummary({
      iteration,
      output,
      diff,
    });
  });
}
