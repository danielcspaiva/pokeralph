/**
 * Battle view for PokéRalph
 *
 * Interface during task execution. Shows real-time progress, logs, feedback
 * loop status, and provides controls for pause, cancel, and HITL approval.
 */

import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useTask,
  useCurrentBattle,
  useBattleProgress,
  useConfig,
  useAppStore,
} from "@/stores/app-store.ts";
import {
  getTask,
  getCurrentBattle,
  getBattleProgress,
  startBattle,
  pauseBattle,
  resumeBattle,
  cancelBattle,
  approveBattle,
} from "@/api/client.ts";
import type { Task, Progress, FeedbackResult } from "@pokeralph/core";
import { TaskStatus } from "@/constants/task-status.ts";
import styles from "./Battle.module.css";

// ==========================================================================
// Types
// ==========================================================================

/**
 * Battle view stage
 */
type BattleStage = "idle" | "running" | "paused" | "awaiting_approval" | "completed" | "failed";

// ==========================================================================
// Sub-components
// ==========================================================================

/**
 * Progress bar component
 */
interface ProgressBarProps {
  current: number;
  max: number;
}

function ProgressBar({ current, max }: ProgressBarProps) {
  const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;

  return (
    <div className={styles.progressBar}>
      <div className={styles.progressFill} style={{ width: `${percentage}%` }} />
      <span className={styles.progressText}>
        Iteration {current} of {max}
      </span>
    </div>
  );
}

/**
 * Timer component showing elapsed time
 */
interface TimerProps {
  startTime: Date | null;
  isRunning: boolean;
}

function Timer({ startTime, isRunning }: TimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime || !isRunning) {
      if (!isRunning && startTime) {
        // Keep showing last elapsed time when paused
        setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
      }
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, isRunning]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className={styles.timer}>
      <span className={styles.timerLabel}>Elapsed</span>
      <span className={styles.timerValue}>{formatTime(elapsed)}</span>
    </div>
  );
}

/**
 * Feedback loop status indicator
 */
interface FeedbackStatusProps {
  results: Record<string, FeedbackResult> | null;
}

function FeedbackStatus({ results }: FeedbackStatusProps) {
  if (!results || Object.keys(results).length === 0) {
    return null;
  }

  return (
    <div className={styles.feedbackStatus}>
      <span className={styles.feedbackLabel}>Feedback Loops</span>
      <div className={styles.feedbackLoops}>
        {Object.entries(results).map(([name, result]) => (
          <div
            key={name}
            className={`${styles.feedbackLoop} ${result.passed ? styles.passed : styles.failed}`}
            title={result.output || (result.passed ? "Passed" : "Failed")}
          >
            <span className={styles.feedbackIcon}>{result.passed ? "✓" : "✗"}</span>
            <span className={styles.feedbackName}>{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Log output area
 */
interface LogAreaProps {
  logs: string[];
  lastOutput: string | null;
  isRunning: boolean;
}

function LogArea({ logs, lastOutput, isRunning }: LogAreaProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally trigger scroll on log changes
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length, lastOutput]);

  return (
    <div className={styles.logArea}>
      <div className={styles.logHeader}>
        <span className={styles.logLabel}>Output</span>
        {isRunning && (
          <span className={styles.liveIndicator}>
            <span className={styles.liveDot} />
            Live
          </span>
        )}
      </div>
      <div className={styles.logContent}>
        {logs.length === 0 && !lastOutput ? (
          <div className={styles.logEmpty}>
            {isRunning ? "Waiting for output..." : "No output yet"}
          </div>
        ) : (
          <>
{logs.map((log, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Log lines are streaming and don't have stable IDs
              <div key={`log-${idx}`} className={styles.logLine}>
                {log}
              </div>
            ))}
            {lastOutput && (
              <div className={styles.logLine}>
                {lastOutput}
              </div>
            )}
          </>
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

/**
 * Task info display
 */
interface TaskInfoProps {
  task: Task;
}

function TaskInfo({ task }: TaskInfoProps) {
  return (
    <div className={styles.taskInfo}>
      <div className={styles.taskHeader}>
        <span className={styles.taskPriority}>#{task.priority}</span>
        <h2 className={styles.taskTitle}>{task.title}</h2>
      </div>
      <p className={styles.taskDescription}>{task.description}</p>
      {task.acceptanceCriteria.length > 0 && (
        <div className={styles.acceptanceCriteria}>
          <span className={styles.criteriaLabel}>Acceptance Criteria</span>
          <ul className={styles.criteriaList}>
            {task.acceptanceCriteria.map((criterion, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Acceptance criteria are static and don't change order
              <li key={`criterion-${idx}`}>{criterion}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Control buttons
 */
interface ControlButtonsProps {
  stage: BattleStage;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onApprove: () => void;
  onRetry: () => void;
  isLoading: boolean;
}

function ControlButtons({
  stage,
  onPause,
  onResume,
  onCancel,
  onApprove,
  onRetry,
  isLoading,
}: ControlButtonsProps) {
  if (stage === "completed") {
    return null;
  }

  if (stage === "failed") {
    return (
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={onRetry}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className={styles.spinner} />
              Retrying...
            </>
          ) : (
            "Retry Battle"
          )}
        </button>
        <Link to="/" className={styles.secondaryButton}>
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (stage === "awaiting_approval") {
    return (
      <div className={styles.controls}>
        <button
          type="button"
          className={`${styles.primaryButton} ${styles.approveButton}`}
          onClick={onApprove}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className={styles.spinner} />
              Approving...
            </>
          ) : (
            "Approve & Continue"
          )}
        </button>
        <button
          type="button"
          className={`${styles.dangerButton}`}
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel Battle
        </button>
      </div>
    );
  }

  if (stage === "paused") {
    return (
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={onResume}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className={styles.spinner} />
              Resuming...
            </>
          ) : (
            "Resume Battle"
          )}
        </button>
        <button
          type="button"
          className={styles.dangerButton}
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel Battle
        </button>
      </div>
    );
  }

  if (stage === "running") {
    return (
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onPause}
          disabled={isLoading}
        >
          {isLoading ? "Pausing..." : "Pause"}
        </button>
        <button
          type="button"
          className={styles.dangerButton}
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </button>
      </div>
    );
  }

  // Idle state - start button
  return (
    <div className={styles.controls}>
      <button
        type="button"
        className={styles.primaryButton}
        onClick={onRetry}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <span className={styles.spinner} />
            Starting...
          </>
        ) : (
          "Start Battle"
        )}
      </button>
      <Link to="/" className={styles.secondaryButton}>
        Back to Dashboard
      </Link>
    </div>
  );
}

/**
 * Success message with confetti effect
 */
interface SuccessMessageProps {
  taskTitle: string;
}

function SuccessMessage({ taskTitle }: SuccessMessageProps) {
  return (
    <div className={styles.successMessage}>
      <div className={styles.confetti}>
        <span>🎉</span>
        <span>✨</span>
        <span>🎊</span>
      </div>
      <h3 className={styles.successTitle}>Battle Complete!</h3>
      <p className={styles.successText}>
        Successfully completed: <strong>{taskTitle}</strong>
      </p>
      <div className={styles.successActions}>
        <Link to="/" className={styles.primaryButton}>
          Back to Dashboard
        </Link>
        <Link to={`/history/${encodeURIComponent(taskTitle)}`} className={styles.secondaryButton}>
          View History
        </Link>
      </div>
    </div>
  );
}

/**
 * Error message with details
 */
interface ErrorMessageProps {
  error: string;
  taskTitle: string;
}

function ErrorMessage({ error, taskTitle }: ErrorMessageProps) {
  return (
    <div className={styles.errorMessage}>
      <div className={styles.errorIcon}>❌</div>
      <h3 className={styles.errorTitle}>Battle Failed</h3>
      <p className={styles.errorText}>
        Task &quot;<strong>{taskTitle}</strong>&quot; encountered an error:
      </p>
      <div className={styles.errorDetails}>{error}</div>
    </div>
  );
}

/**
 * Loading state
 */
function LoadingState() {
  return (
    <div className={styles.loading}>
      <span className={styles.spinner} />
      <p>Loading task...</p>
    </div>
  );
}

/**
 * Not found state
 */
function NotFoundState() {
  return (
    <div className={styles.notFound}>
      <div className={styles.notFoundIcon}>🔍</div>
      <h2 className={styles.notFoundTitle}>Task Not Found</h2>
      <p className={styles.notFoundText}>
        The requested task could not be found.
      </p>
      <Link to="/" className={styles.primaryButton}>
        Back to Dashboard
      </Link>
    </div>
  );
}

// ==========================================================================
// Main Component
// ==========================================================================

/**
 * Battle view component
 */
export function Battle() {
  const { taskId } = useParams<{ taskId: string }>();

  // Store state
  const storeTask = useTask(taskId ?? "");
  const currentBattle = useCurrentBattle();
  const battleProgress = useBattleProgress(taskId ?? "");
  const config = useConfig();
  const setCurrentBattle = useAppStore((state) => state.setCurrentBattle);
  const setBattleProgress = useAppStore((state) => state.setBattleProgress);
  const updateTask = useAppStore((state) => state.updateTask);

  // Local state
  const [task, setTask] = useState<Task | null>(storeTask);
  const [progress, setProgress] = useState<Progress | null>(battleProgress);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<BattleStage>("idle");
  const [iterationStartTime, setIterationStartTime] = useState<Date | null>(null);

  // Derive stage from state
  useEffect(() => {
    if (!currentBattle) {
      if (task?.status === "completed") {
        setStage("completed");
      } else if (task?.status === "failed") {
        setStage("failed");
      } else {
        setStage("idle");
      }
      return;
    }

    if (currentBattle.taskId !== taskId) {
      setStage("idle");
      return;
    }

    if (currentBattle.isAwaitingApproval) {
      setStage("awaiting_approval");
    } else if (currentBattle.isPaused) {
      setStage("paused");
    } else if (currentBattle.isRunning) {
      setStage("running");
      if (!iterationStartTime) {
        setIterationStartTime(new Date());
      }
    }
  }, [currentBattle, taskId, task?.status, iterationStartTime]);

  // Sync progress from store
  useEffect(() => {
    if (battleProgress) {
      setProgress(battleProgress);
      if (battleProgress.error) {
        setStage("failed");
        setError(battleProgress.error);
      } else if (battleProgress.completionDetected) {
        setStage("completed");
      }
    }
  }, [battleProgress]);

  // Load task and battle state on mount
  useEffect(() => {
    async function loadData() {
      if (!taskId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Load task
        const loadedTask = await getTask(taskId);
        setTask(loadedTask);

        // Check for active battle
        const battleState = await getCurrentBattle();
        if (battleState.battle && battleState.battle.taskId === taskId) {
          setCurrentBattle({
            taskId: battleState.battle.taskId,
            iteration: battleState.battle.iteration,
            status: battleState.battle.status,
            mode: battleState.battle.mode,
            isRunning: battleState.isRunning,
            isPaused: battleState.isPaused,
            isAwaitingApproval: battleState.isAwaitingApproval,
          });

          if (battleState.isRunning) {
            setIterationStartTime(new Date());
          }
        }

        // Load progress if available
        try {
          const progressData = await getBattleProgress(taskId);
          if (progressData.progress) {
            setProgress(progressData.progress);
            setBattleProgress(taskId, progressData.progress);
          }
        } catch {
          // Progress might not exist yet
        }
      } catch (err) {
        // Task not found is handled by showing NotFoundState
        console.error("Failed to load task:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [taskId, setCurrentBattle, setBattleProgress]);

  // Handle starting/retrying battle
  const handleStartBattle = async () => {
    if (!taskId) return;

    setIsActionLoading(true);
    setError(null);

    try {
      await startBattle(taskId, config?.mode ?? "hitl");
      setIterationStartTime(new Date());
      setStage("running");
      if (task) {
        updateTask(taskId, { status: TaskStatus.InProgress });
        setTask({ ...task, status: TaskStatus.InProgress });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start battle";
      setError(message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle pause
  const handlePause = async () => {
    setIsActionLoading(true);
    try {
      await pauseBattle();
    } catch (err) {
      console.error("Failed to pause:", err);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle resume
  const handleResume = async () => {
    setIsActionLoading(true);
    try {
      await resumeBattle();
      setIterationStartTime(new Date());
    } catch (err) {
      console.error("Failed to resume:", err);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle cancel
  const handleCancel = async () => {
    setIsActionLoading(true);
    try {
      await cancelBattle("User cancelled");
      setStage("failed");
      if (task && taskId) {
        updateTask(taskId, { status: TaskStatus.Failed });
        setTask({ ...task, status: TaskStatus.Failed });
      }
    } catch (err) {
      console.error("Failed to cancel:", err);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle approve (HITL)
  const handleApprove = async () => {
    setIsActionLoading(true);
    try {
      await approveBattle();
      setIterationStartTime(new Date());
    } catch (err) {
      console.error("Failed to approve:", err);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Show loading state
  if (isLoading) {
    return <LoadingState />;
  }

  // Show not found if task doesn't exist
  if (!task) {
    return <NotFoundState />;
  }

  // Determine max iterations
  const maxIterations = config?.maxIterationsPerTask ?? 10;

  return (
    <div className={styles.battle}>
      {/* Task info section */}
      <TaskInfo task={task} />

      {/* Status section */}
      <div className={styles.statusSection}>
        <div className={styles.statusHeader}>
          <span className={`${styles.stageBadge} ${styles[stage]}`}>
            {stage === "idle" && "Ready"}
            {stage === "running" && "Running"}
            {stage === "paused" && "Paused"}
            {stage === "awaiting_approval" && "Awaiting Approval"}
            {stage === "completed" && "Completed"}
            {stage === "failed" && "Failed"}
          </span>
          <Timer
            startTime={iterationStartTime}
            isRunning={stage === "running"}
          />
        </div>

        <ProgressBar
          current={currentBattle?.iteration ?? progress?.currentIteration ?? 0}
          max={maxIterations}
        />

        <FeedbackStatus results={progress?.feedbackResults ?? null} />
      </div>

      {/* Success message */}
      {stage === "completed" && <SuccessMessage taskTitle={task.title} />}

      {/* Error message */}
      {stage === "failed" && (
        <ErrorMessage
          error={error || progress?.error || "Unknown error"}
          taskTitle={task.title}
        />
      )}

      {/* Log area (only show when not completed/failed) */}
      {stage !== "completed" && stage !== "failed" && (
        <LogArea
          logs={progress?.logs ?? []}
          lastOutput={progress?.lastOutput ?? null}
          isRunning={stage === "running"}
        />
      )}

      {/* HITL approval message */}
      {stage === "awaiting_approval" && (
        <div className={styles.approvalMessage}>
          <div className={styles.approvalIcon}>⏸️</div>
          <h4 className={styles.approvalTitle}>Review Required</h4>
          <p className={styles.approvalText}>
            Iteration {currentBattle?.iteration ?? progress?.currentIteration ?? 0} complete.
            Review the changes and approve to continue, or cancel the battle.
          </p>
        </div>
      )}

      {/* Control buttons */}
      <ControlButtons
        stage={stage}
        onPause={handlePause}
        onResume={handleResume}
        onCancel={handleCancel}
        onApprove={handleApprove}
        onRetry={handleStartBattle}
        isLoading={isActionLoading}
      />

      {/* Loading overlay during actions */}
      {stage === "running" && (
        <div className={styles.loadingOverlay}>
          <div className={styles.pulseRing} />
          <span className={styles.loadingText}>Claude is working...</span>
        </div>
      )}
    </div>
  );
}
