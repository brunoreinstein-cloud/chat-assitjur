import {
  AGENT_ID_ASSISTJUR_MASTER,
  AGENT_ID_REDATOR_CONTESTACAO,
  AGENT_ID_REVISOR_DEFESAS,
  type AgentId,
} from "@/lib/ai/agents-registry-metadata";

/** Classe Tailwind do dot de risco (bg-*). */
export const RISCO_DOT: Record<string, string> = {
  provavel: "bg-red-400",
  possivel: "bg-amber-400",
  remoto: "bg-emerald-400",
};

/** Classes Tailwind do badge de risco (fundo + borda + texto). */
export const RISCO_CLASSES: Record<string, string> = {
  provavel: "bg-red-500/15 border-red-500/25 text-red-400",
  possivel: "bg-amber-500/15 border-amber-500/25 text-amber-400",
  remoto: "bg-emerald-500/15 border-emerald-500/25 text-emerald-400",
};

/** Rótulo legível do nível de risco. */
export const RISCO_LABEL: Record<string, string> = {
  provavel: "Provável",
  possivel: "Possível",
  remoto: "Remoto",
};

/** Rótulo legível da fase do pipeline. */
export const FASE_LABEL: Record<string, string> = {
  recebimento: "Recebimento",
  analise_risco: "Análise de Risco",
  estrategia: "Estratégia",
  elaboracao: "Elaboração",
  revisao: "Revisão",
  protocolo: "Protocolo",
};

/** Sequência ordenada de fases do pipeline (primeira → última). */
export const FASE_ORDER = [
  "recebimento",
  "analise_risco",
  "estrategia",
  "elaboracao",
  "revisao",
  "protocolo",
] as const;

export type Fase = (typeof FASE_ORDER)[number];

/**
 * Retorna a próxima fase do pipeline, ou null se já estiver na fase terminal.
 * Fases desconhecidas (valores legados) também retornam null.
 */
export function nextFase(fase: string | null | undefined): Fase | null {
  const idx = FASE_ORDER.indexOf(fase as Fase);
  if (idx === -1 || idx === FASE_ORDER.length - 1) {
    return null;
  }
  return FASE_ORDER[idx + 1];
}

/** Mapeia fase do processo para o agentId recomendado. */
export const FASE_TO_AGENT: Record<string, AgentId> = {
  recebimento: AGENT_ID_ASSISTJUR_MASTER,
  analise_risco: AGENT_ID_REVISOR_DEFESAS,
  estrategia: AGENT_ID_REVISOR_DEFESAS,
  elaboracao: AGENT_ID_REDATOR_CONTESTACAO,
  revisao: AGENT_ID_REVISOR_DEFESAS,
  protocolo: AGENT_ID_ASSISTJUR_MASTER,
};
