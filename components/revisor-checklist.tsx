"use client";

import { BookOpenIcon, CheckIcon, XIcon } from "lucide-react";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RevisorChecklistProps {
  readonly attachments: Attachment[];
  readonly knowledgeDocumentIds?: string[];
  readonly messageCount: number;
  /** Layout centralizado (painel no empty state). Quando false, usa a faixa compacta acima do input. */
  readonly variant?: "inline" | "central";
  /** Para variant="central": abre a sidebar da base de conhecimento ao clicar no item Base. */
  readonly onOpenKnowledge?: () => void;
}

/** Checklist "Antes de executar": PI, Contestação e Base. Só visível quando o chat está vazio. */
export function RevisorChecklist({
  attachments,
  knowledgeDocumentIds = [],
  messageCount,
  variant = "inline",
  onOpenKnowledge,
}: RevisorChecklistProps) {
  if (messageCount > 0) {
    return null;
  }

  const hasPi = attachments.some((a) => a.documentType === "pi");
  const hasContestacao = attachments.some(
    (a) => a.documentType === "contestacao"
  );
  const hasBase = knowledgeDocumentIds.length > 0;

  const piHasText = attachments.some(
    (a) => a.documentType === "pi" && a.extractedText != null
  );
  const contestacaoHasText = attachments.some(
    (a) => a.documentType === "contestacao" && a.extractedText != null
  );

  const baseSubtext = hasBase
    ? `${knowledgeDocumentIds.length} documento(s)`
    : onOpenKnowledge != null
      ? "Opcional — abrir para selecionar teses"
      : "Opcional";

  if (variant === "central") {
    return (
      <section
        aria-label="Verificação antes de executar"
        aria-live="polite"
        className="mx-auto w-full max-w-2xl"
        data-testid="revisor-checklist"
      >
        <h3 className="mb-3 font-medium text-muted-foreground text-sm">
          Verificação
        </h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
              hasPi
                ? "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/30"
                : "border-border bg-muted/30"
            )}
          >
            {hasPi ? (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400">
                <CheckIcon aria-hidden className="size-5" />
              </span>
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <XIcon aria-hidden className="size-4" />
              </span>
            )}
            <div className="min-w-0">
              <span className="font-medium text-foreground text-sm">
                Petição Inicial
              </span>
              <p className="text-muted-foreground text-xs">
                {hasPi
                  ? piHasText
                    ? "Identificada"
                    : "Identificada (a processar texto…)"
                  : "Anexe ou arraste o documento"}
              </p>
            </div>
          </div>

          <div
            className={cn(
              "flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
              hasContestacao
                ? "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/30"
                : "border-border bg-muted/30"
            )}
          >
            {hasContestacao ? (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400">
                <CheckIcon aria-hidden className="size-5" />
              </span>
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <XIcon aria-hidden className="size-4" />
              </span>
            )}
            <div className="min-w-0">
              <span className="font-medium text-foreground text-sm">
                Contestação
              </span>
              <p className="text-muted-foreground text-xs">
                {hasContestacao
                  ? contestacaoHasText
                    ? "Identificada"
                    : "Identificada (a processar texto…)"
                  : "Anexe ou arraste o documento"}
              </p>
            </div>
          </div>

          <div
            className={cn(
              "flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
              hasBase
                ? "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/30"
                : "border-border bg-muted/30"
            )}
          >
            {hasBase ? (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400">
                <CheckIcon aria-hidden className="size-5" />
              </span>
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <BookOpenIcon aria-hidden className="size-4" />
              </span>
            )}
            <div className="min-w-0">
              <span className="font-medium text-foreground text-sm">
                Base de conhecimento
              </span>
              <p className="text-muted-foreground text-xs">{baseSubtext}</p>
              {onOpenKnowledge != null && !hasBase && (
                <button
                  className="mt-1 font-medium text-primary text-xs underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={onOpenKnowledge}
                  type="button"
                >
                  Abrir base
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Antes de executar"
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs"
      data-testid="revisor-checklist"
    >
      <span className="flex items-center gap-1.5">
        {hasPi ? (
          <CheckIcon aria-hidden className="size-3.5 text-green-600" />
        ) : (
          <XIcon aria-hidden className="size-3.5 text-muted-foreground/70" />
        )}
        <span>Petição Inicial</span>
      </span>
      <span className="flex items-center gap-1.5">
        {hasContestacao ? (
          <CheckIcon aria-hidden className="size-3.5 text-green-600" />
        ) : (
          <XIcon aria-hidden className="size-3.5 text-muted-foreground/70" />
        )}
        <span>Contestação</span>
      </span>
      <span className="flex items-center gap-1.5">
        {hasBase ? (
          <CheckIcon aria-hidden className="size-3.5 text-green-600" />
        ) : (
          <XIcon
            aria-hidden
            className={cn("size-3.5 text-muted-foreground/70")}
          />
        )}
        <span>Base de conhecimento</span>
        {hasBase && (
          <span className="tabular-nums">({knowledgeDocumentIds.length})</span>
        )}
      </span>
    </section>
  );
}
