"use client";

import { Clock, MoreHorizontal, Scale, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
  /** Progresso do caso 0–100 */
  progress?: number;
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
  progress,
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
        className,
      )}
    >
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 flex-1 font-semibold text-foreground text-xl leading-snug">
            {title}
          </h3>
          <Badge variant={WORKFLOW_BADGE_VARIANT[status]} className="shrink-0">
            {WORKFLOW_LABEL[status]}
          </Badge>
        </div>
        <p className="font-mono text-muted-foreground text-sm">
          {processNumber}
        </p>
      </div>

      {/* Meta */}
      <div className="flex flex-col gap-1.5">
        {court && (
          <MetaItem icon={<Scale className="h-3.5 w-3.5" />} label="Vara">
            {court}
          </MetaItem>
        )}
        {parties && (
          <MetaItem icon={<Users className="h-3.5 w-3.5" />} label="Partes">
            {parties}
          </MetaItem>
        )}
        {updatedAt && (
          <MetaItem icon={<Clock className="h-3.5 w-3.5" />} label="Atualizado">
            {updatedAt}
          </MetaItem>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3">
        {progress !== undefined && (
          <div className="flex flex-1 flex-col gap-1">
            <Progress value={progress} className="h-1.5" />
            <span className="text-muted-foreground text-xs">{progress}% concluído</span>
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {onOpen && (
            <Button size="sm" variant="outline-brand" onClick={onOpen}>
              Abrir
            </Button>
          )}
          {onMenu && (
            <Button size="icon-sm" variant="ghost" onClick={onMenu} aria-label="Mais ações">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ——— Sub-componente interno ——————————————————————————————————————————

function MetaItem({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
      <span className="shrink-0 text-muted-foreground/60">{icon}</span>
      <span className="sr-only">{label}:</span>
      <span className="truncate">{children}</span>
    </div>
  );
}
