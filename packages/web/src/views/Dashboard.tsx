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
    label: "Active",
    filter: (t) => t.status === "in_progress",
  },
  completed: { label: "Done", filter: (t) => t.status === "completed" },
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
    default: "text-[hsl(var(--screen-fg))]",
    success: "text-[hsl(var(--success))]",
    warning: "text-[hsl(var(--primary))]",
    error: "text-[hsl(var(--destructive))]",
  }[variant];

  return (
    <div className="bg-[hsl(var(--screen-card))] border border-[hsl(var(--screen-border))] rounded-lg p-4 text-center shadow-sm">
      <span className={cn("text-2xl font-bold block", colorClass)}>{value}</span>
      <span className="text-xs text-[hsl(var(--screen-muted-fg))]">
        {label}
      </span>
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
  const statusToBadgeVariant: Record<string, string> = {
    pending: "secondary",
    planning: "secondary",
    in_progress: "default",
    paused: "warning",
    completed: "success",
    failed: "destructive",
  };
  const statusVariant = statusToBadgeVariant[task.status] ?? "secondary";
  
  // Status indicator colors
  const statusColorMap: Record<string, string> = {
    pending: "bg-[hsl(var(--screen-muted))]",
    planning: "bg-blue-400",
    in_progress: "bg-[hsl(var(--primary))]",
    paused: "bg-[hsl(var(--warning))]",
    completed: "bg-[hsl(var(--success))]",
    failed: "bg-[hsl(var(--destructive))]",
  };
  const statusColor = statusColorMap[task.status] || statusColorMap.pending;

  const statusLabels: Record<string, string> = {
    pending: "Pending",
    planning: "Planning",
    in_progress: "Active",
    paused: "Paused",
    completed: "Done",
    failed: "Failed",
  };

  return (
    <Link
      to={`/task/${task.id}`}
      className="flex items-center justify-between bg-[hsl(var(--screen-card))] border border-[hsl(var(--screen-border))] rounded-lg p-4 hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-3">
        {/* Status indicator */}
        <div className={cn("w-3 h-3 rounded-full", statusColor)} />
        <div>
          <span className="mr-2 text-xs text-[hsl(var(--screen-muted-fg))]">
            #{task.priority}
          </span>
          <span className="font-bold text-sm text-[hsl(var(--screen-fg))]">{task.title}</span>
        </div>
      </div>
      <Badge variant={statusVariant as "default" | "secondary" | "success" | "warning" | "destructive"}>
        {statusLabels[task.status] || task.status}
      </Badge>
    </Link>
  );
}

/**
 * Empty state when no PRD exists
 */
function EmptyState() {
  return (
    <Card className="max-w-lg mx-auto">
      <CardContent className="text-center py-12 px-6">
        <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-full bg-[hsl(var(--screen-muted))]">
          <ClipboardList className="h-8 w-8 text-[hsl(var(--screen-muted-fg))]" />
        </div>
        <h2 className="mb-3 text-lg font-bold text-[hsl(var(--screen-fg))]">No tasks yet</h2>
        <p className="mb-6 text-[hsl(var(--screen-muted-fg))]">
          Create a PRD to get started with your project.
        </p>
        <Button asChild size="lg">
          <Link to="/planning">
            <Plus className="mr-2 h-4 w-4" />
            Create PRD
          </Link>
        </Button>
      </CardContent>
    </Card>
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
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-bold text-[hsl(var(--screen-fg))]">{prd.name}</h1>
              {prd.description && (
                <p className="mt-1 text-sm text-[hsl(var(--screen-muted-fg))]">
                  {prd.description}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link to="/planning">
                  <Plus className="mr-2 h-4 w-4" />
                  New Task
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
                  "Running..."
                ) : nextTask ? (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Start Task
                  </>
                ) : (
                  "No Tasks"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Pending" value={counts.pending} />
        <StatCard label="Active" value={counts.in_progress} variant="warning" />
        <StatCard label="Done" value={counts.completed} variant="success" />
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
            <CardContent className="py-8 text-center text-[hsl(var(--screen-muted-fg))]">
              No {activeFilter === "all" ? "tasks" : filterConfigs[activeFilter].label.toLowerCase()} found.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
