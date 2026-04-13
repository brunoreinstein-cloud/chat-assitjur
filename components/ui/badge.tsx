import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        // Success / Warning / Error semânticos
        success:
          "border-transparent bg-brand-success-light text-brand-success hover:bg-brand-success-light/80 dark:bg-brand-success/20 dark:text-green-300",
        warning:
          "border-transparent bg-brand-warning-light text-brand-warning hover:bg-brand-warning-light/80 dark:bg-brand-warning/20 dark:text-yellow-300",
        error:
          "border-transparent bg-brand-error-light text-brand-error hover:bg-brand-error-light/80 dark:bg-brand-error/20 dark:text-red-300",
        // Workflow — status de caso/processo
        "workflow-draft":
          "border-transparent bg-workflow-draft-bg text-workflow-draft hover:bg-workflow-draft-bg/80",
        "workflow-active":
          "border-transparent bg-workflow-active-bg text-workflow-active hover:bg-workflow-active-bg/80",
        "workflow-review":
          "border-transparent bg-workflow-review-bg text-workflow-review hover:bg-workflow-review-bg/80",
        "workflow-done":
          "border-transparent bg-workflow-done-bg text-workflow-done hover:bg-workflow-done-bg/80",
        "workflow-blocked":
          "border-transparent bg-workflow-blocked-bg text-workflow-blocked hover:bg-workflow-blocked-bg/80",
        // Rastreabilidade — origem de informação (nomenclatura centrada no usuário)
        "source-document":
          "border-transparent bg-source-document-bg text-source-document hover:bg-source-document-bg/80",
        "source-suggested":
          "border-transparent bg-source-suggested-bg text-source-suggested hover:bg-source-suggested-bg/80",
        "source-review":
          "border-transparent bg-source-review-bg text-source-review hover:bg-source-review-bg/80",
        "source-verified":
          "border-transparent bg-source-verified-bg text-source-verified hover:bg-source-verified-bg/80",
        // Confiança — nível de certeza da IA
        "confidence-high":
          "border-transparent bg-confidence-high-bg text-confidence-high hover:bg-confidence-high-bg/80",
        "confidence-medium":
          "border-transparent bg-confidence-medium-bg text-confidence-medium hover:bg-confidence-medium-bg/80",
        "confidence-low":
          "border-transparent bg-confidence-low-bg text-confidence-low hover:bg-confidence-low-bg/80",
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
