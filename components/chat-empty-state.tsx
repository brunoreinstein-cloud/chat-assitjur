"use client";

import { useState } from "react";
import { AssistJurLogo } from "@/components/assistjur-logo";
import type { AgentId } from "@/lib/ai/agents-registry-metadata";
import {
  AGENT_ID_ASSISTENTE_GERAL,
  AGENT_ID_ASSISTJUR_MASTER,
  AGENT_ID_AVALIADOR_CONTESTACAO,
  AGENT_ID_REDATOR_CONTESTACAO,
  AGENT_ID_REVISOR_DEFESAS,
  AGENT_IDS,
  getAgentConfig,
} from "@/lib/ai/agents-registry-metadata";

const AGENT_CARD_STYLE: Record<AgentId, { emoji: string; bg: string }> = {
  [AGENT_ID_ASSISTENTE_GERAL]: { emoji: "💬", bg: "bg-muted" },
  [AGENT_ID_REVISOR_DEFESAS]: { emoji: "🔍", bg: "bg-gold-accent/15" },
  [AGENT_ID_REDATOR_CONTESTACAO]: { emoji: "✍️", bg: "bg-primary/15" },
  [AGENT_ID_AVALIADOR_CONTESTACAO]: { emoji: "📊", bg: "bg-gold-accent/15" },
  /** Master usa gold: produto flagship com 14 módulos — visualmente distinto do Redator (purple). */
  [AGENT_ID_ASSISTJUR_MASTER]: { emoji: "⚡", bg: "bg-gold-accent/15" },
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
  [AGENT_ID_AVALIADOR_CONTESTACAO]: [
    {
      label: "📊 Avaliar contestação anexada",
      text: "Avalie a qualidade da contestação que anexo (estrutura, impugnações e riscos).",
    },
    {
      label: "🔍 Pontos fracos da defesa",
      text: "Identifique os pontos mais fracos desta contestação e sugira melhorias objetivas.",
    },
    {
      label: "⚖️ Confrontar com a inicial",
      text: "Confronte a contestação com a petição inicial anexa e indique lacunas ou pedidos não impugnados.",
    },
    {
      label: "📄 Gerar relatório DOCX",
      text: "Elabore o relatório de avaliação da contestação em DOCX com notas e recomendações.",
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

/** Todos os módulos do AssistJur Master (M01–M14). */
interface MasterModule {
  id: string;
  command: string;
  title: string;
  description: string;
  output: string;
  icon: string;
  /** Destacado na grelha inicial (máx 6) */
  featured?: boolean;
}

const MASTER_MODULES: MasterModule[] = [
  {
    id: "M03",
    command: "/relatorio-master",
    title: "Relatório Master",
    description: "Relatório processual universal com tabela dourada + cinza",
    output: "DOCX",
    icon: "📄",
    featured: true,
  },
  {
    id: "M02",
    command: "/carta-prognostico",
    title: "Carta de Prognóstico",
    description: "Carta com classificação de risco e provisão recomendada",
    output: "DOCX",
    icon: "📝",
    featured: true,
  },
  {
    id: "M08",
    command: "/cadastro-elaw",
    title: "Cadastro eLaw",
    description: "Planilha de cadastro para upload no sistema eLaw",
    output: "XLSX",
    icon: "📊",
    featured: true,
  },
  {
    id: "M07",
    command: "/auditoria",
    title: "Auditoria 360º",
    description: "Auditoria trabalhista corporativa com 15-20 páginas",
    output: "DOCX+XLSX",
    icon: "🔍",
    featured: true,
  },
  {
    id: "M12",
    command: "/modelo-br",
    title: "Modelo BR",
    description: "Relatório simplificado com 50 campos (6-10 páginas)",
    output: "DOCX",
    icon: "📋",
    featured: true,
  },
  {
    id: "M13",
    command: "/completo",
    title: "Relatório Completo A-P",
    description: "Relatório master detalhado com 250 campos (30-50 páginas)",
    output: "DOCX",
    icon: "📚",
    featured: true,
  },
  // Não-featured: aparecem após "Ver mais"
  {
    id: "M01",
    command: "/relatorio-processual",
    title: "Relatório Processual",
    description: "Relatório genérico para qualquer cliente",
    output: "DOCX",
    icon: "📄",
  },
  {
    id: "M04",
    command: "/relatorio-dpsp",
    title: "Relatório DPSP",
    description: "Template específico Drogaria São Paulo",
    output: "DOCX",
    icon: "🏪",
  },
  {
    id: "M05",
    command: "/obf",
    title: "Formulário OBF",
    description: "Obrigação de fazer: reintegração, equipamentos, PPP",
    output: "Form",
    icon: "📝",
  },
  {
    id: "M06",
    command: "/ficha-apolice",
    title: "Ficha Apólice",
    description: "Ficha de apólice de seguros e garantias",
    output: "DOCX",
    icon: "🔒",
  },
  {
    id: "M09",
    command: "/encerramento",
    title: "Encerramento",
    description: "Classificação de encerramento de processos",
    output: "XLSX",
    icon: "✅",
  },
  {
    id: "M10",
    command: "/aquisicao-creditos",
    title: "Aquisição de Créditos",
    description: "Análise para fundos e securitizadoras (12 abas)",
    output: "XLSX",
    icon: "💰",
  },
  {
    id: "M11",
    command: "/analise-tst",
    title: "Análise TST",
    description: "Estratégia para recursos no TST e análise processual",
    output: "DOCX",
    icon: "⚖️",
  },
  {
    id: "M14",
    command: "/extracao-calculos",
    title: "Extração Cálculos",
    description: "Extração estruturada de cálculos de liquidação",
    output: "JSON",
    icon: "🔢",
  },
];

const OUTPUT_BADGE_STYLE: Record<string, string> = {
  DOCX: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  XLSX: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "DOCX+XLSX":
    "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  JSON: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  Form: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
};

interface MasterModulesGridProps {
  onSelect: (command: string) => void;
}

function MasterModulesGrid({ onSelect }: MasterModulesGridProps) {
  const [expanded, setExpanded] = useState(false);
  const featured = MASTER_MODULES.filter((m) => m.featured);
  const rest = MASTER_MODULES.filter((m) => !m.featured);
  const visible = expanded ? MASTER_MODULES : featured;

  return (
    <div className="w-full">
      <p className="mb-3 text-center font-semibold text-[13px] text-muted-foreground">
        O que queres gerar hoje?
      </p>
      <div className="grid grid-cols-2 gap-2">
        {visible.map((mod, idx) => (
          <button
            className={`group flex flex-col gap-1.5 rounded-[10px] border border-border bg-card p-3 text-left shadow-sm card-interactive hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:shadow-md animate-fade-in-up ${idx < 6 ? `stagger-${idx + 1}` : ""}`}
            key={mod.id}
            onClick={() => onSelect(mod.command)}
            type="button"
          >
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] leading-none">{mod.icon}</span>
                <span className="font-semibold text-[11px] text-muted-foreground/60">
                  {mod.id}
                </span>
              </div>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 font-medium text-[10px] ${OUTPUT_BADGE_STYLE[mod.output] ?? "bg-muted text-muted-foreground"}`}
              >
                {mod.output}
              </span>
            </div>
            <p className="font-semibold text-[12px] text-foreground leading-tight">
              {mod.title}
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {mod.description}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/50 group-hover:text-primary/60">
              {mod.command}
            </p>
          </button>
        ))}
      </div>

      {/* Toggle "Ver mais / Ver menos" */}
      <button
        className="mt-2 w-full rounded-lg border border-border border-dashed py-2 text-[12px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        {expanded
          ? "▲ Ver menos módulos"
          : `▼ Ver todos os módulos (+${rest.length} mais)`}
      </button>
    </div>
  );
}

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
  const isMaster = agentId === AGENT_ID_ASSISTJUR_MASTER;
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
        <div className="mb-5 flex h-16 items-center justify-center animate-fade-in-up">
          <AssistJurLogo className="font-semibold text-[22px]" iconSize={48} />
        </div>

        <h1 className="mb-2.5 text-center font-semibold text-[28px] text-foreground tracking-tight animate-fade-in-up stagger-1">
          {isMaster ? "AssistJur Master" : "Como posso ajudar hoje?"}
        </h1>
        <p className="mb-8 text-center text-[14px] text-muted-foreground leading-relaxed animate-fade-in-up stagger-2">
          {isMaster ? (
            "Geração de documentos jurídicos com IA. Selecione um módulo abaixo ou descreva o que precisa."
          ) : (
            <>
              Selecione um agente abaixo ou escreva diretamente.
              <br />
              Cada agente é especializado em uma tarefa jurídica específica.
            </>
          )}
        </p>

        {/* Master: grelha de módulos em vez de agent cards */}
        {isMaster ? (
          <div className="mb-6 w-full">
            <MasterModulesGrid onSelect={onQuickPrompt} />
          </div>
        ) : (
          /* Agent cards — visíveis quando não está no Master */
          <div className="mb-6 grid w-full grid-cols-3 gap-2.5">
            {AGENT_IDS.map((id, idx) => {
              const config = getAgentConfig(id);
              const style = AGENT_CARD_STYLE[id];
              const staggerClass = idx < 6 ? `stagger-${idx + 1}` : "";
              return (
                <button
                  className={`group flex flex-col gap-2 rounded-[10px] border border-border bg-card p-3.5 text-left shadow-sm card-interactive hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:shadow-md animate-fade-in-up ${staggerClass}`}
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
                  <div className="mt-auto flex items-center gap-1 text-[11px] text-muted-foreground transition-colors group-hover:text-primary">
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
        )}

        {/* Quick prompts — para o Master aparecem como "perguntas livres" */}
        <div className="flex flex-wrap justify-center gap-1.5">
          {isMaster && (
            <p className="mb-1.5 w-full text-center text-[11px] text-muted-foreground/60">
              ou descreve em linguagem natural:
            </p>
          )}
          {quickPrompts.map((q, idx) => (
            <button
              className={`whitespace-nowrap rounded-full border border-border bg-muted/80 px-3 py-1.5 text-[12px] text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-foreground animate-fade-in-up stagger-${Math.min(idx + 3, 6)}`}
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
