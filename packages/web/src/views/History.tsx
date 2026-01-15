/**
 * History view for PokéRalph
 *
 * Displays battle history for a task with a vertical timeline of iterations.
 * Shows iteration details, duration, result, files changed, and commit links.
 */

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useTask,
  useBattleHistory,
  useAppStore,
} from "@/stores/app-store.ts";
import {
  getTask,
  getBattleHistory,
  startBattle,
} from "@/api/client.ts";
import { TaskStatus, type Task, type Battle, type Iteration, type IterationResult } from "@pokeralph/core";
import styles from "./History.module.css";

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
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
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
 * Get result badge class
 */
function getResultClass(result: IterationResult): string {
  switch (result) {
    case "success":
      return styles.success ?? "";
    case "failure":
      return styles.failure ?? "";
    case "timeout":
      return styles.timeout ?? "";
    case "cancelled":
      return styles.cancelled ?? "";
    default:
      return "";
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
  const statusClass = styles[task.status] || "";

  return (
    <div className={styles.taskHeader}>
      <div className={styles.taskInfo}>
        <div className={styles.taskMeta}>
          <span className={styles.taskPriority}>#{task.priority}</span>
          <span className={`${styles.statusBadge} ${statusClass}`}>
            {task.status.replace("_", " ")}
          </span>
        </div>
        <h1 className={styles.taskTitle}>{task.title}</h1>
        <p className={styles.taskDescription}>{task.description}</p>
      </div>
      {battle && (
        <div className={styles.battleStats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Started</span>
            <span className={styles.statValue}>{formatTimestamp(battle.startedAt)}</span>
          </div>
          {battle.completedAt && (
            <div className={styles.stat}>
              <span className={styles.statLabel}>Completed</span>
              <span className={styles.statValue}>{formatTimestamp(battle.completedAt)}</span>
            </div>
          )}
          {battle.durationMs && (
            <div className={styles.stat}>
              <span className={styles.statLabel}>Total Duration</span>
              <span className={styles.statValue}>{formatDuration(battle.durationMs)}</span>
            </div>
          )}
          <div className={styles.stat}>
            <span className={styles.statLabel}>Iterations</span>
            <span className={styles.statValue}>{battle.iterations.length}</span>
          </div>
        </div>
      )}
    </div>
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

function IterationItem({ iteration, isExpanded, onToggle, isFirst, isLast }: IterationItemProps) {
  const duration = calculateIterationDuration(iteration);
  const resultClass = getResultClass(iteration.result);

  return (
    <div className={`${styles.iterationItem} ${isFirst ? styles.first : ""} ${isLast ? styles.last : ""}`}>
      {/* Timeline connector */}
      <div className={styles.timelineConnector}>
        <div className={`${styles.timelineDot} ${resultClass}`} />
        {!isLast && <div className={styles.timelineLine} />}
      </div>

      {/* Iteration content */}
      <div className={styles.iterationContent}>
        <button
          type="button"
          className={styles.iterationHeader}
          onClick={onToggle}
          aria-expanded={isExpanded}
        >
          <div className={styles.iterationMain}>
            <span className={styles.iterationNumber}>Iteration {iteration.number}</span>
            <span className={`${styles.resultBadge} ${resultClass}`}>
              {getResultLabel(iteration.result)}
            </span>
          </div>
          <div className={styles.iterationMeta}>
            {duration > 0 && (
              <span className={styles.duration}>{formatDuration(duration)}</span>
            )}
            <span className={styles.timestamp}>{formatTimestamp(iteration.startedAt)}</span>
            <span className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ""}`}>
              {isExpanded ? "−" : "+"}
            </span>
          </div>
        </button>

        {isExpanded && (
          <div className={styles.iterationDetails}>
            {/* Error message if present */}
            {iteration.error && (
              <div className={styles.errorSection}>
                <span className={styles.sectionLabel}>Error</span>
                <div className={styles.errorContent}>{iteration.error}</div>
              </div>
            )}

            {/* Output section */}
            {iteration.output && (
              <div className={styles.outputSection}>
                <span className={styles.sectionLabel}>Output</span>
                <div className={styles.outputContent}>{iteration.output}</div>
              </div>
            )}

            {/* Files changed */}
            {iteration.filesChanged.length > 0 && (
              <div className={styles.filesSection}>
                <span className={styles.sectionLabel}>
                  Files Changed ({iteration.filesChanged.length})
                </span>
                <ul className={styles.filesList}>
                  {iteration.filesChanged.map((file) => (
                    <li key={file} className={styles.fileItem}>
                      {file}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Commit link */}
            {iteration.commitHash && (
              <div className={styles.commitSection}>
                <span className={styles.sectionLabel}>Commit</span>
                <code className={styles.commitHash}>{iteration.commitHash}</code>
              </div>
            )}

            {/* Timestamps */}
            <div className={styles.timestampsSection}>
              <span className={styles.sectionLabel}>Timeline</span>
              <div className={styles.timestamps}>
                <div className={styles.timestampRow}>
                  <span className={styles.timestampLabel}>Started:</span>
                  <span>{formatTimestamp(iteration.startedAt)}</span>
                </div>
                {iteration.endedAt && (
                  <div className={styles.timestampRow}>
                    <span className={styles.timestampLabel}>Ended:</span>
                    <span>{formatTimestamp(iteration.endedAt)}</span>
                  </div>
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
      <div className={styles.emptyTimeline}>
        <p>No iterations recorded yet.</p>
      </div>
    );
  }

  return (
    <div className={styles.timeline}>
      <div className={styles.timelineHeader}>
        <h2 className={styles.timelineTitle}>Iteration History</h2>
        <div className={styles.timelineActions}>
          <button
            type="button"
            className={styles.toggleButton}
            onClick={expandAll}
          >
            Expand All
          </button>
          <button
            type="button"
            className={styles.toggleButton}
            onClick={collapseAll}
          >
            Collapse All
          </button>
        </div>
      </div>
      <div className={styles.timelineList}>
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
    <div className={styles.loading}>
      <span className={styles.spinner} />
      <p>Loading history...</p>
    </div>
  );
}

/**
 * Not found state
 */
function NotFoundState() {
  return (
    <div className={styles.notFound}>
      <div className={styles.notFoundIcon}>&#128269;</div>
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
    <div className={styles.noHistory}>
      <div className={styles.noHistoryIcon}>&#128196;</div>
      <h3 className={styles.noHistoryTitle}>No Battle History</h3>
      <p className={styles.noHistoryText}>
        This task hasn&apos;t been executed yet, or no history was recorded.
      </p>
      <div className={styles.noHistoryActions}>
        {canRetry && (
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
        )}
        <Link to={`/task/${encodeURIComponent(task.id)}`} className={styles.secondaryButton}>
          Go to Battle
        </Link>
        <Link to="/" className={styles.secondaryButton}>
          Back to Dashboard
        </Link>
      </div>
    </div>
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
        // Load task
        const loadedTask = await getTask(taskId);
        setTask(loadedTask);

        // Load history
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
        // Task not found
        setTask(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [taskId, setBattleHistory]);

  // Sync from store
  useEffect(() => {
    if (storeHistory && (!history || storeHistory.iterations.length > history.iterations.length)) {
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
      // Navigate to battle view
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
    <div className={styles.history}>
      {/* Task header with stats */}
      <TaskHeader task={task} battle={history} />

      {/* Navigation */}
      <div className={styles.navigation}>
        <Link to={`/task/${encodeURIComponent(task.id)}`} className={styles.navLink}>
          &larr; Battle View
        </Link>
        <Link to="/" className={styles.navLink}>
          Dashboard
        </Link>
      </div>

      {/* Timeline or empty state */}
      {history && history.iterations.length > 0 ? (
        <IterationTimeline iterations={history.iterations} />
      ) : (
        <NoHistoryState task={task} onRetry={handleRetry} isLoading={isActionLoading} />
      )}

      {/* Retry button for failed tasks */}
      {history && task.status === "failed" && (
        <div className={styles.retrySection}>
          <button
            type="button"
            className={styles.retryButton}
            onClick={handleRetry}
            disabled={isActionLoading}
          >
            {isActionLoading ? (
              <>
                <span className={styles.spinner} />
                Retrying...
              </>
            ) : (
              "Retry Task"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
