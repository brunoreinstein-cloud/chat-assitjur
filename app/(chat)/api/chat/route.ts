import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { ZodError } from "zod";
import { auth, type UserType } from "@/app/(auth)/auth";
import { AGENTE_REVISOR_DEFESAS_INSTRUCTIONS } from "@/lib/ai/agent-revisor-defesas";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getKnowledgeDocumentsByIds,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
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

type DocumentPartLike = {
  type: "document";
  name?: string;
  text?: string;
  documentType?: "pi" | "contestacao";
};

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

/** Converte partes do tipo "document" (PDF/DOCX) em partes "text" para o modelo. Ordena PI antes de Contestação. Trunca texto para não exceder o limite do modelo. */
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
      const remaining = Math.max(
        0,
        MAX_TOTAL_DOC_CHARS - totalDocChars
      );
      if (remaining <= 0) {
        return [];
      }
      const maxForThis = Math.min(
        MAX_CHARS_PER_DOCUMENT,
        remaining
      );
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
      return [part];
    });

    const normalizedParts = [...docTextParts, ...normalizedOther];
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
    } = requestBody;

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
    }

    const t0 = Date.now();
    const session = await auth();
    logTiming("auth", Date.now() - t0);

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const userType: UserType = session.user.type;
    const isToolApprovalFlow = Boolean(messages);

    const t1 = Date.now();
    const [messageCount, chat, messagesFromDb, knowledgeDocsResult] =
      await Promise.all([
        getMessageCountByUserId({
          id: session.user.id,
          differenceInHours: 24,
        }),
        getChatById({ id }),
        getMessagesByChatId({ id, limit: CHAT_MESSAGES_LIMIT }),
        knowledgeDocumentIds?.length && session.user.id
          ? getKnowledgeDocumentsByIds({
              ids: knowledgeDocumentIds,
              userId: session.user.id,
            })
          : Promise.resolve([] as Awaited<
              ReturnType<typeof getKnowledgeDocumentsByIds>
            >),
      ]);
    logTiming("getMessageCount + getChat + getMessages + knowledge (paralelo)", Date.now() - t1);

    if (
      process.env.NODE_ENV !== "development" &&
      messageCount > entitlementsByUserType[userType].maxMessagesPerDay
    ) {
      return new ChatbotError("rate_limit:chat").toResponse();
    }

    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatbotError("forbidden:chat").toResponse();
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
      });
      titlePromise = generateTitleFromUserMessage({
        message: normalizeMessageParts([message as ChatMessage])[0],
      });
    }

    const effectiveMessagesFromDb = chat && !isToolApprovalFlow ? messagesFromDb : [];

    const uiMessages = isToolApprovalFlow
      ? (messages as ChatMessage[])
      : [...convertToUIMessages(effectiveMessagesFromDb), message as ChatMessage];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    const knowledgeContext =
      knowledgeDocsResult.length > 0
        ? knowledgeDocsResult
            .map((doc) => `--- ${doc.title} ---\n${doc.content}`)
            .join("\n\n")
        : undefined;

    if (message?.role === "user") {
      const t4 = Date.now();
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
      logTiming("saveMessages(user)", Date.now() - t4);
    }

    const isReasoningModel =
      selectedChatModel.includes("reasoning") ||
      selectedChatModel.includes("thinking");

    const t5 = Date.now();
    const normalizedMessages = normalizeMessageParts(uiMessages);
    const modelMessages = await convertToModelMessages(normalizedMessages);
    logTiming("normalizeMessageParts + convertToModelMessages", Date.now() - t5);

    const preStreamEnd = Date.now();
    logTiming("preStream (total antes do stream)", preStreamEnd - requestStart);

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        logTiming("execute started (modelo + tools a correr)", Date.now() - requestStart);
        const effectiveAgentInstructions =
          agentInstructions?.trim() || AGENTE_REVISOR_DEFESAS_INSTRUCTIONS;

        const result = streamText({
          model: getLanguageModel(selectedChatModel),
          system: systemPrompt({
            selectedChatModel,
            requestHints,
            agentInstructions: effectiveAgentInstructions,
            knowledgeContext,
          }),
          messages: modelMessages,
          stopWhen: stepCountIs(5),
          experimental_activeTools: isReasoningModel
            ? []
            : [
                "getWeather",
                "createDocument",
                "updateDocument",
                "requestSuggestions",
              ],
          providerOptions: isReasoningModel
            ? {
                anthropic: {
                  thinking: { type: "enabled", budgetTokens: 10_000 },
                },
              }
            : undefined,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({ session, dataStream }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });

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
        logTiming("onFinish (stream terminou) total request", onFinishStart - requestStart);
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
          logTiming("saveMessages(tool-flow) em onFinish", Date.now() - tSaveTool);
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
        logTiming("onFinish completo", Date.now() - onFinishStart);
      },
      onError: (error: unknown) => {
        const fallback =
          "Ocorreu um erro ao processar o pedido. Tente novamente.";
        const err =
          error instanceof Error ? error : new Error(String(error));
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
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
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
