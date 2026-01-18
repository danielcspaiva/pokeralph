/**
 * Global state management for PokéRalph web client
 *
 * Uses Zustand for state management with localStorage persistence for config.
 * Integrates with WebSocket for real-time updates from the server.
 *
 * @example
 * ```ts
 * import { useAppStore, useConfig, useTasks } from "@/stores/app-store";
 *
 * // Use individual selectors
 * const config = useConfig();
 * const tasks = useTasks();
 *
 * // Or access the full store
 * const { setConfig, startBattle } = useAppStore();
 * ```
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import {
  type Config,
  type PRD,
  type Task,
  type Progress,
  type Battle,
  type ExecutionMode,
  TaskStatus,
} from "@pokeralph/core/types";
import {
  getWebSocketClient,
  setResyncCallback,
  type WebSocketEventPayloads,
} from "../api/websocket.ts";
import {
  getConfig,
  getPRD,
  getCurrentBattle,
  getPlanningStatus,
  getWorkingDir,
} from "../api/client.ts";

// ==========================================================================
// State Types
// ==========================================================================

/**
 * Planning phase state
 */
export type PlanningState = "idle" | "planning" | "waiting_input" | "completed";

/**
 * Battle state for the current active battle
 */
export interface CurrentBattle {
  taskId: string;
  iteration: number;
  status: string;
  mode: ExecutionMode;
  isRunning: boolean;
  isPaused: boolean;
  isAwaitingApproval: boolean;
}

/**
 * Planning session state
 */
export interface PlanningSession {
  state: PlanningState;
  pendingQuestion: string | null;
  conversationOutput: string[];
}

/**
 * App store state interface
 */
export interface AppState {
  // Server connection
  isConnected: boolean;
  connectionId: string | null;

  // Working directory
  workingDir: string | null;
  hasPokeralphFolder: boolean;

  // Configuration
  config: Config | null;

  // PRD and tasks
  prd: PRD | null;
  tasks: Task[];

  // Current battle state
  currentBattle: CurrentBattle | null;
  battleProgress: Record<string, Progress>;
  battleHistory: Record<string, Battle>;

  // Planning state
  planningSession: PlanningSession;
}

/**
 * App store actions interface
 */
export interface AppActions {
  // Connection actions
  setConnected: (connected: boolean, connectionId?: string | null) => void;

  // Working directory actions
  setWorkingDir: (workingDir: string, hasPokeralphFolder?: boolean) => void;

  // Config actions
  setConfig: (config: Config) => void;
  updateConfig: (partial: Partial<Config>) => void;

  // PRD/Tasks actions
  setPRD: (prd: PRD | null) => void;
  setTasks: (tasks: Task[]) => void;
  updateTask: (taskId: string, partial: Partial<Task>) => void;
  addTask: (task: Task) => void;
  removeTask: (taskId: string) => void;

  // Battle actions
  setCurrentBattle: (battle: CurrentBattle | null) => void;
  setBattleProgress: (taskId: string, progress: Progress) => void;
  setBattleHistory: (taskId: string, history: Battle) => void;
  clearBattleProgress: (taskId: string) => void;

  // Planning actions
  setPlanningState: (state: PlanningState) => void;
  setPendingQuestion: (question: string | null) => void;
  addPlanningOutput: (output: string) => void;
  clearPlanningSession: () => void;

  // Hydration actions
  hydrate: (data: Partial<AppState>) => void;
  reset: () => void;
}

/**
 * Combined store type
 */
export type AppStore = AppState & AppActions;

// ==========================================================================
// Initial State
// ==========================================================================

const initialState: AppState = {
  // Connection
  isConnected: false,
  connectionId: null,

  // Working directory
  workingDir: null,
  hasPokeralphFolder: false,

  // Config
  config: null,

  // PRD/Tasks
  prd: null,
  tasks: [],

  // Battle
  currentBattle: null,
  battleProgress: {},
  battleHistory: {},

  // Planning
  planningSession: {
    state: "idle",
    pendingQuestion: null,
    conversationOutput: [],
  },
};

// ==========================================================================
// Store Creation
// ==========================================================================

/**
 * Main application store
 *
 * Uses persist middleware to save config to localStorage.
 * Other state is ephemeral and synced via WebSocket.
 */
export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      ...initialState,

      // ==================================================================
      // Connection Actions
      // ==================================================================

      setConnected: (connected, connectionId = null) =>
        set({ isConnected: connected, connectionId }),

      // ==================================================================
      // Working Directory Actions
      // ==================================================================

      setWorkingDir: (workingDir, hasPokeralphFolder = true) =>
        set({ workingDir, hasPokeralphFolder }),

      // ==================================================================
      // Config Actions
      // ==================================================================

      setConfig: (config) => set({ config }),

      updateConfig: (partial) =>
        set((state) => ({
          config: state.config ? { ...state.config, ...partial } : null,
        })),

      // ==================================================================
      // PRD/Tasks Actions
      // ==================================================================

      setPRD: (prd) =>
        set({
          prd,
          tasks: prd?.tasks ?? [],
        }),

      setTasks: (tasks) => set({ tasks }),

      updateTask: (taskId, partial) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === taskId ? { ...task, ...partial } : task
          ),
          prd: state.prd
            ? {
                ...state.prd,
                tasks: state.prd.tasks.map((task) =>
                  task.id === taskId ? { ...task, ...partial } : task
                ),
              }
            : null,
        })),

      addTask: (task) =>
        set((state) => ({
          tasks: [...state.tasks, task],
          prd: state.prd
            ? { ...state.prd, tasks: [...state.prd.tasks, task] }
            : null,
        })),

      removeTask: (taskId) =>
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== taskId),
          prd: state.prd
            ? {
                ...state.prd,
                tasks: state.prd.tasks.filter((task) => task.id !== taskId),
              }
            : null,
        })),

      // ==================================================================
      // Battle Actions
      // ==================================================================

      setCurrentBattle: (battle) => set({ currentBattle: battle }),

      setBattleProgress: (taskId, progress) =>
        set((state) => ({
          battleProgress: { ...state.battleProgress, [taskId]: progress },
        })),

      setBattleHistory: (taskId, history) =>
        set((state) => ({
          battleHistory: { ...state.battleHistory, [taskId]: history },
        })),

      clearBattleProgress: (taskId) =>
        set((state) => {
          const { [taskId]: _, ...rest } = state.battleProgress;
          return { battleProgress: rest };
        }),

      // ==================================================================
      // Planning Actions
      // ==================================================================

      setPlanningState: (state) =>
        set((current) => ({
          planningSession: { ...current.planningSession, state },
        })),

      setPendingQuestion: (question) =>
        set((state) => ({
          planningSession: { ...state.planningSession, pendingQuestion: question },
        })),

      addPlanningOutput: (output) =>
        set((state) => ({
          planningSession: {
            ...state.planningSession,
            conversationOutput: [...state.planningSession.conversationOutput, output],
          },
        })),

      clearPlanningSession: () =>
        set({
          planningSession: {
            state: "idle",
            pendingQuestion: null,
            conversationOutput: [],
          },
        }),

      // ==================================================================
      // Hydration Actions
      // ==================================================================

      hydrate: (data) => set((state) => ({ ...state, ...data })),

      reset: () => set(initialState),
    }),
    {
      name: "pokeralph-storage",
      storage: createJSONStorage(() => localStorage),
      // Only persist config
      partialize: (state) => ({ config: state.config }),
    }
  )
);

// ==========================================================================
// Selectors
// ==========================================================================

/**
 * Select connection status
 */
export const useIsConnected = () => useAppStore((state) => state.isConnected);

/**
 * Select connection ID
 */
export const useConnectionId = () => useAppStore((state) => state.connectionId);

/**
 * Select working directory
 */
export const useWorkingDir = () => useAppStore((state) => state.workingDir);

/**
 * Select if .pokeralph folder exists
 */
export const useHasPokeralphFolder = () => useAppStore((state) => state.hasPokeralphFolder);

/**
 * Select configuration
 */
export const useConfig = () => useAppStore((state) => state.config);

/**
 * Select PRD
 */
export const usePRD = () => useAppStore((state) => state.prd);

/**
 * Select all tasks
 */
export const useTasks = () => useAppStore((state) => state.tasks);

/**
 * Select a specific task by ID
 */
export const useTask = (taskId: string) =>
  useAppStore((state) => state.tasks.find((t) => t.id === taskId) ?? null);

/**
 * Select tasks by status
 * @param status - Status string (e.g. "pending", "in_progress")
 */
export const useTasksByStatus = (status: string) =>
  useAppStore((state) => state.tasks.filter((t) => t.status === status));

/**
 * Select pending tasks
 */
export const usePendingTasks = () =>
  useAppStore((state) => state.tasks.filter((t) => t.status === "pending"));

/**
 * Select completed tasks
 */
export const useCompletedTasks = () =>
  useAppStore((state) => state.tasks.filter((t) => t.status === "completed"));

/**
 * Select in-progress tasks
 */
export const useInProgressTasks = () =>
  useAppStore((state) => state.tasks.filter((t) => t.status === "in_progress"));

/**
 * Select failed tasks
 */
export const useFailedTasks = () =>
  useAppStore((state) => state.tasks.filter((t) => t.status === "failed"));

/**
 * Select current battle
 */
export const useCurrentBattle = () =>
  useAppStore((state) => state.currentBattle);

/**
 * Select battle progress for a task
 */
export const useBattleProgress = (taskId: string) =>
  useAppStore((state) => state.battleProgress[taskId] ?? null);

/**
 * Select all battle progress
 */
export const useAllBattleProgress = () =>
  useAppStore((state) => state.battleProgress);

/**
 * Select battle history for a task
 */
export const useBattleHistory = (taskId: string) =>
  useAppStore((state) => state.battleHistory[taskId] ?? null);

/**
 * Select all battle history
 */
export const useAllBattleHistory = () =>
  useAppStore((state) => state.battleHistory);

/**
 * Select planning session
 */
export const usePlanningSession = () =>
  useAppStore((state) => state.planningSession);

/**
 * Select planning state
 */
export const usePlanningState = () =>
  useAppStore((state) => state.planningSession.state);

/**
 * Select if planning is active
 */
export const useIsPlanning = () =>
  useAppStore((state) => state.planningSession.state !== "idle");

/**
 * Select pending planning question
 */
export const usePendingQuestion = () =>
  useAppStore((state) => state.planningSession.pendingQuestion);

/**
 * Select planning conversation output
 */
export const usePlanningOutput = () =>
  useAppStore((state) => state.planningSession.conversationOutput);

// ==========================================================================
// Derived Selectors
// ==========================================================================

/**
 * Select task counts by status
 */
export const useTaskCounts = () =>
  useAppStore(
    useShallow((state) => {
      const counts = {
        total: state.tasks.length,
        pending: 0,
        planning: 0,
        in_progress: 0,
        paused: 0,
        completed: 0,
        failed: 0,
      };

      for (const task of state.tasks) {
        counts[task.status]++;
      }

      return counts;
    })
  );

/**
 * Select the next pending task (highest priority)
 */
export const useNextPendingTask = () =>
  useAppStore((state) => {
    const pending = state.tasks.filter((t) => t.status === "pending");
    if (pending.length === 0) return null;
    return pending.sort((a, b) => a.priority - b.priority)[0];
  });

/**
 * Check if a battle is running
 */
export const useIsBattleRunning = () =>
  useAppStore((state) => state.currentBattle?.isRunning ?? false);

/**
 * Check if a battle is paused
 */
export const useIsBattlePaused = () =>
  useAppStore((state) => state.currentBattle?.isPaused ?? false);

/**
 * Check if awaiting approval
 */
export const useIsAwaitingApproval = () =>
  useAppStore((state) => state.currentBattle?.isAwaitingApproval ?? false);

// ==========================================================================
// WebSocket Integration
// ==========================================================================

/**
 * Resyncs state from server after WebSocket reconnection per spec (07-websocket.md lines 784-967)
 * Fetches current state via REST APIs and updates the store
 */
async function resyncStateFromServer(): Promise<void> {
  const log = (action: string, data?: unknown) => {
    console.log(`%c[PokéRalph][Resync] ${action}`, "color: #f59e0b; font-weight: bold", data ?? "");
  };

  try {
    // Fetch all state in parallel for efficiency
    const [workingDirResult, configResult, prdResult, battleResult, planningResult] = await Promise.allSettled([
      getWorkingDir(),
      getConfig(),
      getPRD(),
      getCurrentBattle(),
      getPlanningStatus(),
    ]);

    // Update working directory
    if (workingDirResult.status === "fulfilled") {
      useAppStore.setState({
        workingDir: workingDirResult.value.workingDir,
        hasPokeralphFolder: workingDirResult.value.hasPokeralphFolder,
      });
      log("Working dir synced", workingDirResult.value);
    }

    // Update config
    if (configResult.status === "fulfilled") {
      useAppStore.setState({ config: configResult.value });
      log("Config synced");
    }

    // Update PRD and tasks
    if (prdResult.status === "fulfilled") {
      useAppStore.setState({
        prd: prdResult.value,
        tasks: prdResult.value.tasks,
      });
      log("PRD synced", { taskCount: prdResult.value.tasks.length });
    }

    // Update battle state
    if (battleResult.status === "fulfilled") {
      const battle = battleResult.value;
      if (battle.battle) {
        useAppStore.setState({
          currentBattle: {
            taskId: battle.battle.taskId,
            iteration: battle.battle.iteration,
            status: battle.battle.status,
            mode: battle.battle.mode,
            isRunning: battle.isRunning,
            isPaused: battle.isPaused,
            isAwaitingApproval: battle.isAwaitingApproval,
          },
        });
        log("Battle synced", { taskId: battle.battle.taskId });
      } else {
        useAppStore.setState({ currentBattle: null });
        log("No active battle");
      }
    }

    // Update planning state
    if (planningResult.status === "fulfilled") {
      const planning = planningResult.value;
      useAppStore.setState((state) => ({
        planningSession: {
          ...state.planningSession,
          state: planning.state,
          pendingQuestion: planning.pendingQuestion,
        },
      }));
      log("Planning synced", { state: planning.state });
    }

    log("State resync completed");
  } catch (error) {
    console.error("[PokéRalph][Resync] Failed to resync state", error);
    throw error;
  }
}

/**
 * Sets up WebSocket listeners to automatically update the store
 *
 * Call this once during app initialization to sync store with server events.
 *
 * @returns Cleanup function to remove listeners
 *
 * @example
 * ```ts
 * useEffect(() => {
 *   const cleanup = setupWebSocketListeners();
 *   return cleanup;
 * }, []);
 * ```
 */
export function setupWebSocketListeners(): () => void {
  const wsClient = getWebSocketClient();

  // Register resync callback for reconnection handling per spec (07-websocket.md lines 831-889)
  setResyncCallback(resyncStateFromServer);

  // Handler for connected event
  const handleConnected = (
    payload: WebSocketEventPayloads["connected"],
    _timestamp: string
  ) => {
    useAppStore.setState({
      isConnected: true,
      connectionId: payload.connectionId,
    });
  };

  // Handler for disconnected event
  const handleDisconnected = (
    _payload: WebSocketEventPayloads["disconnected"],
    _timestamp: string
  ) => {
    useAppStore.setState({
      isConnected: false,
      connectionId: null,
    });
  };

  // Handler for planning output
  const handlePlanningOutput = (
    payload: WebSocketEventPayloads["planning_output"],
    _timestamp: string
  ) => {
    useAppStore.getState().addPlanningOutput(payload.output);
  };

  // Handler for planning question
  const handlePlanningQuestion = (
    payload: WebSocketEventPayloads["planning_question"],
    _timestamp: string
  ) => {
    useAppStore.setState((state) => ({
      planningSession: {
        ...state.planningSession,
        state: "waiting_input",
        pendingQuestion: payload.question,
      },
    }));
  };

  // Handler for planning completed
  const handlePlanningCompleted = (
    _payload: WebSocketEventPayloads["planning_completed"],
    _timestamp: string
  ) => {
    useAppStore.getState().setPlanningState("completed");
  };

  // Handler for battle start
  const handleBattleStart = (
    payload: WebSocketEventPayloads["battle_start"],
    _timestamp: string
  ) => {
    useAppStore.setState({
      currentBattle: {
        taskId: payload.taskId,
        iteration: 1,
        status: "in_progress",
        mode: "hitl", // Default, will be updated by server
        isRunning: true,
        isPaused: false,
        isAwaitingApproval: false,
      },
    });
    // Also update task status
    useAppStore.getState().updateTask(payload.taskId, { status: TaskStatus.InProgress  });
  };

  // Handler for battle pause
  const handleBattlePause = (
    payload: WebSocketEventPayloads["battle_pause"],
    _timestamp: string
  ) => {
    useAppStore.setState((state) => ({
      currentBattle: state.currentBattle
        ? {
            ...state.currentBattle,
            isPaused: true,
            isRunning: false,
            iteration: payload.iteration,
          }
        : null,
    }));
    useAppStore.getState().updateTask(payload.taskId, { status: TaskStatus.Paused  });
  };

  // Handler for battle resume
  const handleBattleResume = (
    payload: WebSocketEventPayloads["battle_resume"],
    _timestamp: string
  ) => {
    useAppStore.setState((state) => ({
      currentBattle: state.currentBattle
        ? {
            ...state.currentBattle,
            isPaused: false,
            isRunning: true,
          }
        : null,
    }));
    useAppStore.getState().updateTask(payload.taskId, { status: TaskStatus.InProgress  });
  };

  // Handler for battle cancel
  const handleBattleCancel = (
    payload: WebSocketEventPayloads["battle_cancel"],
    _timestamp: string
  ) => {
    useAppStore.setState({ currentBattle: null });
    useAppStore.getState().updateTask(payload.taskId, { status: TaskStatus.Failed  });
  };

  // Handler for battle complete
  const handleBattleComplete = (
    payload: WebSocketEventPayloads["battle_complete"],
    _timestamp: string
  ) => {
    useAppStore.setState({ currentBattle: null });
    useAppStore.getState().updateTask(payload.taskId, { status: TaskStatus.Completed  });
    useAppStore.getState().setBattleHistory(payload.taskId, payload.battle);
  };

  // Handler for battle failed
  const handleBattleFailed = (
    payload: WebSocketEventPayloads["battle_failed"],
    _timestamp: string
  ) => {
    useAppStore.setState({ currentBattle: null });
    useAppStore.getState().updateTask(payload.taskId, { status: TaskStatus.Failed  });
    useAppStore.getState().setBattleHistory(payload.taskId, payload.battle);
  };

  // Handler for iteration start
  const handleIterationStart = (
    payload: WebSocketEventPayloads["iteration_start"],
    _timestamp: string
  ) => {
    useAppStore.setState((state) => ({
      currentBattle: state.currentBattle
        ? {
            ...state.currentBattle,
            iteration: payload.iteration,
          }
        : null,
    }));
  };

  // Handler for iteration end
  const handleIterationEnd = (
    payload: WebSocketEventPayloads["iteration_end"],
    _timestamp: string
  ) => {
    // Update iteration in current battle
    useAppStore.setState((state) => ({
      currentBattle: state.currentBattle
        ? {
            ...state.currentBattle,
            iteration: payload.iteration,
          }
        : null,
    }));
  };

  // Handler for progress update
  const handleProgressUpdate = (
    payload: WebSocketEventPayloads["progress_update"],
    _timestamp: string
  ) => {
    useAppStore.getState().setBattleProgress(payload.taskId, payload.progress);
  };

  // Handler for await approval
  const handleAwaitApproval = (
    payload: WebSocketEventPayloads["await_approval"],
    _timestamp: string
  ) => {
    useAppStore.setState((state) => ({
      currentBattle: state.currentBattle
        ? {
            ...state.currentBattle,
            isAwaitingApproval: true,
            isRunning: false,
            iteration: payload.iteration,
          }
        : null,
    }));
  };

  // Handler for approval received
  const handleApprovalReceived = (
    payload: WebSocketEventPayloads["approval_received"],
    _timestamp: string
  ) => {
    useAppStore.setState((state) => ({
      currentBattle: state.currentBattle
        ? {
            ...state.currentBattle,
            isAwaitingApproval: false,
            isRunning: payload.approved,
          }
        : null,
    }));
  };

  // Handler for repo changed
  const handleRepoChanged = (
    payload: WebSocketEventPayloads["repo_changed"],
    _timestamp: string
  ) => {
    // Update working directory and reset PRD/tasks/planning state
    useAppStore.setState({
      workingDir: payload.workingDir,
      hasPokeralphFolder: true,
      // Clear data from previous repo
      prd: null,
      tasks: [],
      currentBattle: null,
      battleProgress: {},
      battleHistory: {},
      planningSession: {
        state: "idle",
        pendingQuestion: null,
        conversationOutput: [],
      },
    });
  };

  // Register all listeners
  wsClient.on("connected", handleConnected);
  wsClient.on("disconnected", handleDisconnected);
  wsClient.on("planning_output", handlePlanningOutput);
  wsClient.on("planning_question", handlePlanningQuestion);
  wsClient.on("planning_completed", handlePlanningCompleted);
  wsClient.on("battle_start", handleBattleStart);
  wsClient.on("battle_pause", handleBattlePause);
  wsClient.on("battle_resume", handleBattleResume);
  wsClient.on("battle_cancel", handleBattleCancel);
  wsClient.on("battle_complete", handleBattleComplete);
  wsClient.on("battle_failed", handleBattleFailed);
  wsClient.on("iteration_start", handleIterationStart);
  wsClient.on("iteration_end", handleIterationEnd);
  wsClient.on("progress_update", handleProgressUpdate);
  wsClient.on("await_approval", handleAwaitApproval);
  wsClient.on("approval_received", handleApprovalReceived);
  wsClient.on("repo_changed", handleRepoChanged);

  // Return cleanup function
  return () => {
    wsClient.off("connected", handleConnected);
    wsClient.off("disconnected", handleDisconnected);
    wsClient.off("planning_output", handlePlanningOutput);
    wsClient.off("planning_question", handlePlanningQuestion);
    wsClient.off("planning_completed", handlePlanningCompleted);
    wsClient.off("battle_start", handleBattleStart);
    wsClient.off("battle_pause", handleBattlePause);
    wsClient.off("battle_resume", handleBattleResume);
    wsClient.off("battle_cancel", handleBattleCancel);
    wsClient.off("battle_complete", handleBattleComplete);
    wsClient.off("battle_failed", handleBattleFailed);
    wsClient.off("iteration_start", handleIterationStart);
    wsClient.off("iteration_end", handleIterationEnd);
    wsClient.off("progress_update", handleProgressUpdate);
    wsClient.off("await_approval", handleAwaitApproval);
    wsClient.off("approval_received", handleApprovalReceived);
    wsClient.off("repo_changed", handleRepoChanged);
  };
}
