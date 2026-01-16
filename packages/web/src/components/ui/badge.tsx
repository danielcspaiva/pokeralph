import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow hover:bg-[hsl(var(--primary))]/80",
        secondary:
          "border-transparent bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--secondary))]/80",
        destructive:
          "border-transparent bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] shadow hover:bg-[hsl(var(--destructive))]/80",
        success:
          "border-transparent bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] shadow hover:bg-[hsl(var(--success))]/80",
        warning:
          "border-transparent bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] shadow hover:bg-[hsl(var(--warning))]/80",
        outline: "text-[hsl(var(--foreground))]",
        // Task status variants
        pending:
          "border-transparent bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
        planning:
          "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
        in_progress:
          "border-transparent bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]",
        paused:
          "border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
        completed:
          "border-transparent bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]",
        failed:
          "border-transparent bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
