/**
 * Metadados dos agentes built-in (IDs, labels, allowedModelIds) para uso em client components.
 * Não importa instruções nem módulos que usem node:fs.
 */

import { nonReasoningChatModelIds } from "@/lib/ai/models";

export const AGENT_ID_ASSISTENTE_GERAL = "assistente-geral";
export const AGENT_ID_REVISOR_DEFESAS = "revisor-defesas";
export const AGENT_ID_REDATOR_CONTESTACAO = "redator-contestacao";
export const AGENT_ID_ASSISTJUR_MASTER = "assistjur-master";

/** Id usado na UI e API quando nenhum agente está selecionado (envio usa este agente por defeito). */
export const DEFAULT_AGENT_ID_WHEN_EMPTY = AGENT_ID_ASSISTENTE_GERAL;

export const AGENT_IDS = [
  AGENT_ID_ASSISTENTE_GERAL,
  AGENT_ID_REVISOR_DEFESAS,
  AGENT_ID_REDATOR_CONTESTACAO,
  AGENT_ID_ASSISTJUR_MASTER,
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

/** Valor usado na UI quando nenhum agente está selecionado (ex.: novo chat). */
export const NO_AGENT_SELECTED = "";

export interface AgentConfigMetadata {
  id: string;
  label: string;
  /** Descrição curta para o greeting (estado vazio do chat). */
  description?: string;
  allowedModelIds?: string[];
}

const REDATOR_ALLOWED_MODEL_IDS = [
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-opus-4.5",
  "anthropic/claude-opus-4.6",
];

const LABELS: Record<AgentId, string> = {
  [AGENT_ID_ASSISTENTE_GERAL]: "Assistente",
  [AGENT_ID_REVISOR_DEFESAS]: "Revisor de Defesas",
  [AGENT_ID_REDATOR_CONTESTACAO]: "Redator de Contestações",
  [AGENT_ID_ASSISTJUR_MASTER]: "AssistJur.IA Master",
};

const DESCRIPTIONS: Record<AgentId, string> = {
  [AGENT_ID_ASSISTENTE_GERAL]:
    "Responde dúvidas sobre o uso do produto e orienta a escolher o agente adequado. Não dá aconselhamento jurídico.",
  [AGENT_ID_REVISOR_DEFESAS]:
    "Assistente para revisão de defesas trabalhistas. Audito contestações, aponto correções e preparo a equipe para audiência.",
  [AGENT_ID_REDATOR_CONTESTACAO]:
    "Assistente para redação de contestações trabalhistas. Elaboro minutas com base em modelos e na base de teses.",
  [AGENT_ID_ASSISTJUR_MASTER]:
    "14 módulos de análise processual: relatórios, carta de prognóstico, planilha eLaw, auditoria 360º e documentos especializados.",
};

const ALLOWED_MODEL_IDS: Partial<Record<AgentId, string[]>> = {
  [AGENT_ID_REDATOR_CONTESTACAO]: REDATOR_ALLOWED_MODEL_IDS,
  /** Revisor usa apenas modelos sem extended thinking para ter ferramentas ativas e resposta rápida. */
  [AGENT_ID_REVISOR_DEFESAS]: nonReasoningChatModelIds,
  /**
   * Master usa apenas modelos sem extended thinking: ferramentas (createMasterDocuments,
   * analyzeProcessoPipeline) ficam ativas. Reasoning models desactivam tools no route.ts
   * → nenhum documento é gerado.
   */
  [AGENT_ID_ASSISTJUR_MASTER]: nonReasoningChatModelIds,
};

export function getAgentConfig(agentId: string): AgentConfigMetadata {
  const effectiveId =
    agentId === NO_AGENT_SELECTED || !agentId
      ? DEFAULT_AGENT_ID_WHEN_EMPTY
      : agentId;
  const id = AGENT_IDS.includes(effectiveId as AgentId)
    ? (effectiveId as AgentId)
    : DEFAULT_AGENT_ID_WHEN_EMPTY;
  return {
    id,
    label: LABELS[id],
    description: DESCRIPTIONS[id],
    allowedModelIds: ALLOWED_MODEL_IDS[id],
  };
}

/** Rótulo para exibição; para agente customizado usa-se name da API. */
export function getAgentLabel(agentId: string): string {
  return getAgentConfig(agentId).label;
}
