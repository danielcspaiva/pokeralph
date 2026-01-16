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
import { Separator } from "@/components/ui/separator";
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
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))] transition-transform duration-300 lg:static lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between px-4">
          <h2 className="text-lg font-semibold text-[hsl(var(--sidebar-foreground))]">
            Tasks
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

        <Separator />

        {/* Stats */}
        <div className="flex items-center justify-around px-4 py-3">
          <div className="text-center">
            <div className="text-xl font-bold text-[hsl(var(--success))]">
              {counts.completed}
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              Done
            </div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-[hsl(var(--warning))]">
              {counts.in_progress}
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              Active
            </div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-[hsl(var(--muted-foreground))]">
              {counts.pending}
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              Pending
            </div>
          </div>
        </div>

        <Separator />

        {/* Navigation */}
        <nav className="space-y-1 px-3 py-2">
          <Link
            to="/"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              location.pathname === "/"
                ? "bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))]"
                : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]"
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            to="/planning"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              location.pathname === "/planning"
                ? "bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))]"
                : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]"
            )}
          >
            <Sparkles className="h-4 w-4" />
            Planning
          </Link>
        </nav>

        <Separator />

        {/* Task list */}
        <ScrollArea className="flex-1 px-3 py-2">
          {tasks.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
              No tasks yet. Start planning!
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
