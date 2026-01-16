/**
 * Sidebar component for PokéRalph
 *
 * Displays task list with status indicators and navigation links.
 * Collapsible on mobile with toggle button.
 */

import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Sparkles, X } from "lucide-react";
import { useTasks, useTaskCounts } from "@/stores/app-store";
import { TaskCard } from "./TaskCard";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onToggle}
          onKeyDown={(e) => e.key === "Escape" && onToggle()}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col shell-plastic lg:static lg:translate-x-0",
          "border-r-4 border-[hsl(var(--shell-darker))] shadow-[4px_0_8px_rgba(0,0,0,0.2)]",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header - raised section */}
        <div className="flex h-14 items-center justify-between px-4 border-b-2 border-[hsl(var(--shell-dark))] bg-gradient-to-b from-[hsl(var(--shell-light))] to-[hsl(var(--shell-bg))]">
          <h2 className="font-bold text-[hsl(var(--shell-fg))]">
            TASKS
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Stats - recessed display */}
        <div className="mx-3 mt-3 p-3 rounded-lg bg-[hsl(var(--shell-darker))] shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-around bg-[hsl(var(--screen-bg))] rounded p-2 shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)]">
            <div className="text-center">
              <div className="text-lg font-bold text-[hsl(var(--success))]">
                {counts.completed}
              </div>
              <div className="text-xs text-[hsl(var(--screen-muted-fg))]">
                Done
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-[hsl(var(--primary))]">
                {counts.in_progress}
              </div>
              <div className="text-xs text-[hsl(var(--screen-muted-fg))]">
                Active
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-[hsl(var(--screen-muted-fg))]">
                {counts.pending}
              </div>
              <div className="text-xs text-[hsl(var(--screen-muted-fg))]">
                Queue
              </div>
            </div>
          </div>
        </div>

        {/* Navigation - raised buttons */}
        <nav className="space-y-2 px-3 py-3">
          <Link
            to="/"
            className={cn(
              "flex items-center gap-3 px-3 py-2 text-sm font-bold rounded-md transition-press",
              location.pathname === "/"
                ? "shell-raised bg-gradient-to-b from-[hsl(var(--primary))] to-[hsl(270_50%_38%)] text-white shadow-[0_3px_0_hsl(270_50%_30%),0_4px_8px_rgba(0,0,0,0.25)]"
                : "shell-raised text-[hsl(var(--shell-fg))] hover:brightness-105 active:shell-pressed"
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            to="/planning"
            className={cn(
              "flex items-center gap-3 px-3 py-2 text-sm font-bold rounded-md transition-press",
              location.pathname === "/planning"
                ? "shell-raised bg-gradient-to-b from-[hsl(var(--primary))] to-[hsl(270_50%_38%)] text-white shadow-[0_3px_0_hsl(270_50%_30%),0_4px_8px_rgba(0,0,0,0.25)]"
                : "shell-raised text-[hsl(var(--shell-fg))] hover:brightness-105 active:shell-pressed"
            )}
          >
            <Sparkles className="h-4 w-4" />
            Planning
          </Link>
        </nav>

        {/* Divider groove */}
        <div className="mx-3 h-1 rounded bg-[hsl(var(--shell-darker))] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]" />

        {/* Task list */}
        <ScrollArea className="flex-1 px-3 py-3">
          {tasks.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-[hsl(var(--shell-fg))] opacity-60">
              No tasks yet
            </p>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </ScrollArea>
      </aside>
    </>
  );
}
