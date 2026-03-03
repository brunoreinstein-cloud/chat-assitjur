import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
} from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { ZodError } from "zod";
import { auth, type UserType } from "@/app/(auth)/auth";
import {
  getDefaultModelForAgent,
  isModelAllowedForAgent,
} from "@/lib/ai/agent-models";
import type { AgentConfig } from "@/lib/ai/agents-registry";
import {
  AGENT_ID_REDATOR_CONTESTACAO,
  AGENT_IDS,
  getAgentConfigForCustomAgent,
  getAgentConfigWithOverrides,
} from "@/lib/ai/agents-registry";
import { MIN_CREDITS_TO_START_CHAT, tokensToCredits } from "@/lib/ai/credits";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { embedQuery } from "@/lib/ai/rag";
import {
  REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID,
  REDATOR_BANCO_SYSTEM_USER_ID,
} from "@/lib/ai/redator-banco-rag";
import { createDocument } from "@/lib/ai/tools/create-document";
import { createRedatorContestacaoDocument } from "@/lib/ai/tools/create-redator-contestacao-document";
import { createRevisorDefesaDocuments } from "@/lib/ai/tools/create-revisor-defesa-documents";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { validationToolsForValidate } from "@/lib/ai/tools/validation-tools";
import { isProductionEnvironment } from "@/lib/constants";
import {
  addCreditsToUser,
  createStreamId,
  deductCreditsAndRecordUsage,
  deleteChatById,
  getBuiltInAgentOverrides,
  getChatById,
  getCustomAgentById,
  getKnowledgeDocumentsByIds,
  getMessageCountByUserId,
  getMessagesByChatId,
  getOrCreateCreditBalance,
  getRelevantChunks,
  getUserFilesByIds,
  saveChat,
  saveMessages,
  updateChatActiveStreamId,
  updateChatAgentId,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

/** Limite de execução da rota (segundos). A duração total do pedido é dominada pelo streaming do modelo; aumentar em vercel.json se precisar de respostas muito longas. */
export const maxDuration = 120;

const isDev = process.env.NODE_ENV === "development";
function logTiming(label: string, ms: number): void {
  if (isDev) {
    console.info(`[chat-timing] ${label}: ${Math.round(ms)}ms`);
  }
}

interface DocumentPartLike {
  type: "document";
  name?: string;
  text?: string;
  documentType?: "pi" | "contestacao";
}

const DOC_TYPE_ORDER: Record<string, number> = {
  pi: 0,
  contestacao: 1,
  "": 2,
};

/** Máximo de caracteres por documento no prompt (evita "prompt is too long" ~200k tokens). */
const MAX_CHARS_PER_DOCUMENT = 35_000;
/** Máximo total de caracteres de documentos numa única mensagem. */
const MAX_TOTAL_DOC_CHARS = 100_000;

/** Últimas N mensagens a carregar para contexto (reduz BD e tamanho do prompt; a qualidade mantém-se com contexto recente). */
const CHAT_MESSAGES_LIMIT = 80;

/** Máximo de caracteres da base de conhecimento no system prompt (reduz custo de tokens). */
const MAX_KNOWLEDGE_CONTEXT_CHARS = 50_000;

/**
 * Indica se uma parte de mensagem é válida para o AI SDK (convertToModelMessages).
 * Partes "document" são sempre inválidas (devem ser convertidas em "text" antes).
 * Partes "file" precisam de url e mediaType. Partes tool-* precisam de toolCallId.
 */
function isPartValidForModel(part: unknown): boolean {
  const p = part as {
    type?: string;
    url?: string;
    mediaType?: string;
    toolCallId?: string;
  };
  const type = p?.type;
  if (typeof type !== "string") {
    return false;
  }
  if (type === "document") {
    return false;
  }
  if (type === "file") {
    return (
      typeof p.url === "string" &&
      p.url.length > 0 &&
      typeof p.mediaType === "string" &&
      p.mediaType.length > 0
    );
  }
  if (type.startsWith("tool-")) {
    return typeof p.toolCallId === "string" && p.toolCallId.length > 0;
  }
  return true;
}

/** Converte partes do tipo "document" (PDF/DOCX) em partes "text" para o modelo. Ordena PI antes de Contestação. Trunca texto para não exceder o limite do modelo. Remove partes inválidas para o AI SDK (ex.: tool sem toolCallId vindas da BD). */
function normalizeMessageParts(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((msg) => {
    if (!msg.parts?.length) {
      return msg;
    }
    const documentParts = msg.parts.filter(
      (part) => (part as { type?: string }).type === "document"
    ) as unknown as DocumentPartLike[];
    const otherParts = msg.parts.filter(
      (part) => (part as { type?: string }).type !== "document"
    );

    const sortedDocs = [...documentParts].sort((a, b) => {
      const orderA = DOC_TYPE_ORDER[a.documentType ?? ""] ?? 2;
      const orderB = DOC_TYPE_ORDER[b.documentType ?? ""] ?? 2;
      return orderA - orderB;
    });

    let totalDocChars = 0;
    const docTextParts = sortedDocs.flatMap((p) => {
      if (typeof p.text !== "string" || !p.name) {
        return [];
      }
      const remaining = Math.max(0, MAX_TOTAL_DOC_CHARS - totalDocChars);
      if (remaining <= 0) {
        return [];
      }
      const maxForThis = Math.min(MAX_CHARS_PER_DOCUMENT, remaining);
      const truncated =
        p.text.length > maxForThis
          ? `${p.text.slice(0, maxForThis)}\n\n[... texto truncado para caber no limite do modelo ...]`
          : p.text;
      totalDocChars += truncated.length;
      const label =
        p.documentType === "pi"
          ? "Petição Inicial"
          : p.documentType === "contestacao"
            ? "Contestação"
            : "Documento";
      return [
        {
          type: "text" as const,
          text: `[${label}: ${p.name}]\n\n${truncated}`,
        },
      ];
    });

    const normalizedOther = otherParts.flatMap((part) => {
      const p = part as { type?: string; text?: string };
      if (p.type === "text" && (p.text?.trim().length ?? 0) === 0) {
        return [];
      }
      if (!isPartValidForModel(part)) {
        return [];
      }
      return [part];
    });

    const normalizedParts = [...docTextParts, ...normalizedOther].filter(
      isPartValidForModel
    );
    return { ...msg, parts: normalizedParts } as ChatMessage;
  }) as ChatMessage[];
}

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (error: unknown) {
    const isDev = process.env.NODE_ENV === "development";
    let cause: string | undefined;
    if (isDev && error instanceof Error) {
      if (error instanceof ZodError && error.issues.length > 0) {
        const first = error.issues[0];
        const path = first.path.join(".");
        cause = path ? `${path}: ${first.message}` : first.message;
        console.error(
          "[POST /api/chat] Validação falhou:",
          cause,
          error.issues
        );
      } else {
        cause = error.message;
        console.error("[POST /api/chat] Erro ao processar corpo:", cause);
      }
    }
    return Response.json(
      {
        code: "bad_request:api",
        message:
          "Corpo do pedido inválido. Verifique id, message/messages, selectedChatModel e selectedVisibilityType.",
        cause,
      },
      { status: 400 }
    );
  }

  const requestStart = Date.now();

  try {
    const {
      id,
      message,
      messages,
      selectedChatModel,
      selectedVisibilityType,
      agentInstructions,
      knowledgeDocumentIds,
      archivoIds,
      agentId: agentIdFromBody,
    } = requestBody;

    const agentId = agentIdFromBody ?? "revisor-defesas";

    const t0 = Date.now();
    const session = await auth();
    logTiming("auth", Date.now() - t0);

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    let builtInOverrides: Record<
      string,
      { instructions: string | null; label: string | null }
    > = {};
    try {
      builtInOverrides = await getBuiltInAgentOverrides();
    } catch {
      // Tabela BuiltInAgentOverride pode não existir se migrações não foram aplicadas; usa config em código.
    }

    let agentConfig: AgentConfig;
    if (AGENT_IDS.includes(agentId as (typeof AGENT_IDS)[number])) {
      agentConfig = getAgentConfigWithOverrides(agentId, builtInOverrides);
    } else {
      const customAgent = await getCustomAgentById({
        id: agentId,
        userId: session.user.id,
      });
      agentConfig = customAgent
        ? getAgentConfigForCustomAgent(customAgent)
        : getAgentConfigWithOverrides("revisor-defesas", builtInOverrides);
    }

    const effectiveModel = isModelAllowedForAgent(agentId, selectedChatModel)
      ? selectedChatModel
      : getDefaultModelForAgent(agentId);

    if (message?.role === "user" && message.parts) {
      const hasContent = message.parts.some((p) => {
        const part = p as { type?: string; text?: string };
        if (part.type === "text") {
          return (part.text?.trim().length ?? 0) > 0;
        }
        return part.type === "file" || part.type === "document";
      });
      if (!hasContent) {
        return Response.json(
          {
            code: "bad_request:api",
            message: "Corpo do pedido inválido.",
            cause:
              "A mensagem não pode estar vazia. Escreve texto ou anexa um ficheiro.",
          },
          { status: 400 }
        );
      }
      const isRevisorAgent = agentConfig.useRevisorDefesaTools;
      if (isRevisorAgent) {
        const documentParts = message.parts.filter(
          (p) => (p as { type?: string }).type === "document"
        ) as DocumentPartLike[];
        const hasDocParts = documentParts.length > 0;
        if (hasDocParts) {
          const hasPi = documentParts.some((p) => p.documentType === "pi");
          const hasContestacao = documentParts.some(
            (p) => p.documentType === "contestacao"
          );
          if (!(hasPi && hasContestacao)) {
            return Response.json(
              {
                code: "bad_request:api",
                message:
                  "Para auditar a contestação, anexe a Petição Inicial e a Contestação (arraste para os slots ou use o anexo). O tipo é identificado automaticamente quando possível; pode ajustar no menu de cada documento.",
              },
              { status: 400 }
            );
          }
        }
      }
    }

    const userType: UserType = session.user.type;
    const isToolApprovalFlow = Boolean(messages);

    const effectiveKnowledgeIds =
      knowledgeDocumentIds?.length && session.user.id
        ? knowledgeDocumentIds
        : agentId === AGENT_ID_REDATOR_CONTESTACAO
          ? [REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID]
          : [];
    const redatorBancoAllowedUserIds =
      agentId === AGENT_ID_REDATOR_CONTESTACAO &&
      effectiveKnowledgeIds.includes(REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID)
        ? [REDATOR_BANCO_SYSTEM_USER_ID]
        : undefined;

    const t1 = Date.now();
    const [messageCount, chat, messagesFromDb, knowledgeDocsResult] =
      await Promise.all([
        getMessageCountByUserId({
          id: session.user.id,
          differenceInHours: 24,
        }),
        getChatById({ id }),
        getMessagesByChatId({ id, limit: CHAT_MESSAGES_LIMIT }),
        effectiveKnowledgeIds.length > 0
          ? getKnowledgeDocumentsByIds({
              ids: effectiveKnowledgeIds,
              userId: session.user.id,
              allowedUserIds: redatorBancoAllowedUserIds,
            })
          : Promise.resolve(
              [] as Awaited<ReturnType<typeof getKnowledgeDocumentsByIds>>
            ),
      ]);
    logTiming(
      "getMessageCount + getChat + getMessages + knowledge (paralelo)",
      Date.now() - t1
    );

    if (
      process.env.NODE_ENV !== "development" &&
      messageCount > entitlementsByUserType[userType].maxMessagesPerDay
    ) {
      return new ChatbotError("rate_limit:chat").toResponse();
    }

    const initialCredits = entitlementsByUserType[userType].initialCredits;
    let balance: number;
    try {
      balance = await getOrCreateCreditBalance(session.user.id, initialCredits);
    } catch (creditError) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[chat] Credit balance unavailable (tabela de créditos?), a usar saldo inicial:",
          creditError
        );
      }
      balance = initialCredits;
    }
    if (balance < MIN_CREDITS_TO_START_CHAT) {
      if (process.env.NODE_ENV === "development") {
        try {
          await addCreditsToUser({
            userId: session.user.id,
            delta: initialCredits,
          });
          balance += initialCredits;
        } catch {
          balance = initialCredits;
        }
      }
      if (balance < MIN_CREDITS_TO_START_CHAT) {
        return new ChatbotError(
          "rate_limit:chat",
          `Sem créditos suficientes para enviar mensagens. Saldo atual: ${balance} créditos. Contacte o administrador para recarregar.`
        ).toResponse();
      }
    }

    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatbotError("forbidden:chat").toResponse();
      }
      // Persistir alteração de agente quando o utilizador envia mensagem com outro agente selecionado
      if (
        message?.role === "user" &&
        (chat.agentId ?? "revisor-defesas") !== agentId
      ) {
        await updateChatAgentId({ chatId: id, agentId });
      }
      // messagesFromDb já vem do Promise.all (últimas CHAT_MESSAGES_LIMIT mensagens quando chat existe)
      if (isToolApprovalFlow) {
        // No tool-approval flow o cliente envia as mensagens; não usamos as da BD
      }
    } else if (message?.role === "user") {
      await saveChat({
        id,
        userId: session.user.id,
        title: "New chat",
        visibility: selectedVisibilityType,
        agentId,
      });
      titlePromise = generateTitleFromUserMessage({
        message: normalizeMessageParts([message as ChatMessage])[0],
      });
    }

    const effectiveMessagesFromDb =
      chat && !isToolApprovalFlow ? messagesFromDb : [];

    let uiMessages: ChatMessage[] = isToolApprovalFlow
      ? (messages as ChatMessage[])
      : [
          ...convertToUIMessages(effectiveMessagesFromDb),
          message as ChatMessage,
        ];

    // Normalizar antes da validação: partes "document" (PI/Contestação) passam a "text",
    // para a validação do AI SDK aceitar e para preservar histórico na conversa (memória).
    const normalizedForValidation =
      !isToolApprovalFlow && uiMessages.length > 0
        ? normalizeMessageParts(uiMessages)
        : uiMessages;

    if (!isToolApprovalFlow && normalizedForValidation.length > 0) {
      const validation = await safeValidateUIMessages({
        messages: normalizedForValidation,
        tools: validationToolsForValidate,
      });
      if (validation.success) {
        uiMessages = validation.data as ChatMessage[];
      } else {
        if (isDev) {
          console.warn(
            "[chat] Validação de mensagens da BD falhou, a manter histórico normalizado:",
            validation.error?.message ?? validation.error
          );
        }
        // Manter histórico normalizado (PI/Contestação em mensagens anteriores) em vez de descartar
        uiMessages = normalizedForValidation;
      }
    }

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    let rawKnowledgeContext = "";
    if (knowledgeDocsResult.length > 0) {
      const lastUserText =
        message?.parts
          ?.filter((p) => (p as { type?: string }).type === "text")
          .map((p) => (p as { text?: string }).text ?? "")
          .join(" ")
          .trim() ?? "";
      if (lastUserText.length > 0) {
        const queryEmbedding = await embedQuery(lastUserText);
        if (queryEmbedding !== null) {
          const ragLimit = agentId === AGENT_ID_REDATOR_CONTESTACAO ? 24 : 12;
          const chunks = await getRelevantChunks({
            userId: session.user.id,
            documentIds: effectiveKnowledgeIds,
            queryEmbedding,
            limit: ragLimit,
            allowedUserIds: redatorBancoAllowedUserIds,
          });
          if (chunks.length > 0) {
            rawKnowledgeContext = chunks
              .map((c) => `--- ${c.title} ---\n${c.text}`)
              .join("\n\n");
          }
        }
      }
      if (rawKnowledgeContext.length === 0) {
        rawKnowledgeContext = knowledgeDocsResult
          .map((doc) => `--- ${doc.title} ---\n${doc.content}`)
          .join("\n\n");
      }
    }
    if (
      archivoIds != null &&
      archivoIds.length > 0 &&
      session.user.id != null
    ) {
      const userFilesFromArchivos = await getUserFilesByIds({
        ids: archivoIds,
        userId: session.user.id,
      });
      const archivosParts = userFilesFromArchivos
        .filter(
          (uf) =>
            typeof uf.extractedTextCache === "string" &&
            uf.extractedTextCache.trim().length > 0
        )
        .map(
          (uf) => `--- ${uf.filename} ---\n${uf.extractedTextCache?.trim()}`
        );
      if (archivosParts.length > 0) {
        const archivosBlock = `## Documentos de Arquivos (uso apenas neste chat)\n${archivosParts.join("\n\n")}`;
        rawKnowledgeContext =
          rawKnowledgeContext.length > 0
            ? `${rawKnowledgeContext}\n\n${archivosBlock}`
            : archivosBlock;
      }
    }
    const redatorBancoIntendedButEmpty =
      agentId === AGENT_ID_REDATOR_CONTESTACAO &&
      effectiveKnowledgeIds.includes(REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID) &&
      rawKnowledgeContext.length === 0;
    const knowledgeContext =
      rawKnowledgeContext.length > MAX_KNOWLEDGE_CONTEXT_CHARS
        ? `${rawKnowledgeContext.slice(0, MAX_KNOWLEDGE_CONTEXT_CHARS)}\n\n[... base de conhecimento truncada para caber no limite ...]`
        : redatorBancoIntendedButEmpty
          ? "[Banco de Teses Padrão não disponível. Para satisfazer (B), o utilizador deve selecionar documentos na Base de conhecimento (sidebar) ou anexar modelo/banco de teses.]"
          : rawKnowledgeContext || undefined;

    if (message?.role === "user") {
      const t4 = Date.now();
      after(async () => {
        try {
          await saveMessages({
            messages: [
              {
                chatId: id,
                id: message.id,
                role: "user",
                parts: message.parts,
                attachments: [],
                createdAt: new Date(),
              },
            ],
          });
        } catch (err) {
          console.error("[chat] saveMessages(user) em background falhou:", err);
        }
      });
      logTiming("saveMessages(user) (agendado em background)", Date.now() - t4);
    }

    const isReasoningModel =
      effectiveModel.includes("reasoning") ||
      effectiveModel.includes("thinking");

    const t5 = Date.now();
    const normalizedMessages = normalizeMessageParts(uiMessages);
    let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
    try {
      modelMessages = await convertToModelMessages(normalizedMessages);
    } catch (convertError) {
      if (isDev) {
        console.warn(
          "[chat] convertToModelMessages falhou (partes inválidas?), a usar apenas a última mensagem:",
          convertError
        );
      }
      const fallbackMessages =
        message?.role === "user"
          ? normalizeMessageParts([message as ChatMessage])
          : normalizedMessages.slice(-1);
      modelMessages = await convertToModelMessages(fallbackMessages);
    }
    logTiming(
      "normalizeMessageParts + convertToModelMessages",
      Date.now() - t5
    );

    const preStreamEnd = Date.now();
    logTiming("preStream (total antes do stream)", preStreamEnd - requestStart);

    type StreamTextResult = Awaited<ReturnType<typeof streamText>>;
    let streamTextResult: StreamTextResult | null = null;

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        logTiming(
          "execute started (modelo + tools a correr)",
          Date.now() - requestStart
        );
        const effectiveAgentInstructions =
          agentInstructions?.trim() || agentConfig.instructions;

        const baseToolNames = [
          "getWeather",
          "createDocument",
          "updateDocument",
          "requestSuggestions",
        ] as const;
        type ActiveToolName =
          | (typeof baseToolNames)[number]
          | "createRevisorDefesaDocuments"
          | "createRedatorContestacaoDocument";
        const activeToolNames: ActiveToolName[] = isReasoningModel
          ? []
          : [
              ...baseToolNames,
              ...(agentConfig.useRevisorDefesaTools
                ? (["createRevisorDefesaDocuments"] as const)
                : []),
              ...(agentConfig.useRedatorContestacaoTool
                ? (["createRedatorContestacaoDocument"] as const)
                : []),
            ];

        const tools = {
          getWeather,
          createDocument: createDocument({ session, dataStream }),
          updateDocument: updateDocument({ session, dataStream }),
          requestSuggestions: requestSuggestions({ session, dataStream }),
        } as {
          getWeather: typeof getWeather;
          createDocument: ReturnType<typeof createDocument>;
          updateDocument: ReturnType<typeof updateDocument>;
          requestSuggestions: ReturnType<typeof requestSuggestions>;
          createRevisorDefesaDocuments?: ReturnType<
            typeof createRevisorDefesaDocuments
          >;
          createRedatorContestacaoDocument?: ReturnType<
            typeof createRedatorContestacaoDocument
          >;
        };
        if (agentConfig.useRevisorDefesaTools) {
          tools.createRevisorDefesaDocuments = createRevisorDefesaDocuments({
            session,
            dataStream,
          });
        }
        if (agentConfig.useRedatorContestacaoTool) {
          tools.createRedatorContestacaoDocument =
            createRedatorContestacaoDocument({
              session,
              dataStream,
            });
        }

        const result = streamText({
          model: getLanguageModel(effectiveModel),
          temperature: 0.2,
          maxOutputTokens: 8192,
          system: systemPrompt({
            selectedChatModel: effectiveModel,
            requestHints,
            agentInstructions: effectiveAgentInstructions,
            knowledgeContext,
          }),
          messages: modelMessages,
          stopWhen: stepCountIs(5),
          experimental_activeTools: activeToolNames,
          providerOptions: isReasoningModel
            ? {
                anthropic: {
                  thinking: { type: "enabled", budgetTokens: 10_000 },
                },
              }
            : undefined,
          tools,
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });
        streamTextResult = result as unknown as StreamTextResult;

        dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));

        if (titlePromise) {
          const title = await titlePromise;
          dataStream.write({ type: "data-chat-title", data: title });
          updateChatTitleById({ chatId: id, title });
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        const onFinishStart = Date.now();
        logTiming(
          "onFinish (stream terminou) total request",
          onFinishStart - requestStart
        );
        if (isToolApprovalFlow) {
          const tSaveTool = Date.now();
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
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
                    chatId: id,
                  },
                ],
              });
            }
          }
          logTiming(
            "saveMessages(tool-flow) em onFinish",
            Date.now() - tSaveTool
          );
        } else if (finishedMessages.length > 0) {
          const tSave = Date.now();
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });
          logTiming("saveMessages(assistant) em onFinish", Date.now() - tSave);
        }
        if (streamTextResult) {
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
            await deductCreditsAndRecordUsage({
              userId: session.user.id,
              chatId: id,
              promptTokens,
              completionTokens,
              model: effectiveModel,
              creditsConsumed,
            });
          } catch (error_) {
            if (isDev) {
              console.warn(
                "[chat] Falha ao registar uso/créditos em onFinish:",
                error_
              );
            }
          }
        }
        await updateChatActiveStreamId({ chatId: id, activeStreamId: null });
        logTiming("onFinish completo", Date.now() - onFinishStart);
      },
      onError: (error: unknown) => {
        const fallback =
          "Ocorreu um erro ao processar o pedido. Tente novamente.";
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
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            await updateChatActiveStreamId({
              chatId: id,
              activeStreamId: null,
            });
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
            await updateChatActiveStreamId({
              chatId: id,
              activeStreamId: streamId,
            });
          }
        } catch (_) {
          // ignore redis errors
        }
      },
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatbotError("bad_request:activate_gateway").toResponse();
    }

    // API overload (ex.: Anthropic 529)
    const status =
      error instanceof Error && "status" in error
        ? (error as { status?: number }).status
        : undefined;
    if (status === 529) {
      return new ChatbotError(
        "offline:chat",
        "Serviço de IA temporariamente sobrecarregado. Tente novamente em instantes."
      ).toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatbotError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
