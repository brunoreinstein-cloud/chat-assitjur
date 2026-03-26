"use client";

import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ——— Tipos ——————————————————————————————————————————————————————————

export type CaseWorkflowStatus =
  | "rascunho"
  | "ativo"
  | "revisao"
  | "concluido"
  | "bloqueado";

const WORKFLOW_BADGE_VARIANT: Record<
  CaseWorkflowStatus,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  rascunho: "workflow-draft",
  ativo: "workflow-active",
  revisao: "workflow-review",
  concluido: "workflow-done",
  bloqueado: "workflow-blocked",
};

const WORKFLOW_LABEL: Record<CaseWorkflowStatus, string> = {
  rascunho: "Rascunho",
  ativo: "Ativo",
  revisao: "Em revisão",
  concluido: "Concluído",
  bloqueado: "Bloqueado",
};

export interface CaseCardProps {
  /** Nome do caso */
  title: string;
  /** Nº do processo (CNJ) */
  processNumber: string;
  /** Status do fluxo */
  status: CaseWorkflowStatus;
  /** Vara / Tribunal */
  court?: string;
  /** "Fulano vs Empresa X" */
  parties?: string;
  /** Texto relativo (ex: "há 2 horas") */
  updatedAt?: string;
  /** Ação principal — geralmente abrir o caso */
  onOpen?: () => void;
  /** Callback do menu de ações */
  onMenu?: () => void;
  className?: string;
}

// ——— Componente ——————————————————————————————————————————————————————

export function CaseCard({
  title,
  processNumber,
  status,
  court,
  parties,
  updatedAt,
  onOpen,
  onMenu,
  className,
}: CaseCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm",
        "min-w-[280px] max-w-[400px]",
        "transition-shadow hover:shadow-md",
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 flex-1 font-semibold text-foreground text-xl leading-snug">
            {title}
          </h3>
          <Badge className="shrink-0" variant={WORKFLOW_BADGE_VARIANT[status]}>
            {WORKFLOW_LABEL[status]}
          </Badge>
        </div>
        <p className="font-mono text-muted-foreground text-sm tabular-nums">
          {processNumber}
        </p>
      </div>

      {/* Meta — label + valor textual, sem ícones */}
      <div className="flex flex-col gap-1.5 text-sm">
        {court && <MetaItem label="Vara">{court}</MetaItem>}
        {parties && <MetaItem label="Partes">{parties}</MetaItem>}
        {updatedAt && <MetaItem label="Atualizado">{updatedAt}</MetaItem>}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-1.5">
        {onOpen && (
          <Button onClick={onOpen} size="sm" variant="outline">
            Abrir
          </Button>
        )}
        {onMenu && (
          <Button
            aria-label="Mais ações"
            onClick={onMenu}
            size="icon-sm"
            variant="ghost"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ——— Sub-componente interno ——————————————————————————————————————————

function MetaItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-1.5 text-muted-foreground">
      <span className="shrink-0 font-medium text-foreground/70 text-xs">
        {label}:
      </span>
      <span className="truncate">{children}</span>
    </div>
  );
}
