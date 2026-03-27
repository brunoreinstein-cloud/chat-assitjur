/**
 * Execução do stream LLM: execute, onFinish, onError, Response.
 * Extraído de app/(chat)/api/chat/route.ts.
 */

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
import { after } from "next/server";
import type { ChatCallOptions, TaskTelemetry } from "@/lib/ai/chat-agent";
import { createChatAgent } from "@/lib/ai/chat-agent";
import type { createChatDebugTracker } from "@/lib/ai/chat-debug";
import { isChatDebugEnabled } from "@/lib/ai/chat-debug";
import {
  applyContextEditing,
  CONTEXT_WINDOW_INPUT_TARGET_TOKENS,
  estimateInputTokens,
} from "@/lib/ai/context-window";
import { withPromptCaching } from "@/lib/ai/middleware";
import { modelReasoningType, modelSupportsVision } from "@/lib/ai/models";
import { systemPrompt } from "@/lib/ai/prompts";
import {
  createStreamId,
  getTaskExecutionByChatId,
  saveMessages,
  updateChatActiveStreamId,
  updateChatTitleById,
  updateMessage,
  updateTaskExecution,
} from "@/lib/db/queries";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import { normalizeMessageParts } from "./parse-request";
import { buildToolsForAgent } from "./tool-registry";
import type {
  ChatStreamParams,
  PrepareModelMessagesResult,
  StreamExecuteContext,
  StreamOnFinishContext,
} from "./types";
import { creditsDisabled, getStreamContext, isDev, logTiming } from "./utils";

/** Prepara mensagens para o modelo; devolve mensagens + preStreamEnd ou Response 413. */
export async function prepareModelMessagesForStream(
  params: ChatStreamParams,
  debugTracker: ReturnType<typeof createChatDebugTracker>
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

  // Injetar documento em cache do processo quando não há documento nos messages.
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
    console.warn(
      "[chat] convertToModelMessages falhou, a usar apenas a última mensagem:",
      convertError
    );
    const fallbackMessages =
      message?.role === "user"
        ? normalizeMessageParts([message as ChatMessage], visionEnabled)
        : normalizedMessages.slice(-1);
    try {
      modelMessages = await convertToModelMessages(fallbackMessages);
    } catch (fallbackError) {
      console.error(
        "[chat] convertToModelMessages fallback também falhou:",
        fallbackError,
        "fallbackMessages:",
        JSON.stringify(
          fallbackMessages.map((m) => ({
            role: m.role,
            partsCount: (m.parts ?? []).length,
            partTypes: (m.parts ?? []).map(
              (p) => (p as { type?: string }).type
            ),
          }))
        )
      );
      // Último recurso: mensagem de texto puro para não crashar com messages: undefined
      modelMessages = [
        {
          role: "user" as const,
          content:
            message?.parts
              ?.filter((p) => (p as { type?: string }).type === "text")
              .map((p) => (p as { text?: string }).text ?? "")
              .join("\n") || "Analisar documentos anexados.",
        },
      ];
    }
  }
  debugTracker.phase("contextConvert", t5);
  logTiming(
    "contextEditing + estimateTokens + normalizeMessageParts + convertToModelMessages",
    Date.now() - t5
  );
  const messagesForModel = withPromptCaching(effectiveModel, modelMessages);
  const preStreamEnd = Date.now();
  debugTracker.flush("preStreamPhases");
  logTiming("preStream (total antes do stream)", preStreamEnd - requestStart);
  return { messagesForModel, preStreamEnd };
}

/** Cria o callback execute para createUIMessageStream. */
export function createStreamExecuteHandler(ctx: StreamExecuteContext) {
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

    const tools = buildToolsForAgent(ctx, dataStream);

    // Cria o agente com prepareCall e onFinish.
    const onTelemetry = ctx.processoId
      ? async (metrics: TaskTelemetry) => {
          const te = await getTaskExecutionByChatId(ctx.id);
          if (te) {
            await updateTaskExecution({
              id: te.id,
              data: {
                result: metrics as unknown as Record<string, unknown>,
                status: "complete",
                completedAt: new Date(),
              },
            }).catch(() => {
              /* telemetria opcional; falha silenciosa */
            });
          }
        }
      : undefined;

    const agent = createChatAgent({
      tools,
      agentConfig: ctx.agentConfig,
      userId: ctx.session.user.id,
      chatId: ctx.id,
      effectiveModel: ctx.effectiveModel,
      creditsDisabled,
      onTelemetry,
      telemetryStartMs: ctx.requestStart,
    });

    const callOptions: ChatCallOptions = {
      userId: ctx.session.user.id,
      chatId: ctx.id,
      effectiveModel: ctx.effectiveModel,
      agentInstructions: effectiveAgentInstructions,
      isReasoningModel: ctx.isReasoningModel,
      isAdaptiveThinking: ctx.isAdaptiveThinking,
      knowledgeContext: ctx.knowledgeContext,
      processoContext: ctx.processoContext,
      requestHints: ctx.requestHints,
      hasDocuments: ctx.documentTexts.size > 0,
    };

    // Guard: ensure messages is never empty/undefined (causes AI_InvalidPromptError)
    let messagesForAgent = ctx.messagesForModel as Awaited<
      ReturnType<typeof convertToModelMessages>
    >;
    if (!messagesForAgent || messagesForAgent.length === 0) {
      console.error(
        "[chat] messagesForModel is empty/undefined before agent.stream — using text fallback."
      );
      messagesForAgent = [
        { role: "user" as const, content: "Analisar documentos anexados." },
      ];
    }

    const result = await agent.stream({
      messages: messagesForAgent,
      abortSignal: AbortSignal.timeout(270_000),
      options: callOptions,
    });

    dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));

    if (ctx.titlePromise) {
      const title = await ctx.titlePromise;
      dataStream.write({ type: "data-chat-title", data: title });
      updateChatTitleById({ chatId: ctx.id, title });
    }
  };
}

/** Cria o callback onFinish para createUIMessageStream (persistência de mensagens). */
export function createStreamOnFinishHandler(ctx: StreamOnFinishContext) {
  return async ({
    messages: finishedMessages,
  }: {
    messages: Array<{ id: string; role: string; parts: unknown[] }>;
  }) => {
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

      await saveMessagesPromise;

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
export function streamOnErrorHandler(error: unknown): string {
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
export function buildStreamAndResponse(
  params: ChatStreamParams,
  prepared: {
    messagesForModel: Awaited<ReturnType<typeof withPromptCaching>>;
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
  } = params;
  const { messagesForModel, preStreamEnd } = prepared;

  const isReasoningModel =
    effectiveModel.includes("reasoning") || effectiveModel.includes("thinking");
  const isAdaptiveThinking = modelReasoningType(effectiveModel) === "adaptive";

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
    processoId: params.processoId ?? null,
    documentTexts,
    mcpTools: params.mcpTools,
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
    execute: createStreamExecuteHandler(executeContext),
    generateId: generateUUID,
    onFinish: createStreamOnFinishHandler(onFinishContext),
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
