"use client";

import { AssistJurLogo } from "@/components/assistjur-logo";
import type { AgentId } from "@/lib/ai/agents-registry-metadata";
import {
  AGENT_ID_ASSISTENTE_GERAL,
  AGENT_ID_ASSISTJUR_MASTER,
  AGENT_ID_REDATOR_CONTESTACAO,
  AGENT_ID_REVISOR_DEFESAS,
  AGENT_IDS,
  getAgentConfig,
} from "@/lib/ai/agents-registry-metadata";

const AGENT_CARD_STYLE: Record<AgentId, { emoji: string; bg: string }> = {
  [AGENT_ID_ASSISTENTE_GERAL]: { emoji: "💬", bg: "bg-muted" },
  [AGENT_ID_REVISOR_DEFESAS]: { emoji: "🔍", bg: "bg-assistjur-gold/15" },
  [AGENT_ID_REDATOR_CONTESTACAO]: { emoji: "✍️", bg: "bg-assistjur-purple/15" },
  [AGENT_ID_ASSISTJUR_MASTER]: { emoji: "🧠", bg: "bg-assistjur-purple/15" },
};

interface QuickPrompt {
  label: string;
  text: string;
}

const QUICK_PROMPTS_BY_AGENT: Record<AgentId, QuickPrompt[]> = {
  [AGENT_ID_ASSISTENTE_GERAL]: [
    {
      label: "💬 Tirar dúvida jurídica",
      text: "Tenho uma dúvida sobre direito trabalhista:",
    },
    {
      label: "📄 Resumir documento",
      text: "Resuma o documento anexado destacando os pontos principais.",
    },
    {
      label: "📋 Calcular prazos",
      text: "Me ajude a calcular os prazos processuais para:",
    },
    {
      label: "🔍 Explicar conceito",
      text: "Explique de forma clara o conceito jurídico de:",
    },
  ],
  [AGENT_ID_REVISOR_DEFESAS]: [
    {
      label: "📎 Revisar defesa anexada",
      text: "Quero revisar a defesa que vou anexar agora.",
    },
    {
      label: "🔍 Auditar contestação",
      text: "Auditar minha contestação: segue em anexo a Petição Inicial e a Contestação.",
    },
    {
      label: "📋 Estruturar tese defensiva",
      text: "Ajude-me a estruturar uma tese defensiva para:",
    },
    {
      label: "⚡ Horas extras — principais teses",
      text: "Quais as principais teses defensivas para horas extras?",
    },
  ],
  [AGENT_ID_REDATOR_CONTESTACAO]: [
    {
      label: "✍️ Redigir contestação",
      text: "Preciso redigir uma contestação trabalhista. Segue a PI em anexo.",
    },
    {
      label: "📝 Contestar pedido específico",
      text: "Preciso contestar o seguinte pedido da inicial:",
    },
    {
      label: "🏛️ Incluir jurisprudência",
      text: "Inclua jurisprudência favorável à defesa sobre:",
    },
    {
      label: "📋 Preliminares e prejudiciais",
      text: "Elabore as preliminares e prejudiciais de mérito para:",
    },
  ],
  [AGENT_ID_ASSISTJUR_MASTER]: [
    {
      label: "🧠 Análise completa",
      text: "Faça uma análise completa do processo anexado, identificando pontos críticos e gerando relatório.",
    },
    {
      label: "📊 Mapear pedidos e riscos",
      text: "Mapeie todos os pedidos da inicial anexada e avalie o risco de cada um.",
    },
    {
      label: "⚖️ Estratégia defensiva",
      text: "Elabore uma estratégia defensiva completa para o caso anexado.",
    },
    {
      label: "📑 Gerar relatório DOCX",
      text: "Analise o documento anexado e gere um relatório completo em DOCX.",
    },
  ],
};

interface ChatEmptyStateProps {
  readonly agentId?: AgentId;
  readonly onAgentSelect: (id: AgentId) => void;
  readonly onQuickPrompt: (text: string) => void;
}

export function ChatEmptyState({
  agentId,
  onAgentSelect,
  onQuickPrompt,
}: ChatEmptyStateProps) {
  const quickPrompts =
    QUICK_PROMPTS_BY_AGENT[agentId ?? AGENT_ID_ASSISTENTE_GERAL] ??
    QUICK_PROMPTS_BY_AGENT[AGENT_ID_ASSISTENTE_GERAL];
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-10">
      {/* Glow — tema claro: sutil; tema escuro: roxo/dourado */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 dark:hidden"
        style={{
          background:
            "radial-gradient(ellipse 600px 400px at 50% 40%, rgba(124,58,237,0.04) 0%, rgba(234,179,8,0.02) 50%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{
          background:
            "radial-gradient(ellipse 600px 400px at 50% 40%, rgba(124,58,237,0.06) 0%, rgba(234,179,8,0.03) 50%, transparent 70%)",
        }}
      />

      <div className="relative z-10 flex w-full max-w-[520px] flex-col items-center">
        {/* Logo */}
        <div className="mb-5 flex h-16 items-center justify-center">
          <AssistJurLogo className="font-semibold text-[22px]" iconSize={48} />
        </div>

        <h1 className="mb-2.5 text-center font-semibold text-[28px] text-foreground tracking-tight">
          Como posso ajudar hoje?
        </h1>
        <p className="mb-8 text-center text-[14px] text-muted-foreground leading-relaxed">
          Selecione um agente abaixo ou escreva diretamente.
          <br />
          Cada agente é especializado em uma tarefa jurídica específica.
        </p>

        {/* Agent cards */}
        <div className="mb-6 grid w-full grid-cols-3 gap-2.5">
          {AGENT_IDS.map((id) => {
            const config = getAgentConfig(id);
            const style = AGENT_CARD_STYLE[id];
            return (
              <button
                className="group flex flex-col gap-2 rounded-[10px] border border-border bg-card p-3.5 text-left shadow-sm transition-all hover:-translate-y-px hover:border-assistjur-purple/40 hover:bg-assistjur-purple/5 hover:shadow-md"
                key={id}
                onClick={() => onAgentSelect(id)}
                type="button"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[13px] ${style.bg}`}
                  >
                    {style.emoji}
                  </div>
                  <span className="font-semibold text-[12.5px] text-foreground">
                    {config.label}
                  </span>
                </div>
                <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                  {config.description ?? ""}
                </p>
                <div className="mt-auto flex items-center gap-1 text-[11px] text-muted-foreground transition-colors group-hover:text-assistjur-purple">
                  <svg
                    aria-hidden
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <title>Usar agente</title>
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  Usar agente
                </div>
              </button>
            );
          })}
        </div>

        {/* Quick prompts */}
        <div className="flex flex-wrap justify-center gap-1.5">
          {quickPrompts.map((q) => (
            <button
              className="whitespace-nowrap rounded-full border border-border bg-muted/80 px-3 py-1.5 text-[12px] text-muted-foreground transition-all hover:border-assistjur-purple/40 hover:bg-assistjur-purple/5 hover:text-foreground"
              key={q.label}
              onClick={() => onQuickPrompt(q.text)}
              type="button"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
