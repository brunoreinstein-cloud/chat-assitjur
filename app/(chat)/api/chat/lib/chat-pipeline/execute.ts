import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import { after } from "next/server";
import type { Session } from "next-auth";
import type { AgentConfig } from "@/lib/ai/agents-registry";
import { isChatDebugEnabled } from "@/lib/ai/chat-debug";
import {
  applyContextEditing,
  CONTEXT_WINDOW_INPUT_TARGET_TOKENS,
  estimateInputTokens,
} from "@/lib/ai/context-window";
import { tokensToCredits } from "@/lib/ai/credits";
import { modelReasoningType, modelSupportsVision } from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { analyzeProcessoPipeline } from "@/lib/ai/tools/analyze-processo-pipeline";
import { createAvaliadorContestacaoDocument } from "@/lib/ai/tools/create-avaliador-contestacao-document";
import { createDocument } from "@/lib/ai/tools/create-document";
import { createMasterDocuments } from "@/lib/ai/tools/create-master-documents";
import { createRedatorContestacaoDocument } from "@/lib/ai/tools/create-redator-contestacao-document";
import { createRevisorDefesaDocuments } from "@/lib/ai/tools/create-revisor-defesa-documents";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { requestApproval } from "@/lib/ai/tools/human-in-the-loop";
import { improvePromptTool } from "@/lib/ai/tools/improve-prompt";
import { createMemoryTools } from "@/lib/ai/tools/memory";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { createSearchDocumentTool } from "@/lib/ai/tools/search-document";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { creditsCache } from "@/lib/cache/credits-cache";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deductCreditsAndRecordUsage,
  pingDatabase,
  saveMessages,
  updateChatActiveStreamId,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import { buildAiSdkTelemetry } from "@/lib/telemetry";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import type { PostRequestBody } from "../../schema";
import {
  creditsDisabled,
  getStreamContext,
  isDev,
  logTiming,
  normalizeMessageParts,
  withPromptCachingForAnthropic,
} from "./utils";

type StreamTextResult = Awaited<ReturnType<typeof streamText>>;

/** Parâmetros para buildChatStreamResponse. */
export interface ChatStreamParams {
  requestStart: number;
  debugTracker: {
    phase: (name: string, t: number) => void;
    flush: (label: string) => void;
  };
  id: string;
  message: PostRequestBody["message"];
  session: Session;
  agentInstructions: PostRequestBody["agentInstructions"];
  agentConfig: AgentConfig;
  effectiveModel: string;
  titlePromise: Promise<string> | null;
  isToolApprovalFlow: boolean;
  uiMessages: ChatMessage[];
  requestHints: RequestHints;
  knowledgeContext: string | undefined;
  processoContext: string | undefined;
  /** true se o dbBatch usou fallback (timeout); o stream envia chunk para o cliente mostrar aviso. */
  dbUsedFallback?: boolean;
  /** Textos completos dos documentos anexados, para o tool buscarNoProcesso. */
  documentTexts: Map<string, string>;
  /** Tools MCP (Gmail, Drive, …) carregadas na rota; vazio se indisponíveis. */
  mcpTools?: Record<string, unknown>;
  /**
   * Documento em cache do intake do processo — injetado como mensagem sintética
   * quando não há document parts nas mensagens.
   */
  cachedProcessoDocument?: {
    name: string;
    text: string;
    documentType?: "pi" | "contestacao";
  };
}

/** Resultado da preparação de mensagens para o modelo. */
type PrepareModelMessagesResult =
  | {
      messagesForModel: Awaited<ReturnType<typeof convertToModelMessages>>;
      preStreamEnd: number;
    }
  | { response: Response };

/** Contexto para o handler execute do stream. */
interface StreamExecuteContext {
  session: ChatStreamParams["session"];
  agentInstructions: ChatStreamParams["agentInstructions"];
  agentConfig: AgentConfig;
  agentId: string;
  effectiveModel: string;
  requestHints: RequestHints;
  knowledgeContext: string | undefined;
  processoContext: string | undefined;
  messagesForModel: Awaited<ReturnType<typeof convertToModelMessages>>;
  isReasoningModel: boolean;
  isAdaptiveThinking: boolean;
  titlePromise: Promise<string> | null;
  id: string;
  requestStart: number;
  preStreamEnd: number;
  dbUsedFallback?: boolean;
  documentTexts: Map<string, string>;
  mcpTools: Record<string, unknown>;
}

/** Contexto para o handler onFinish do stream. */
interface StreamOnFinishContext {
  requestStart: number;
  session: ChatStreamParams["session"];
  id: string;
  effectiveModel: string;
  isToolApprovalFlow: boolean;
  uiMessages: ChatMessage[];
}

/** Prepara mensagens para o modelo; devolve mensagens + preStreamEnd ou Response 413. */
async function prepareModelMessagesForStream(
  params: ChatStreamParams,
  debugTracker: ChatStreamParams["debugTracker"]
): Promise<PrepareModelMessagesResult> {
  const {
    requestStart,
    message,
    agentInstructions,
    agentConfig,
    effectiveModel,
    uiMessages,
    requestHints,
    knowledgeContext,
    processoContext,
  } = params;
  const t5 = Date.now();
  const visionEnabled = modelSupportsVision(effectiveModel);

  let uiMessagesWithCache = uiMessages;
  if (params.cachedProcessoDocument) {
    const hasDocInMessages = uiMessages.some((m) =>
      (m.parts ?? []).some((p) => (p as { type?: string }).type === "document")
    );
    if (!hasDocInMessages) {
      const { name, text, documentType } = params.cachedProcessoDocument;
      const syntheticMsg: ChatMessage = {
        id: "processo-cache-doc",
        role: "user",
        parts: [
          {
            type: "document",
            name,
            text,
            ...(documentType ? { documentType } : {}),
          } as unknown as ChatMessage["parts"][number],
        ],
      };
      uiMessagesWithCache = [syntheticMsg, ...uiMessages];
    }
  }

  const normalizedMessages = normalizeMessageParts(
    uiMessagesWithCache,
    visionEnabled
  );
  const effectiveAgentInstructionsForContext =
    agentInstructions?.trim() || agentConfig.instructions;
  const systemStrForEstimate = systemPrompt({
    selectedChatModel: effectiveModel,
    requestHints,
    agentInstructions: effectiveAgentInstructionsForContext,
    knowledgeContext,
    processoContext,
    hasDocuments: params.documentTexts.size > 0,
  });
  const messagesToSend = applyContextEditing(normalizedMessages);
  const estimatedInputTokens = estimateInputTokens(
    systemStrForEstimate.length,
    messagesToSend
  );
  if (estimatedInputTokens > CONTEXT_WINDOW_INPUT_TARGET_TOKENS) {
    return {
      response: Response.json(
        {
          code: "context_limit",
          message:
            "O contexto desta conversa excede o limite do modelo. Por favor, inicia um novo chat ou encurta a conversa.",
          estimatedTokens: estimatedInputTokens,
          limit: CONTEXT_WINDOW_INPUT_TARGET_TOKENS,
        },
        { status: 413 }
      ),
    };
  }
  let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  try {
    modelMessages = await convertToModelMessages(messagesToSend);
  } catch (convertError) {
    if (isDev) {
      console.warn(
        "[chat] convertToModelMessages falhou (partes inválidas?), a usar apenas a última mensagem:",
        convertError
      );
    }
    const fallbackMessages =
      message?.role === "user"
        ? normalizeMessageParts([message as ChatMessage], visionEnabled)
        : normalizedMessages.slice(-1);
    modelMessages = await convertToModelMessages(fallbackMessages);
  }
  debugTracker.phase("contextConvert", t5);
  logTiming(
    "contextEditing + estimateTokens + normalizeMessageParts + convertToModelMessages",
    Date.now() - t5
  );
  const messagesForModel = withPromptCachingForAnthropic(
    effectiveModel,
    modelMessages
  );
  const preStreamEnd = Date.now();
  debugTracker.flush("preStreamPhases");
  logTiming("preStream (total antes do stream)", preStreamEnd - requestStart);
  return { messagesForModel, preStreamEnd };
}

/** Cria o callback execute para createUIMessageStream; escreve streamTextResult em ref. */
function createStreamExecuteHandler(
  ctx: StreamExecuteContext,
  streamTextResultRef: { current: StreamTextResult | null }
) {
  return async ({
    writer: dataStream,
  }: {
    writer: Parameters<
      Parameters<typeof createUIMessageStream>[0]["execute"]
    >[0]["writer"];
  }) => {
    if (ctx.dbUsedFallback) {
      dataStream.write({ type: "data-db-fallback", data: true });
    }
    const executeStartedAt = Date.now();
    if (isChatDebugEnabled()) {
      dataStream.write({
        type: "data-chat-debug",
        data: {
          preStreamMs: ctx.preStreamEnd - ctx.requestStart,
          executeStartedMs: executeStartedAt - ctx.requestStart,
        },
      });
    }
    logTiming(
      "execute started (modelo + tools a correr)",
      executeStartedAt - ctx.requestStart
    );
    const effectiveAgentInstructions =
      ctx.agentInstructions?.trim() || ctx.agentConfig.instructions;

    const baseToolNames = [
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
    type ActiveToolName =
      | (typeof baseToolNames)[number]
      | "buscarNoProcesso"
      | "createRevisorDefesaDocuments"
      | "createRedatorContestacaoDocument"
      | "createAvaliadorContestacaoDocument"
      | "analyzeProcessoPipeline"
      | "createMasterDocuments";
    const activeToolNames: ActiveToolName[] = ctx.isReasoningModel
      ? []
      : [
          ...baseToolNames,
          // buscarNoProcesso: disponível sempre que há documentos com texto anexados
          ...(ctx.documentTexts.size > 0
            ? (["buscarNoProcesso"] as const)
            : []),
          ...(ctx.agentConfig.useRevisorDefesaTools
            ? (["createRevisorDefesaDocuments"] as const)
            : []),
          ...(ctx.agentConfig.useRedatorContestacaoTool
            ? (["createRedatorContestacaoDocument"] as const)
            : []),
          ...(ctx.agentConfig.useAvaliadorContestacaoTool
            ? (["createAvaliadorContestacaoDocument"] as const)
            : []),
          ...(ctx.agentConfig.usePipelineTool
            ? (["analyzeProcessoPipeline"] as const)
            : []),
          ...(ctx.agentConfig.useMasterDocumentsTool
            ? (["createMasterDocuments"] as const)
            : []),
        ];

    const memoryTools = createMemoryTools({ userId: ctx.session.user.id });
    const tools = {
      getWeather,
      createDocument: createDocument({ session: ctx.session, dataStream }),
      updateDocument: updateDocument({ session: ctx.session, dataStream }),
      requestSuggestions: requestSuggestions({
        session: ctx.session,
        dataStream,
      }),
      improvePrompt: improvePromptTool,
      saveMemory: memoryTools.saveMemory,
      recallMemories: memoryTools.recallMemories,
      forgetMemory: memoryTools.forgetMemory,
      requestApproval,
      // buscarNoProcesso criado com os textos completos em closure
      ...(ctx.documentTexts.size > 0
        ? {
            buscarNoProcesso: createSearchDocumentTool({
              documentTexts: ctx.documentTexts,
            }),
          }
        : {}),
    } as {
      getWeather: typeof getWeather;
      createDocument: ReturnType<typeof createDocument>;
      updateDocument: ReturnType<typeof updateDocument>;
      requestSuggestions: ReturnType<typeof requestSuggestions>;
      improvePrompt: typeof improvePromptTool;
      saveMemory: ReturnType<typeof createMemoryTools>["saveMemory"];
      recallMemories: ReturnType<typeof createMemoryTools>["recallMemories"];
      forgetMemory: ReturnType<typeof createMemoryTools>["forgetMemory"];
      requestApproval: typeof requestApproval;
      buscarNoProcesso?: ReturnType<typeof createSearchDocumentTool>;
      createRevisorDefesaDocuments?: ReturnType<
        typeof createRevisorDefesaDocuments
      >;
      createRedatorContestacaoDocument?: ReturnType<
        typeof createRedatorContestacaoDocument
      >;
      createAvaliadorContestacaoDocument?: ReturnType<
        typeof createAvaliadorContestacaoDocument
      >;
      analyzeProcessoPipeline?: ReturnType<typeof analyzeProcessoPipeline>;
      createMasterDocuments?: ReturnType<typeof createMasterDocuments>;
    };
    if (ctx.agentConfig.useRevisorDefesaTools) {
      tools.createRevisorDefesaDocuments = createRevisorDefesaDocuments({
        session: ctx.session,
        dataStream,
      });
    }
    if (ctx.agentConfig.usePipelineTool) {
      tools.analyzeProcessoPipeline = analyzeProcessoPipeline({
        session: ctx.session,
        dataStream,
      });
    }
    if (ctx.agentConfig.useRedatorContestacaoTool) {
      tools.createRedatorContestacaoDocument = createRedatorContestacaoDocument(
        {
          session: ctx.session,
          dataStream,
        }
      );
    }
    if (ctx.agentConfig.useAvaliadorContestacaoTool) {
      tools.createAvaliadorContestacaoDocument =
        createAvaliadorContestacaoDocument({
          session: ctx.session,
          dataStream,
        });
    }
    if (ctx.agentConfig.useMasterDocumentsTool) {
      tools.createMasterDocuments = createMasterDocuments({
        session: ctx.session,
        dataStream,
      });
    }

    if (Object.keys(ctx.mcpTools).length > 0) {
      Object.assign(tools, ctx.mcpTools);
    }

    const result = streamText({
      model: getLanguageModel(ctx.effectiveModel),
      // temperature não é suportado quando thinking está activo (adaptive ou extended).
      // Omitir evita o warning da AI SDK e o parâmetro a ser silenciosamente ignorado.
      ...(ctx.isReasoningModel || ctx.isAdaptiveThinking
        ? {}
        : { temperature: 0.2 }),
      maxOutputTokens: ctx.agentConfig.maxOutputTokens ?? 8192,
      system: systemPrompt({
        selectedChatModel: ctx.effectiveModel,
        requestHints: ctx.requestHints,
        agentInstructions: effectiveAgentInstructions,
        knowledgeContext: ctx.knowledgeContext,
        processoContext: ctx.processoContext,
        hasDocuments: ctx.documentTexts.size > 0,
      }),
      messages: ctx.messagesForModel as Awaited<
        ReturnType<typeof convertToModelMessages>
      >,
      // Permite múltiplos steps: step 1 = model chama tool; step 2 = model gera texto após tool result (entrega).
      // Sem isto (default stepCountIs(1)) o stream encerra após a tool e o utilizador não vê mensagem.
      // Master com pipeline pode precisar: pipeline → createDocument → resposta (7 steps).
      stopWhen: stepCountIs(ctx.agentConfig.usePipelineTool ? 7 : 5),
      experimental_activeTools: activeToolNames,
      providerOptions: ctx.isReasoningModel
        ? {
            anthropic: {
              thinking: {
                type: "enabled",
                budgetTokens: 4000,
              },
            },
          }
        : ctx.isAdaptiveThinking
          ? { anthropic: { thinking: { type: "adaptive" } } }
          : undefined,
      tools,
      experimental_telemetry: buildAiSdkTelemetry({
        isEnabled: isProductionEnvironment,
        functionId: "stream-text",
        agentId: ctx.agentId,
        model: ctx.effectiveModel,
        userId: ctx.session.user.id,
        chatId: ctx.id,
      }),
      // Aborta o stream ao fim de 270s para fechar graciosamente antes do
      // corte do Vercel (300s). Evita o "Task timed out after 300 seconds".
      abortSignal: AbortSignal.timeout(270_000),
    });
    streamTextResultRef.current = result as unknown as StreamTextResult;

    dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));

    if (ctx.titlePromise) {
      const title = await ctx.titlePromise;
      dataStream.write({ type: "data-chat-title", data: title });
      updateChatTitleById({ chatId: ctx.id, title });
    }
  };
}

/** Cria o callback onFinish para createUIMessageStream. */
function createStreamOnFinishHandler(
  ctx: StreamOnFinishContext,
  streamTextResultRef: { current: StreamTextResult | null }
) {
  return async ({
    messages: finishedMessages,
  }: {
    messages: Array<{ id: string; role: string; parts: unknown[] }>;
  }) => {
    const streamTextResult = streamTextResultRef.current;
    const onFinishStart = Date.now();
    logTiming(
      "onFinish (stream terminou) total request",
      onFinishStart - ctx.requestStart
    );

    try {
      const logOnFinishDbError = (label: string, err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout =
          typeof (err as { code?: string })?.code === "string" &&
          (err as { code: string }).code === "57014";
        if (isDev || isTimeout) {
          console.warn(`[chat] ${label}:`, msg);
        }
      };
      let saveMessagesPromise: Promise<void>;
      if (ctx.isToolApprovalFlow) {
        saveMessagesPromise = (async () => {
          for (const finishedMsg of finishedMessages) {
            const existingMsg = ctx.uiMessages.find(
              (m) => m.id === finishedMsg.id
            );
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: ctx.id,
                  },
                ],
              });
            }
          }
        })().catch((err: unknown) => {
          logOnFinishDbError(
            "saveMessages (tool-approval) em onFinish falhou",
            err
          );
        });
      } else if (finishedMessages.length > 0) {
        saveMessagesPromise = saveMessages({
          messages: finishedMessages.map((currentMessage) => ({
            id: currentMessage.id,
            role: currentMessage.role,
            parts: currentMessage.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: ctx.id,
          })),
        })
          .then(() => undefined)
          .catch((err: unknown) => {
            logOnFinishDbError("saveMessages em onFinish falhou", err);
          });
      } else {
        saveMessagesPromise = Promise.resolve();
      }

      const creditsPromise =
        creditsDisabled || !streamTextResult
          ? Promise.resolve()
          : (async () => {
              try {
                const usage = await streamTextResult.totalUsage;
                const promptTokens =
                  "promptTokens" in usage
                    ? (usage as { promptTokens: number }).promptTokens
                    : ((usage as { inputTokens?: number }).inputTokens ?? 0);
                const completionTokens =
                  "completionTokens" in usage
                    ? (usage as { completionTokens: number }).completionTokens
                    : ((usage as { outputTokens?: number }).outputTokens ?? 0);
                const creditsConsumed = tokensToCredits(
                  promptTokens,
                  completionTokens
                );
                const deductArgs = {
                  userId: ctx.session.user.id,
                  chatId: ctx.id,
                  promptTokens,
                  completionTokens,
                  model: ctx.effectiveModel,
                  creditsConsumed,
                };
                // Após streams longos (>2min) o pool PgBouncer pode estar
                // esgotado. Aguarda o warm-up (await) para que a ligação esteja
                // activa antes do primeiro retry — sem await o SELECT 1 ainda não
                // tinha terminado quando a transacção era tentada.
                const CREDITS_MAX_RETRIES = 5;
                const CREDITS_RETRY_BASE_MS = 1000;
                await pingDatabase().catch(() => {
                  /* warm-up silencioso; ignora erro de ping */
                });
                let lastCreditsError: unknown;
                let saved = false;
                for (
                  let attempt = 0;
                  attempt < CREDITS_MAX_RETRIES;
                  attempt++
                ) {
                  try {
                    await deductCreditsAndRecordUsage(deductArgs);
                    saved = true;
                    break;
                  } catch (err) {
                    lastCreditsError = err;
                    if (attempt < CREDITS_MAX_RETRIES - 1) {
                      const delay = CREDITS_RETRY_BASE_MS * 2 ** attempt; // 1s, 2s, 4s, 8s
                      if (isDev) {
                        console.warn(
                          `[chat] créditos: tentativa ${attempt + 1} falhou, retry em ${delay}ms:`,
                          err instanceof Error ? err.message : err
                        );
                      }
                      await new Promise((resolve) =>
                        setTimeout(resolve, delay)
                      );
                    }
                  }
                }
                if (!saved) {
                  throw lastCreditsError;
                }
                creditsCache.delete(ctx.session.user.id);
              } catch (error_) {
                logOnFinishDbError(
                  "Falha ao registar uso/créditos em onFinish",
                  error_
                );
              }
            })();

      await Promise.all([saveMessagesPromise, creditsPromise]);

      after(() => {
        updateChatActiveStreamId({
          chatId: ctx.id,
          activeStreamId: null,
        }).catch((err: unknown) => {
          const isTimeout =
            typeof (err as { code?: string })?.code === "string" &&
            (err as { code: string }).code === "57014";
          if (isDev || isTimeout) {
            console.warn(
              "[chat] updateChatActiveStreamId em after falhou:",
              err instanceof Error ? err.message : err
            );
          }
        });
      });
    } catch (err) {
      if (isDev) {
        console.warn("[chat] onFinish falhou:", err);
      }
    }
    logTiming("onFinish completo", Date.now() - onFinishStart);
  };
}

/** Callback onError para createUIMessageStream. */
function streamOnErrorHandler(error: unknown): string {
  const fallback = "Ocorreu um erro ao processar o pedido. Tente novamente.";
  const err = error instanceof Error ? error : new Error(String(error));
  const isInsufficientFunds = /insufficient\s+funds/i.test(err.message);
  if (isInsufficientFunds) {
    const hint =
      "A conta Vercel não tem créditos para o AI Gateway. Adicione créditos em Vercel Dashboard → AI (top-up) ou use uma chave de API direta do fornecedor (ex.: ANTHROPIC_API_KEY) em desenvolvimento. Ver docs/vercel-setup.md.";
    return process.env.NODE_ENV === "development"
      ? `${hint} (dev: ${err.message})`
      : hint;
  }
  if (process.env.NODE_ENV === "development") {
    return `${fallback} (dev: ${err.message})`;
  }
  if (process.env.NODE_ENV === "production") {
    console.error("[chat] onError (produção):", err.message, err.stack);
  }
  return fallback;
}

/** Cria o handler consumeSseStream para createUIMessageStreamResponse. */
function createConsumeSseStreamHandler(chatId: string) {
  return async function consumeSseStream({
    stream: sseStream,
  }: {
    stream: ReadableStream<string>;
  }) {
    if (!process.env.REDIS_URL) {
      return;
    }
    try {
      const streamContext = getStreamContext();
      if (streamContext) {
        await updateChatActiveStreamId({
          chatId,
          activeStreamId: null,
        });
        const streamId = generateId();
        await createStreamId({ streamId, chatId });
        await streamContext.createNewResumableStream(streamId, () => sseStream);
        await updateChatActiveStreamId({
          chatId,
          activeStreamId: streamId,
        });
      }
    } catch {
      // Redis/stream context opcional: ignorar erros para não falhar o request
    }
  };
}

/** Cria o stream e a Response após as mensagens estarem preparadas. */
function buildStreamAndResponse(
  params: ChatStreamParams,
  prepared: {
    messagesForModel: Awaited<ReturnType<typeof convertToModelMessages>>;
    preStreamEnd: number;
  }
): Response {
  const {
    requestStart,
    id,
    session,
    agentInstructions,
    agentConfig,
    effectiveModel,
    titlePromise,
    isToolApprovalFlow,
    uiMessages,
    requestHints,
    knowledgeContext,
    processoContext,
    documentTexts,
    mcpTools = {},
  } = params;
  const { messagesForModel, preStreamEnd } = prepared;

  const isReasoningModel =
    effectiveModel.includes("reasoning") || effectiveModel.includes("thinking");
  const isAdaptiveThinking = modelReasoningType(effectiveModel) === "adaptive";

  // Ref partilhada entre execute e onFinish: o SDK invoca execute antes de onFinish,
  // pelo que onFinish pode ler streamTextResultRef.current com segurança.
  const streamTextResultRef: { current: StreamTextResult | null } = {
    current: null,
  };

  const executeContext: StreamExecuteContext = {
    session,
    agentInstructions,
    agentConfig,
    agentId: agentConfig.id,
    effectiveModel,
    requestHints,
    knowledgeContext,
    processoContext,
    messagesForModel,
    isReasoningModel,
    isAdaptiveThinking,
    titlePromise,
    id,
    requestStart,
    preStreamEnd,
    dbUsedFallback: params.dbUsedFallback,
    documentTexts,
    mcpTools,
  };

  const onFinishContext: StreamOnFinishContext = {
    requestStart,
    session,
    id,
    effectiveModel,
    isToolApprovalFlow,
    uiMessages,
  };

  const stream = createUIMessageStream({
    originalMessages: isToolApprovalFlow ? uiMessages : undefined,
    execute: createStreamExecuteHandler(executeContext, streamTextResultRef),
    generateId: generateUUID,
    onFinish: createStreamOnFinishHandler(onFinishContext, streamTextResultRef),
    onError: streamOnErrorHandler,
  });

  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: createConsumeSseStreamHandler(id),
  });
}

/** Prepara mensagens para o modelo, cria o stream e devolve a Response. */
export async function buildChatStreamResponse(
  params: ChatStreamParams
): Promise<Response> {
  const prepared = await prepareModelMessagesForStream(
    params,
    params.debugTracker
  );
  if ("response" in prepared) {
    return prepared.response;
  }
  return buildStreamAndResponse(params, prepared);
}
