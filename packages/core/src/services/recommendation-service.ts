/**
 * Task Recommendation Service
 *
 * Computes task recommendations to help users decide which task to work on next.
 * Based on: SPECS/04-dashboard.md (Smart Task Management section, lines 521-623)
 */

import type { Task, PRD } from "../types/index.ts";
import { TaskStatus } from "../types/task.ts";
import { assessTaskRisk, type TaskRisk } from "./preflight-service.ts";

// =============================================================================
// Types
// =============================================================================

/**
 * Reason type for task recommendation
 * per spec (04-dashboard.md lines 537-539)
 */
export type RecommendationReasonType =
  | "priority"
  | "dependency"
  | "risk"
  | "momentum"
  | "blocking";

/**
 * Individual reason contributing to recommendation score
 * per spec (04-dashboard.md lines 537-540)
 */
export interface RecommendationReason {
  type: RecommendationReasonType;
  label: string;
  impact: number; // -100 to +100
}

/**
 * Task recommendation with score and reasoning
 * per spec (04-dashboard.md lines 529-535)
 */
export interface TaskRecommendation {
  task: Task;
  score: number;
  reasons: RecommendationReason[];
  suggestedMode: "hitl" | "yolo";
  risk: TaskRisk;
}

/**
 * Context for computing recommendations
 * per spec (04-dashboard.md line 542)
 */
export interface ProjectContext {
  /** All tasks from the PRD */
  allTasks: Task[];
  /** Tasks that have been completed */
  completedTasks: Task[];
  /** Tasks that are pending */
  pendingTasks: Task[];
  /** Recently worked on tasks (for momentum calculation) */
  recentTasks: Task[];
}

/**
 * Recommendations result containing sorted list
 */
export interface RecommendationsResult {
  /** Recommended tasks sorted by score (highest first) */
  recommendations: TaskRecommendation[];
  /** The top recommended task, if any */
  topRecommendation: TaskRecommendation | null;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Score weights for recommendation factors
 * Based on spec algorithm (04-dashboard.md lines 542-596)
 */
const SCORE_WEIGHTS = {
  /** Base score per priority level (10 - priority) * 10 */
  priorityMultiplier: 10,
  /** Bonus when all dependencies are met */
  dependenciesMet: 20,
  /** Penalty when blocked by dependencies */
  dependenciesBlocked: -50,
  /** Bonus for low risk tasks */
  lowRisk: 15,
  /** No change for medium risk */
  mediumRisk: 0,
  /** Penalty for high risk tasks */
  highRisk: -15,
  /** Multiplier for number of tasks unblocked */
  blockingMultiplier: 10,
  /** Maximum momentum bonus */
  maxMomentumBonus: 15,
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract task IDs from acceptance criteria that reference other tasks
 * Looks for patterns like "after 001-", "requires 002-", "depends on 003-"
 */
export function extractDependencies(task: Task): string[] {
  const dependencies: string[] = [];
  const patterns = [
    /after\s+(\d{3}-[\w-]+)/gi,
    /requires?\s+(\d{3}-[\w-]+)/gi,
    /depends?\s+on\s+(\d{3}-[\w-]+)/gi,
    /blocked\s+by\s+(\d{3}-[\w-]+)/gi,
    /following\s+(\d{3}-[\w-]+)/gi,
  ];

  const textToSearch = [
    task.description,
    ...task.acceptanceCriteria,
  ].join(" ");

  for (const pattern of patterns) {
    let match: RegExpExecArray | null = pattern.exec(textToSearch);
    while (match !== null) {
      const depId = match[1]?.toLowerCase();
      if (depId && depId !== task.id.toLowerCase() && !dependencies.includes(depId)) {
        dependencies.push(depId);
      }
      match = pattern.exec(textToSearch);
    }
  }

  return dependencies;
}

/**
 * Check if all task dependencies are completed
 * per spec (04-dashboard.md lines 555-563)
 */
export function checkDependencies(
  task: Task,
  completedTasks: Task[]
): boolean {
  const dependencies = extractDependencies(task);
  if (dependencies.length === 0) return true;

  const completedIds = new Set(completedTasks.map((t) => t.id.toLowerCase()));
  return dependencies.every((depId) => completedIds.has(depId));
}

/**
 * Count how many pending tasks would be unblocked by completing this task
 * per spec (04-dashboard.md lines 583-587)
 */
export function countBlockedTasks(
  task: Task,
  pendingTasks: Task[]
): number {
  let count = 0;
  const taskIdLower = task.id.toLowerCase();

  for (const pending of pendingTasks) {
    if (pending.id === task.id) continue;
    const deps = extractDependencies(pending);
    if (deps.includes(taskIdLower)) {
      count++;
    }
  }

  return count;
}

/**
 * Calculate momentum score based on similarity to recently completed tasks
 * per spec (04-dashboard.md lines 575-580)
 *
 * Similarity is based on:
 * - Similar keywords in title/description
 * - Same priority range
 */
export function calculateMomentum(
  task: Task,
  recentTasks: Task[]
): number {
  if (recentTasks.length === 0) return 0;

  // Extract keywords from task (words > 4 chars, excluding common words)
  const commonWords = new Set([
    "this", "that", "with", "from", "have", "will", "should", "would",
    "could", "into", "when", "where", "what", "which", "their", "there",
    "about", "after", "before", "through", "during", "between", "under",
  ]);

  const getKeywords = (t: Task): Set<string> => {
    const text = `${t.title} ${t.description}`.toLowerCase();
    const words = text.match(/\b\w{5,}\b/g) || [];
    return new Set(words.filter((w) => !commonWords.has(w)));
  };

  const taskKeywords = getKeywords(task);
  if (taskKeywords.size === 0) return 0;

  let maxSimilarity = 0;

  for (const recent of recentTasks.slice(0, 5)) { // Only consider last 5 recent tasks
    const recentKeywords = getKeywords(recent);
    if (recentKeywords.size === 0) continue;

    // Calculate Jaccard similarity
    let intersection = 0;
    for (const word of taskKeywords) {
      if (recentKeywords.has(word)) intersection++;
    }

    const union = taskKeywords.size + recentKeywords.size - intersection;
    const similarity = union > 0 ? intersection / union : 0;

    // Also boost if similar priority
    const priorityBoost = Math.abs(task.priority - recent.priority) <= 1 ? 0.2 : 0;

    maxSimilarity = Math.max(maxSimilarity, similarity + priorityBoost);
  }

  // Scale to max momentum bonus
  return Math.round(maxSimilarity * SCORE_WEIGHTS.maxMomentumBonus);
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Compute recommendation for a single task
 * per spec (04-dashboard.md lines 542-596)
 */
export function computeTaskRecommendation(
  task: Task,
  context: ProjectContext
): TaskRecommendation {
  const reasons: RecommendationReason[] = [];
  let score = 0;

  // 1. Priority factor (highest priority = highest score)
  // per spec (04-dashboard.md lines 547-552)
  const priorityScore = (10 - task.priority) * SCORE_WEIGHTS.priorityMultiplier;
  reasons.push({
    type: "priority",
    label: `Priority ${task.priority}`,
    impact: priorityScore,
  });
  score += priorityScore;

  // 2. Dependency factor (tasks with completed dependencies score higher)
  // per spec (04-dashboard.md lines 554-563)
  const dependenciesMet = checkDependencies(task, context.completedTasks);
  if (dependenciesMet) {
    reasons.push({
      type: "dependency",
      label: "Dependencies met",
      impact: SCORE_WEIGHTS.dependenciesMet,
    });
    score += SCORE_WEIGHTS.dependenciesMet;
  } else {
    reasons.push({
      type: "dependency",
      label: "Blocked by dependencies",
      impact: SCORE_WEIGHTS.dependenciesBlocked,
    });
    score += SCORE_WEIGHTS.dependenciesBlocked;
  }

  // 3. Risk assessment (lower risk = higher YOLO suitability)
  // per spec (04-dashboard.md lines 565-572)
  const risk = assessTaskRisk(task);
  const riskImpact =
    risk.level === "low"
      ? SCORE_WEIGHTS.lowRisk
      : risk.level === "medium"
        ? SCORE_WEIGHTS.mediumRisk
        : SCORE_WEIGHTS.highRisk;
  reasons.push({
    type: "risk",
    label: `${risk.level} risk`,
    impact: riskImpact,
  });
  score += riskImpact;

  // 4. Momentum factor (similar tasks to recently completed)
  // per spec (04-dashboard.md lines 574-580)
  const momentumScore = calculateMomentum(task, context.recentTasks);
  if (momentumScore > 0) {
    reasons.push({
      type: "momentum",
      label: "Similar to recent work",
      impact: momentumScore,
    });
    score += momentumScore;
  }

  // 5. Blocking factor (tasks that unblock others)
  // per spec (04-dashboard.md lines 582-587)
  const blockedCount = countBlockedTasks(task, context.pendingTasks);
  if (blockedCount > 0) {
    const blockingScore = blockedCount * SCORE_WEIGHTS.blockingMultiplier;
    reasons.push({
      type: "blocking",
      label: `Unblocks ${blockedCount} task${blockedCount > 1 ? "s" : ""}`,
      impact: blockingScore,
    });
    score += blockingScore;
  }

  // Determine suggested mode based on risk
  // per spec (04-dashboard.md line 594)
  const suggestedMode = risk.level === "low" ? "yolo" : "hitl";

  return {
    task,
    score,
    reasons,
    suggestedMode,
    risk,
  };
}

/**
 * Build project context from PRD
 */
export function buildProjectContext(prd: PRD): ProjectContext {
  const allTasks = prd.tasks;

  const completedTasks = allTasks.filter(
    (t) => t.status === TaskStatus.Completed
  );

  const pendingTasks = allTasks.filter(
    (t) => t.status === TaskStatus.Pending || t.status === TaskStatus.Failed
  );

  // Recent tasks: completed tasks sorted by updatedAt descending
  const recentTasks = [...completedTasks].sort((a, b) =>
    (b.updatedAt || "").localeCompare(a.updatedAt || "")
  );

  return {
    allTasks,
    completedTasks,
    pendingTasks,
    recentTasks,
  };
}

/**
 * Get task recommendations for all pending tasks
 * Returns sorted list with highest scored task first
 */
export function getTaskRecommendations(
  prd: PRD
): RecommendationsResult {
  const context = buildProjectContext(prd);

  // Only compute recommendations for pending/failed tasks (actionable)
  const actionableTasks = prd.tasks.filter(
    (t) => t.status === TaskStatus.Pending || t.status === TaskStatus.Failed
  );

  if (actionableTasks.length === 0) {
    return {
      recommendations: [],
      topRecommendation: null,
    };
  }

  // Compute recommendations for each task
  const recommendations = actionableTasks
    .map((task) => computeTaskRecommendation(task, context))
    .sort((a, b) => b.score - a.score);

  return {
    recommendations,
    topRecommendation: recommendations[0] || null,
  };
}

/**
 * Get the top recommended task from a PRD
 * Convenience function for getting just the #1 recommendation
 */
export function getTopRecommendation(
  prd: PRD
): TaskRecommendation | null {
  return getTaskRecommendations(prd).topRecommendation;
}
