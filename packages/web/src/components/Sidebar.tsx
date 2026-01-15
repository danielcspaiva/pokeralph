/**
 * Sidebar component for PokéRalph
 *
 * Displays task list with status indicators and navigation links.
 * Collapsible on mobile with toggle button.
 */

import { Link, useLocation } from "react-router-dom";
import { useTasks, useTaskCounts } from "@/stores/app-store.ts";
import { TaskCard } from "./TaskCard.tsx";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  /** Whether the sidebar is open */
  isOpen: boolean;
  /** Callback when sidebar toggle is clicked */
  onToggle: () => void;
}

/**
 * Navigation sidebar with task list
 */
export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const tasks = useTasks();
  const counts = useTaskCounts();
  const location = useLocation();

  const handleOverlayKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onToggle();
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className={styles.overlay}
          onClick={onToggle}
          onKeyDown={handleOverlayKeyDown}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
        />
      )}

      <aside className={`${styles.sidebar} ${isOpen ? styles.open : styles.closed}`}>
        <div className={styles.header}>
          <h2 className={styles.title}>Tasks</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onToggle}
            aria-label="Close sidebar"
          >
            ×
          </button>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{counts.completed}</span>
            <span className={styles.statLabel}>Done</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{counts.in_progress}</span>
            <span className={styles.statLabel}>In Progress</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{counts.pending}</span>
            <span className={styles.statLabel}>Pending</span>
          </div>
        </div>

        <nav className={styles.nav}>
          <Link
            to="/"
            className={`${styles.navLink} ${location.pathname === "/" ? styles.active : ""}`}
          >
            Dashboard
          </Link>
          <Link
            to="/planning"
            className={`${styles.navLink} ${location.pathname === "/planning" ? styles.active : ""}`}
          >
            Planning
          </Link>
        </nav>

        <div className={styles.taskList}>
          {tasks.length === 0 ? (
            <p className={styles.empty}>No tasks yet. Start planning!</p>
          ) : (
            tasks.map((task) => <TaskCard key={task.id} task={task} />)
          )}
        </div>
      </aside>
    </>
  );
}
