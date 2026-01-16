import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-3 w-full overflow-hidden bg-[hsl(var(--muted))] border-2 border-[hsl(var(--border))]",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-[hsl(var(--primary))]"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

/**
 * Pokeball indicator - shows progress as a row of pokeballs
 * Like the party indicator in Pokemon battle screens
 */
interface PokeballIndicatorProps {
  /** Total number of pokeballs to show */
  total: number;
  /** Number of filled/completed pokeballs */
  filled: number;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Custom class name */
  className?: string;
  /** Variant for filled pokeballs */
  variant?: "default" | "success" | "warning" | "error";
}

function PokeballIndicator({
  total,
  filled,
  size = "md",
  className,
  variant = "default",
}: PokeballIndicatorProps) {
  const sizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  const filledColors = {
    default: "from-[hsl(3,74%,55%)] via-[hsl(var(--border))] to-[hsl(0,0%,95%)]",
    success: "from-[hsl(120,38%,46%)] via-[hsl(var(--border))] to-[hsl(0,0%,95%)]",
    warning: "from-[hsl(45,94%,58%)] via-[hsl(var(--border))] to-[hsl(0,0%,95%)]",
    error: "from-[hsl(3,74%,55%)] via-[hsl(var(--border))] to-[hsl(0,0%,95%)]",
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {Array.from({ length: total }).map((_, index) => {
        const isFilled = index < filled;
        return (
          <div
            key={`pokeball-${index}`}
            className={cn(
              sizeClasses[size],
              "rounded-full border-2 border-[hsl(var(--border))]",
              isFilled
                ? `bg-gradient-to-b ${filledColors[variant]}`
                : "bg-gradient-to-b from-[hsl(0,0%,85%)] via-[hsl(var(--border))] to-[hsl(0,0%,95%)] opacity-40"
            )}
            style={{
              backgroundSize: "100% 100%",
              backgroundPosition: "center",
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * HP Bar style progress indicator
 * Like the health bars in Pokemon battles
 */
interface HPBarProps {
  /** Current value (0-100) */
  value: number;
  /** Label to show (e.g., "HP") */
  label?: string;
  /** Show percentage text */
  showValue?: boolean;
  /** Custom class name */
  className?: string;
}

function HPBar({ value, label, showValue = false, className }: HPBarProps) {
  // Color based on value
  const getBarColor = () => {
    if (value > 50) return "bg-[hsl(120,38%,46%)]"; // Green
    if (value > 20) return "bg-[hsl(45,94%,58%)]"; // Yellow
    return "bg-[hsl(3,74%,55%)]"; // Red
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {label && (
        <span className="text-xs font-bold text-[hsl(var(--foreground))]">
          {label}
        </span>
      )}
      <div className="relative flex-1 h-3 bg-[hsl(var(--muted))] border-2 border-[hsl(var(--border))]">
        <div
          className={cn("h-full", getBarColor())}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      {showValue && (
        <span className="text-xs font-mono text-[hsl(var(--muted-foreground))]">
          {Math.round(value)}%
        </span>
      )}
    </div>
  );
}

export { Progress, PokeballIndicator, HPBar };
