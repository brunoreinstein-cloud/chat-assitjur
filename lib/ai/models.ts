// Curated list of top models from Vercel AI Gateway
export const DEFAULT_CHAT_MODEL = "anthropic/claude-sonnet-4.6";

export interface ChatModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  /**
   * Indica se o modelo suporta entradas multimodais (imagens + texto).
   * Multi-Modal Agent — Cookbook pattern.
   * Quando false, partes de imagem são removidas antes de enviar ao LLM.
   */
  supportsVision?: boolean;
}

export const chatModels: ChatModel[] = [
  // Anthropic — todos os modelos Claude suportam visão
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    description: "Fast and affordable, great for everyday tasks",
    supportsVision: true,
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    description: "Best balance of speed, intelligence, and cost",
    supportsVision: true,
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    description:
      "Latest Sonnet: coding, agents, long context, adaptive thinking",
    supportsVision: true,
  },
  {
    id: "anthropic/claude-opus-4.5",
    name: "Claude Opus 4.5",
    provider: "anthropic",
    description: "Most capable Anthropic model",
    supportsVision: true,
  },
  {
    id: "anthropic/claude-opus-4.6",
    name: "Claude Opus 4.6",
    provider: "anthropic",
    description: "Latest Opus, maximum capability",
    supportsVision: true,
  },
  // OpenAI — GPT-4 series com visão
  {
    id: "openai/gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    provider: "openai",
    description: "Fast and cost-effective for simple tasks",
    supportsVision: true,
  },
  {
    id: "openai/gpt-5.2",
    name: "GPT-5.2",
    provider: "openai",
    description: "Most capable OpenAI model",
    supportsVision: true,
  },
  // Google — todos Gemini suportam visão
  {
    id: "google/gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    provider: "google",
    description: "Ultra fast and affordable",
    supportsVision: true,
  },
  {
    id: "google/gemini-3-pro-preview",
    name: "Gemini 3 Pro",
    provider: "google",
    description: "Most capable Google model",
    supportsVision: true,
  },
  // xAI
  {
    id: "xai/grok-4.1-fast-non-reasoning",
    name: "Grok 4.1 Fast",
    provider: "xai",
    description: "Fast with 30K context",
    supportsVision: true,
  },
  // Reasoning models (extended thinking)
  {
    id: "anthropic/claude-3.7-sonnet-thinking",
    name: "Claude 3.7 Sonnet",
    provider: "reasoning",
    description: "Extended thinking for complex problems",
    supportsVision: true,
  },
  {
    id: "xai/grok-code-fast-1-thinking",
    name: "Grok Code Fast",
    provider: "reasoning",
    description: "Reasoning optimized for code",
    supportsVision: false,
  },
];

/** IDs de modelos sem extended thinking (reasoning). Usado pelo Revisor de Defesas para garantir ferramentas ativas e primeira resposta rápida. */
export const nonReasoningChatModelIds = chatModels
  .filter((m) => !(m.id.includes("reasoning") || m.id.includes("thinking")))
  .map((m) => m.id);

// Group models by provider for UI
export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);

/**
 * Retorna true se o modelId suporta entradas de imagem (visão multimodal).
 * Multi-Modal Agent — Cookbook pattern.
 *
 * Fallback conservador: modelos desconhecidos são tratados como sem visão
 * para evitar erros de API. Claude e GPT-4V/Gemini suportam por padrão.
 */
export function modelSupportsVision(modelId: string): boolean {
  const model = chatModels.find((m) => m.id === modelId);
  if (model) {
    return model.supportsVision ?? false;
  }
  // Fallback por prefixo para modelos não listados (ex.: versões futuras)
  const lc = modelId.toLowerCase();
  return (
    lc.startsWith("anthropic/") ||
    lc.startsWith("openai/gpt-4") ||
    lc.startsWith("openai/gpt-5") ||
    lc.startsWith("google/gemini") ||
    lc.startsWith("xai/grok")
  );
}
