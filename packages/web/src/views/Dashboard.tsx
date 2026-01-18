/**
 * Dashboard view for PokéRalph
 *
 * Initial screen with project overview, task statistics, and task list with filters.
 * Provides quick actions to start battles or create new PRDs.
 */

import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Play, ClipboardList, Loader2, Search, ArrowUpDown, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import {
  usePRD,
  useTasks,
  useTaskCounts,
  useNextPendingTask,
  useIsBattleRunning,
  useAppStore,
} from "@/stores/app-store";
import { getPRD, startBattle, getTopRecommendation } from "@/api/client";
import type { TaskRecommendation } from "@/api/client";
import type { Task } from "@pokeralph/core/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Filter options for task list
 */
type TaskFilter = "all" | "pending" | "in_progress" | "completed" | "failed";

/**
 * Sort options per spec (04-dashboard.md lines 385-392)
 */
type TaskSort = "priority_asc" | "priority_desc" | "status" | "created_asc" | "created_desc" | "name";

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
 * Sort configuration per spec (04-dashboard.md lines 385-392)
 */
interface SortConfig {
  label: string;
  compare: (a: Task, b: Task) => number;
}

const sortConfigs: Record<TaskSort, SortConfig> = {
  priority_asc: {
    label: "Priority (Low → High)",
    compare: (a, b) => a.priority - b.priority,
  },
  priority_desc: {
    label: "Priority (High → Low)",
    compare: (a, b) => b.priority - a.priority,
  },
  status: {
    label: "Status",
    compare: (a, b) => {
      const order = ["in_progress", "pending", "paused", "completed", "failed"];
      return order.indexOf(a.status) - order.indexOf(b.status);
    },
  },
  created_asc: {
    label: "Oldest First",
    compare: (a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  },
  created_desc: {
    label: "Newest First",
    compare: (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  },
  name: {
    label: "Name (A → Z)",
    compare: (a, b) => a.title.localeCompare(b.title),
  },
};

/**
 * Local storage key for persisting dashboard preferences per spec (04-dashboard.md line 51)
 */
const DASHBOARD_PREFS_KEY = "pokeralph-dashboard-prefs";

/**
 * Dashboard preferences interface
 */
interface DashboardPrefs {
  filter: TaskFilter;
  sort: TaskSort;
  search: string;
}

/**
 * Load dashboard preferences from localStorage
 */
function loadDashboardPrefs(): DashboardPrefs {
  try {
    const stored = localStorage.getItem(DASHBOARD_PREFS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        filter: parsed.filter ?? "all",
        sort: parsed.sort ?? "priority_asc",
        search: "", // Don't persist search
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { filter: "all", sort: "priority_asc", search: "" };
}

/**
 * Save dashboard preferences to localStorage
 */
function saveDashboardPrefs(prefs: Omit<DashboardPrefs, "search">): void {
  try {
    localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}

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
 * Recommendation card component per spec (04-dashboard.md lines 599-622)
 */
interface RecommendationCardProps {
  recommendation: TaskRecommendation;
  onStartBattle: (mode: "hitl" | "yolo") => void;
  isStarting: boolean;
  isBattleRunning: boolean;
}

function RecommendationCard({
  recommendation,
  onStartBattle,
  isStarting,
  isBattleRunning,
}: RecommendationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { task, score, reasons, suggestedMode, risk } = recommendation;

  // Risk indicator dots per spec (04-dashboard.md lines 875-884)
  const riskDots = {
    low: (
      <span className="inline-flex gap-0.5">
        <span className="w-2 h-2 rounded-full bg-[hsl(var(--success))]" />
        <span className="w-2 h-2 rounded-full bg-[hsl(var(--screen-muted))]" />
        <span className="w-2 h-2 rounded-full bg-[hsl(var(--screen-muted))]" />
      </span>
    ),
    medium: (
      <span className="inline-flex gap-0.5">
        <span className="w-2 h-2 rounded-full bg-[hsl(var(--primary))]" />
        <span className="w-2 h-2 rounded-full bg-[hsl(var(--primary))]" />
        <span className="w-2 h-2 rounded-full bg-[hsl(var(--screen-muted))]" />
      </span>
    ),
    high: (
      <span className="inline-flex gap-0.5">
        <span className="w-2 h-2 rounded-full bg-[hsl(var(--destructive))]" />
        <span className="w-2 h-2 rounded-full bg-[hsl(var(--destructive))]" />
        <span className="w-2 h-2 rounded-full bg-[hsl(var(--destructive))]" />
      </span>
    ),
  };

  return (
    <Card className="border-[hsl(var(--primary))] border-2">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" />
            <span className="text-sm font-medium text-[hsl(var(--primary))]">
              Recommended Next Task
            </span>
          </div>
          <Badge variant="outline" className="text-xs">
            Score: {score}
          </Badge>
        </div>

        {/* Task info */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[hsl(var(--screen-fg))]">{task.title}</span>
            <span className="text-xs text-[hsl(var(--screen-muted-fg))]">#{task.id}</span>
          </div>
          <p className="text-sm text-[hsl(var(--screen-muted-fg))] line-clamp-2">
            {task.description}
          </p>
        </div>

        {/* Risk and mode */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[hsl(var(--screen-muted-fg))]">Risk:</span>
            {riskDots[risk.level]}
            <span className={cn(
              "capitalize",
              risk.level === "low" && "text-[hsl(var(--success))]",
              risk.level === "medium" && "text-[hsl(var(--primary))]",
              risk.level === "high" && "text-[hsl(var(--destructive))]"
            )}>
              {risk.level}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[hsl(var(--screen-muted-fg))]">Suggested:</span>
            <Badge variant={suggestedMode === "yolo" ? "default" : "secondary"} className="text-xs py-0">
              {suggestedMode.toUpperCase()}
            </Badge>
          </div>
        </div>

        {/* Reasons (expandable) */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-[hsl(var(--screen-muted-fg))] hover:text-[hsl(var(--screen-fg))] transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Hide reasons" : "Why this task?"}
        </button>

        {expanded && (
          <div className="space-y-1 text-xs pl-4 border-l-2 border-[hsl(var(--screen-border))]">
            {reasons.map((reason) => (
              <div key={`${reason.type}-${reason.label}`} className="flex items-center justify-between">
                <span className="text-[hsl(var(--screen-muted-fg))]">
                  {reason.impact > 0 ? "+" : ""}{reason.label}
                </span>
                <span className={cn(
                  "font-mono",
                  reason.impact > 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--destructive))]"
                )}>
                  {reason.impact > 0 ? "+" : ""}{reason.impact}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={() => onStartBattle(suggestedMode)}
            disabled={isBattleRunning || isStarting}
            className="flex-1"
          >
            {isStarting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Battle ({suggestedMode.toUpperCase()})
              </>
            )}
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/task/${task.id}`}>Details</Link>
          </Button>
        </div>
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

  // Load preferences from localStorage per spec (04-dashboard.md line 51)
  const [prefs] = useState(() => loadDashboardPrefs());
  const [activeFilter, setActiveFilter] = useState<TaskFilter>(prefs.filter);
  const [activeSort, setActiveSort] = useState<TaskSort>(prefs.sort);
  const [searchQuery, setSearchQuery] = useState("");
  const [isStartingBattle, setIsStartingBattle] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [recommendation, setRecommendation] = useState<TaskRecommendation | null>(null);

  // Load PRD and recommendation on mount
  useEffect(() => {
    async function loadData() {
      try {
        const data = await getPRD();
        setPRD(data);

        // Fetch recommendation after PRD loads
        try {
          const recResponse = await getTopRecommendation();
          setRecommendation(recResponse.recommendation);
        } catch {
          // Recommendation fetch failed, just continue without it
          setRecommendation(null);
        }
      } catch {
        // PRD doesn't exist yet, show empty state
        setPRD(null);
        setRecommendation(null);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [setPRD]);

  // Persist filter/sort preferences per spec (04-dashboard.md line 51)
  useEffect(() => {
    saveDashboardPrefs({ filter: activeFilter, sort: activeSort });
  }, [activeFilter, activeSort]);

  // Filter, search, and sort tasks per spec (04-dashboard.md US-DB-4)
  const filteredTasks = useMemo(() => {
    let result = tasks.filter(filterConfigs[activeFilter].filter);

    // Search by title/description per spec (04-dashboard.md line 50)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
      );
    }

    // Sort per spec (04-dashboard.md lines 385-392)
    result = [...result].sort(sortConfigs[activeSort].compare);

    return result;
  }, [tasks, activeFilter, searchQuery, activeSort]);

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

  // Handle starting recommended battle with specific mode
  const handleStartRecommendedBattle = async (mode: "hitl" | "yolo") => {
    if (!recommendation || isBattleRunning) return;

    setIsStartingBattle(true);
    try {
      await startBattle(recommendation.task.id, mode);
      navigate(`/task/${recommendation.task.id}`);
    } catch (error) {
      console.error("Failed to start recommended battle:", error);
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

      {/* Recommendation card per spec (04-dashboard.md lines 521-623) */}
      {recommendation && !isBattleRunning && (
        <RecommendationCard
          recommendation={recommendation}
          onStartBattle={handleStartRecommendedBattle}
          isStarting={isStartingBattle}
          isBattleRunning={isBattleRunning}
        />
      )}

      {/* Task filters, search, and sort per spec (04-dashboard.md lines 213-216) */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Status filter tabs */}
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

          {/* Sort selector and search per spec (04-dashboard.md lines 49-50) */}
          <div className="flex gap-2">
            {/* Sort dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowUpDown className="h-4 w-4" />
                  <span className="hidden sm:inline">{sortConfigs[activeSort].label}</span>
                  <span className="sm:hidden">Sort</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={activeSort}
                  onValueChange={(v) => setActiveSort(v as TaskSort)}
                >
                  {(Object.keys(sortConfigs) as TaskSort[]).map((sort) => (
                    <DropdownMenuRadioItem key={sort} value={sort}>
                      {sortConfigs[sort].label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Search input per spec (04-dashboard.md line 50) */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--screen-muted-fg))]" />
              <Input
                type="search"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-40 pl-8 sm:w-56"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {filteredTasks.length > 0 ? (
          filteredTasks.map((task) => <TaskListItem key={task.id} task={task} />)
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-[hsl(var(--screen-muted-fg))]">
              {searchQuery.trim() ? (
                <>
                  No tasks match "{searchQuery}"
                  <Button
                    variant="link"
                    className="ml-1 p-0 h-auto"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear search
                  </Button>
                </>
              ) : (
                `No ${activeFilter === "all" ? "tasks" : filterConfigs[activeFilter].label.toLowerCase()} found.`
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
