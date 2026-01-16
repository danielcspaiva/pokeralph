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
  variant: "default" | "secondary" | "success" | "warning" | "destructive";
  dotClass: string;
}

/**
 * Default status config for unknown statuses
 */
const defaultStatusConfig: StatusConfig = {
  label: "Pending",
  variant: "secondary",
  dotClass: "bg-[hsl(var(--screen-muted))]",
};

/**
 * Status indicator colors mapping
 */
const statusConfig: Record<string, StatusConfig> = {
  pending: {
    label: "Pending",
    variant: "secondary",
    dotClass: "bg-[hsl(var(--screen-muted-fg))]",
  },
  planning: {
    label: "Planning",
    variant: "secondary",
    dotClass: "bg-blue-400",
  },
  in_progress: {
    label: "Active",
    variant: "default",
    dotClass: "bg-[hsl(var(--primary))]",
  },
  paused: {
    label: "Paused",
    variant: "warning",
    dotClass: "bg-[hsl(var(--warning))]",
  },
  completed: {
    label: "Done",
    variant: "success",
    dotClass: "bg-[hsl(var(--success))]",
  },
  failed: {
    label: "Failed",
    variant: "destructive",
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
      <Card className="p-3 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-2">
          {/* Status indicator */}
          <div
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full",
              config.dotClass
            )}
          />
          <span className="text-xs text-[hsl(var(--screen-muted-fg))]">
            #{task.priority}
          </span>
        </div>
        <h3 className="mt-1 line-clamp-2 text-sm font-medium text-[hsl(var(--screen-fg))]">{task.title}</h3>
        <div className="mt-2 flex items-center justify-between">
          <Badge variant={config.variant} className="text-xs">
            {config.label}
          </Badge>
          {task.acceptanceCriteria.length > 0 && (
            <span className="text-xs text-[hsl(var(--screen-muted-fg))]">
              {task.acceptanceCriteria.length} AC
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
