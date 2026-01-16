/**
 * Dashboard view for PokéRalph
 *
 * Initial screen with project overview, task statistics, and task list with filters.
 * Provides quick actions to start battles or create new PRDs.
 */

import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Play, ClipboardList, Loader2 } from "lucide-react";
import {
  usePRD,
  useTasks,
  useTaskCounts,
  useNextPendingTask,
  useIsBattleRunning,
  useAppStore,
} from "@/stores/app-store";
import { getPRD, startBattle } from "@/api/client";
import type { Task } from "@pokeralph/core/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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
  in_progress: {
    label: "In Progress",
    filter: (t) => t.status === "in_progress",
  },
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
  const colorClass = {
    default: "text-[hsl(var(--foreground))]",
    success: "text-[hsl(var(--success))]",
    warning: "text-[hsl(var(--warning))]",
    error: "text-[hsl(var(--destructive))]",
  }[variant];

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center p-4">
        <span className={cn("text-3xl font-bold", colorClass)}>{value}</span>
        <span className="text-sm text-[hsl(var(--muted-foreground))]">
          {label}
        </span>
      </CardContent>
    </Card>
  );
}

/**
 * Task list item component
 */
interface TaskListItemProps {
  task: Task;
}

function TaskListItem({ task }: TaskListItemProps) {
  const statusToBadgeVariant: Record<string, string> = {
    pending: "pending",
    planning: "planning",
    in_progress: "in_progress",
    paused: "paused",
    completed: "completed",
    failed: "failed",
  };
  const statusVariant = statusToBadgeVariant[task.status] ?? "pending";
  const dotClassMap: Record<string, string> = {
    pending: "bg-[hsl(var(--muted-foreground))]",
    planning: "bg-blue-500",
    in_progress: "bg-[hsl(var(--warning))]",
    paused: "bg-orange-500",
    completed: "bg-[hsl(var(--success))]",
    failed: "bg-[hsl(var(--destructive))]",
  };
  const dotClass = dotClassMap[task.status] || "bg-[hsl(var(--muted-foreground))]";

  return (
    <Link
      to={`/task/${task.id}`}
      className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 transition-colors hover:bg-[hsl(var(--accent))]"
    >
      <div className="flex items-center gap-3">
        <span className={cn("h-2 w-2 rounded-full", dotClass)} />
        <div>
          <span className="mr-2 text-sm text-[hsl(var(--muted-foreground))]">
            #{task.priority}
          </span>
          <span className="font-medium">{task.title}</span>
        </div>
      </div>
      <Badge variant={statusVariant as "pending" | "planning" | "in_progress" | "paused" | "completed" | "failed"}>
        {task.status.replace("_", " ")}
      </Badge>
    </Link>
  );
}

/**
 * Empty state when no PRD exists
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-8 sm:py-16">
      <div className="mb-4 bg-[hsl(var(--muted))] p-4 sm:mb-6 sm:p-6">
        <ClipboardList className="h-8 w-8 text-[hsl(var(--muted-foreground))] sm:h-12 sm:w-12" />
      </div>
      <h2 className="mb-2 text-center text-lg font-semibold sm:text-2xl">No Project Yet</h2>
      <p className="mb-4 max-w-md text-center text-sm text-[hsl(var(--muted-foreground))] sm:mb-6 sm:text-base">
        Start by describing your idea and Claude will help you create a plan
        with actionable tasks.
      </p>
      <Button asChild size="lg">
        <Link to="/planning">
          <Plus className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
          <span className="text-xs sm:text-sm">Start Planning</span>
        </Link>
      </Button>
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
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="mb-4 h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
        <p className="text-[hsl(var(--muted-foreground))]">Loading project...</p>
      </div>
    );
  }

  // Show empty state if no PRD
  if (!prd) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6">
      {/* Project header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{prd.name}</h1>
          {prd.description && (
            <p className="mt-1 text-[hsl(var(--muted-foreground))]">
              {prd.description}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/planning">
              <Plus className="mr-2 h-4 w-4" />
              New Idea
            </Link>
          </Button>
          <Button
            onClick={handleStartBattle}
            disabled={!nextTask || isBattleRunning || isStartingBattle}
          >
            {isStartingBattle ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : isBattleRunning ? (
              "Battle in Progress"
            ) : nextTask ? (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Next Battle
              </>
            ) : (
              "No Tasks Pending"
            )}
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Pending" value={counts.pending} />
        <StatCard label="In Progress" value={counts.in_progress} variant="warning" />
        <StatCard label="Completed" value={counts.completed} variant="success" />
        <StatCard label="Failed" value={counts.failed} variant="error" />
      </div>

      {/* Task filters */}
      <Tabs
        value={activeFilter}
        onValueChange={(v) => setActiveFilter(v as TaskFilter)}
      >
        <TabsList>
          {(Object.keys(filterConfigs) as TaskFilter[]).map((filter) => (
            <TabsTrigger key={filter} value={filter} className="gap-2">
              {filterConfigs[filter].label}
              {filter !== "all" && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                  {filter === "pending"
                    ? counts.pending
                    : filter === "in_progress"
                      ? counts.in_progress
                      : filter === "completed"
                        ? counts.completed
                        : counts.failed}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Task list */}
      <div className="space-y-2">
        {filteredTasks.length > 0 ? (
          filteredTasks.map((task) => <TaskListItem key={task.id} task={task} />)
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-[hsl(var(--muted-foreground))]">
              No {activeFilter === "all" ? "" : activeFilter.replace("_", " ")}{" "}
              tasks found.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
