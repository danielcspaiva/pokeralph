/**
 * Dashboard view for PokéRalph
 *
 * Initial screen with project overview, task statistics, and task list with filters.
 * Provides quick actions to start battles or create new PRDs.
 */

import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  usePRD,
  useTasks,
  useTaskCounts,
  useNextPendingTask,
  useIsBattleRunning,
  useAppStore,
} from "@/stores/app-store.ts";
import { getPRD, startBattle } from "@/api/client.ts";
import type { Task } from "@pokeralph/core/types";
import styles from "./Dashboard.module.css";

/**
 * Filter options for task list
 */
type TaskFilter = "all" | "pending" | "in_progress" | "completed" | "failed";

/**
 * Filter configuration
 */
interface FilterConfig {
  label: string;
  filter: (task: Task) => boolean;
}

const filterConfigs: Record<TaskFilter, FilterConfig> = {
  all: { label: "All", filter: () => true },
  pending: { label: "Pending", filter: (t) => t.status === "pending" },
  in_progress: { label: "In Progress", filter: (t) => t.status === "in_progress" },
  completed: { label: "Completed", filter: (t) => t.status === "completed" },
  failed: { label: "Failed", filter: (t) => t.status === "failed" },
};

/**
 * Stats card component
 */
interface StatCardProps {
  label: string;
  value: number;
  variant?: "default" | "success" | "warning" | "error";
}

function StatCard({ label, value, variant = "default" }: StatCardProps) {
  return (
    <div className={`${styles.statCard} ${styles[variant]}`}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

/**
 * Task list item component
 */
interface TaskListItemProps {
  task: Task;
}

function TaskListItem({ task }: TaskListItemProps) {
  const statusClass = task.status.replace("_", "");

  return (
    <Link to={`/task/${task.id}`} className={styles.taskItem}>
      <div className={styles.taskInfo}>
        <span className={`${styles.statusDot} ${styles[statusClass]}`} />
        <div className={styles.taskDetails}>
          <span className={styles.taskId}>#{task.priority}</span>
          <span className={styles.taskTitle}>{task.title}</span>
        </div>
      </div>
      <span className={`${styles.statusBadge} ${styles[statusClass]}`}>
        {task.status.replace("_", " ")}
      </span>
    </Link>
  );
}

/**
 * Empty state when no PRD exists
 */
function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          role="img"
          aria-label="Empty clipboard icon"
        >
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M12 11v6" />
          <path d="M9 14h6" />
        </svg>
      </div>
      <h2 className={styles.emptyTitle}>No Project Yet</h2>
      <p className={styles.emptyDescription}>
        Start by describing your idea and Claude will help you create a plan with actionable tasks.
      </p>
      <Link to="/planning" className={styles.ctaButton}>
        Start Planning
      </Link>
    </div>
  );
}

/**
 * Dashboard view component
 */
export function Dashboard() {
  const prd = usePRD();
  const tasks = useTasks();
  const counts = useTaskCounts();
  const nextTask = useNextPendingTask();
  const isBattleRunning = useIsBattleRunning();
  const setPRD = useAppStore((state) => state.setPRD);
  const navigate = useNavigate();

  const [activeFilter, setActiveFilter] = useState<TaskFilter>("all");
  const [isStartingBattle, setIsStartingBattle] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load PRD on mount
  useEffect(() => {
    async function loadPRD() {
      try {
        const data = await getPRD();
        setPRD(data);
      } catch {
        // PRD doesn't exist yet, show empty state
        setPRD(null);
      } finally {
        setIsLoading(false);
      }
    }
    loadPRD();
  }, [setPRD]);

  // Filter tasks based on active filter
  const filteredTasks = tasks.filter(filterConfigs[activeFilter].filter);

  // Handle starting next battle
  const handleStartBattle = async () => {
    if (!nextTask || isBattleRunning) return;

    setIsStartingBattle(true);
    try {
      await startBattle(nextTask.id);
      navigate(`/task/${nextTask.id}`);
    } catch (error) {
      console.error("Failed to start battle:", error);
    } finally {
      setIsStartingBattle(false);
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className={styles.loading}>
        <span className={styles.spinner} />
        <p>Loading project...</p>
      </div>
    );
  }

  // Show empty state if no PRD
  if (!prd) {
    return <EmptyState />;
  }

  return (
    <div className={styles.dashboard}>
      {/* Project header */}
      <div className={styles.header}>
        <div className={styles.projectInfo}>
          <h1 className={styles.projectName}>{prd.name}</h1>
          {prd.description && (
            <p className={styles.projectDescription}>{prd.description}</p>
          )}
        </div>
        <div className={styles.actions}>
          <Link to="/planning" className={styles.secondaryButton}>
            New Idea
          </Link>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleStartBattle}
            disabled={!nextTask || isBattleRunning || isStartingBattle}
          >
            {isStartingBattle
              ? "Starting..."
              : isBattleRunning
                ? "Battle in Progress"
                : nextTask
                  ? "Start Next Battle"
                  : "No Tasks Pending"}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className={styles.stats}>
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Pending" value={counts.pending} />
        <StatCard label="In Progress" value={counts.in_progress} variant="warning" />
        <StatCard label="Completed" value={counts.completed} variant="success" />
        <StatCard label="Failed" value={counts.failed} variant="error" />
      </div>

      {/* Task filters */}
      <div className={styles.filters}>
        {(Object.keys(filterConfigs) as TaskFilter[]).map((filter) => (
          <button
            key={filter}
            type="button"
            className={`${styles.filterButton} ${
              activeFilter === filter ? styles.active : ""
            }`}
            onClick={() => setActiveFilter(filter)}
          >
            {filterConfigs[filter].label}
            {filter !== "all" && (
              <span className={styles.filterCount}>
                {filter === "pending"
                  ? counts.pending
                  : filter === "in_progress"
                    ? counts.in_progress
                    : filter === "completed"
                      ? counts.completed
                      : counts.failed}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className={styles.taskList}>
        {filteredTasks.length > 0 ? (
          filteredTasks.map((task) => <TaskListItem key={task.id} task={task} />)
        ) : (
          <div className={styles.noTasks}>
            <p>No {activeFilter === "all" ? "" : activeFilter.replace("_", " ")} tasks found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
