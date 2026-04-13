"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, CircleAlertIcon, LoaderIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export type StepStatus = "pending" | "active" | "completed" | "error";

// ─── Indicator variants ─────────────────────────────────────────────────────

const stepIndicatorVariants = cva(
  "flex shrink-0 items-center justify-center rounded-full font-medium text-xs transition-colors",
  {
    variants: {
      status: {
        pending: "bg-muted text-muted-foreground",
        active: "bg-primary text-primary-foreground",
        completed: "bg-confidence-high text-white",
        error: "bg-confidence-low text-white",
      },
      size: {
        sm: "h-6 w-6",
        md: "h-8 w-8",
        lg: "h-10 w-10",
      },
    },
    defaultVariants: {
      status: "pending",
      size: "md",
    },
  }
);

// ─── StepperRoot ────────────────────────────────────────────────────────────

interface StepperRootProps extends React.OlHTMLAttributes<HTMLOListElement> {
  /** Orientação do stepper. Default: "vertical". */
  orientation?: "horizontal" | "vertical";
}

function StepperRoot({
  className,
  orientation = "vertical",
  ...props
}: StepperRootProps) {
  return (
    <ol
      className={cn(
        "flex",
        orientation === "vertical" ? "flex-col gap-0" : "flex-row gap-2",
        className
      )}
      {...props}
    />
  );
}

// ─── StepperItem ────────────────────────────────────────────────────────────

interface StepperItemProps extends React.LiHTMLAttributes<HTMLLIElement> {
  status?: StepStatus;
}

function StepperItem({
  className,
  status = "pending",
  ...props
}: StepperItemProps) {
  return (
    <li
      className={cn("flex gap-3", className)}
      data-status={status}
      {...props}
    />
  );
}

// ─── StepperIndicator ───────────────────────────────────────────────────────

interface StepperIndicatorProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof stepIndicatorVariants> {
  /** Número do step (1-based). Exibido quando status=pending ou active. */
  step?: number;
}

function StepperIndicator({
  className,
  status = "pending",
  size,
  step,
  ...props
}: StepperIndicatorProps) {
  return (
    <div
      className={cn(stepIndicatorVariants({ status, size }), className)}
      {...props}
    >
      {status === "completed" ? (
        <CheckIcon className="h-4 w-4" />
      ) : status === "error" ? (
        <CircleAlertIcon className="h-4 w-4" />
      ) : status === "active" ? (
        <LoaderIcon className="h-4 w-4 animate-spin" />
      ) : (
        step
      )}
    </div>
  );
}

// ─── StepperSeparator ───────────────────────────────────────────────────────

interface StepperSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  status?: StepStatus;
  orientation?: "horizontal" | "vertical";
}

function StepperSeparator({
  className,
  status = "pending",
  orientation = "vertical",
  ...props
}: StepperSeparatorProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "shrink-0",
        orientation === "vertical"
          ? "ml-[15px] min-h-4 w-0.5"
          : "mt-[15px] h-0.5 min-w-4 flex-1",
        status === "completed" ? "bg-confidence-high" : "bg-border",
        className
      )}
      {...props}
    />
  );
}

// ─── StepperTitle ───────────────────────────────────────────────────────────

function StepperTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("font-medium text-sm leading-tight", className)}
      {...props}
    />
  );
}

// ─── StepperDescription ─────────────────────────────────────────────────────

function StepperDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-muted-foreground text-xs", className)} {...props} />
  );
}

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  StepperRoot,
  StepperItem,
  StepperIndicator,
  StepperSeparator,
  StepperTitle,
  StepperDescription,
  stepIndicatorVariants,
};
