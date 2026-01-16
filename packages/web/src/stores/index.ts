/**
 * Stores module for PokéRalph web client
 *
 * Re-exports all stores and selectors for convenient imports.
 *
 * @example
 * ```ts
 * import { useAppStore, useConfig, useTasks, setupWebSocketListeners } from "@/stores";
 * ```
 */

export {
  // Main store
  useAppStore,
  // Types
  type AppState,
  type AppActions,
  type AppStore,
  type PlanningState,
  type CurrentBattle,
  type PlanningSession,
  // Connection selectors
  useIsConnected,
  useConnectionId,
  // Config selectors
  useConfig,
  // PRD/Tasks selectors
  usePRD,
  useTasks,
  useTask,
  useTasksByStatus,
  usePendingTasks,
  useCompletedTasks,
  useInProgressTasks,
  useFailedTasks,
  // Battle selectors
  useCurrentBattle,
  useBattleProgress,
  useAllBattleProgress,
  useBattleHistory,
  useAllBattleHistory,
  // Planning selectors
  usePlanningSession,
  usePlanningState,
  useIsPlanning,
  usePendingQuestion,
  usePlanningOutput,
  // Derived selectors
  useTaskCounts,
  useNextPendingTask,
  useIsBattleRunning,
  useIsBattlePaused,
  useIsAwaitingApproval,
  // WebSocket integration
  setupWebSocketListeners,
} from "./app-store.ts";

// Re-export WebSocket connect function for app initialization
export { connect } from "@/api/websocket.ts";
