import { gateway } from "@ai-sdk/gateway";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";

const THINKING_SUFFIX_REGEX = /-thinking$/;

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        artifactModel,
        chatModel,
        reasoningModel,
        titleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "chat-model-reasoning": reasoningModel,
          "title-model": titleModel,
          "artifact-model": artifactModel,
        },
      });
    })()
  : null;

/**
 * Mapa de fallbacks por modelo primário.
 * Se o modelo primário falhar com erro transiente (503, rate_limit, quota),
 * o handler do chat pode consultar esta lista para tentar alternativas.
 *
 * Exportado para uso no route.ts via getFallbackModels().
 */
export const MODEL_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  // Claude Sonnet → Haiku → GPT-4o mini
  "anthropic/claude-sonnet-4-5": [
    "anthropic/claude-haiku-4-5",
    "openai/gpt-4o-mini",
  ],
  "anthropic/claude-opus-4-5": [
    "anthropic/claude-sonnet-4-5",
    "anthropic/claude-haiku-4-5",
  ],
  // GPT-4o → GPT-4o mini → Gemini Flash Lite
  "openai/gpt-4o": ["openai/gpt-4o-mini", "google/gemini-2.5-flash-lite"],
  "openai/gpt-4o-mini": ["google/gemini-2.5-flash-lite"],
  // Gemini Pro → Flash → Flash Lite
  "google/gemini-2.5-pro": ["google/gemini-2.5-flash", "openai/gpt-4o-mini"],
  "google/gemini-2.5-flash": ["google/gemini-2.5-flash-lite"],
};

/**
 * Retorna os modelos de fallback para um modelId primário.
 * Útil para implementar retry no route.ts em caso de erro transiente do provider.
 *
 * @example
 * try {
 *   await streamText({ model: getLanguageModel(effectiveModel), ... });
 * } catch (err) {
 *   if (isTransientModelError(err)) {
 *     for (const fallback of getFallbackModels(effectiveModel)) {
 *       // tenta com getLanguageModel(fallback)
 *     }
 *   }
 * }
 */
export function getFallbackModels(modelId: string): readonly string[] {
  return MODEL_FALLBACKS[modelId] ?? [];
}

/**
 * Verifica se um erro de LLM é transiente (vale a pena tentar com modelo de fallback).
 * Erros transientes: sobrecarga, rate limit, quota excedida, serviço indisponível.
 */
export function isTransientModelError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const msg = err.message.toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("529") ||
    msg.includes("overloaded") ||
    msg.includes("rate_limit") ||
    msg.includes("quota") ||
    msg.includes("too_many_requests") ||
    msg.includes("service unavailable")
  );
}

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  const isReasoningModel =
    modelId.includes("reasoning") || modelId.endsWith("-thinking");

  if (isReasoningModel) {
    const gatewayModelId = modelId.replace(THINKING_SUFFIX_REGEX, "");

    return wrapLanguageModel({
      model: gateway.languageModel(gatewayModelId),
      middleware: extractReasoningMiddleware({ tagName: "thinking" }),
    });
  }

  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return gateway.languageModel("google/gemini-2.5-flash-lite");
}

export function getArtifactModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("artifact-model");
  }
  return gateway.languageModel("anthropic/claude-haiku-4.5");
}
