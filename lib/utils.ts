import type {
  AssistantModelMessage,
  ToolModelMessage,
  UIMessage,
  UIMessagePart,
} from "ai";
import { type ClassValue, clsx } from "clsx";
import { formatISO } from "date-fns";
import { twMerge } from "tailwind-merge";
import type { DBMessage, Document } from "@/lib/db/schema";
import { ChatbotError, type ErrorCode } from "./errors";
import type { ChatMessage, ChatTools, CustomUIDataTypes } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

async function parseErrorBody(
  response: Response
): Promise<{ code?: string; cause?: string }> {
  const contentType = response.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return {
      code: "bad_request:api",
      cause: `Serviço indisponível (${response.status}). Verifique se a base de dados está configurada.`,
    };
  }
  try {
    const text = await response.text();
    const trimmed = text.trimStart().replace(/^\uFEFF/, "");
    const body = JSON.parse(trimmed) as {
      code?: string;
      message?: string;
      cause?: string;
    };
    return {
      code: body.code ?? "bad_request:api",
      cause: body.cause ?? body.message,
    };
  } catch {
    return {
      code: "bad_request:api",
      cause: `Erro inesperado (${response.status}).`,
    };
  }
}

export const fetcher = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    const { code, cause } = await parseErrorBody(response);
    throw new ChatbotError(code as ErrorCode, cause);
  }

  return response.json();
};

const DOCUMENT_FETCH_MAX_RETRIES = 4;
const DOCUMENT_FETCH_INITIAL_MS = 300;

/**
 * Fetcher para GET /api/document com retry em 404 (documento pode ainda não estar na BD após criação pela tool).
 */
export const documentFetcher = async (url: string): Promise<unknown> => {
  const isDocumentGet =
    url.includes("/api/document") &&
    url.includes("id=") &&
    !url.includes("timestamp=");
  let lastResponse: Response | null = null;

  for (
    let attempt = 0;
    attempt < (isDocumentGet ? DOCUMENT_FETCH_MAX_RETRIES : 1);
    attempt++
  ) {
    lastResponse = await fetch(url);
    if (lastResponse.ok) {
      return lastResponse.json();
    }
    if (lastResponse.status !== 404 || !isDocumentGet) {
      const { code, cause } = await parseErrorBody(lastResponse);
      throw new ChatbotError(code as ErrorCode, cause);
    }
    if (attempt < DOCUMENT_FETCH_MAX_RETRIES - 1) {
      const delayMs = DOCUMENT_FETCH_INITIAL_MS * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  if (!lastResponse) {
    throw new ChatbotError("UNKNOWN" as ErrorCode, "No response received");
  }
  const { code, cause } = await parseErrorBody(lastResponse);
  throw new ChatbotError(code as ErrorCode, cause);
};

export async function fetchWithErrorHandlers(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  try {
    const response = await fetch(input, init);

    if (!response.ok) {
      const { code, cause } = await parseErrorBody(response);
      throw new ChatbotError(code as ErrorCode, cause);
    }

    return response;
  } catch (error: unknown) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new ChatbotError("offline:chat");
    }

    throw error;
  }
}

export function getLocalStorage(key: string) {
  if (typeof window !== "undefined") {
    return JSON.parse(localStorage.getItem(key) || "[]");
  }
  return [];
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r % 4) + 8;
    return v.toString(16);
  });
}

type ResponseMessageWithoutId = ToolModelMessage | AssistantModelMessage;
type ResponseMessage = ResponseMessageWithoutId & { id: string };

export function getMostRecentUserMessage(messages: UIMessage[]) {
  const userMessages = messages.filter((message) => message.role === "user");
  return userMessages.at(-1);
}

export function getDocumentTimestampByIndex(
  documents: Document[],
  index: number
) {
  if (!documents) {
    return new Date();
  }
  if (index > documents.length) {
    return new Date();
  }

  return documents[index].createdAt;
}

export function getTrailingMessageId({
  messages,
}: {
  messages: ResponseMessage[];
}): string | null {
  const trailingMessage = messages.at(-1);

  if (!trailingMessage) {
    return null;
  }

  return trailingMessage.id;
}

export function sanitizeText(text: string) {
  return text.replace("<has_function_call>", "");
}

export function convertToUIMessages(messages: DBMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role as "user" | "assistant" | "system",
    parts: message.parts as UIMessagePart<CustomUIDataTypes, ChatTools>[],
    metadata: {
      createdAt: formatISO(message.createdAt),
    },
  }));
}

export function getTextFromMessage(message: ChatMessage | UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("");
}
