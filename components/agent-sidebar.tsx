"use client";

import { isToday } from "date-fns";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "next-auth";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";
import { AssistJurLogo } from "@/components/assistjur-logo";
import { NovoProcessoForm } from "@/components/novo-processo-form";
import { ProcessoCard } from "@/components/processo-card";
import {
  type ChatHistory,
  getChatHistoryPaginationKey,
} from "@/components/sidebar-history";
import { SidebarUserNav } from "@/components/sidebar-user-nav";
import {
  AGENT_ID_ASSISTJUR_MASTER,
  AGENT_IDS,
  type AgentId,
  getAgentConfig,
} from "@/lib/ai/agents-registry-metadata";
import { FASE_TO_AGENT } from "@/lib/constants/processo";
import type { ProcessoComVerbas } from "@/lib/db/queries";
import type { Chat } from "@/lib/db/schema";
import { fetcher, historyFetcher } from "@/lib/utils";

const AGENT_DOTS: Record<AgentId, string> = {
  "assistente-geral": "bg-assistjur-purple",
  "revisor-defesas": "bg-assistjur-gold",
  "redator-contestacao": "bg-assistjur-purple",
  /** Master usa gold — produto flagship, visualmente distinto do Redator (purple). */
  "assistjur-master": "bg-assistjur-gold",
};

interface ChatItem {
  id: string;
  title: string;
  timeLabel: string;
  group: "today" | "week";
}

interface CreditsData {
  balance: number;
  lowBalanceThreshold: number;
}

function formatTimeLabel(createdAt: string): string {
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 60) {
    return `${diffMins}m`;
  }
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  if (diffDays < 7) {
    return `${diffDays}d`;
  }
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}

function groupChats(chats: Chat[]): ChatItem[] {
  return chats.map((c) => {
    const createdAt =
      typeof c.createdAt === "string" ? c.createdAt : c.createdAt.toISOString();
    const d = new Date(createdAt);
    return {
      id: c.id,
      title: c.title,
      timeLabel: formatTimeLabel(createdAt),
      group: isToday(d) ? "today" : "week",
    };
  });
}

interface AgentSidebarProps {
  readonly user: User | undefined;
  readonly isGuest?: boolean;
}

export function AgentSidebar({ user, isGuest = false }: AgentSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { mutate } = useSWRConfig();
  const isNewChat = pathname === "/chat";
  const agentFromUrl = searchParams.get("agent");
  const activeAgent: AgentId =
    isNewChat && agentFromUrl && AGENT_IDS.includes(agentFromUrl as AgentId)
      ? (agentFromUrl as AgentId)
      : AGENT_IDS[0];
  const activeChatId = pathname?.startsWith("/chat/")
    ? (pathname.split("/")[2] ?? undefined)
    : undefined;

  // Sidebar tabs: conversas | processos
  const [sidebarTab, setSidebarTab] = useState<"conversas" | "processos">(
    "conversas"
  );
  const [showNovoForm, setShowNovoForm] = useState(false);
  const activeProcessoId = isNewChat ? searchParams.get("processo") : null;

  const { data: paginatedHistories } = useSWRInfinite<ChatHistory>(
    (pageIndex, prev) =>
      user ? getChatHistoryPaginationKey(pageIndex, prev) : null,
    historyFetcher,
    { fallbackData: [] }
  );
  const { data: creditsData } = useSWR<CreditsData>(
    user ? "/api/credits" : null,
    fetcher
  );
  // Lazy: só busca quando a aba Processos está activa para não desperdiçar
  // bandwidth em sessões que nunca abrem essa aba.
  const { data: processos } = useSWR<ProcessoComVerbas[]>(
    user && !isGuest && sidebarTab === "processos" ? "/api/processos" : null,
    fetcher
  );

  const allChats = paginatedHistories
    ? paginatedHistories.flatMap((p) => p.chats)
    : [];
  const chatItems = groupChats(allChats);
  const todayChats = chatItems.filter((c) => c.group === "today");
  const weekChats = chatItems.filter((c) => c.group === "week");

  const credits = creditsData?.balance ?? 0;
  const maxCredits = Math.max(
    credits,
    creditsData?.lowBalanceThreshold ?? 1000,
    1000
  );
  const pct = Math.min(100, (credits / maxCredits) * 100);

  const onAgentChange = (id: AgentId) => {
    router.push(`/chat?agent=${encodeURIComponent(id)}`);
    router.refresh();
  };

  const onProcessoClick = (p: Pick<ProcessoComVerbas, "id" | "fase">) => {
    const agent = FASE_TO_AGENT[p.fase ?? ""] ?? AGENT_ID_ASSISTJUR_MASTER;
    router.push(`/chat?agent=${agent}&processo=${p.id}`);
  };

  return (
    <aside
      aria-label="Navegação do chat e agentes"
      className="flex h-full w-[260px] shrink-0 flex-col border-border border-r bg-sidebar dark:border-white/8 dark:bg-assistjur-purple-darker"
    >
      {/* Brand + Novo chat */}
      <div className="space-y-3 border-border border-b px-3 pt-4 pb-3 dark:border-white/8">
        <div className="flex shrink-0 items-center gap-2.5 px-1">
          <AssistJurLogo iconSize={28} />
        </div>
        <Link href="/chat">
          <button
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-assistjur-gold/40 bg-assistjur-gold/10 px-3 py-2 font-medium text-[13px] text-assistjur-gold transition-all hover:border-assistjur-gold/50 hover:bg-assistjur-gold/20 dark:border-assistjur-gold/30"
            type="button"
          >
            <svg
              aria-hidden
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <title>Novo chat</title>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Novo chat
          </button>
        </Link>
      </div>

      {/* Tabs: Conversas | Processos */}
      {!isGuest && (
        <div className="flex border-border border-b dark:border-white/8">
          {(["conversas", "processos"] as const).map((tab) => (
            <button
              className={`flex-1 py-2 font-medium text-[11px] transition-colors ${
                sidebarTab === tab
                  ? "border-assistjur-gold border-b-2 text-assistjur-gold"
                  : "border-transparent border-b-2 text-muted-foreground hover:text-foreground dark:text-assistjur-gray dark:hover:text-white"
              }`}
              key={tab}
              onClick={() => {
                setSidebarTab(tab);
                setShowNovoForm(false);
              }}
              type="button"
            >
              {tab === "conversas" ? "Conversas" : "Processos"}
            </button>
          ))}
        </div>
      )}

      {/* ── ABA CONVERSAS ── */}
      {sidebarTab === "conversas" && (
        <>
          {/* Agentes */}
          <div className="border-border border-b px-3 py-3 dark:border-white/8">
            <p className="mb-1.5 px-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-widest dark:text-assistjur-gray">
              Agentes
            </p>
            {AGENT_IDS.map((id) => {
              const config = getAgentConfig(id);
              return (
                <button
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-[7px] font-medium text-[13px] text-foreground transition-colors dark:text-white ${
                    activeAgent === id
                      ? "bg-assistjur-purple/15 dark:bg-assistjur-purple-dark"
                      : "hover:bg-muted dark:hover:bg-white/10"
                  }`}
                  key={id}
                  onClick={() => onAgentChange(id)}
                  type="button"
                >
                  <span
                    aria-hidden
                    className={`h-[7px] w-[7px] shrink-0 rounded-full ${AGENT_DOTS[id]}`}
                  />
                  {config.label}
                </button>
              );
            })}
          </div>

          {/* Histórico */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {(
              [
                ["Hoje", todayChats],
                ["Esta semana", weekChats],
              ] as [string, ChatItem[]][]
            ).map(([label, items]) =>
              items.length === 0 ? null : (
                <div className="mb-3" key={label}>
                  <p className="mb-1 px-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-widest dark:text-assistjur-gray">
                    {label}
                  </p>
                  {items.map((chat: ChatItem) => (
                    <Link href={`/chat/${chat.id}`} key={chat.id}>
                      <div
                        className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-[7px] text-[12.5px] transition-colors ${
                          activeChatId === chat.id
                            ? "bg-assistjur-purple/10 text-foreground dark:bg-assistjur-purple-dark dark:text-white"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground dark:text-assistjur-gray-light dark:hover:bg-white/10 dark:hover:text-white"
                        }`}
                      >
                        <svg
                          aria-hidden
                          className="h-3 w-3 shrink-0 opacity-50"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <title>Chat</title>
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <span className="min-w-0 flex-1 truncate">
                          {chat.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground dark:text-assistjur-gray">
                          {chat.timeLabel}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            )}
          </div>
        </>
      )}

      {/* ── ABA PROCESSOS ── */}
      {sidebarTab === "processos" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header da aba */}
          <div className="flex items-center justify-between border-border border-b px-3 py-2 dark:border-white/8">
            <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest dark:text-assistjur-gray">
              {processos
                ? `${processos.length} processo${processos.length !== 1 ? "s" : ""}`
                : "Processos"}
            </p>
            {!showNovoForm && (
              <button
                className="rounded px-1.5 py-0.5 text-[11px] text-assistjur-gold hover:bg-assistjur-gold/10"
                onClick={() => setShowNovoForm(true)}
                type="button"
              >
                + Novo
              </button>
            )}
          </div>

          {/* Formulário novo processo */}
          {showNovoForm && (
            <div className="border-border border-b px-3 py-3 dark:border-white/8">
              <NovoProcessoForm
                onCancel={() => setShowNovoForm(false)}
                onCreated={(p) => {
                  mutate("/api/processos");
                  setShowNovoForm(false);
                  onProcessoClick(p);
                }}
              />
            </div>
          )}

          {/* Lista de processos */}
          <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
            {!processos && (
              <p className="py-6 text-center text-[11px] text-muted-foreground dark:text-assistjur-gray">
                Carregando…
              </p>
            )}
            {processos && processos.length === 0 && !showNovoForm && (
              <div className="py-8 text-center">
                <p className="text-[12px] text-muted-foreground dark:text-assistjur-gray-light">
                  Nenhum processo ainda.
                </p>
                <button
                  className="mt-2 text-[11px] text-assistjur-gold hover:underline"
                  onClick={() => setShowNovoForm(true)}
                  type="button"
                >
                  + Adicionar primeiro processo
                </button>
              </div>
            )}
            {processos?.map((p) => (
              <ProcessoCard
                isActive={activeProcessoId === p.id}
                key={p.id}
                onClick={() => onProcessoClick(p)}
                onMutate={() => mutate("/api/processos")}
                processo={p}
              />
            ))}
          </div>
        </div>
      )}

      {/* Créditos */}
      <div className="border-border border-t px-3 py-2.5 dark:border-white/8">
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-2 dark:border-white/8 dark:bg-assistjur-purple-dark/80">
          <span aria-hidden className="shrink-0 text-assistjur-gold text-sm">
            ⚡
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground dark:text-assistjur-gray-light">
                Créditos disponíveis
              </span>
              <span className="font-semibold text-[13px] text-assistjur-gold">
                {credits}
              </span>
            </div>
            <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-muted dark:bg-white/10">
              <div
                aria-hidden
                className="h-full rounded-full bg-assistjur-gold"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-border border-t px-3 py-2 dark:border-white/8">
        <div className="flex flex-col gap-0.5">
          <Link
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground dark:text-assistjur-gray-light dark:hover:bg-white/10 dark:hover:text-white"
            href="/ajuda"
          >
            Ajuda
          </Link>
          <Link
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground dark:text-assistjur-gray-light dark:hover:bg-white/10 dark:hover:text-white"
            href="/admin/agents"
          >
            Administração — Agentes built-in
          </Link>
        </div>
      </div>

      {isGuest && (
        <div className="border-border border-t px-3 py-2 dark:border-white/8">
          <p className="text-muted-foreground text-xs dark:text-assistjur-gray-light">
            Está a usar como visitante. Ao sair, o histórico é apagado.{" "}
            <Link
              className="font-medium text-foreground underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-assistjur-gold focus-visible:ring-offset-2 dark:text-white dark:focus-visible:ring-offset-assistjur-purple-darker"
              href="/register"
            >
              Crie uma conta
            </Link>{" "}
            para guardar.
          </p>
        </div>
      )}

      {user && <SidebarUserNav isGuest={isGuest} user={user} />}
    </aside>
  );
}
