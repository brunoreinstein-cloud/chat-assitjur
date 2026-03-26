/**
 * Validação e parsing do body do POST /api/chat.
 * Extraído de app/(chat)/api/chat/route.ts.
 */

import { ZodError } from "zod";
import {
  MAX_DOCUMENT_PART_TEXT_DB_LENGTH,
  MAX_DOCUMENT_PART_TEXT_LENGTH,
  type PostRequestBody,
  postRequestBodySchema,
} from "@/app/(chat)/api/chat/schema";
import type { AgentConfig } from "@/lib/ai/agents-registry";
import {
  MAX_CHARS_PER_DOCUMENT,
  MAX_TOTAL_DOC_CHARS,
} from "@/lib/ai/context-window";
import { MIN_CREDITS_TO_START_CHAT } from "@/lib/ai/credits";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import {
  extractStructuredFields,
  formatStructuredFieldsAsHeader,
} from "@/lib/ai/extract-structured-fields";
import { stripImageParts } from "@/lib/ai/multimodal";
import { creditsCache } from "@/lib/cache/credits-cache";
import { addCreditsToUser, ensureStatementTimeout } from "@/lib/db/queries";
import {
  ChatbotError,
  databaseUnavailableResponse,
  isDatabaseConnectionError,
  isStatementTimeoutError,
} from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import type { DocumentPartLike } from "./types";
import {
  DOC_TYPE_ORDER,
  ENSURE_DB_READY_TIMEOUT_MS,
  getDocumentPartExtractionHint,
  getDocumentPartLabel,
  isDev,
  TRUNCATE_SUFFIX,
  truncateDocumentText,
} from "./utils";

type UserMessagePart = NonNullable<PostRequestBody["message"]>["parts"][number];

/** Parseia e valida o body do POST; devolve Response em caso de erro. */
export async function parsePostBody(
  request: Request
): Promise<PostRequestBody | Response> {
  try {
    const json = (await request.json()) as Record<string, unknown>;
    return postRequestBodySchema.parse(json);
  } catch (error: unknown) {
    let cause: string | undefined;
    if (error instanceof ZodError && error.issues.length > 0) {
      const first = error.issues[0];
      const path = first.path.join(".");
      cause = path ? `${path}: ${first.message}` : first.message;
      if (isDev) {
        console.error(
          "[POST /api/chat] Validação falhou:",
          cause,
          error.issues
        );
      }
    } else if (error instanceof Error) {
      cause = error.message;
      if (isDev) {
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
}

/** Valida que a mensagem do utilizador tem conteúdo; devolve Response se inválida. */
export function validateUserMessageContent(
  message: PostRequestBody["message"]
): Response | null {
  if (message?.role !== "user" || !message.parts) {
    return null;
  }
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
  return null;
}

/** Garante que a ligação à BD está pronta; devolve Response em caso de erro. Com um retry para cold start. */
export async function ensureDbReady(): Promise<Response | null> {
  const attempt = async (): Promise<void> => {
    await Promise.race([
      ensureStatementTimeout(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `ensureStatementTimeout did not complete within ${ENSURE_DB_READY_TIMEOUT_MS}ms`
              )
            ),
          ENSURE_DB_READY_TIMEOUT_MS
        )
      ),
    ]);
  };
  try {
    await attempt();
  } catch (dbInitErr) {
    if (isDev) {
      console.warn(
        "[chat] DB init/timeout (1.ª tentativa), a repetir:",
        dbInitErr
      );
    }
    try {
      await attempt();
    } catch (retryErr) {
      if (isDev) {
        console.error("[chat] DB init/timeout após retry:", retryErr);
      }
      const dbMsg =
        process.env.NODE_ENV === "production"
          ? "A ligação à base de dados está a demorar demasiado. Em produção (Vercel) verifica POSTGRES_URL em Settings → Environment Variables (usa pooler, porta 6543 no Supabase) e que a base de dados está acessível. Tenta novamente."
          : "A ligação à base de dados está a demorar demasiado. Verifica POSTGRES_URL em .env.local e que a base de dados está acessível. Tenta novamente.";
      return new ChatbotError("bad_request:database", dbMsg).toResponse();
    }
  }
  if (isDev) {
    console.info("[chat-timing] ensureStatementTimeout: done");
  }
  return null;
}

/** Valida partes de documento do Revisor (PI + Contestação); devolve Response se inválido. */
export function validateRevisorDocumentParts(
  message: PostRequestBody["message"],
  agentConfig: AgentConfig
): Response | null {
  if (
    message?.role !== "user" ||
    !message.parts ||
    !agentConfig.useRevisorDefesaTools
  ) {
    return null;
  }
  const documentParts = message.parts.filter(
    (p) => (p as { type?: string }).type === "document"
  ) as DocumentPartLike[];
  if (documentParts.length === 0) {
    return null;
  }
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
  return null;
}

/** Trunca o texto de partes "document" que excedam MAX_DOCUMENT_PART_TEXT_LENGTH. */
export function truncateDocumentParts(
  parts: UserMessagePart[]
): UserMessagePart[] {
  const maxLen = MAX_DOCUMENT_PART_TEXT_LENGTH - TRUNCATE_SUFFIX.length;
  return parts.map((part) => {
    if (
      part &&
      typeof part === "object" &&
      part.type === "document" &&
      typeof part.text === "string" &&
      part.text.length > MAX_DOCUMENT_PART_TEXT_LENGTH
    ) {
      return { ...part, text: part.text.slice(0, maxLen) + TRUNCATE_SUFFIX };
    }
    return part;
  });
}

/**
 * Trunca partes "document" para armazenamento na BD (limite muito menor que o do LLM).
 */
export function truncateDocumentPartsForDb(
  parts: UserMessagePart[]
): UserMessagePart[] {
  const dbSuffix = "\n\n[Texto completo disponível apenas durante a sessão.]";
  const maxLen = MAX_DOCUMENT_PART_TEXT_DB_LENGTH - dbSuffix.length;
  return parts.map((part) => {
    if (
      part &&
      typeof part === "object" &&
      part.type === "document" &&
      typeof part.text === "string" &&
      part.text.length > MAX_DOCUMENT_PART_TEXT_DB_LENGTH
    ) {
      return { ...part, text: part.text.slice(0, maxLen) + dbSuffix };
    }
    return part;
  });
}

/** Aplica truncagem de partes "document" ao body já parseado (imutável). */
export function truncateDocumentPartsInBody(
  body: PostRequestBody
): PostRequestBody {
  const message = body.message
    ? { ...body.message, parts: truncateDocumentParts(body.message.parts) }
    : undefined;
  const messages = body.messages
    ? body.messages.map((msg) => ({
        ...msg,
        parts: truncateDocumentParts((msg.parts ?? []) as UserMessagePart[]),
      }))
    : undefined;
  return { ...body, message, messages };
}

/**
 * Indica se uma parte de mensagem é válida para o AI SDK (convertToModelMessages).
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

/**
 * Converte partes do tipo "document" (PDF/DOCX) em partes "text" para o modelo.
 * Ordena PI antes de Contestação. Trunca texto para não exceder o limite do modelo.
 * Remove partes inválidas para o AI SDK. Se supportsVision=false, substitui imagens por placeholders.
 */
export function normalizeMessageParts(
  messages: ChatMessage[],
  supportsVision = true
): ChatMessage[] {
  return messages.map((msg) => {
    if (!msg.parts?.length) {
      return msg;
    }
    const isDocumentPart = (part: unknown): part is DocumentPartLike =>
      typeof part === "object" &&
      part !== null &&
      "type" in part &&
      (part as Record<string, unknown>).type === "document";
    const documentParts = msg.parts.filter(
      isDocumentPart
    ) as unknown as DocumentPartLike[];
    const otherParts = msg.parts.filter((part) => !isDocumentPart(part));

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

      const regexFields = extractStructuredFields(p.text);
      const regexHeader = formatStructuredFieldsAsHeader(regexFields);

      const maxForThis = Math.min(MAX_CHARS_PER_DOCUMENT, remaining);
      const truncated = truncateDocumentText(
        p.text,
        maxForThis,
        p.documentType
      );
      totalDocChars += truncated.length + regexHeader.length;
      const label = getDocumentPartLabel(p.documentType);
      const hint = getDocumentPartExtractionHint(p.documentType);
      const headerParts = [`[${label}: ${p.name}]`];
      if (hint) {
        headerParts.push(hint);
      }
      if (regexHeader) {
        headerParts.push(regexHeader);
      }
      const header = `${headerParts.join("\n")}\n\n`;
      return [
        {
          type: "text" as const,
          text: `${header}${truncated}`,
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

    const combinedParts = [...docTextParts, ...normalizedOther].filter(
      isPartValidForModel
    );
    const normalizedParts = supportsVision
      ? combinedParts
      : (stripImageParts(combinedParts) as typeof combinedParts);
    return { ...msg, parts: normalizedParts };
  });
}

/** Verifica rate limit e créditos; devolve Response se bloquear, ou null e atualiza balance. */
export async function checkRateLimitAndCredits(
  messageCount: number,
  userType: import("@/app/(auth)/auth").UserType,
  balanceFromDb: number,
  session: { user: { id: string } },
  initialCredits: number
): Promise<{ balance: number } | Response> {
  if (process.env.DISABLE_CREDITS === "true") {
    return { balance: initialCredits };
  }
  if (
    process.env.NODE_ENV !== "development" &&
    messageCount > entitlementsByUserType[userType].maxMessagesPerDay
  ) {
    return new ChatbotError("rate_limit:chat").toResponse();
  }
  let balance = balanceFromDb;
  if (balance < MIN_CREDITS_TO_START_CHAT) {
    if (process.env.NODE_ENV === "development") {
      try {
        await addCreditsToUser({
          userId: session.user.id,
          delta: initialCredits,
        });
        creditsCache.delete(session.user.id);
        balance += initialCredits;
      } catch {
        balance = initialCredits;
      }
      if (balance < MIN_CREDITS_TO_START_CHAT) {
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
  return { balance };
}

/** Trata erros do POST /api/chat e devolve Response apropriada. */
export function handleChatPostError(
  error: unknown,
  request: Request
): Response {
  if (error instanceof ChatbotError) {
    return error.toResponse();
  }
  if (isDatabaseConnectionError(error) || isStatementTimeoutError(error)) {
    return databaseUnavailableResponse();
  }
  if (
    error instanceof Error &&
    error.message?.includes(
      "AI Gateway requires a valid credit card on file to service requests"
    )
  ) {
    return new ChatbotError("bad_request:activate_gateway").toResponse();
  }
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
  const vercelId = request.headers.get("x-vercel-id");
  console.error("Unhandled error in chat API:", error, { vercelId });
  return new ChatbotError("offline:chat").toResponse();
}
