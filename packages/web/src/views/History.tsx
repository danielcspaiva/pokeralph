/**
 * History view for PokéRalph
 *
 * Displays battle history for a task with a vertical timeline of iterations.
 * Shows iteration details, duration, result, files changed, and commit links.
 */

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Loader2,
  Play,
  Search,
  FileText,
  ChevronDown,
  ChevronUp,
  Clock,
  GitCommit,
  ArrowLeft,
  Check,
  X,
  AlertCircle,
  Timer,
} from "lucide-react";
import {
  useTask,
  useBattleHistory,
  useAppStore,
} from "@/stores/app-store";
import { getTask, getBattleHistory, startBattle } from "@/api/client";
import {
  type Task,
  type Battle,
  type Iteration,
  type IterationResult,
  TaskStatus,
} from "@pokeralph/core/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ==========================================================================
// Helper Functions
// ==========================================================================

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Calculate iteration duration from timestamps
 */
function calculateIterationDuration(iteration: Iteration): number {
  if (!iteration.endedAt) return 0;
  const start = new Date(iteration.startedAt).getTime();
  const end = new Date(iteration.endedAt).getTime();
  return end - start;
}

/**
 * Format timestamp to locale string
 */
function formatTimestamp(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

/**
 * Get result variant for badge
 */
function getResultVariant(
  result: IterationResult
): "success" | "destructive" | "warning" | "secondary" {
  switch (result) {
    case "success":
      return "success";
    case "failure":
      return "destructive";
    case "timeout":
      return "warning";
    case "cancelled":
      return "secondary";
    default:
      return "secondary";
  }
}

/**
 * Get result label
 */
function getResultLabel(result: IterationResult): string {
  switch (result) {
    case "success":
      return "Success";
    case "failure":
      return "Failed";
    case "timeout":
      return "Timeout";
    case "cancelled":
      return "Cancelled";
    default:
      return result;
  }
}

// ==========================================================================
// Sub-components
// ==========================================================================

/**
 * Task info header
 */
interface TaskHeaderProps {
  task: Task;
  battle: Battle | null;
}

function TaskHeader({ task, battle }: TaskHeaderProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">#{task.priority}</Badge>
          <Badge
            variant={
              task.status === "completed"
                ? "success"
                : task.status === "failed"
                  ? "destructive"
                  : task.status === "in_progress"
                    ? "warning"
                    : "secondary"
            }
          >
            {task.status.replace("_", " ")}
          </Badge>
        </div>
        <CardTitle className="mt-2">{task.title}</CardTitle>
        <p className="text-[hsl(var(--muted-foreground))]">{task.description}</p>
      </CardHeader>
      {battle && (
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-sm text-[hsl(var(--muted-foreground))]">
                Started
              </div>
              <div className="font-medium">
                {formatTimestamp(battle.startedAt)}
              </div>
            </div>
            {battle.completedAt && (
              <div>
                <div className="text-sm text-[hsl(var(--muted-foreground))]">
                  Completed
                </div>
                <div className="font-medium">
                  {formatTimestamp(battle.completedAt)}
                </div>
              </div>
            )}
            {battle.durationMs && (
              <div>
                <div className="text-sm text-[hsl(var(--muted-foreground))]">
                  Total Duration
                </div>
                <div className="font-medium">
                  {formatDuration(battle.durationMs)}
                </div>
              </div>
            )}
            <div>
              <div className="text-sm text-[hsl(var(--muted-foreground))]">
                Iterations
              </div>
              <div className="font-medium">{battle.iterations.length}</div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Single iteration in the timeline
 */
interface IterationItemProps {
  iteration: Iteration;
  isExpanded: boolean;
  onToggle: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function IterationItem({
  iteration,
  isExpanded,
  onToggle,
  isFirst: _isFirst,
  isLast,
}: IterationItemProps) {
  const duration = calculateIterationDuration(iteration);
  const resultVariant = getResultVariant(iteration.result);

  return (
    <div className="relative flex gap-4">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
            iteration.result === "success"
              ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]"
              : iteration.result === "failure"
                ? "bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]"
                : iteration.result === "timeout"
                  ? "bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]"
                  : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
          )}
        >
          {iteration.result === "success" ? (
            <Check className="h-4 w-4" />
          ) : iteration.result === "failure" ? (
            <X className="h-4 w-4" />
          ) : iteration.result === "timeout" ? (
            <Timer className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
        </div>
        {!isLast && (
          <div className="h-full w-px bg-[hsl(var(--border))]" />
        )}
      </div>

      {/* Iteration content */}
      <div className="flex-1 pb-6">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-left transition-colors hover:bg-[hsl(var(--accent))]"
          onClick={onToggle}
          aria-expanded={isExpanded}
        >
          <div className="flex items-center gap-4">
            <span className="font-medium">Iteration {iteration.number}</span>
            <Badge variant={resultVariant}>{getResultLabel(iteration.result)}</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-[hsl(var(--muted-foreground))]">
            {duration > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {formatDuration(duration)}
              </span>
            )}
            <span>{formatTimestamp(iteration.startedAt)}</span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </button>

        {isExpanded && (
          <div className="mt-2 space-y-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] p-4">
            {/* Error message if present */}
            {iteration.error && (
              <div>
                <span className="text-sm font-medium text-[hsl(var(--destructive))]">
                  Error
                </span>
                <div className="mt-1 rounded-md bg-[hsl(var(--destructive)/0.1)] p-3 text-sm">
                  {iteration.error}
                </div>
              </div>
            )}

            {/* Output section */}
            {iteration.output && (
              <div>
                <span className="text-sm font-medium">Output</span>
                <ScrollArea className="mt-1 h-40 rounded-md bg-[hsl(var(--muted))] p-3 font-mono text-sm">
                  {iteration.output}
                </ScrollArea>
              </div>
            )}

            {/* Files changed */}
            {iteration.filesChanged.length > 0 && (
              <div>
                <span className="text-sm font-medium">
                  Files Changed ({iteration.filesChanged.length})
                </span>
                <ul className="mt-2 space-y-1">
                  {iteration.filesChanged.map((file) => (
                    <li
                      key={file}
                      className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"
                    >
                      <FileText className="h-4 w-4" />
                      {file}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Commit link */}
            {iteration.commitHash && (
              <div>
                <span className="text-sm font-medium">Commit</span>
                <div className="mt-1 flex items-center gap-2">
                  <GitCommit className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                  <code className="rounded bg-[hsl(var(--muted))] px-2 py-1 text-sm">
                    {iteration.commitHash}
                  </code>
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div>
              <span className="text-sm font-medium">Timeline</span>
              <div className="mt-1 space-y-1 text-sm text-[hsl(var(--muted-foreground))]">
                <div>Started: {formatTimestamp(iteration.startedAt)}</div>
                {iteration.endedAt && (
                  <div>Ended: {formatTimestamp(iteration.endedAt)}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Timeline of iterations
 */
interface IterationTimelineProps {
  iterations: Iteration[];
}

function IterationTimeline({ iterations }: IterationTimelineProps) {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const toggleItem = (number: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedItems(new Set(iterations.map((i) => i.number)));
  };

  const collapseAll = () => {
    setExpandedItems(new Set());
  };

  if (iterations.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-[hsl(var(--muted-foreground))]">
          No iterations recorded yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Iteration History</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
        </div>
      </div>
      <div>
        {iterations.map((iteration, idx) => (
          <IterationItem
            key={iteration.number}
            iteration={iteration}
            isExpanded={expandedItems.has(iteration.number)}
            onToggle={() => toggleItem(iteration.number)}
            isFirst={idx === 0}
            isLast={idx === iterations.length - 1}
          />
        ))}
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
      <p className="text-[hsl(var(--muted-foreground))]">Loading history...</p>
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

/**
 * No history state
 */
interface NoHistoryStateProps {
  task: Task;
  onRetry: () => void;
  isLoading: boolean;
}

function NoHistoryState({ task, onRetry, isLoading }: NoHistoryStateProps) {
  const canRetry = task.status === "pending" || task.status === "failed";

  return (
    <Card>
      <CardContent className="flex flex-col items-center py-12">
        <FileText className="mb-4 h-12 w-12 text-[hsl(var(--muted-foreground))]" />
        <h3 className="text-lg font-semibold">No Battle History</h3>
        <p className="mt-2 text-center text-[hsl(var(--muted-foreground))]">
          This task hasn't been executed yet, or no history was recorded.
        </p>
        <div className="mt-6 flex gap-2">
          {canRetry && (
            <Button onClick={onRetry} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Start Battle
                </>
              )}
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to={`/task/${encodeURIComponent(task.id)}`}>Go to Battle</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">Back to Dashboard</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ==========================================================================
// Main Component
// ==========================================================================

/**
 * History view component
 */
export function History() {
  const { taskId } = useParams<{ taskId: string }>();

  // Store state
  const storeTask = useTask(taskId ?? "");
  const storeHistory = useBattleHistory(taskId ?? "");
  const setBattleHistory = useAppStore((state) => state.setBattleHistory);
  const updateTask = useAppStore((state) => state.updateTask);

  // Local state
  const [task, setTask] = useState<Task | null>(storeTask);
  const [history, setHistory] = useState<Battle | null>(storeHistory);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Load task and history on mount
  useEffect(() => {
    async function loadData() {
      if (!taskId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const loadedTask = await getTask(taskId);
        setTask(loadedTask);

        try {
          const historyResponse = await getBattleHistory(taskId);
          if (historyResponse.history) {
            setHistory(historyResponse.history);
            setBattleHistory(taskId, historyResponse.history);
          }
        } catch {
          // History might not exist yet - that's okay
        }
      } catch {
        setTask(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [taskId, setBattleHistory]);

  // Sync from store
  useEffect(() => {
    if (
      storeHistory &&
      (!history || storeHistory.iterations.length > history.iterations.length)
    ) {
      setHistory(storeHistory);
    }
  }, [storeHistory, history]);

  // Handle retry/start battle
  const handleRetry = async () => {
    if (!taskId || !task) return;

    setIsActionLoading(true);

    try {
      await startBattle(taskId, "hitl");
      updateTask(taskId, { status: TaskStatus.InProgress });
      window.location.href = `/task/${encodeURIComponent(taskId)}`;
    } catch (err) {
      console.error("Failed to start battle:", err);
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

  return (
    <div className="space-y-6">
      {/* Task header with stats */}
      <TaskHeader task={task} battle={history} />

      {/* Navigation */}
      <div className="flex gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/task/${encodeURIComponent(task.id)}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Battle View
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/">Dashboard</Link>
        </Button>
      </div>

      {/* Timeline or empty state */}
      {history && history.iterations.length > 0 ? (
        <IterationTimeline iterations={history.iterations} />
      ) : (
        <NoHistoryState
          task={task}
          onRetry={handleRetry}
          isLoading={isActionLoading}
        />
      )}

      {/* Retry button for failed tasks */}
      {history && task.status === "failed" && (
        <div className="flex justify-center">
          <Button onClick={handleRetry} disabled={isActionLoading}>
            {isActionLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Retrying...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Retry Task
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
