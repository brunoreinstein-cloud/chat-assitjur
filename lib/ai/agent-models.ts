/**
 * Modelos LLM permitidos por agente.
 * Filtra o catálogo global conforme AgentConfig.allowedModelIds.
 */

import { getAgentConfig } from "@/lib/ai/agents-registry-metadata";
import type { ChatModel } from "@/lib/ai/models";
import { chatModels } from "@/lib/ai/models";

/**
 * Lista de modelos que o agente pode usar.
 * Se o agente tiver allowedModelIds, só esses; caso contrário, todos.
 */
export function getModelsForAgent(agentId: string): ChatModel[] {
  const config = getAgentConfig(agentId);
  const ids = config.allowedModelIds;
  if (ids == null || ids.length === 0) {
    return [...chatModels];
  }
  const set = new Set(ids);
  return chatModels.filter((m) => set.has(m.id));
}

/**
 * Mesmo que getModelsForAgent mas agrupado por provider (para o UI do seletor).
 */
export function getModelsByProviderForAgent(
  agentId: string
): Record<string, ChatModel[]> {
  const list = getModelsForAgent(agentId);
  return list.reduce(
    (acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = [];
      }
      acc[model.provider].push(model);
      return acc;
    },
    {} as Record<string, ChatModel[]>
  );
}

/**
 * Indica se um modelo é permitido para o agente.
 */
export function isModelAllowedForAgent(
  agentId: string,
  modelId: string
): boolean {
  const config = getAgentConfig(agentId);
  const ids = config.allowedModelIds;
  if (ids == null || ids.length === 0) {
    return chatModels.some((m) => m.id === modelId);
  }
  return ids.includes(modelId);
}

/**
 * Primeiro modelo permitido para o agente (fallback quando o atual não é permitido).
 */
export function getDefaultModelForAgent(agentId: string): string {
  const list = getModelsForAgent(agentId);
  const first = list[0];
  if (first) {
    return first.id;
  }
  return chatModels[0]?.id ?? "";
}
