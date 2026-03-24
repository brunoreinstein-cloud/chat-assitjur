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
 * 5s por tentativa × 3 tentativas = 15s máx por doc (vs 24s anterior).
 * Saves correm em paralelo e não bloqueiam o stream, pelo que o impacto para o utilizador é nulo.
 */
const SAVE_ATTEMPT_TIMEOUT_MS = 5000;

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
      // Exponential backoff: 2s, 4s, 8s, ...
      const delay = SAVE_RETRY_BASE_MS * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
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
            content: z
              .string()
              .describe(
                "Document content in markdown format. " +
                  "For Template Lock mode (M02/M04/M06): pass the full template content with {PLACEHOLDER} markers already present; " +
                  "use the 'placeholders' field to supply the substitution values."
              ),
            placeholders: z
              .record(z.string(), z.string())
              .optional()
              .describe(
                "Template Lock — map of {PLACEHOLDER_KEY}: value to substitute in the content. " +
                  "Example: { 'NOME_RECLAMANTE': 'João Silva', 'DATA_ADMISSAO': '01/03/2020' }. " +
                  "Keys must match exactly the placeholder names inside braces in the template content."
              ),
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

      // Aquece a ligação à BD em background enquanto o LLM gera conteúdo.
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
      // Saves disparados em paralelo — não bloqueiam o loop de streaming.
      const savePromises: Promise<void>[] = [];

      for (let i = 0; i < total; i++) {
        const id = generateUUID();
        const { title, placeholders } = documents[i];
        // Template Lock: substituir {PLACEHOLDER} pelo valor mapeado (se fornecido)
        let content = documents[i].content;
        if (placeholders && Object.keys(placeholders).length > 0) {
          for (const [key, value] of Object.entries(placeholders)) {
            content = content.replaceAll(`{${key}}`, value);
          }
        }
        ids.push(id);
        titles.push(title);

        // Progresso: anuncia título real para o skeleton
        dataStream.write({
          type: "data-masterTitle",
          data: JSON.stringify({ index: i, title }),
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

        // Dispara o save em background — NÃO bloqueia o próximo documento.
        // O utilizador já recebeu o conteúdo via stream; o save é apenas persistência.
        if (userId) {
          const docIndex = i + 1;
          const savePromise = saveWithRetry({
            id,
            title,
            content,
            kind: "text",
            userId,
          })
            .then(() => {
              savedCount++;
            })
            .catch((saveError) => {
              console.error(
                `[createMasterDocuments] falha ao guardar doc ${docIndex}:`,
                saveError
              );
            });
          savePromises.push(savePromise);
        }

        // Progresso imediato — não espera pelo save
        dataStream.write({
          type: "data-masterProgress",
          data: i + 1,
          transient: true,
        });
      }

      // Sinaliza fim do streaming ANTES de aguardar os saves.
      // O cliente recebe data-mdocDone imediatamente após o último chunk.
      dataStream.write({
        type: "data-mdocDone",
        data: JSON.stringify({ ids, titles }),
        transient: true,
      });

      // Aguarda todos os saves em paralelo (para reportar savedCount preciso na mensagem).
      // Usa allSettled — qualquer falha já foi tratada no .catch() acima.
      await Promise.allSettled(savePromises);

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
