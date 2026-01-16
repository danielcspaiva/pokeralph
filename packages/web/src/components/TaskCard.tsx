/**
 * TaskCard component for PokéRalph
 *
 * Displays a task in the sidebar with status indicator.
 * Visual status: pending (gray), in_progress (yellow), completed (green), failed (red)
 */

import { Link } from "react-router-dom";
import type { Task } from "@pokeralph/core/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TaskCardProps {
  /** Task to display */
  task: Task;
}

/**
 * Status config type
 */
interface StatusConfig {
  label: string;
  variant:
    | "pending"
    | "planning"
    | "in_progress"
    | "paused"
    | "completed"
    | "failed";
  dotClass: string;
}

/**
 * Default status config for unknown statuses
 */
const defaultStatusConfig: StatusConfig = {
  label: "Pending",
  variant: "pending",
  dotClass: "bg-[hsl(var(--muted-foreground))]",
};

/**
 * Status indicator colors mapping
 */
const statusConfig: Record<string, StatusConfig> = {
  pending: {
    label: "Pending",
    variant: "pending",
    dotClass: "bg-[hsl(var(--muted-foreground))]",
  },
  planning: {
    label: "Planning",
    variant: "planning",
    dotClass: "bg-blue-500",
  },
  in_progress: {
    label: "In Progress",
    variant: "in_progress",
    dotClass: "bg-[hsl(var(--warning))]",
  },
  paused: {
    label: "Paused",
    variant: "paused",
    dotClass: "bg-orange-500",
  },
  completed: {
    label: "Completed",
    variant: "completed",
    dotClass: "bg-[hsl(var(--success))]",
  },
  failed: {
    label: "Failed",
    variant: "failed",
    dotClass: "bg-[hsl(var(--destructive))]",
  },
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
    <Link to={`/task/${task.id}`} className="block">
      <Card className="p-3 transition-colors hover:bg-[hsl(var(--accent))]">
        <div className="flex items-center gap-2">
          <span
            className={cn("h-2 w-2 shrink-0 rounded-full", config.dotClass)}
          />
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            #{task.priority}
          </span>
        </div>
        <h3 className="mt-1 line-clamp-2 text-sm font-medium">{task.title}</h3>
        <div className="mt-2 flex items-center justify-between">
          <Badge variant={config.variant} className="text-xs">
            {config.label}
          </Badge>
          {task.acceptanceCriteria.length > 0 && (
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              {task.acceptanceCriteria.length} criteria
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
