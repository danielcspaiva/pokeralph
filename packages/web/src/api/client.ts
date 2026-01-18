/**
 * REST API client for PokéRalph
 *
 * Provides typed functions for all server endpoints.
 * Uses the Vite proxy configuration to route /api requests to localhost:3456.
 */

// Strategic logging helper for browser console
const log = (action: string, data?: unknown) => {
  console.log(`%c[PokéRalph][API] ${action}`, "color: #3b82f6; font-weight: bold", data ?? "");
};

const logError = (action: string, error: unknown) => {
  console.error(`%c[PokéRalph][API] ${action}`, "color: #ef4444; font-weight: bold", error);
};

// Re-use types from core where possible
import type {
  Config,
  PRD,
  Task,
  TaskStatus,
  Progress,
  Battle,
  ExecutionMode,
} from "@pokeralph/core/types";

// ==========================================================================
// API Response Types
// ==========================================================================

/**
 * Standard error response from the API
 */
export interface ApiError {
  error: string;
  code: string;
  status: number;
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: "ok";
  version: string;
  timestamp: string;
  orchestratorInitialized: boolean;
}

/**
 * Planning status response
 */
export interface PlanningStatusResponse {
  state: "idle" | "planning" | "waiting_input" | "completed";
  pendingQuestion: string | null;
  isPlanning: boolean;
}

/**
 * Planning start response
 */
export interface PlanningStartResponse {
  message: string;
  idea: string;
  state: string;
}

/**
 * Planning answer response
 */
export interface PlanningAnswerResponse {
  message: string;
  state: string;
}

/**
 * Planning finish response
 */
export interface PlanningFinishResponse {
  message: string;
  prd: PRD;
}

/**
 * Planning reset response
 */
export interface PlanningResetResponse {
  message: string;
  state: string;
}

/**
 * Current battle state response
 */
export interface CurrentBattleResponse {
  battle: {
    taskId: string;
    iteration: number;
    status: string;
    mode: ExecutionMode;
  } | null;
  isRunning: boolean;
  isPaused: boolean;
  isAwaitingApproval: boolean;
}

/**
 * Battle start response
 */
export interface BattleStartResponse {
  message: string;
  taskId: string;
  mode: ExecutionMode;
}

/**
 * Battle control response (pause, resume, cancel, approve)
 */
export interface BattleControlResponse {
  message: string;
  taskId: string;
  reason?: string | null;
}

/**
 * Battle progress response
 */
export interface BattleProgressResponse {
  taskId: string;
  progress: Progress | null;
}

/**
 * Battle history response
 */
export interface BattleHistoryResponse {
  taskId: string;
  history: Battle | null;
}

/**
 * File summary in iteration (per spec 05-history.md)
 */
export interface FileSummary {
  path: string;
  action: "created" | "modified" | "deleted";
  linesChanged?: number;
  summary: string;
}

/**
 * Feedback summary in iteration (per spec 05-history.md)
 */
export interface FeedbackSummary {
  loop: string;
  passed: boolean;
  summary: string;
  durationMs?: number;
}

/**
 * Auto-generated iteration summary (per spec 05-history.md lines 434-444)
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
 * Response for iteration summaries endpoint
 */
export interface IterationSummariesResponse {
  taskId: string;
  summaries: IterationSummary[];
}

/**
 * Response for single iteration summary endpoint
 */
export interface SingleIterationSummaryResponse {
  taskId: string;
  iterationNumber: number;
  summary: IterationSummary;
}

// ==========================================================================
// API Client Configuration
// ==========================================================================

/**
 * Base URL for API requests (empty to use Vite proxy)
 */
const BASE_URL = "";

/**
 * Custom error class for API errors
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly response?: ApiError
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

/**
 * Handles fetch response and extracts JSON or throws error
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: ApiError | undefined;
    try {
      errorData = await response.json();
    } catch {
      // Response wasn't JSON
    }

    throw new ApiClientError(
      errorData?.error ?? `HTTP ${response.status}: ${response.statusText}`,
      response.status,
      errorData?.code ?? "HTTP_ERROR",
      errorData
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

/**
 * Default timeout for API requests in milliseconds (30 seconds)
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Longer timeout for Claude-powered operations (5 minutes)
 * Used for planning and battle operations that involve Claude processing
 */
const CLAUDE_TIMEOUT_MS = 300000;

/**
 * Custom error class for network timeout errors
 */
export class ApiTimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = "ApiTimeoutError";
  }
}

/**
 * Makes a fetch request with standard headers and timeout support
 */
async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const method = options.method || "GET";
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  log(`${method} ${path}`, options.body ? JSON.parse(options.body as string) : undefined);

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const result = await handleResponse<T>(response);
    log(`${method} ${path} response`, result);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    // Check if this was a timeout (abort)
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new ApiTimeoutError(
        `Request to ${path} timed out after ${timeoutMs}ms`,
        timeoutMs
      );
      logError(`${method} ${path} timed out`, timeoutError);
      throw timeoutError;
    }

    logError(`${method} ${path} failed`, error);
    throw error;
  }
}

// ==========================================================================
// Health Endpoint
// ==========================================================================

/**
 * Checks server health status
 */
export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

// ==========================================================================
// Config Endpoints
// ==========================================================================

/**
 * Gets the current configuration
 */
export async function getConfig(): Promise<Config> {
  return request<Config>("/api/config");
}

/**
 * Updates the configuration with partial values
 */
export async function updateConfig(config: Partial<Config>): Promise<Config> {
  return request<Config>("/api/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

/**
 * Resets the configuration to default values
 */
export async function resetConfig(): Promise<Config> {
  return request<Config>("/api/config/reset", {
    method: "POST",
  });
}

// ==========================================================================
// Repository Endpoints (per spec 08-repositories.md)
// ==========================================================================

/**
 * Recent repository entry
 */
export interface RecentRepo {
  path: string;
  name: string;
  lastUsed: string; // ISO timestamp
  taskCount: number;
}

/**
 * Repository validation result
 */
export interface ValidateRepoResponse {
  valid: boolean;
  exists: boolean;
  isDirectory: boolean;
  isGitRepo: boolean;
  hasPokeralph: boolean;
  errors: string[];
}

/**
 * Select repository response
 */
export interface SelectRepoResponse {
  success: boolean;
  workingDir: string;
  initialized: boolean;
  config: Config | null;
  prd: PRD | null;
  taskCount: number;
  hasActiveBattle: boolean;
}

/**
 * Current repository response
 */
export interface CurrentRepoResponse {
  workingDir: string | null;
  initialized: boolean;
  config: Config | null;
  prd: PRD | null;
  taskCount: number;
  hasActiveBattle: boolean;
}

/**
 * Recent repositories response
 */
export interface RecentReposResponse {
  repos: RecentRepo[];
}

/**
 * Init repository response
 */
export interface InitRepoResponse {
  success: boolean;
  message: string;
}

/**
 * Selects and initializes a repository
 *
 * @param path - Absolute path to the repository
 */
export async function selectRepo(path: string): Promise<SelectRepoResponse> {
  return request<SelectRepoResponse>("/api/repo/select", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

/**
 * Gets the current repository info
 */
export async function getCurrentRepo(): Promise<CurrentRepoResponse> {
  return request<CurrentRepoResponse>("/api/repo/current");
}

/**
 * Initializes .pokeralph/ in the current repository
 */
export async function initRepo(): Promise<InitRepoResponse> {
  return request<InitRepoResponse>("/api/repo/init", {
    method: "POST",
  });
}

/**
 * Validates a path as a potential repository
 *
 * @param path - Path to validate
 */
export async function validateRepo(path: string): Promise<ValidateRepoResponse> {
  return request<ValidateRepoResponse>(
    `/api/repo/validate?path=${encodeURIComponent(path)}`
  );
}

/**
 * Gets recently used repositories
 */
export async function getRecentRepos(): Promise<RecentReposResponse> {
  return request<RecentReposResponse>("/api/repo/recent");
}

/**
 * Removes a repository from the recent list
 *
 * @param path - Path of the repository to remove
 */
export async function removeRecentRepo(path: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    `/api/repo/recent/${encodeURIComponent(path)}`,
    { method: "DELETE" }
  );
}

// ==========================================================================
// Legacy Working Directory Endpoints (kept for backwards compatibility)
// ==========================================================================

/**
 * Working directory response type
 * @deprecated Use getCurrentRepo() instead
 */
export interface WorkingDirResponse {
  workingDir: string;
  hasPokeralphFolder: boolean;
}

/**
 * Working directory change response type
 * @deprecated Use selectRepo() instead
 */
export interface WorkingDirChangeResponse {
  success: boolean;
  workingDir: string;
}

/**
 * Gets the current working directory
 * @deprecated Use getCurrentRepo() instead
 */
export async function getWorkingDir(): Promise<WorkingDirResponse> {
  return request<WorkingDirResponse>("/api/config/working-dir");
}

/**
 * Changes the working directory to a new path
 * @deprecated Use selectRepo() instead
 *
 * @param path - The new working directory path (can be relative or absolute)
 */
export async function setWorkingDir(path: string): Promise<WorkingDirChangeResponse> {
  return request<WorkingDirChangeResponse>("/api/config/working-dir", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

// ==========================================================================
// PRD Endpoints
// ==========================================================================

/**
 * Gets the complete PRD
 */
export async function getPRD(): Promise<PRD> {
  return request<PRD>("/api/prd");
}

/**
 * Creates or updates the PRD
 */
export async function updatePRD(prd: Partial<PRD>): Promise<PRD> {
  return request<PRD>("/api/prd", {
    method: "PUT",
    body: JSON.stringify(prd),
  });
}

// ==========================================================================
// Tasks Endpoints
// ==========================================================================

/**
 * Gets all tasks from the PRD
 */
export async function getTasks(): Promise<Task[]> {
  return request<Task[]>("/api/prd/tasks");
}

/**
 * Gets a specific task by ID
 */
export async function getTask(taskId: string): Promise<Task> {
  return request<Task>(`/api/prd/tasks/${encodeURIComponent(taskId)}`);
}

/**
 * Input for creating a new task
 */
export interface CreateTaskInput {
  title: string;
  description: string;
  priority: number;
  acceptanceCriteria: string[];
}

/**
 * Creates a new task in the PRD
 */
export async function createTask(task: CreateTaskInput): Promise<Task> {
  return request<Task>("/api/prd/tasks", {
    method: "POST",
    body: JSON.stringify(task),
  });
}

/**
 * Input for updating an existing task
 */
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: number;
  acceptanceCriteria?: string[];
}

/**
 * Updates an existing task
 */
export async function updateTask(
  taskId: string,
  task: UpdateTaskInput
): Promise<Task> {
  return request<Task>(`/api/prd/tasks/${encodeURIComponent(taskId)}`, {
    method: "PUT",
    body: JSON.stringify(task),
  });
}

/**
 * Deletes a task from the PRD
 */
export async function deleteTask(taskId: string): Promise<void> {
  return request<void>(`/api/prd/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
}

// ==========================================================================
// Planning Endpoints
// ==========================================================================

/**
 * Gets the current planning status
 */
export async function getPlanningStatus(): Promise<PlanningStatusResponse> {
  return request<PlanningStatusResponse>("/api/planning/status");
}

/**
 * Starts a new planning session
 * Uses extended timeout since Claude processing can take time
 */
export async function startPlanning(
  idea: string
): Promise<PlanningStartResponse> {
  return request<PlanningStartResponse>(
    "/api/planning/start",
    {
      method: "POST",
      body: JSON.stringify({ idea }),
    },
    CLAUDE_TIMEOUT_MS
  );
}

/**
 * Sends an answer during planning
 * Uses extended timeout since Claude processing can take time
 */
export async function answerPlanningQuestion(
  answer: string
): Promise<PlanningAnswerResponse> {
  return request<PlanningAnswerResponse>(
    "/api/planning/answer",
    {
      method: "POST",
      body: JSON.stringify({ answer }),
    },
    CLAUDE_TIMEOUT_MS
  );
}

/**
 * Finishes planning and extracts the PRD
 * Uses extended timeout since Claude processes the full conversation to generate PRD
 */
export async function finishPlanning(): Promise<PlanningFinishResponse> {
  return request<PlanningFinishResponse>(
    "/api/planning/finish",
    {
      method: "POST",
    },
    CLAUDE_TIMEOUT_MS
  );
}

/**
 * Resets the planning session
 */
export async function resetPlanning(): Promise<PlanningResetResponse> {
  return request<PlanningResetResponse>("/api/planning/reset", {
    method: "POST",
  });
}

/**
 * Breakdown response containing refined tasks and updated PRD
 */
export interface BreakdownResponse {
  message: string;
  tasks: Task[];
  prd: PRD;
}

/**
 * Breaks down PRD into detailed tasks using Claude
 * Uses extended timeout since Claude processing can take time
 */
export async function breakdownTasks(): Promise<BreakdownResponse> {
  return request<BreakdownResponse>(
    "/api/planning/breakdown",
    { method: "POST" },
    CLAUDE_TIMEOUT_MS
  );
}

// ==========================================================================
// Battle Endpoints
// ==========================================================================

/**
 * Gets the current battle state
 */
export async function getCurrentBattle(): Promise<CurrentBattleResponse> {
  return request<CurrentBattleResponse>("/api/battle/current");
}

/**
 * Starts a battle for a task
 * Uses extended timeout since Claude processes tasks over multiple iterations
 */
export async function startBattle(
  taskId: string,
  mode?: ExecutionMode
): Promise<BattleStartResponse> {
  return request<BattleStartResponse>(
    `/api/battle/start/${encodeURIComponent(taskId)}`,
    {
      method: "POST",
      body: mode ? JSON.stringify({ mode }) : undefined,
    },
    CLAUDE_TIMEOUT_MS
  );
}

/**
 * Pauses the current battle
 */
export async function pauseBattle(): Promise<BattleControlResponse> {
  return request<BattleControlResponse>("/api/battle/pause", {
    method: "POST",
  });
}

/**
 * Resumes a paused battle
 */
export async function resumeBattle(): Promise<BattleControlResponse> {
  return request<BattleControlResponse>("/api/battle/resume", {
    method: "POST",
  });
}

/**
 * Cancels the current battle
 */
export async function cancelBattle(
  reason?: string
): Promise<BattleControlResponse> {
  return request<BattleControlResponse>("/api/battle/cancel", {
    method: "POST",
    body: reason ? JSON.stringify({ reason }) : undefined,
  });
}

/**
 * Approves the current iteration (HITL mode)
 */
export async function approveBattle(): Promise<BattleControlResponse> {
  return request<BattleControlResponse>("/api/battle/approve", {
    method: "POST",
  });
}

/**
 * Gets the progress for a task's battle
 */
export async function getBattleProgress(
  taskId: string
): Promise<BattleProgressResponse> {
  return request<BattleProgressResponse>(
    `/api/battle/${encodeURIComponent(taskId)}/progress`
  );
}

/**
 * Gets the battle history for a task
 */
export async function getBattleHistory(
  taskId: string
): Promise<BattleHistoryResponse> {
  return request<BattleHistoryResponse>(
    `/api/battle/${encodeURIComponent(taskId)}/history`
  );
}

/**
 * Gets auto-generated summaries for all iterations in a battle
 * Per spec 05-history.md lines 427-531 (Learning Tool Features)
 */
export async function getIterationSummaries(
  taskId: string
): Promise<IterationSummariesResponse> {
  return request<IterationSummariesResponse>(
    `/api/battle/${encodeURIComponent(taskId)}/summaries`
  );
}

/**
 * Gets auto-generated summary for a specific iteration
 * Per spec 05-history.md lines 427-531 (Learning Tool Features)
 */
export async function getIterationSummary(
  taskId: string,
  iterationNumber: number
): Promise<SingleIterationSummaryResponse> {
  return request<SingleIterationSummaryResponse>(
    `/api/battle/${encodeURIComponent(taskId)}/iteration/${iterationNumber}/summary`
  );
}

// ==========================================================================
// Onboarding Endpoints
// ==========================================================================

/**
 * Project detection result
 */
export interface ProjectDetection {
  type: "bun" | "node" | "python" | "go" | "rust" | "unknown";
  packageManager: "bun" | "npm" | "pnpm" | "yarn" | null;
  framework: string | null;
  testRunner: string | null;
  linter: string | null;
  typescript: boolean;
  existingPokeralph: boolean;
}

/**
 * Detection response with suggested configuration
 */
export interface DetectionResponse {
  detection: ProjectDetection;
  suggestedConfig: Config;
}

/**
 * Onboarding status response
 */
export interface OnboardingStatusResponse {
  completed: boolean;
  existingConfig: boolean;
  existingPRD: boolean;
}

/**
 * Complete onboarding request
 */
export interface CompleteOnboardingRequest {
  config: Config;
  skipFirstPRD: boolean;
}

/**
 * Complete onboarding response
 */
export interface CompleteOnboardingResponse {
  success: boolean;
  configPath: string;
}

/**
 * Detects project type and suggests configuration
 */
export async function detectProject(): Promise<DetectionResponse> {
  return request<DetectionResponse>("/api/onboarding/detect", {
    method: "POST",
  });
}

/**
 * Gets the onboarding status
 */
export async function getOnboardingStatus(): Promise<OnboardingStatusResponse> {
  return request<OnboardingStatusResponse>("/api/onboarding/status");
}

/**
 * Completes the onboarding process
 */
export async function completeOnboarding(
  data: CompleteOnboardingRequest
): Promise<CompleteOnboardingResponse> {
  return request<CompleteOnboardingResponse>("/api/onboarding/complete", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ==========================================================================
// Preflight Endpoints (per spec 10-preflight.md)
// ==========================================================================

/**
 * Preflight check category
 */
export type PreflightCheckCategory = "environment" | "git" | "config" | "task" | "system";

/**
 * Preflight check severity
 */
export type PreflightCheckSeverity = "error" | "warning" | "info";

/**
 * Result of a single preflight check
 */
export interface PreflightResult {
  passed: boolean;
  message: string;
  details?: string;
  canProceed: boolean;
  suggestion?: string;
}

/**
 * Preflight check result DTO (API response format)
 */
export interface PreflightCheckResultDTO {
  check: {
    id: string;
    name: string;
    description: string;
    category: PreflightCheckCategory;
    severity: PreflightCheckSeverity;
    hasAutoFix: boolean;
  };
  result: PreflightResult;
  duration: number;
}

/**
 * Preflight summary
 */
export interface PreflightSummary {
  total: number;
  passed: number;
  warnings: number;
  errors: number;
  infos: number;
}

/**
 * Preflight report DTO (API response format)
 */
export interface PreflightReportDTO {
  taskId: string;
  timestamp: string;
  duration: number;
  results: PreflightCheckResultDTO[];
  summary: PreflightSummary;
  canStart: boolean;
  stashRef?: string;
  preflightToken?: string;
}

/**
 * Response from running preflight checks
 */
export interface PreflightRunResponse {
  report: PreflightReportDTO;
}

/**
 * Fix result
 */
export interface FixResult {
  success: boolean;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Response from applying a fix
 */
export interface PreflightFixResponse {
  result: FixResult;
  updatedCheck: PreflightCheckResultDTO;
}

/**
 * Response from restoring stash
 */
export interface RestoreStashResponse {
  result: FixResult;
}

/**
 * Dry run result
 */
export interface DryRunResult {
  taskId: string;
  timestamp: string;
  prompt: {
    full: string;
    redacted: string;
    redactedFields: string[];
  };
  promptTokens: number;
  filesLikelyAffected: {
    files: string[];
    confidence: "high" | "medium" | "low";
    reason: string;
  };
  estimatedIterations: {
    min: number;
    max: number;
    confidence: "high" | "medium" | "low";
    reason: string;
  };
  estimatedDuration: {
    min: number;
    max: number;
    confidence: "high" | "medium" | "low";
    reason: string;
  };
  existingFiles: string[];
  contextSize: number;
  config?: {
    mode: ExecutionMode;
    maxIterationsPerTask: number;
    feedbackLoops: string[];
    autoCommit: boolean;
  };
}

/**
 * Response from dry run
 */
export interface DryRunResponse {
  result: DryRunResult;
}

/**
 * Response from validating preflight token
 */
export interface ValidateTokenResponse {
  valid: boolean;
  taskId?: string;
  timestamp?: string;
  expired?: boolean;
}

/**
 * Available preflight check info
 */
export interface PreflightCheckInfo {
  id: string;
  name: string;
  description: string;
  category: PreflightCheckCategory;
  severity: PreflightCheckSeverity;
  hasAutoFix: boolean;
}

/**
 * Response from listing available checks
 */
export interface PreflightChecksResponse {
  checks: PreflightCheckInfo[];
}

/**
 * Runs preflight checks for a task
 *
 * @param taskId - The task to run preflight for
 */
export async function runPreflight(taskId: string): Promise<PreflightRunResponse> {
  return request<PreflightRunResponse>("/api/preflight/run", {
    method: "POST",
    body: JSON.stringify({ taskId }),
  });
}

/**
 * Applies a fix for a preflight check
 *
 * @param taskId - The task ID
 * @param checkId - The check to fix
 */
export async function applyPreflightFix(
  taskId: string,
  checkId: string
): Promise<PreflightFixResponse> {
  return request<PreflightFixResponse>("/api/preflight/fix", {
    method: "POST",
    body: JSON.stringify({ taskId, checkId }),
  });
}

/**
 * Restores stashed changes after battle
 *
 * @param stashRef - The stash reference to restore
 */
export async function restoreStash(stashRef: string): Promise<RestoreStashResponse> {
  return request<RestoreStashResponse>("/api/preflight/restore-stash", {
    method: "POST",
    body: JSON.stringify({ stashRef }),
  });
}

/**
 * Runs a dry run analysis for a task
 *
 * @param taskId - The task to analyze
 */
export async function runDryRun(taskId: string): Promise<DryRunResponse> {
  return request<DryRunResponse>("/api/preflight/dry-run", {
    method: "POST",
    body: JSON.stringify({ taskId }),
  });
}

/**
 * Validates a preflight token
 *
 * @param token - The token to validate
 */
export async function validatePreflightToken(
  token: string
): Promise<ValidateTokenResponse> {
  return request<ValidateTokenResponse>("/api/preflight/validate-token", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

/**
 * Gets all available preflight checks
 */
export async function getPreflightChecks(): Promise<PreflightChecksResponse> {
  return request<PreflightChecksResponse>("/api/preflight/checks");
}

// ==========================================================================
// Recommendation Endpoints (Task 030)
// Based on SPECS/04-dashboard.md (Smart Task Management section, lines 521-623)
// ==========================================================================

/**
 * Recommendation reason type
 */
export type RecommendationReasonType =
  | "priority"
  | "dependency"
  | "risk"
  | "momentum"
  | "blocking";

/**
 * Individual reason contributing to recommendation score
 */
export interface RecommendationReason {
  type: RecommendationReasonType;
  label: string;
  impact: number; // -100 to +100
}

/**
 * Task risk assessment
 */
export interface TaskRisk {
  level: "low" | "medium" | "high";
  recommendation: string;
  factors: Array<{
    name: string;
    impact: "low" | "medium" | "high";
    description: string;
  }>;
}

/**
 * Task recommendation with score and reasoning
 */
export interface TaskRecommendation {
  task: Task;
  score: number;
  reasons: RecommendationReason[];
  suggestedMode: "hitl" | "yolo";
  risk: TaskRisk;
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

/**
 * Response from top recommendation endpoint
 */
export interface TopRecommendationResponse {
  recommendation: TaskRecommendation | null;
}

/**
 * Gets task recommendations for all pending tasks
 * Sorted by score with highest scored task first
 */
export async function getTaskRecommendations(): Promise<RecommendationsResult> {
  return request<RecommendationsResult>("/api/prd/recommendations");
}

/**
 * Gets only the top recommended task
 * Convenience function for quick task selection
 */
export async function getTopRecommendation(): Promise<TopRecommendationResponse> {
  return request<TopRecommendationResponse>("/api/prd/recommendations/top");
}
