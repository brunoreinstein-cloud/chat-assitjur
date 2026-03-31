/**
 * Registry de agentes (SPEC § 7.4, Fase 3).
 * Mapeia agentId → instruções e conjunto de tools para o chat.
 */

import { AGENTE_ASSISTENTE_GERAL_INSTRUCTIONS } from "@/lib/ai/agent-assistente-geral";
import { AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS } from "@/lib/ai/agent-assistjur-master";
import { AGENTE_AUTUORIA_REVISOR_INSTRUCTIONS } from "@/lib/ai/agent-autuoria-revisor";
import { AGENTE_AVALIADOR_CONTESTACAO_INSTRUCTIONS } from "@/lib/ai/agent-avaliador-contestacao";
import { AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS } from "@/lib/ai/agent-redator-contestacao";
import { AGENTE_REVISOR_DEFESAS_INSTRUCTIONS } from "@/lib/ai/agent-revisor-defesas";
import { nonReasoningChatModelIds } from "@/lib/ai/models";

export const AGENT_ID_ASSISTENTE_GERAL = "assistente-geral";
export const AGENT_ID_REVISOR_DEFESAS = "revisor-defesas";
export const AGENT_ID_REDATOR_CONTESTACAO = "redator-contestacao";
export const AGENT_ID_AVALIADOR_CONTESTACAO = "avaliador-contestacao";
export const AGENT_ID_ASSISTJUR_MASTER = "assistjur-master";
export const AGENT_ID_AUTUORIA_REVISOR = "autuoria-revisor";

/** Id usado pela API quando o cliente não envia agentId (chat sem agente selecionado). */
export const DEFAULT_AGENT_ID_WHEN_EMPTY = AGENT_ID_ASSISTENTE_GERAL;

export const AGENT_IDS = [
  AGENT_ID_ASSISTENTE_GERAL,
  AGENT_ID_REVISOR_DEFESAS,
  AGENT_ID_REDATOR_CONTESTACAO,
  AGENT_ID_AVALIADOR_CONTESTACAO,
  AGENT_ID_ASSISTJUR_MASTER,
  AGENT_ID_AUTUORIA_REVISOR,
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

/**
 * Flags de ferramentas de um agente — subset editável pelo admin via override.
 * Cada flag activa/desactiva uma ferramenta específica (e o output associado).
 */
export interface AgentToolFlags {
  /** Auditoria PI+Contestação → gera DOCX */
  useRevisorDefesaTools?: boolean;
  /** Redação de contestação com aprovação → gera DOCX */
  useRedatorContestacaoTool?: boolean;
  /** Memória persistente entre sessões */
  useMemoryTools?: boolean;
  /** Human-in-the-Loop: pausa para aprovação antes de acções irreversíveis */
  useApprovalTool?: boolean;
  /** Pipeline multi-chamadas para PDFs grandes (>200 pgs) */
  usePipelineTool?: boolean;
  /** Geração de Relatórios Master (DOCX/XLSX/JSON) + ZIP download */
  useMasterDocumentsTool?: boolean;
  /** AutuorIA: Quadro de Correções (paisagem) + Contestação Revisada (marcações coloridas + comentários Word) */
  useAutuoriaTools?: boolean;
}

export interface AgentConfig {
  /** Id do agente: built-in (revisor-defesas, etc.) ou UUID do CustomAgent. */
  id: string;
  label: string;
  instructions: string;
  /** Incluir createRevisorDefesaDocuments e validação PI+Contestação */
  useRevisorDefesaTools: boolean;
  /** Incluir createRedatorContestacaoDocument para export minuta DOCX */
  useRedatorContestacaoTool: boolean;
  /**
   * Habilitar Custom Memory Tools (saveMemory, recallMemories, forgetMemory).
   * Quando true, o agente pode guardar e recuperar contexto persistente entre sessões.
   * Default: true — todos os agentes têm memória por omissão.
   */
  useMemoryTools?: boolean;
  /**
   * Habilitar Human-in-the-Loop (requestApproval).
   * Quando true, o agente pode pausar e solicitar aprovação explícita do advogado
   * antes de acções irreversíveis (ex.: submeter peça, enviar comunicação).
   * Default: false — activar apenas em agentes que executam acções externas.
   */
  useApprovalTool?: boolean;
  /**
   * Habilitar Pipeline Multi-Chamadas (analyzeProcessoPipeline).
   * Quando true, o agente pode processar PDFs grandes (>500 pgs) dividindo-os
   * em blocos temáticos e analisando cada um separadamente.
   * Default: false — activar apenas no Master agent.
   */
  usePipelineTool?: boolean;
  /**
   * Habilitar createAvaliadorContestacaoDocument.
   * Quando true, o agente pode gerar o DOCX de Avaliação de Qualidade da Contestação.
   * Default: false — activar apenas no Avaliador de Contestação.
   */
  useAvaliadorContestacaoTool?: boolean;
  /**
   * Habilitar createMasterDocuments (geração DOCX direta + ZIP).
   * Quando true, o agente gera documentos DOCX via stream direto (sem artifact)
   * e oferece download individual e compactado.
   * Default: false — activar apenas no Master agent.
   */
  useMasterDocumentsTool?: boolean;
  /**
   * Habilitar AutuorIA (createAutuoriaDocuments).
   * Quando true, o agente gera Quadro de Correções (paisagem) + Contestação Revisada
   * com marcações coloridas e comentários Word.
   * Default: false — activar apenas no AutuorIA - Revisor de Defesa.
   */
  useAutuoriaTools?: boolean;
  /**
   * Temperature do modelo para este agente.
   * Playbook v9.0: Tipo A/F/G (extração/dados) → 0.1; Tipo B/C/D/E (análise/redação) → 0.2.
   * Se omitido, usa 0.2 como default global.
   */
  temperature?: number;
  /**
   * Habilitar thinking adaptativo (Playbook v9.0 — Tipo B/C/D).
   * true → ativa adaptive thinking em modelos compatíveis (mesmo sem reasoning variant).
   * false → desativa adaptive thinking mesmo que o modelo o suporte (ex.: Master em modo extração).
   * undefined → comportamento baseado no modelo selecionado (legacy).
   */
  thinkingEnabled?: boolean;
  /**
   * IDs de modelos LLM permitidos para este agente (ex.: ["anthropic/claude-sonnet-4.6"]).
   * Se omitido ou vazio, todos os modelos do catálogo são permitidos.
   */
  allowedModelIds?: string[];
  /**
   * Habilitar busca semântica de jurisprudência na Knowledge Base (searchJurisprudencia).
   * Quando true, o agente pode buscar acórdãos, súmulas e OJs indexados pelo utilizador.
   * Default: false — ativar apenas em agentes que fundamentam teses jurídicas.
   */
  useSearchJurisprudenciaTool?: boolean;
  /**
   * Limite de tokens de output para o modelo (maxOutputTokens).
   * Se omitido, usa o default global do route.ts (8192).
   * O Master agent usa 16000 para suportar relatórios longos (M13: 250 campos, 30-50 pgs).
   */
  maxOutputTokens?: number;
  /**
   * Modelo LLM padrão para este agente (override do default global).
   * Aplicado quando o utilizador não seleccionou explicitamente um modelo.
   * Deve estar em allowedModelIds (ou este ser vazio/undefined).
   * Definido via admin override — não existe nas configs do código.
   */
  defaultModelId?: string;
  /**
   * Quando true, o agente suporta o modo Runner (execução single-shot em /run/[agentId]).
   * O Runner apresenta um fluxo linear upload → validar → executar → download,
   * sem interação conversacional.
   */
  supportsRunnerMode?: boolean;
  /**
   * Tipos de documento obrigatórios para o modo Runner.
   * O frontend mostra um checklist e só habilita "Executar" quando todos estão presentes.
   * Array vazio = aceita qualquer documento (ex.: Master).
   */
  requiredDocumentTypes?: Array<"pi" | "contestacao" | "sentenca" | "laudo">;
  /**
   * Número mínimo de documentos para o Runner (defaults para requiredDocumentTypes.length).
   * Útil quando requiredDocumentTypes é vazio mas o agente precisa de pelo menos 1 doc.
   */
  minDocuments?: number;
}

/** Modelos Claude Sonnet/Opus (recomendados para redação jurídica longa). */
const REDATOR_ALLOWED_MODEL_IDS = [
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-opus-4.5",
  "anthropic/claude-opus-4.6",
];

const AGENT_CONFIGS: Record<AgentId, AgentConfig> = {
  [AGENT_ID_ASSISTENTE_GERAL]: {
    id: AGENT_ID_ASSISTENTE_GERAL,
    label: "Assistente",
    instructions: AGENTE_ASSISTENTE_GERAL_INSTRUCTIONS,
    useRevisorDefesaTools: false,
    useRedatorContestacaoTool: false,
    useMemoryTools: true,
    useApprovalTool: false,
    // Tipo G (Pesquisa): extração e consulta → temperature baixa para respostas determinísticas.
    temperature: 0.1,
    // Tipo G: sem análise complexa — adaptive thinking desnecessário.
    thinkingEnabled: false,
  },
  [AGENT_ID_REVISOR_DEFESAS]: {
    id: AGENT_ID_REVISOR_DEFESAS,
    label: "Revisor de Defesas",
    instructions: AGENTE_REVISOR_DEFESAS_INSTRUCTIONS,
    useRevisorDefesaTools: true,
    useRedatorContestacaoTool: false,
    useMemoryTools: true,
    useApprovalTool: false, // Usa GATE do sistema prompt; HITL não necessário aqui
    useSearchJurisprudenciaTool: true, // Busca súmulas/OJs para fundamentar análise de defesas.
    // Tipo B (Analisador): análise jurídica → temperature 0.2 (alguma variação criativa).
    temperature: 0.2,
    // Tipo B (Analisador): análise complexa → thinking adaptativo ativado.
    thinkingEnabled: true,
    /** Apenas modelos sem extended thinking: ferramentas ativas e primeira resposta rápida. */
    allowedModelIds: nonReasoningChatModelIds,
    supportsRunnerMode: true,
    requiredDocumentTypes: ["pi", "contestacao"],
  },
  [AGENT_ID_REDATOR_CONTESTACAO]: {
    id: AGENT_ID_REDATOR_CONTESTACAO,
    label: "Redator de Contestações",
    instructions: AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS,
    useRevisorDefesaTools: false,
    useRedatorContestacaoTool: true,
    useMemoryTools: true,
    useApprovalTool: true, // Advogado aprova minuta antes de gerar DOCX final
    // Tipo C (Redator de Peça): redação jurídica → temperature 0.2 para variação argumentativa.
    temperature: 0.2,
    // Tipo C (Redator de Peça): redação complexa → thinking adaptativo ativado.
    thinkingEnabled: true,
    allowedModelIds: REDATOR_ALLOWED_MODEL_IDS,
  },
  [AGENT_ID_AVALIADOR_CONTESTACAO]: {
    id: AGENT_ID_AVALIADOR_CONTESTACAO,
    label: "Avaliador de Contestação",
    instructions: AGENTE_AVALIADOR_CONTESTACAO_INSTRUCTIONS,
    useRevisorDefesaTools: false,
    useRedatorContestacaoTool: false,
    useAvaliadorContestacaoTool: true,
    useMemoryTools: true,
    useApprovalTool: false,
    // Tipo B (Analisador): avaliação jurídica → temperature 0.2.
    temperature: 0.2,
    // Tipo B (Analisador): análise complexa → thinking adaptativo ativado.
    thinkingEnabled: true,
    allowedModelIds: nonReasoningChatModelIds,
  },
  [AGENT_ID_ASSISTJUR_MASTER]: {
    id: AGENT_ID_ASSISTJUR_MASTER,
    label: "AssistJur.IA Master",
    instructions: AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS,
    useRevisorDefesaTools: false,
    useRedatorContestacaoTool: false,
    useMemoryTools: true,
    useApprovalTool: true, // Master agent pode executar acções — requer aprovação
    usePipelineTool: true, // Pipeline multi-chamadas para PDFs grandes (>500 pgs)
    useMasterDocumentsTool: true, // Geração DOCX direta + ZIP download
    useSearchJurisprudenciaTool: true, // Busca súmulas/OJs/acórdãos para fundamentar módulos (M02, M07, M11).
    // Tipo A/F/G (extração/dados): temperature baixa para minimizar variância em campos extraídos.
    temperature: 0.1,
    // Thinking desativado: extração de dados beneficia de determinismo (temperature 0.1).
    // Adaptive thinking aumentaria latência e custo sem ganho em tarefas estruturadas.
    thinkingEnabled: false,
    // 16000 tokens para relatórios longos (M13: 250 campos, 30-50 pgs ≈ 15K-30K tokens).
    // O default global (8192) trunca o tool call JSON, impedindo a geração do documento.
    maxOutputTokens: 16_000,
    /** Apenas modelos sem extended thinking: ferramentas ativas.
     *  Reasoning models (sufixo -thinking/-reasoning) desactivam tools no route.ts
     *  → createMasterDocuments nunca é chamado → sem documento gerado. */
    allowedModelIds: nonReasoningChatModelIds,
    supportsRunnerMode: true,
    requiredDocumentTypes: [],
    minDocuments: 1,
  },
  [AGENT_ID_AUTUORIA_REVISOR]: {
    id: AGENT_ID_AUTUORIA_REVISOR,
    label: "AutuorIA - Revisor de Defesa",
    instructions: AGENTE_AUTUORIA_REVISOR_INSTRUCTIONS,
    useRevisorDefesaTools: false,
    useRedatorContestacaoTool: false,
    useAutuoriaTools: true,
    useMemoryTools: true,
    useApprovalTool: false,
    useSearchJurisprudenciaTool: true, // Consulta INSTRUÇÃO_CONSOLIDADA e jurisprudência via RAG.
    // Tipo B (Analisador cirúrgico): auditoria + edição de peças → temperature 0.1 (determinístico).
    temperature: 0.1,
    // Thinking adaptativo ativado: análise cruzada PI × Contestação requer raciocínio complexo.
    thinkingEnabled: true,
    // 24000 tokens: análise (4K) + tool call JSON quadro (3K) + revisadaContent (10-14K).
    // 16K era insuficiente — LLM esgotava tokens na análise P1-P3 antes de chamar a tool P4.
    maxOutputTokens: 24_000,
    /** Apenas modelos sem extended thinking: ferramentas ativas. */
    allowedModelIds: nonReasoningChatModelIds,
    supportsRunnerMode: true,
    requiredDocumentTypes: ["pi", "contestacao"],
  },
};

export function getAgentConfig(agentId: string): AgentConfig {
  const id = AGENT_IDS.includes(agentId as AgentId)
    ? (agentId as AgentId)
    : DEFAULT_AGENT_ID_WHEN_EMPTY;
  return AGENT_CONFIGS[id];
}

/**
 * Map de overrides de agentes built-in da BD (admin panel).
 * Cada campo nulo/undefined significa "usar valor do código".
 */
export type BuiltInAgentOverridesMap = Record<
  string,
  {
    instructions: string | null;
    label: string | null;
    defaultModelId?: string | null;
    toolFlags?: Partial<AgentToolFlags> | null;
  }
>;

/** Devolve a config do agente built-in, aplicando overrides da BD se existirem. */
export function getAgentConfigWithOverrides(
  agentId: string,
  overridesMap?: BuiltInAgentOverridesMap | null
): AgentConfig {
  const base = getAgentConfig(agentId);
  const override = overridesMap?.[agentId];
  if (!override) {
    return base;
  }

  // Aplicar apenas os tool flags definidos (não sobrescrever flags ausentes do override)
  const toolFlagOverrides: Partial<AgentToolFlags> = {};
  const flags = override.toolFlags;
  if (flags != null) {
    for (const key of Object.keys(flags) as Array<keyof AgentToolFlags>) {
      if (flags[key] !== undefined) {
        toolFlagOverrides[key] = flags[key];
      }
    }
  }

  return {
    ...base,
    ...toolFlagOverrides,
    ...(override.instructions != null && override.instructions !== ""
      ? { instructions: override.instructions }
      : {}),
    ...(override.label != null && override.label !== ""
      ? { label: override.label }
      : {}),
    ...(override.defaultModelId != null && override.defaultModelId !== ""
      ? { defaultModelId: override.defaultModelId }
      : {}),
  };
}

/** Configuração resolvida para um agente personalizado (CustomAgent da BD). */
export function getAgentConfigForCustomAgent(custom: {
  id: string;
  name: string;
  instructions: string;
  baseAgentId: string | null;
}): AgentConfig {
  const useRevisorDefesaTools = custom.baseAgentId === AGENT_ID_REVISOR_DEFESAS;
  const baseConfig =
    custom.baseAgentId != null && custom.baseAgentId !== ""
      ? AGENT_CONFIGS[custom.baseAgentId as AgentId]
      : undefined;
  const useRedatorContestacaoTool =
    custom.baseAgentId === AGENT_ID_REDATOR_CONTESTACAO;
  return {
    id: custom.id,
    label: custom.name,
    instructions: custom.instructions,
    useRevisorDefesaTools,
    useRedatorContestacaoTool: useRedatorContestacaoTool ?? false,
    allowedModelIds: baseConfig?.allowedModelIds,
  };
}
