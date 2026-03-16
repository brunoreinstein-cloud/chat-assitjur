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
/** Atraso base entre tentativas (ms). */
const SAVE_RETRY_BASE_MS = 2000;
/** Timeout por tentativa de save (ms). */
const SAVE_ATTEMPT_TIMEOUT_MS = 8000;

interface CreateMasterDocumentsProps {
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
      await new Promise((resolve) => setTimeout(resolve, SAVE_RETRY_BASE_MS));
    }
  }
  throw lastError;
}

/**
 * Ferramenta que gera documento(s) DOCX do Master agent e faz stream para o cliente.
 * Aceita 1 ou mais documentos (ex: relatório simples = 1, M07/M10 com Word+Excel = múltiplos).
 * Usa stream events com prefixo "mdoc" para não conflitar com o Revisor (prefixo "rdoc").
 * Inclui retry com backoff para cold start do Supabase.
 */
export const createMasterDocuments = ({
  session,
  dataStream,
}: CreateMasterDocumentsProps) =>
  tool({
    description:
      "Create one or more Master agent documents (DOCX) and stream them to the client for direct download. Use this instead of createDocument when generating final reports. Pass each document with title and markdown content.",
    inputSchema: z.object({
      documents: z
        .array(
          z.object({
            title: z.string().describe("Document title"),
            content: z.string().describe("Document content in markdown format"),
          })
        )
        .min(1)
        .describe("Array of documents to generate"),
    }),
    execute: async ({ documents }) => {
      const total = documents.length;
      const ids: string[] = [];
      const titles: string[] = [];
      const userId = session?.user?.id;

      // Aquece a ligação à BD em background
      if (userId) {
        pingDatabase().catch(() => {
          /* ignorar — apenas warm-up */
        });
      }

      // Sinaliza início da geração
      dataStream.write({
        type: "data-mdocStart",
        data: total,
        transient: true,
      });

      let savedCount = 0;

      for (let i = 0; i < total; i++) {
        const id = generateUUID();
        const { title, content } = documents[i];
        ids.push(id);
        titles.push(title);

        // Progresso
        dataStream.write({
          type: "data-mdocProgress",
          data: JSON.stringify({ current: i + 1, total, title }),
          transient: true,
        });

        // Stream documento individual com prefixo mdoc
        dataStream.write({
          type: "data-mdocId",
          data: id,
          transient: true,
        });
        dataStream.write({
          type: "data-mdocTitle",
          data: title,
          transient: true,
        });
        dataStream.write({
          type: "data-mdocClear",
          data: null,
          transient: true,
        });

        // Stream conteúdo em chunks
        for (let offset = 0; offset < content.length; offset += CHUNK_SIZE) {
          const chunk = content.slice(offset, offset + CHUNK_SIZE);
          dataStream.write({
            type: "data-mdocDelta",
            data: chunk,
            transient: true,
          });
        }

        dataStream.write({
          type: "data-mdocFinish",
          data: null,
          transient: true,
        });

        // Salvar na BD com retry
        if (userId) {
          try {
            await saveWithRetry({ id, title, content, kind: "text", userId });
            savedCount++;
          } catch (saveError) {
            console.error(
              `[createMasterDocuments] falha ao guardar doc ${i + 1}:`,
              saveError
            );
          }
        } else {
          savedCount++;
        }

        // Progresso completado
        dataStream.write({
          type: "data-masterProgress",
          data: i + 1,
          transient: true,
        });
      }

      // Sinaliza fim da geração
      dataStream.write({
        type: "data-mdocDone",
        data: JSON.stringify({ ids, titles }),
        transient: true,
      });

      return {
        ids,
        titles,
        content:
          savedCount === total
            ? `${total === 1 ? "O documento foi criado" : `Os ${total} documentos foram criados`} com sucesso.`
            : savedCount === 0
              ? `${total === 1 ? "O documento foi gerado e está disponível" : `Os ${total} documentos foram gerados e estão disponíveis`} para download. Não foi possível guardá-los na base de dados (cold start) — os botões DOCX/ZIP funcionam na mesma.`
              : `${savedCount}/${total} documentos foram guardados. Os restantes estão disponíveis para download.`,
      };
    },
  });
