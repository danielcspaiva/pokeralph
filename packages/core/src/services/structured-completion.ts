/**
 * Structured Completion Protocol for PokéRalph
 *
 * Per spec 03-battles.md (lines 1232-1342), this replaces the fragile sigil-based
 * completion detection with a structured JSON block that provides:
 * - Validated task completion
 * - Structured metadata
 * - Acceptance criteria tracking
 * - Confidence levels
 *
 * @remarks
 * The structured completion block is wrapped in `<completion>...</completion>` tags
 * and contains a JSON object matching the CompletionSignal interface.
 *
 * Backward compatibility is maintained with the simple `<promise>COMPLETE</promise>` sigil.
 */

import type { Task } from "../types/index.ts";
import type { FeedbackResults } from "../types/progress.ts";

// =============================================================================
// Types
// =============================================================================

/**
 * Confidence level for the completion signal
 */
export type CompletionConfidence = "high" | "medium" | "low";

/**
 * Status of an individual acceptance criterion
 */
export interface AcceptanceCriterionStatus {
  /** The criterion text */
  criterion: string;
  /** Whether the criterion was met */
  met: boolean;
  /** Optional evidence of completion (e.g., file path, test name) */
  evidence?: string;
}

/**
 * Structured completion signal from Claude per spec lines 1246-1261
 */
export interface CompletionSignal {
  /** Type discriminator - must be "BATTLE_COMPLETE" */
  type: "BATTLE_COMPLETE";
  /** Version of the completion protocol */
  version: number;
  /** ID of the completed task */
  taskId: string;
  /** Human-readable summary of what was done */
  summary: string;
  /** Status of each acceptance criterion */
  acceptanceCriteriaMet: AcceptanceCriterionStatus[];
  /** List of files that were changed */
  filesChanged: string[];
  /** Number of tests added (if any) */
  testsAdded: number;
  /** Claude's confidence in the completion */
  confidence: CompletionConfidence;
  /** Optional notes about the implementation */
  notes?: string;
}

/**
 * Result of validating a completion signal per spec lines 1297-1302
 */
export interface CompletionValidation {
  /** Whether the signal structure is valid */
  signalValid: boolean;
  /** Whether all acceptance criteria are marked as met */
  criteriaFullyMet: boolean;
  /** Whether all feedback loops are passing */
  feedbackPassing: boolean;
  /** List of validation errors */
  errors: string[];
}

/**
 * Result of detecting completion in output
 */
export interface CompletionDetectionResult {
  /** Whether completion was detected (structured or sigil) */
  detected: boolean;
  /** The type of completion detected */
  type: "structured" | "sigil" | "none";
  /** The parsed completion signal (if structured) */
  signal?: CompletionSignal;
  /** Validation result (if structured) */
  validation?: CompletionValidation;
  /** Raw completion block content (if structured) */
  rawBlock?: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Opening tag for structured completion block */
export const COMPLETION_BLOCK_START = "<completion>";

/** Closing tag for structured completion block */
export const COMPLETION_BLOCK_END = "</completion>";

/** Simple completion sigil (for backward compatibility) */
export const SIMPLE_COMPLETION_SIGIL = "<promise>COMPLETE</promise>";

/** Current protocol version */
export const COMPLETION_PROTOCOL_VERSION = 1;

// =============================================================================
// Parsing Functions
// =============================================================================

/**
 * Extracts the structured completion block from Claude's output
 *
 * @param output - The full output from Claude
 * @returns The raw JSON content from within completion tags, or null if not found
 */
export function extractCompletionBlock(output: string): string | null {
  const startIndex = output.indexOf(COMPLETION_BLOCK_START);
  const endIndex = output.indexOf(COMPLETION_BLOCK_END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  const blockContent = output.slice(
    startIndex + COMPLETION_BLOCK_START.length,
    endIndex
  );

  return blockContent.trim();
}

/**
 * Parses the completion block JSON into a CompletionSignal
 *
 * @param blockContent - The raw JSON content from the completion block
 * @returns The parsed CompletionSignal or null if parsing fails
 */
export function parseCompletionSignal(blockContent: string): CompletionSignal | null {
  try {
    const parsed = JSON.parse(blockContent);

    // Type guard: validate it has required fields
    if (!isCompletionSignal(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Type guard to check if an object is a valid CompletionSignal
 *
 * @param obj - The object to check
 * @returns True if the object matches the CompletionSignal interface
 */
export function isCompletionSignal(obj: unknown): obj is CompletionSignal {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const signal = obj as Record<string, unknown>;

  // Check required fields and types
  if (signal.type !== "BATTLE_COMPLETE") {
    return false;
  }

  if (typeof signal.version !== "number") {
    return false;
  }

  if (typeof signal.taskId !== "string") {
    return false;
  }

  if (typeof signal.summary !== "string") {
    return false;
  }

  if (!Array.isArray(signal.acceptanceCriteriaMet)) {
    return false;
  }

  // Validate each criterion
  for (const criterion of signal.acceptanceCriteriaMet) {
    if (typeof criterion !== "object" || criterion === null) {
      return false;
    }
    if (typeof criterion.criterion !== "string") {
      return false;
    }
    if (typeof criterion.met !== "boolean") {
      return false;
    }
    // evidence is optional but must be string if present
    if (criterion.evidence !== undefined && typeof criterion.evidence !== "string") {
      return false;
    }
  }

  if (!Array.isArray(signal.filesChanged)) {
    return false;
  }

  for (const file of signal.filesChanged) {
    if (typeof file !== "string") {
      return false;
    }
  }

  if (typeof signal.testsAdded !== "number") {
    return false;
  }

  if (!["high", "medium", "low"].includes(signal.confidence as string)) {
    return false;
  }

  // notes is optional but must be string if present
  if (signal.notes !== undefined && typeof signal.notes !== "string") {
    return false;
  }

  return true;
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validates a completion signal against the task and feedback results
 * per spec lines 1304-1341
 *
 * @param signal - The completion signal to validate
 * @param task - The task being completed
 * @param feedbackResults - Results from feedback loops
 * @returns Validation result with errors
 */
export function validateCompletion(
  signal: CompletionSignal,
  task: Task,
  feedbackResults: FeedbackResults
): CompletionValidation {
  const errors: string[] = [];

  // 1. Validate signal structure
  const signalValid = isCompletionSignal(signal);
  if (!signalValid) {
    errors.push("Invalid completion signal format");
  }

  // 2. Check task ID matches
  if (signal.taskId !== task.id) {
    errors.push(`Task ID mismatch: expected ${task.id}, got ${signal.taskId}`);
  }

  // 3. Verify all acceptance criteria claimed as met
  const unmetCriteria = signal.acceptanceCriteriaMet.filter((c) => !c.met);
  const criteriaFullyMet = unmetCriteria.length === 0;
  if (!criteriaFullyMet) {
    errors.push(`${unmetCriteria.length} acceptance criteria not met`);
  }

  // 4. Check that all task criteria are accounted for
  const signalCriteria = new Set(signal.acceptanceCriteriaMet.map((c) => c.criterion));
  const missingCriteria = task.acceptanceCriteria.filter(
    (c) => !signalCriteria.has(c)
  );
  if (missingCriteria.length > 0) {
    errors.push(`${missingCriteria.length} criteria not addressed in completion signal`);
  }

  // 5. Check feedback loops
  const feedbackPassing = Object.values(feedbackResults).every((r) => r.passed);
  if (!feedbackPassing) {
    errors.push("Feedback loops not all passing");
  }

  return {
    signalValid,
    criteriaFullyMet,
    feedbackPassing,
    errors,
  };
}

/**
 * Checks if a completion is fully valid (no errors)
 *
 * @param validation - The validation result
 * @returns True if the completion is fully valid
 */
export function isCompletionValid(validation: CompletionValidation): boolean {
  return (
    validation.signalValid &&
    validation.criteriaFullyMet &&
    validation.feedbackPassing &&
    validation.errors.length === 0
  );
}

// =============================================================================
// Detection Functions
// =============================================================================

/**
 * Detects completion in Claude's output, supporting both structured and sigil-based
 * completion for backward compatibility
 *
 * @param output - The full output from Claude
 * @param task - The task being executed (for validation)
 * @param feedbackResults - Results from feedback loops (for validation)
 * @returns Detection result with type and optional parsed signal
 */
export function detectCompletion(
  output: string,
  task?: Task,
  feedbackResults?: FeedbackResults
): CompletionDetectionResult {
  // First, try to detect structured completion
  const blockContent = extractCompletionBlock(output);

  if (blockContent) {
    const signal = parseCompletionSignal(blockContent);

    if (signal) {
      // Validate if we have task and feedback context
      let validation: CompletionValidation | undefined;
      if (task && feedbackResults) {
        validation = validateCompletion(signal, task, feedbackResults);
      }

      return {
        detected: true,
        type: "structured",
        signal,
        validation,
        rawBlock: blockContent,
      };
    }

    // Block found but couldn't parse - treat as incomplete
    return {
      detected: false,
      type: "none",
      rawBlock: blockContent,
    };
  }

  // Fall back to simple sigil detection for backward compatibility
  if (output.includes(SIMPLE_COMPLETION_SIGIL)) {
    return {
      detected: true,
      type: "sigil",
    };
  }

  return {
    detected: false,
    type: "none",
  };
}

/**
 * Checks if structured completion was detected
 *
 * @param result - The detection result
 * @returns True if structured completion was detected
 */
export function isStructuredCompletion(result: CompletionDetectionResult): boolean {
  return result.detected && result.type === "structured";
}

/**
 * Checks if sigil-based completion was detected
 *
 * @param result - The detection result
 * @returns True if sigil completion was detected
 */
export function isSigilCompletion(result: CompletionDetectionResult): boolean {
  return result.detected && result.type === "sigil";
}

// =============================================================================
// Prompt Helper Functions
// =============================================================================

/**
 * Generates the structured completion block instructions for the prompt
 *
 * @param task - The task being executed
 * @returns Instructions for Claude on how to signal completion
 */
export function getStructuredCompletionInstructions(task: Task): string {
  const criteriaList = task.acceptanceCriteria
    .map((c) => `    { "criterion": "${c}", "met": true, "evidence": "..." }`)
    .join(",\n");

  return `When you have successfully completed ALL acceptance criteria and all feedback loops pass, output a structured completion block:

${COMPLETION_BLOCK_START}
{
  "type": "BATTLE_COMPLETE",
  "version": ${COMPLETION_PROTOCOL_VERSION},
  "taskId": "${task.id}",
  "summary": "Brief description of what was implemented",
  "acceptanceCriteriaMet": [
${criteriaList}
  ],
  "filesChanged": ["list", "of", "changed", "files"],
  "testsAdded": 0,
  "confidence": "high",
  "notes": "Optional notes about the implementation"
}
${COMPLETION_BLOCK_END}

Confidence levels:
- "high": All criteria clearly met with tests
- "medium": Criteria met but edge cases may exist
- "low": Unsure about some criteria

For backward compatibility, you may also use the simple sigil: ${SIMPLE_COMPLETION_SIGIL}
However, the structured format is preferred as it provides better validation.

DO NOT output the completion block until ALL criteria are met and ALL feedback loops pass.`;
}

/**
 * Creates a sample CompletionSignal (useful for testing)
 *
 * @param taskId - The task ID
 * @param overrides - Optional property overrides
 * @returns A sample CompletionSignal
 */
export function createSampleCompletionSignal(
  taskId: string,
  overrides: Partial<CompletionSignal> = {}
): CompletionSignal {
  return {
    type: "BATTLE_COMPLETE",
    version: COMPLETION_PROTOCOL_VERSION,
    taskId,
    summary: "Task completed successfully",
    acceptanceCriteriaMet: [],
    filesChanged: [],
    testsAdded: 0,
    confidence: "high",
    ...overrides,
  };
}
