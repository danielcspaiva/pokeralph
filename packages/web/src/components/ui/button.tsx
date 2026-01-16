import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Default - clean modern button for screen area
        default:
          "rounded-md border-2 border-[hsl(var(--screen-border))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm hover:brightness-110 active:brightness-95",
        // Shell - 3D raised button for sidebar/header
        shell:
          "rounded-md border-2 border-[hsl(var(--shell-border))] bg-gradient-to-b from-[hsl(var(--shell-light))] to-[hsl(var(--shell-bg))] text-[hsl(var(--shell-fg))] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_3px_0_hsl(var(--shell-darker)),0_4px_6px_rgba(0,0,0,0.2)] hover:brightness-105 active:translate-y-[2px] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_1px_0_hsl(var(--shell-darker))]",
        // Battle - Game Boy green style for battle view
        battle:
          "rounded-none border-3 border-[hsl(var(--battle-fg))] bg-[hsl(120_35%_29%)] text-[hsl(72_85%_75%)] shadow-[3px_3px_0_hsl(var(--battle-fg))] hover:brightness-110 active:translate-y-[2px] active:shadow-[1px_1px_0_hsl(var(--battle-fg))]",
        destructive:
          "rounded-md border-2 border-[hsl(var(--screen-border))] bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] shadow-sm hover:brightness-110",
        outline:
          "rounded-md border-2 border-[hsl(var(--screen-border))] bg-[hsl(var(--screen-card))] text-[hsl(var(--screen-fg))] shadow-sm hover:bg-[hsl(var(--screen-muted))]",
        secondary:
          "rounded-md border-2 border-[hsl(var(--screen-border))] bg-[hsl(var(--screen-muted))] text-[hsl(var(--screen-fg))] shadow-sm hover:brightness-95",
        ghost:
          "rounded-md border-2 border-transparent hover:bg-[hsl(var(--screen-muted))] hover:border-[hsl(var(--screen-border))]",
        link: 
          "border-transparent text-[hsl(var(--primary))] underline-offset-4 hover:underline",
        success:
          "rounded-md border-2 border-[hsl(var(--screen-border))] bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] shadow-sm hover:brightness-110",
        warning:
          "rounded-md border-2 border-[hsl(var(--screen-border))] bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] shadow-sm hover:brightness-110",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
