/**
 * Factory de ToolLoopAgent para o chat.
 *
 * Cria uma instância de ToolLoopAgent por request (não singleton), pois as tools
 * dependem de `dataStream` e `session` disponíveis apenas durante a execução do stream.
 *
 * Ganhos sobre `streamText` direto:
 * - `prepareCall` para injeção declarativa de system prompt + RAG/processo context
 * - `callOptionsSchema` para tipagem end-to-end dos parâmetros por request
 * - `agent.onFinish` recebe `totalUsage` diretamente (sem PromiseLike)
 * - Base para futura migração para singleton (quando tools removerem dependência de dataStream)
 */
import { stepCountIs, ToolLoopAgent, type ToolSet } from "ai";
import { z } from "zod";
import type { AgentConfig } from "@/lib/ai/agents-registry";
import { isChatDebugEnabled, logChatDebug } from "@/lib/ai/chat-debug";
import { tokensToCredits } from "@/lib/ai/credits";
import { modelReasoningType } from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { creditsCache } from "@/lib/cache/credits-cache";
import { isProductionEnvironment } from "@/lib/constants";
import { deductCreditsAndRecordUsage, pingDatabase } from "@/lib/db/queries";
import { buildAiSdkTelemetry } from "@/lib/telemetry";

const isDev = process.env.NODE_ENV === "development";

// ---------------------------------------------------------------------------
// Call options schema — parâmetros serializáveis por request
// ---------------------------------------------------------------------------

export const chatCallOptionsSchema = z.object({
  /** ID do utilizador autenticado. */
  userId: z.string(),
  /** ID do chat/conversa. */
  chatId: z.string(),
  /** Model ID efectivo para este request (pode diferir do default do agente). */
  effectiveModel: z.string(),
  /** Instruções efectivas do agente (code + admin override). */
  agentInstructions: z.string(),
  /** Se o modelo é de raciocínio (extended thinking). */
  isReasoningModel: z.boolean(),
  /** Se o modelo usa adaptive thinking. */
  isAdaptiveThinking: z.boolean(),
  /** Contexto da base de conhecimento já resolvido (RAG ou injeção direta). */
  knowledgeContext: z.string().optional(),
  /** Contexto do processo judicial (metadata + estrutura). */
  processoContext: z.string().optional(),
  /** Hints de geolocalização do pedido. */
  requestHints: z.object({
    latitude: z.string().nullish(),
    longitude: z.string().nullish(),
    city: z.string().nullish(),
    country: z.string().nullish(),
  }),
  /** Se há documentos com texto anexados (para activar buscarNoProcesso). */
  hasDocuments: z.boolean(),
});

export type ChatCallOptions = z.infer<typeof chatCallOptionsSchema>;

// ---------------------------------------------------------------------------
// Active tools builder — extrai lógica do execute handler
// ---------------------------------------------------------------------------

const BASE_TOOL_NAMES = [
  "getWeather",
  "createDocument",
  "updateDocument",
  "requestSuggestions",
  "improvePrompt",
  "saveMemory",
  "recallMemories",
  "forgetMemory",
  "requestApproval",
] as const;

type BaseToolName = (typeof BASE_TOOL_NAMES)[number];
type ActiveToolName =
  | BaseToolName
  | "buscarNoProcesso"
  | "createRevisorDefesaDocuments"
  | "createRedatorContestacaoDocument"
  | "analyzeProcessoPipeline"
  | "createMasterDocuments";

export function buildActiveToolNames(opts: {
  isReasoningModel: boolean;
  hasDocuments: boolean;
  agentConfig: AgentConfig;
}): ActiveToolName[] {
  if (opts.isReasoningModel) {
    return [];
  }
  return [
    ...BASE_TOOL_NAMES,
    ...(opts.hasDocuments ? (["buscarNoProcesso"] as const) : []),
    ...(opts.agentConfig.useRevisorDefesaTools
      ? (["createRevisorDefesaDocuments"] as const)
      : []),
    ...(opts.agentConfig.useRedatorContestacaoTool
      ? (["createRedatorContestacaoDocument"] as const)
      : []),
    ...(opts.agentConfig.usePipelineTool
      ? (["analyzeProcessoPipeline"] as const)
      : []),
    ...(opts.agentConfig.useMasterDocumentsTool
      ? (["createMasterDocuments"] as const)
      : []),
  ];
}

// ---------------------------------------------------------------------------
// Credits retry — reutilizado por agent.onFinish
// ---------------------------------------------------------------------------

const CREDITS_MAX_RETRIES = 5;
const CREDITS_RETRY_BASE_MS = 1000;

export async function deductCreditsWithRetry(args: {
  userId: string;
  chatId: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}): Promise<void> {
  const creditsConsumed = tokensToCredits(args.inputTokens, args.outputTokens);
  const deductArgs = {
    userId: args.userId,
    chatId: args.chatId,
    promptTokens: args.inputTokens,
    completionTokens: args.outputTokens,
    model: args.model,
    creditsConsumed,
  };

  // Warm-up: após streams longos o pool PgBouncer pode estar esgotado
  await pingDatabase().catch(() => {
    /* silencioso */
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < CREDITS_MAX_RETRIES; attempt++) {
    try {
      await deductCreditsAndRecordUsage(deductArgs);
      creditsCache.delete(args.userId);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < CREDITS_MAX_RETRIES - 1) {
        const delay = CREDITS_RETRY_BASE_MS * 2 ** attempt; // 1s, 2s, 4s, 8s
        if (isDev) {
          console.warn(
            `[chat-agent] créditos: tentativa ${attempt + 1} falhou, retry em ${delay}ms:`,
            err instanceof Error ? err.message : err
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Parâmetros do factory
// ---------------------------------------------------------------------------

export interface CreateChatAgentParams<TOOLS extends ToolSet> {
  /** Conjunto de tools já instanciadas com as dependências de request (session, dataStream). */
  tools: TOOLS;
  agentConfig: AgentConfig;
  /** ID do utilizador (para créditos). */
  userId: string;
  /** ID do chat (para créditos). */
  chatId: string;
  /** Model ID efectivo (para créditos e provider options). */
  effectiveModel: string;
  /** Flag créditos desabilitados (DISABLE_CREDITS=true). */
  creditsDisabled: boolean;
}

// ---------------------------------------------------------------------------
// Factory principal
// ---------------------------------------------------------------------------

/**
 * Cria uma instância de ToolLoopAgent configurada para o chat.
 * Deve ser chamada após `dataStream` estar disponível (dentro do execute handler).
 *
 * Responsabilidades:
 * - `prepareCall`: injeta system prompt, contexto RAG/processo, model settings
 * - `onStepFinish`: logging de steps em dev/debug
 * - `onFinish`: dedução de créditos (totalUsage disponível diretamente)
 */
export function createChatAgent<TOOLS extends ToolSet>(
  params: CreateChatAgentParams<TOOLS>
) {
  const {
    tools,
    agentConfig,
    userId,
    chatId,
    effectiveModel,
    creditsDisabled,
  } = params;

  const languageModel = getLanguageModel(effectiveModel);

  return new ToolLoopAgent<ChatCallOptions, TOOLS>({
    model: languageModel,
    tools,
    stopWhen: stepCountIs(agentConfig.usePipelineTool ? 7 : 5),
    callOptionsSchema: chatCallOptionsSchema,

    prepareCall: (callParams) => {
      const options = callParams.options;
      if (options === undefined) {
        throw new Error(
          "createChatAgent prepareCall: options em falta com callOptionsSchema definido."
        );
      }
      const isAdaptiveThinking =
        modelReasoningType(options.effectiveModel) === "adaptive";

      return {
        model: languageModel,
        system: systemPrompt({
          selectedChatModel: options.effectiveModel,
          requestHints: options.requestHints as RequestHints,
          agentInstructions: options.agentInstructions,
          knowledgeContext: options.knowledgeContext,
          processoContext: options.processoContext,
          hasDocuments: options.hasDocuments,
        }),
        maxOutputTokens: agentConfig.maxOutputTokens ?? 8192,
        activeTools: buildActiveToolNames({
          isReasoningModel: options.isReasoningModel,
          hasDocuments: options.hasDocuments,
          agentConfig,
        }),
        ...(options.isReasoningModel || isAdaptiveThinking
          ? {}
          : { temperature: 0.2 as const }),
        ...(options.isReasoningModel
          ? {
              providerOptions: {
                anthropic: {
                  thinking: { type: "enabled" as const, budgetTokens: 4000 },
                },
              },
            }
          : isAdaptiveThinking
            ? {
                providerOptions: {
                  anthropic: { thinking: { type: "adaptive" as const } },
                },
              }
            : {}),
      };
    },

    experimental_telemetry: buildAiSdkTelemetry({
      isEnabled: isProductionEnvironment,
      functionId: "stream-text",
      agentId: agentConfig.id,
      model: effectiveModel,
      userId,
      chatId,
    }),

    onStepFinish: ({ stepNumber, usage, toolCalls, finishReason }) => {
      if (isDev) {
        const toolNames = toolCalls.flatMap((tc) => (tc ? [tc.toolName] : []));
        const tools = toolNames.length > 0 ? toolNames.join(", ") : "none";
        console.info(
          `[stream-step] step=${stepNumber} finish=${finishReason} tools=[${tools}] tokens=in:${usage?.inputTokens ?? 0}/out:${usage?.outputTokens ?? 0}`
        );
      }
      if (isChatDebugEnabled()) {
        logChatDebug("step-finish", {
          stepNumber,
          finishReason,
          usage,
          toolNames: toolCalls.flatMap((tc) => (tc ? [tc.toolName] : [])),
        });
      }
    },

    onFinish: async ({ totalUsage }) => {
      if (creditsDisabled) {
        return;
      }
      try {
        await deductCreditsWithRetry({
          userId,
          chatId,
          inputTokens: totalUsage.inputTokens ?? 0,
          outputTokens: totalUsage.outputTokens ?? 0,
          model: effectiveModel,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const isTimeout =
          typeof (error as { code?: string })?.code === "string" &&
          (error as { code: string }).code === "57014";
        if (isDev || isTimeout) {
          console.warn(
            "[chat-agent] Falha ao registar uso/créditos em onFinish:",
            msg
          );
        }
      }
    },
  });
}
