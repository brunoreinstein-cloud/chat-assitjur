"use client";

import { ArrowLeft, FileText, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Attachment } from "@/lib/types";

interface RunnerValidationPhaseProps {
  agentLabel: string;
  attachments: Attachment[];
  onExecute: () => void;
  onBack: () => void;
}

export function RunnerValidationPhase({
  agentLabel,
  attachments,
  onExecute,
  onBack,
}: RunnerValidationPhaseProps) {
  const totalPages = attachments.reduce(
    (sum, a) => sum + (a.pageCount ?? 0),
    0
  );

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Summary card */}
      <div className="rounded-xl border border-gold-accent/30 bg-gold-accent/5 p-6">
        <h2 className="font-semibold text-lg">Pronto para executar</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {agentLabel} vai processar os documentos abaixo.
        </p>

        <div className="mt-4 flex gap-6">
          <div className="flex flex-col">
            <span className="font-bold text-2xl">{attachments.length}</span>
            <span className="text-muted-foreground text-xs">
              {attachments.length === 1 ? "Documento" : "Documentos"}
            </span>
          </div>
          {totalPages > 0 && (
            <div className="flex flex-col">
              <span className="font-bold text-2xl">{totalPages}</span>
              <span className="text-muted-foreground text-xs">
                {totalPages === 1 ? "Página" : "Páginas"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Document list */}
      <div className="flex flex-col gap-2">
        {attachments.map((att) => (
          <div
            className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm"
            key={att.url}
          >
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{att.name}</span>
            {att.documentType && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary text-xs">
                {att.documentType === "pi" ? "PI" : "Cont."}
              </span>
            )}
            {att.pageCount !== undefined && (
              <span className="text-muted-foreground text-xs">
                {att.pageCount}p
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button className="gap-2" onClick={onBack} variant="outline">
          <ArrowLeft className="size-4" />
          Voltar
        </Button>
        <Button className="flex-1 gap-2" onClick={onExecute}>
          <Play className="size-4" />
          Executar
        </Button>
      </div>
    </div>
  );
}
