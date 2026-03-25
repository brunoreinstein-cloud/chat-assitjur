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
        // Brand purple pill — para status de agente, categorias jurídicas
        brand:
          "border-transparent bg-brand-purple-100 text-brand-purple-800 hover:bg-brand-purple-200 dark:bg-brand-purple-900/50 dark:text-brand-purple-300 dark:hover:bg-brand-purple-800/60",
        // Gold — para destaques, alertas positivos, tier premium
        gold: "border-transparent bg-brand-gold-400/20 text-brand-gold-700 hover:bg-brand-gold-400/30 dark:bg-brand-gold-500/20 dark:text-brand-gold-300 dark:hover:bg-brand-gold-500/30",
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
        // Confiança — rastreabilidade de fontes e inferências
        source:
          "border-transparent bg-confidence-source-bg text-confidence-source hover:bg-confidence-source-bg/80",
        inference:
          "border-transparent bg-confidence-inference-bg text-confidence-inference hover:bg-confidence-inference-bg/80",
        "needs-review":
          "border-transparent bg-confidence-alert-bg text-confidence-alert hover:bg-confidence-alert-bg/80",
        verified:
          "border-transparent bg-confidence-verified-bg text-confidence-verified hover:bg-confidence-verified-bg/80",
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
