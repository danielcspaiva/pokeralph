/**
 * TaskCard component for PokéRalph
 *
 * Displays a task in the sidebar with status indicator.
 * Visual status: pending (gray), in_progress (yellow), completed (green), failed (red)
 */

import { Link } from "react-router-dom";
import type { Task } from "@pokeralph/core";
import styles from "./TaskCard.module.css";

interface TaskCardProps {
  /** Task to display */
  task: Task;
}

/**
 * Status config type
 */
interface StatusConfig {
  label: string;
  className: string;
}

/**
 * Default status config for unknown statuses
 */
const defaultStatusConfig: StatusConfig = {
  label: "Pending",
  className: "pending",
};

/**
 * Status indicator colors mapping
 */
const statusConfig: Record<string, StatusConfig> = {
  pending: { label: "Pending", className: "pending" },
  planning: { label: "Planning", className: "planning" },
  in_progress: { label: "In Progress", className: "inProgress" },
  paused: { label: "Paused", className: "paused" },
  completed: { label: "Completed", className: "completed" },
  failed: { label: "Failed", className: "failed" },
};

/**
 * Get status config for a task status
 */
function getStatusConfig(status: string): StatusConfig {
  return statusConfig[status] ?? defaultStatusConfig;
}

/**
 * Task card displayed in the sidebar
 */
export function TaskCard({ task }: TaskCardProps) {
  const config = getStatusConfig(task.status);

  return (
    <Link to={`/task/${task.id}`} className={styles.card}>
      <div className={styles.header}>
        <span className={`${styles.status} ${styles[config.className]}`} />
        <span className={styles.priority}>#{task.priority}</span>
      </div>
      <h3 className={styles.title}>{task.title}</h3>
      <div className={styles.footer}>
        <span className={`${styles.badge} ${styles[config.className]}`}>
          {config.label}
        </span>
        {task.acceptanceCriteria.length > 0 && (
          <span className={styles.criteria}>
            {task.acceptanceCriteria.length} criteria
          </span>
        )}
      </div>
    </Link>
  );
}
