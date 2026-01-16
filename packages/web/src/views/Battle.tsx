/**
 * Battle view for PokéRalph
 *
 * Interface during task execution. Shows real-time progress, logs, feedback
 * loop status, and provides controls for pause, cancel, and HITL approval.
 */

import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Loader2,
  Play,
  Pause,
  RotateCcw,
  X,
  Check,
  ArrowLeft,
  Clock,
  PartyPopper,
  AlertCircle,
  Search,
} from "lucide-react";
import {
  useTask,
  useCurrentBattle,
  useBattleProgress,
  useConfig,
  useAppStore,
} from "@/stores/app-store";
import {
  getTask,
  getCurrentBattle,
  getBattleProgress,
  startBattle,
  pauseBattle,
  resumeBattle,
  cancelBattle,
  approveBattle,
} from "@/api/client";
import {
  type Task,
  type Progress,
  type FeedbackResult,
  TaskStatus,
} from "@pokeralph/core/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PokeballIndicator, HPBar } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

// ==========================================================================
// Types
// ==========================================================================

/**
 * Battle view stage
 */
type BattleStage =
  | "idle"
  | "running"
  | "paused"
  | "awaiting_approval"
  | "completed"
  | "failed";

// ==========================================================================
// Sub-components
// ==========================================================================

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
    <div className="flex items-center gap-2 text-[hsl(var(--battle-fg))] opacity-70">
      <Clock className="h-4 w-4" />
      <span className="font-mono">{formatTime(elapsed)}</span>
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
    <div className="flex flex-wrap gap-2">
      {Object.entries(results).map(([name, result]) => (
        <Badge
          key={name}
          variant={result.passed ? "success" : "destructive"}
          className="gap-1"
          title={result.output || (result.passed ? "Passed" : "Failed")}
        >
          {result.passed ? (
            <Check className="h-3 w-3" />
          ) : (
            <X className="h-3 w-3" />
          )}
          {name}
        </Badge>
      ))}
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally trigger scroll on log changes
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length, lastOutput]);

  return (
    <div className="battle-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-sm text-[hsl(var(--battle-fg))]">OUTPUT</span>
        {isRunning && (
          <div className="flex items-center gap-2 text-sm text-[hsl(120_50%_30%)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(120_50%_30%)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(120_50%_30%)]" />
            </span>
            LIVE
          </div>
        )}
      </div>
      <ScrollArea className="h-64 bg-[hsl(var(--battle-bg))] border-3 border-[hsl(var(--battle-fg))] p-4 font-mono text-sm text-[hsl(var(--battle-fg))]">
        {logs.length === 0 && !lastOutput ? (
          <div className="opacity-60">
            {isRunning ? "Waiting for output..." : "No output yet"}
          </div>
        ) : (
          <>
            {logs.map((log, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Log lines are streaming and don't have stable IDs
              <div key={`log-${idx}`} className="whitespace-pre-wrap">
                {log}
              </div>
            ))}
            {lastOutput && (
              <div className="whitespace-pre-wrap">{lastOutput}</div>
            )}
          </>
        )}
        <div ref={logsEndRef} />
      </ScrollArea>
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
    <div className="battle-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-1 bg-[hsl(var(--battle-bg))] border-2 border-[hsl(var(--battle-fg))] text-xs font-bold">
          #{task.priority}
        </span>
        <h3 className="font-bold text-[hsl(var(--battle-fg))]">{task.title}</h3>
      </div>
      <p className="text-[hsl(var(--battle-fg))] opacity-80 mb-3">{task.description}</p>
      {task.acceptanceCriteria.length > 0 && (
        <div>
          <span className="text-sm font-bold text-[hsl(var(--battle-fg))]">Acceptance Criteria</span>
          <ul className="mt-2 list-inside list-disc text-sm text-[hsl(var(--battle-fg))] opacity-80">
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
 * Success message with confetti effect
 */
interface SuccessMessageProps {
  taskTitle: string;
  taskId: string;
}

function SuccessMessage({ taskTitle, taskId }: SuccessMessageProps) {
  return (
    <div className="battle-card p-6 text-center border-[hsl(120_50%_25%)]">
      <div className="mb-4 flex justify-center gap-2">
        <PartyPopper className="h-10 w-10 text-[hsl(120_50%_25%)]" />
      </div>
      <h3 className="text-lg font-bold text-[hsl(120_50%_25%)]">
        VICTORY!
      </h3>
      <p className="mt-3 text-[hsl(var(--battle-fg))] opacity-80">
        {taskTitle} was defeated!
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="battle" asChild>
          <Link to="/">Continue</Link>
        </Button>
        <Button variant="battle" asChild>
          <Link to={`/history/${encodeURIComponent(taskId)}`}>
            View History
          </Link>
        </Button>
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
    <div className="battle-card p-6 text-center border-[hsl(0_60%_40%)]">
      <AlertCircle className="mx-auto mb-4 h-10 w-10 text-[hsl(0_60%_40%)]" />
      <h3 className="text-lg font-bold text-[hsl(0_60%_40%)]">
        FAINTED!
      </h3>
      <p className="mt-3 text-[hsl(var(--battle-fg))] opacity-80">
        {taskTitle} could not be completed.
      </p>
      <div className="mt-4 bg-[hsl(var(--battle-bg))] border-3 border-[hsl(var(--battle-fg))] p-3 text-sm text-left text-[hsl(var(--battle-fg))]">
        {error}
      </div>
    </div>
  );
}

/**
 * Loading state
 */
function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Loader2 className="mb-4 h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
      <p className="text-[hsl(var(--muted-foreground))]">Loading task...</p>
    </div>
  );
}

/**
 * Not found state
 */
function NotFoundState() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Search className="mb-4 h-12 w-12 text-[hsl(var(--muted-foreground))]" />
      <h2 className="text-xl font-bold">Task Not Found</h2>
      <p className="mt-2 text-[hsl(var(--muted-foreground))]">
        The requested task could not be found.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Back to Dashboard</Link>
      </Button>
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
  const [iterationStartTime, setIterationStartTime] = useState<Date | null>(
    null
  );

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
        const loadedTask = await getTask(taskId);
        setTask(loadedTask);

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
      const message =
        err instanceof Error ? err.message : "Failed to start battle";
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
  const currentIteration =
    currentBattle?.iteration ?? progress?.currentIteration ?? 0;
  const progressPercentage =
    maxIterations > 0
      ? Math.min((currentIteration / maxIterations) * 100, 100)
      : 0;

  return (
    <div className="battle-lcd p-6 space-y-6 min-h-full">
      {/* Task info section */}
      <TaskInfo task={task} />

      {/* Status section - Battle HUD style */}
      <div className="battle-card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Left side - Status and feedback */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className={`px-2 py-1 text-xs font-bold border-2 border-[hsl(var(--battle-fg))] ${
                stage === "completed" ? "bg-[hsl(120_50%_30%)]" : 
                stage === "failed" ? "bg-[hsl(0_50%_35%)]" : 
                "bg-[hsl(var(--battle-card))]"
              } text-[hsl(var(--battle-fg))]`}>
                {stage === "idle" && "READY"}
                {stage === "running" && "BATTLING"}
                {stage === "paused" && "PAUSED"}
                {stage === "awaiting_approval" && "REVIEW"}
                {stage === "completed" && "VICTORY"}
                {stage === "failed" && "FAINTED"}
              </span>
              <Timer
                startTime={iterationStartTime}
                isRunning={stage === "running"}
              />
            </div>
            <FeedbackStatus results={progress?.feedbackResults ?? null} />
          </div>

          {/* Right side - Iteration indicators (pokeball style) */}
          <div className="flex flex-col items-end gap-2">
            <span className="text-xs font-bold text-[hsl(var(--battle-fg))]">
              ROUND {currentIteration}/{maxIterations}
            </span>
            <PokeballIndicator
              total={Math.min(maxIterations, 6)}
              filled={Math.min(currentIteration, 6)}
              size="md"
              variant={stage === "completed" ? "success" : stage === "failed" ? "error" : "default"}
            />
            {maxIterations > 6 && (
              <span className="text-xs text-[hsl(var(--battle-fg))] opacity-60">
                +{maxIterations - 6} more
              </span>
            )}
          </div>
        </div>

        {/* HP-style progress bar */}
        <div className="mt-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[hsl(var(--battle-fg))] mb-1">
            <span>PROGRESS</span>
            <span>{Math.round(progressPercentage)}%</span>
          </div>
          <div className="battle-hp-bar">
            <div 
              className={`battle-hp-bar-fill ${progressPercentage < 25 ? 'danger' : progressPercentage < 50 ? 'warning' : ''}`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Success message */}
      {stage === "completed" && (
        <SuccessMessage taskTitle={task.title} taskId={task.id} />
      )}

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
        <div className="battle-dialog py-4 text-center">
          <Pause className="mx-auto mb-3 h-8 w-8 text-[hsl(var(--battle-fg))]" />
          <h4 className="font-bold text-[hsl(var(--battle-fg))]">What will TRAINER do?</h4>
          <p className="mt-2 text-[hsl(var(--battle-fg))] opacity-70">
            Round {currentIteration} complete. Review changes and choose your next move.
          </p>
        </div>
      )}

      {/* Control buttons */}
      <div className="flex justify-end gap-2">
        {stage === "completed" ? null : stage === "failed" ? (
          <>
            <Button variant="battle" onClick={handleStartBattle} disabled={isActionLoading}>
              {isActionLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Retry
                </>
              )}
            </Button>
            <Button variant="battle" asChild>
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
          </>
        ) : stage === "awaiting_approval" ? (
          <>
            <Button
              variant="battle"
              onClick={handleCancel}
              disabled={isActionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="battle"
              onClick={handleApprove}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Approve
                </>
              )}
            </Button>
          </>
        ) : stage === "paused" ? (
          <>
            <Button
              variant="battle"
              onClick={handleCancel}
              disabled={isActionLoading}
            >
              Cancel
            </Button>
            <Button variant="battle" onClick={handleResume} disabled={isActionLoading}>
              {isActionLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resuming...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Resume
                </>
              )}
            </Button>
          </>
        ) : stage === "running" ? (
          <>
            <Button
              variant="battle"
              onClick={handleCancel}
              disabled={isActionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="battle"
              onClick={handlePause}
              disabled={isActionLoading}
            >
              {isActionLoading ? "Pausing..." : "Pause"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="battle" asChild>
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button variant="battle" onClick={handleStartBattle} disabled={isActionLoading}>
              {isActionLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Fight!
                </>
              )}
            </Button>
          </>
        )}
      </div>

      {/* Loading overlay during running */}
      {stage === "running" && (
        <div className="battle-dialog py-4 flex items-center justify-center gap-4">
          <div className="relative">
            <div className="h-6 w-6 animate-ping rounded-full bg-[hsl(72_85%_50%)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-[hsl(72_85%_60%)]" />
            </div>
          </div>
          <span className="font-bold text-[hsl(var(--battle-fg))]">CLAUDE used IMPLEMENT!</span>
        </div>
      )}
    </div>
  );
}
