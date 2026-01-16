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
 * Makes a fetch request with standard headers
 */
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const method = options.method || "GET";
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  log(`${method} ${path}`, options.body ? JSON.parse(options.body as string) : undefined);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const result = await handleResponse<T>(response);
    log(`${method} ${path} response`, result);
    return result;
  } catch (error) {
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

// ==========================================================================
// Working Directory Endpoints
// ==========================================================================

/**
 * Working directory response type
 */
export interface WorkingDirResponse {
  workingDir: string;
  hasPokeralphFolder: boolean;
}

/**
 * Working directory change response type
 */
export interface WorkingDirChangeResponse {
  success: boolean;
  workingDir: string;
}

/**
 * Gets the current working directory
 */
export async function getWorkingDir(): Promise<WorkingDirResponse> {
  return request<WorkingDirResponse>("/api/config/working-dir");
}

/**
 * Changes the working directory to a new path
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
 */
export async function startPlanning(
  idea: string
): Promise<PlanningStartResponse> {
  return request<PlanningStartResponse>("/api/planning/start", {
    method: "POST",
    body: JSON.stringify({ idea }),
  });
}

/**
 * Sends an answer during planning
 */
export async function answerPlanningQuestion(
  answer: string
): Promise<PlanningAnswerResponse> {
  return request<PlanningAnswerResponse>("/api/planning/answer", {
    method: "POST",
    body: JSON.stringify({ answer }),
  });
}

/**
 * Finishes planning and extracts the PRD
 */
export async function finishPlanning(): Promise<PlanningFinishResponse> {
  return request<PlanningFinishResponse>("/api/planning/finish", {
    method: "POST",
  });
}

/**
 * Resets the planning session
 */
export async function resetPlanning(): Promise<PlanningResetResponse> {
  return request<PlanningResetResponse>("/api/planning/reset", {
    method: "POST",
  });
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
    }
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
