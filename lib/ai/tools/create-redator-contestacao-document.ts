import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { pingDatabase, saveDocument } from "@/lib/db/queries";
import { isDatabaseConnectionError, isLikelyDatabaseError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

const CHUNK_SIZE = 400;
/** Tentativas máximas de guardar na BD (apenas erros de ligação transitórios). */
const SAVE_MAX_RETRIES = 3;
/**
 * Atraso base entre tentativas (ms). Backoff exponencial: base * 2^(attempt-1).
 * 500ms é suficiente para recuperar de falhas transitórias sem atrasar demasiado.
 */
const SAVE_RETRY_BASE_MS = 500;
/**
 * Timeout por tentativa de save (ms).
 * 5s por tentativa × 3 tentativas = 15s máx (mesmo padrão do Revisor e Master).
 */
const SAVE_ATTEMPT_TIMEOUT_MS = 5000;

interface CreateRedatorContestacaoDocumentProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

function isRetryableDbError(error: unknown): boolean {
  return isDatabaseConnectionError(error) || isLikelyDatabaseError(error);
}

async function saveWithTimeout(params: {
  id: string;
  title: string;
  content: string;
  kind: "text";
  userId: string;
}): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("save_timeout")),
      SAVE_ATTEMPT_TIMEOUT_MS
    );
  });
  try {
    await Promise.race([saveDocument(params), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

async function saveWithRetry(params: {
  id: string;
  title: string;
  content: string;
  kind: "text";
  userId: string;
}): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= SAVE_MAX_RETRIES; attempt++) {
    try {
      await saveWithTimeout(params);
      return;
    } catch (err) {
      lastError = err;
      if (!isRetryableDbError(err) || attempt === SAVE_MAX_RETRIES) {
        break;
      }
      // Exponential backoff: 500ms, 1s, 2s, …
      const delay = SAVE_RETRY_BASE_MS * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Ferramenta que gera um DOCX de contestação (minuta) para download.
 * Usada na FASE B do Redator: o modelo envia o texto completo da minuta e o título sugerido.
 * Inclui pingDatabase warm-up e retry com backoff (mesmo padrão do Revisor e Master).
 */
export const createRedatorContestacaoDocument = ({
  session,
  dataStream,
}: CreateRedatorContestacaoDocumentProps) =>
  tool({
    description:
      "Create the contestação minuta document for download. Use this once in FASE B after producing the full minuta text. Pass the suggested title (e.g. Contestacao_[Nº processo]_minuta) and the complete minuta content (with campos pendentes 🟡🔴🔵). The document will be available for download as DOCX.",
    inputSchema: z.object({
      title: z
        .string()
        .describe(
          "Title for the document (suggested: Contestacao_[Nº processo]_minuta, e.g. Contestacao_0000000-00.2024.5.02.0000_minuta)"
        ),
      minutaContent: z
        .string()
        .describe(
          "Full text of the contestação minuta (with campos pendentes highlighted as in Bloco 8)"
        ),
    }),
    execute: async ({ title, minutaContent }) => {
      const id = generateUUID();
      const userId = session?.user?.id;
      const content = minutaContent ?? "";

      // Aquece a ligação à BD em background enquanto o stream chega ao cliente.
      if (userId) {
        pingDatabase().catch(() => {
          /* ignorar — apenas warm-up */
        });
      }

      dataStream.write({
        type: "data-kind",
        data: "text",
        transient: true,
      });
      dataStream.write({
        type: "data-id",
        data: id,
        transient: true,
      });
      dataStream.write({
        type: "data-title",
        data: title,
        transient: true,
      });
      dataStream.write({
        type: "data-clear",
        data: null,
        transient: true,
      });

      for (let offset = 0; offset < content.length; offset += CHUNK_SIZE) {
        const chunk = content.slice(offset, offset + CHUNK_SIZE);
        dataStream.write({
          type: "data-textDelta",
          data: chunk,
          transient: true,
        });
      }

      dataStream.write({
        type: "data-finish",
        data: null,
        transient: true,
      });

      if (userId) {
        await saveWithRetry({
          id,
          title,
          content,
          kind: "text",
          userId,
        });
      }

      return {
        id,
        title,
        content:
          "Minuta de contestação criada e disponível para download (DOCX).",
      };
    },
  });
