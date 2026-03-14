"use client";

import { BookMarkedIcon } from "lucide-react";
import useSWR from "swr";
import { CreditsBalance } from "@/components/credits-balance";
import { SidebarToggle } from "@/components/sidebar-toggle";
import {
  VisibilitySelector,
  type VisibilityType,
} from "@/components/visibility-selector";
import type { AgentId } from "@/lib/ai/agents-registry-metadata";
import {
  AGENT_ID_ASSISTENTE_GERAL,
  AGENT_ID_ASSISTJUR_MASTER,
  AGENT_ID_REDATOR_CONTESTACAO,
  AGENT_ID_REVISOR_DEFESAS,
  getAgentConfig,
} from "@/lib/ai/agents-registry-metadata";
import { RISCO_DOT } from "@/lib/constants/processo";
import type { ProcessoComVerbas } from "@/lib/db/queries";
import { fetcher } from "@/lib/utils";

interface ChatTopbarProps {
  readonly activeAgent: AgentId | string;
  readonly onAgentToggle?: () => void;
  readonly onKnowledgeBase?: () => void;
  readonly onQuickSettings?: () => void;
  readonly isReadonly?: boolean;
  readonly chatId?: string;
  readonly selectedVisibilityType?: VisibilityType;
  readonly hasAssistantMessage?: boolean;
  readonly onSaveToKnowledge?: () => void;
  /** ID do processo vinculado ao chat (se houver). */
  readonly processoId?: string | null;
}

const AGENT_DOTS: Record<string, string> = {
  [AGENT_ID_ASSISTENTE_GERAL]: "bg-muted-foreground/70",
  [AGENT_ID_REVISOR_DEFESAS]: "bg-assistjur-gold",
  [AGENT_ID_REDATOR_CONTESTACAO]: "bg-assistjur-purple",
  [AGENT_ID_ASSISTJUR_MASTER]: "bg-assistjur-purple",
};

function getAgentMeta(agentId: string): { label: string; dot: string } {
  const config = getAgentConfig(agentId);
  return {
    label: config.label,
    dot: AGENT_DOTS[agentId] ?? "bg-assistjur-gold",
  };
}

export function ChatTopbar({
  activeAgent,
  onAgentToggle,
  onKnowledgeBase,
  onQuickSettings,
  isReadonly,
  chatId,
  selectedVisibilityType,
  hasAssistantMessage,
  onSaveToKnowledge,
  processoId,
}: ChatTopbarProps) {
  const meta = getAgentMeta(activeAgent);
  // Reutiliza o cache da sidebar (/api/processos) em vez de um request individual.
  // Se a sidebar já buscou a lista, isso é um hit de cache sem network round-trip.
  const { data: processos } = useSWR<ProcessoComVerbas[]>(
    processoId ? "/api/processos" : null,
    fetcher
  );
  const processo = processoId
    ? (processos?.find((p) => p.id === processoId) ?? null)
    : null;

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-border border-b bg-background px-5 dark:border-white/8 dark:bg-assistjur-purple-darker">
      <SidebarToggle className="border-border bg-muted text-foreground hover:bg-muted/80 dark:border-white/8 dark:bg-assistjur-purple-dark dark:text-white dark:hover:bg-assistjur-purple" />
      {/* Agent selector */}
      <button
        aria-label="Alterar agente"
        className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5 font-medium text-[13px] text-foreground transition-all hover:bg-muted/80 dark:border-white/8 dark:bg-assistjur-purple-dark dark:text-white dark:hover:border-assistjur-gold/30 dark:hover:bg-assistjur-purple"
        onClick={onAgentToggle}
        type="button"
      >
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`}
        />
        {meta.label}
        <svg
          aria-hidden
          className="h-3 w-3 text-muted-foreground dark:text-assistjur-gray-light"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
        >
          <title>Seta</title>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <button
        className="rounded-md border border-border bg-muted px-3 py-[5px] text-[12px] text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground dark:border-white/8 dark:bg-assistjur-purple-dark dark:text-assistjur-gray-light dark:hover:text-white"
        onClick={onQuickSettings}
        type="button"
      >
        ⚙ Configurações rápidas
      </button>

      {/* Badge do processo vinculado */}
      {processo && (
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1.5 dark:border-white/8 dark:bg-assistjur-purple-dark">
          <span
            aria-hidden
            className={`h-2 w-2 shrink-0 rounded-full ${RISCO_DOT[processo.riscoGlobal ?? ""] ?? "bg-muted-foreground/40"}`}
          />
          <span className="font-mono text-[11px] text-muted-foreground dark:text-assistjur-gray-light">
            {processo.numeroAutos.length > 20
              ? `${processo.numeroAutos.slice(0, 20)}…`
              : processo.numeroAutos}
          </span>
          <span className="text-[10px] text-muted-foreground/40 dark:text-assistjur-gray/40">
            ·
          </span>
          <span className="text-[11px] text-foreground dark:text-white/80">
            {processo.reclamante.split(" ")[0]}
          </span>
        </div>
      )}

      <div className="flex-1" />

      {!isReadonly && chatId != null && selectedVisibilityType != null && (
        <VisibilitySelector
          chatId={chatId}
          className="[&_button]:border-border [&_button]:bg-muted [&_button]:text-foreground [&_button]:hover:bg-muted/80 dark:[&_button]:border-white/8 dark:[&_button]:bg-assistjur-purple-dark dark:[&_button]:text-white dark:[&_button]:hover:bg-assistjur-purple"
          selectedVisibilityType={selectedVisibilityType}
        />
      )}
      {!isReadonly && hasAssistantMessage && onSaveToKnowledge != null && (
        <button
          aria-label="Guardar última resposta do assistente em conhecimento"
          className="flex h-8 items-center justify-center rounded-md border border-border bg-muted px-2 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground dark:border-white/8 dark:bg-assistjur-purple-dark dark:text-assistjur-gray-light dark:hover:bg-assistjur-purple dark:hover:text-white"
          onClick={onSaveToKnowledge}
          title="Guardar última resposta em conhecimento"
          type="button"
        >
          <BookMarkedIcon aria-hidden className="size-4" />
        </button>
      )}

      {/* Icon actions */}
      <div className="flex items-center gap-2">
        <IconBtn onClick={onKnowledgeBase} title="Base de conhecimento">
          <svg
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <title>Base de conhecimento</title>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </IconBtn>
        {!isReadonly && (
          <div aria-live="polite">
            <CreditsBalance />
          </div>
        )}
        <IconBtn title="Layout">
          <svg
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <title>Layout</title>
            <rect height="7" width="7" x="3" y="3" />
            <rect height="7" width="7" x="14" y="3" />
            <rect height="7" width="7" x="3" y="14" />
            <rect height="7" width="7" x="14" y="14" />
          </svg>
        </IconBtn>
      </div>
    </header>
  );
}

function IconBtn({
  children,
  title,
  onClick,
}: Readonly<{
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
}>) {
  return (
    <button
      aria-label={title}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground transition-all hover:bg-muted/80 hover:text-foreground dark:border-white/8 dark:bg-assistjur-purple-dark dark:text-assistjur-gray-light dark:hover:border-assistjur-gold/30 dark:hover:bg-assistjur-purple dark:hover:text-white [&>svg]:h-3.5 [&>svg]:w-3.5"
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}
