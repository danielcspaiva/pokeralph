/**
 * DryRunService for PokéRalph
 *
 * Provides dry run analysis before starting a battle.
 * Shows prompt preview, estimated outcomes, and affected files.
 *
 * Based on: SPECS/10-preflight.md (Dry Run Feature section, lines 755-927)
 */

import type { Config, Task, PRD } from "../types/index.ts";
import { PromptBuilder, type TaskContext } from "./prompt-builder.ts";
import { assessTaskRisk, type TaskRisk } from "./preflight-service.ts";

// =============================================================================
// Types
// =============================================================================

/**
 * Confidence level for predictions
 */
export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * Result of a dry run analysis
 */
export interface DryRunResult {
  taskId: string;
  timestamp: string;

  /** What would be sent to Claude */
  prompt: {
    /** Complete prompt (only shown if user clicks "Show full prompt") */
    full: string;
    /** Prompt with sensitive data redacted (default view) */
    redacted: string;
    /** List of what was redacted */
    redactedFields: string[];
  };
  promptTokens: number;

  /** Predictions with confidence levels */
  filesLikelyAffected: {
    files: string[];
    confidence: ConfidenceLevel;
    reason: string;
  };
  estimatedIterations: {
    min: number;
    max: number;
    confidence: ConfidenceLevel;
    reason: string;
  };
  estimatedDuration: {
    min: number;
    max: number;
    confidence: ConfidenceLevel;
    reason: string;
  };

  /** Context used */
  existingFiles: string[];
  contextSize: number;

  /** Risk assessment */
  risk: TaskRisk;

  /** Config used */
  config: {
    mode: string;
    maxIterationsPerTask: number;
    feedbackLoops: string[];
    autoCommit: boolean;
  };
}

/**
 * Context for dry run
 */
export interface DryRunContext {
  taskId: string;
  task: Task;
  config: Config;
  prd: PRD;
  workingDir: string;
  progressFilePath: string;
}

// =============================================================================
// Sensitive Data Redaction
// =============================================================================

/**
 * Patterns for sensitive data that should be redacted in dry run prompt preview
 * Based on: SPECS/10-preflight.md lines 800-809
 */
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[\w-]+["']?/gi, label: "API keys" },
  { pattern: /(?:password|passwd|pwd)\s*[:=]\s*["']?[^\s"']+["']?/gi, label: "Passwords" },
  { pattern: /(?:secret|token)\s*[:=]\s*["']?[\w-]+["']?/gi, label: "Secrets/Tokens" },
  { pattern: /(?:aws_)?(?:access_key|secret_key)\s*[:=]\s*["']?[\w/+=]+["']?/gi, label: "AWS credentials" },
  { pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END/gi, label: "Private keys" },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, label: "GitHub tokens" },
  { pattern: /sk-[a-zA-Z0-9]{32,}/g, label: "OpenAI API keys" },
  { pattern: /sk-ant-[a-zA-Z0-9-]+/g, label: "Anthropic API keys" },
  { pattern: /xox[baprs]-[a-zA-Z0-9-]+/g, label: "Slack tokens" },
  { pattern: /AKIA[0-9A-Z]{16}/g, label: "AWS Access Key IDs" },
];

/**
 * Redact sensitive data from a prompt
 * Based on: SPECS/10-preflight.md lines 811-827
 */
export function redactSensitiveData(prompt: string): { redacted: string; redactedFields: string[] } {
  let redacted = prompt;
  const redactedFields: string[] = [];

  for (const { pattern, label } of SENSITIVE_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;

    if (pattern.test(redacted)) {
      // Reset again after test
      pattern.lastIndex = 0;
      redacted = redacted.replace(pattern, `[REDACTED: ${label}]`);
      if (!redactedFields.includes(label)) {
        redactedFields.push(label);
      }
    }
  }

  return { redacted, redactedFields };
}

// =============================================================================
// File Prediction
// =============================================================================

/**
 * Predict affected files from task description
 * Based on: SPECS/10-preflight.md lines 907-927
 */
export function predictAffectedFiles(task: Task): string[] {
  const files: string[] = [];
  const description = `${task.description} ${task.acceptanceCriteria.join(" ")}`;

  const patterns = [
    // "create/add/modify/update/edit the filename.ext"
    /(?:create|add|modify|update|edit)\s+(?:the\s+)?(?:file\s+)?(\S+\.\w+)/gi,
    // "in/at filename.ext"
    /(?:in|at)\s+(\S+\.\w+)/gi,
    // Direct file paths with extensions
    /(\S+\.(ts|tsx|js|jsx|py|go|rs|json|yaml|yml|md|css|scss|html))/gi,
    // Paths with directories
    /((?:src|lib|app|components|pages|api|routes|services|utils|hooks|types|tests?)\/[\w/-]+\.\w+)/gi,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null = pattern.exec(description);
    while (match !== null) {
      const file = match[1];
      if (file && !files.includes(file) && !file.startsWith(".")) {
        files.push(file);
      }
      match = pattern.exec(description);
    }
  }

  return files;
}

/**
 * Assess confidence for file predictions
 * Based on: SPECS/10-preflight.md lines 873-884
 */
export function assessFileConfidence(task: Task, files: string[]): { confidence: ConfidenceLevel; reason: string } {
  // High confidence: explicit file mentions in task
  if (files.length > 0 && files.some(file => task.description.includes(file))) {
    return { confidence: "high", reason: "Files explicitly mentioned in task description" };
  }
  // Medium confidence: reasonable inference from task
  if (files.length > 0) {
    return { confidence: "medium", reason: "Files inferred from task keywords" };
  }
  // Low confidence: no specific files identified
  return { confidence: "low", reason: "No specific files identified, will depend on Claude's analysis" };
}

// =============================================================================
// Iteration Estimation
// =============================================================================

/**
 * Estimate iterations based on task complexity
 * Based on: SPECS/10-preflight.md lines 886-905
 */
export function estimateIterations(risk: TaskRisk, task: Task): { min: number; max: number } {
  const criteriaCount = task.acceptanceCriteria.length;

  if (risk.level === "low") {
    return { min: 1, max: Math.min(3, Math.max(1, criteriaCount)) };
  }

  if (risk.level === "medium") {
    return { min: 2, max: Math.min(5, Math.max(2, criteriaCount + 1)) };
  }

  // high risk
  return { min: 3, max: Math.min(8, Math.max(3, criteriaCount + 2)) };
}

/**
 * Assess confidence for iteration estimate
 * Based on: SPECS/10-preflight.md lines 886-894
 */
export function assessIterationConfidence(task: Task, risk: TaskRisk): { confidence: ConfidenceLevel; reason: string } {
  if (risk.level === "low" && task.acceptanceCriteria.length <= 3) {
    return { confidence: "high", reason: "Well-scoped task with clear criteria" };
  }
  if (risk.level === "medium") {
    return { confidence: "medium", reason: "Moderately complex task" };
  }
  return { confidence: "low", reason: "Complex task with multiple unknowns" };
}

/**
 * Assess confidence for duration estimate
 * Based on: SPECS/10-preflight.md lines 896-905
 */
export function assessDurationConfidence(iterations: { min: number; max: number }): { confidence: ConfidenceLevel; reason: string } {
  const range = iterations.max - iterations.min;
  if (range <= 2) {
    return { confidence: "high", reason: "Narrow iteration range" };
  }
  if (range <= 5) {
    return { confidence: "medium", reason: "Moderate iteration range" };
  }
  return { confidence: "low", reason: "Wide iteration range indicates uncertainty" };
}

// =============================================================================
// Token Counting
// =============================================================================

/**
 * Estimate token count for a prompt
 * Simple approximation: ~4 characters per token for English text
 */
export function countTokens(text: string): number {
  // More accurate approximation accounting for whitespace and code
  const words = text.split(/\s+/).length;
  const chars = text.length;

  // Use a weighted average of word count and character-based estimate
  const wordBasedEstimate = words * 1.3; // Words tend to be ~1.3 tokens
  const charBasedEstimate = chars / 4; // ~4 chars per token

  return Math.round((wordBasedEstimate + charBasedEstimate) / 2);
}

// =============================================================================
// File Listing
// =============================================================================

/**
 * List relevant files in the working directory for a task
 */
async function listRelevantFiles(workingDir: string, task: Task): Promise<string[]> {
  const files: string[] = [];

  try {
    // Use git ls-files to get tracked files (respects .gitignore)
    const proc = Bun.spawn(["git", "ls-files"], {
      cwd: workingDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode === 0) {
      const allFiles = output.trim().split("\n").filter(Boolean);

      // Filter to likely relevant files based on task keywords
      const keywords = extractKeywords(task);
      for (const file of allFiles) {
        if (isLikelyRelevant(file, keywords)) {
          files.push(file);
          if (files.length >= 50) break; // Limit to 50 files
        }
      }
    }
  } catch {
    // Ignore errors, return empty list
  }

  return files;
}

/**
 * Extract keywords from a task for file matching
 */
function extractKeywords(task: Task): string[] {
  const text = `${task.title} ${task.description} ${task.acceptanceCriteria.join(" ")}`.toLowerCase();

  // Extract meaningful words (3+ chars, not common words)
  const commonWords = new Set(["the", "and", "for", "this", "that", "with", "from", "have", "will", "should", "must", "can", "are", "was", "been", "being", "has", "had", "not", "but", "all", "any", "each"]);

  const words = text.match(/\b[a-z][a-z0-9-_]{2,}\b/g) ?? [];
  return [...new Set(words.filter(w => !commonWords.has(w)))];
}

/**
 * Check if a file is likely relevant to a task
 */
function isLikelyRelevant(file: string, keywords: string[]): boolean {
  const fileLower = file.toLowerCase();

  // Always include source files
  const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"];
  const isSource = sourceExtensions.some(ext => file.endsWith(ext));

  // Check if any keyword matches the file path
  const hasKeywordMatch = keywords.some(kw => fileLower.includes(kw));

  return isSource && hasKeywordMatch;
}

/**
 * Measure context size (total bytes of relevant files)
 */
async function measureContextSize(workingDir: string, files: string[]): Promise<number> {
  let totalSize = 0;

  for (const file of files.slice(0, 20)) { // Limit to first 20 files
    try {
      const bunFile = Bun.file(`${workingDir}/${file}`);
      totalSize += bunFile.size;
    } catch {
      // Ignore errors
    }
  }

  return totalSize;
}

// =============================================================================
// DryRunService Class
// =============================================================================

/**
 * Service for running dry run analysis before battles
 */
export class DryRunService {
  private readonly workingDir: string;
  private readonly promptBuilder: PromptBuilder;

  constructor(workingDir: string) {
    this.workingDir = workingDir;
    this.promptBuilder = new PromptBuilder();
  }

  /**
   * Run a dry run analysis for a task
   * Based on: SPECS/10-preflight.md lines 829-870
   */
  async runDryRun(context: DryRunContext): Promise<DryRunResult> {
    const timestamp = new Date().toISOString();

    // 1. Build the prompt that would be sent
    const prdSummary = this.promptBuilder.summarizePRD(context.prd);
    const taskContext: TaskContext = {
      prdSummary,
      feedbackLoops: context.config.feedbackLoops,
      autoCommit: context.config.autoCommit,
      maxIterations: context.config.maxIterationsPerTask,
      progressFilePath: context.progressFilePath,
    };

    const fullPrompt = this.promptBuilder.buildTaskPrompt(context.task, taskContext);
    const { redacted, redactedFields } = redactSensitiveData(fullPrompt);

    // 2. Analyze task to predict affected files
    const filesLikelyAffected = predictAffectedFiles(context.task);
    const fileConfidence = assessFileConfidence(context.task, filesLikelyAffected);

    // 3. Estimate iterations based on task complexity
    const risk = assessTaskRisk(context.task);
    const estimatedIterations = estimateIterations(risk, context.task);
    const iterationConfidence = assessIterationConfidence(context.task, risk);

    // 4. Estimate duration (in minutes)
    // Assume ~3-5 minutes per iteration on average
    const estimatedDuration = {
      min: estimatedIterations.min * 3,
      max: estimatedIterations.max * 5,
    };
    const durationConfidence = assessDurationConfidence(estimatedIterations);

    // 5. List existing relevant files
    const existingFiles = await listRelevantFiles(this.workingDir, context.task);

    // 6. Measure context size
    const contextSize = await measureContextSize(this.workingDir, existingFiles);

    // 7. Count tokens
    const promptTokens = countTokens(fullPrompt);

    return {
      taskId: context.taskId,
      timestamp,
      prompt: {
        full: fullPrompt,
        redacted,
        redactedFields,
      },
      promptTokens,
      filesLikelyAffected: {
        files: filesLikelyAffected,
        ...fileConfidence,
      },
      estimatedIterations: {
        ...estimatedIterations,
        ...iterationConfidence,
      },
      estimatedDuration: {
        ...estimatedDuration,
        ...durationConfidence,
      },
      existingFiles,
      contextSize,
      risk,
      config: {
        mode: context.config.mode,
        maxIterationsPerTask: context.config.maxIterationsPerTask,
        feedbackLoops: context.config.feedbackLoops,
        autoCommit: context.config.autoCommit,
      },
    };
  }
}
