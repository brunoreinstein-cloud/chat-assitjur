import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const notificationBadgeVariants = cva(
  "pointer-events-none absolute rounded-full",
  {
    variants: {
      variant: {
        default: "bg-primary",
        destructive: "bg-destructive",
        success: "bg-confidence-high",
      },
      size: {
        sm: "",
        md: "",
      },
      mode: {
        dot: "",
        count:
          "flex items-center justify-center font-bold text-white leading-none",
      },
    },
    compoundVariants: [
      { mode: "dot", size: "sm", className: "-top-0.5 -right-0.5 h-1.5 w-1.5" },
      { mode: "dot", size: "md", className: "-top-1 -right-1 h-2 w-2" },
      {
        mode: "count",
        size: "sm",
        className: "-top-1 -right-1 h-3.5 min-w-[14px] px-1 text-[9px]",
      },
      {
        mode: "count",
        size: "md",
        className: "-top-1.5 -right-1.5 h-[18px] min-w-[18px] px-1 text-[10px]",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "md",
      mode: "dot",
    },
  }
);

export interface NotificationBadgeProps
  extends VariantProps<typeof notificationBadgeVariants> {
  /** Número a exibir. Se > 0, usa modo count. Se 0 ou undefined, usa modo dot. */
  count?: number;
  /** Controla visibilidade do badge. Default: true. */
  show?: boolean;
  /** Valor máximo exibido. Default: 99 (mostra "99+"). */
  maxCount?: number;
  /** Animar com pulse para chamar atenção. */
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}

function NotificationBadge({
  count,
  show = true,
  maxCount = 99,
  pulse = false,
  variant,
  size,
  className,
  children,
}: NotificationBadgeProps) {
  if (!show) {
    return <>{children}</>;
  }

  const mode = count && count > 0 ? "count" : "dot";
  const displayCount =
    mode === "count" && count != null
      ? count > maxCount
        ? `${maxCount}+`
        : String(count)
      : null;

  return (
    <span className="relative inline-flex">
      {children}
      <span
        className={cn(
          notificationBadgeVariants({ variant, size, mode }),
          pulse && "animate-pulse",
          className
        )}
      >
        {displayCount}
      </span>
    </span>
  );
}

export { NotificationBadge, notificationBadgeVariants };
