import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import type { z } from "zod";
import {
  pingDatabase,
  saveDocument,
  withQueryTimeout,
  withRetry,
} from "@/lib/db/queries";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import type { DocStreamPrefix } from "./document-stream-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedDocument {
  id: string;
  title: string;
  content: string;
}

export interface DocumentToolConfig<TInput extends z.ZodTypeAny> {
  /** Tool description for the LLM. */
  description: string;
  /** Zod schema for tool input. */
  inputSchema: TInput;
  /** Stream event prefix (e.g., 'rdoc', 'mdoc', 'autuoria', 'redator'). */
  prefix: DocStreamPrefix;
  /** Progress event type (e.g., 'data-revisorProgress'). */
  progressEventType: `data-${string}`;
  /** Save timeout per attempt (ms). Default: 5000. */
  saveTimeoutMs?: number;
  /** Async hook called before streaming starts (e.g., template pre-warming). */
  preProcess?: (input: z.infer<TInput>) => Promise<void>;
  /**
   * Converts tool input into an array of documents to stream.
   * Each document has id, title, content. Content generation can be async.
   */
  generateDocuments: (
    input: z.infer<TInput>,
    ctx: { userId?: string; generateId: () => string }
  ) => Promise<GeneratedDocument[]>;
  /**
   * Optional hook called before streaming each document.
   * Use for agent-specific extra events (e.g., Master emits data-masterTitle).
   */
  onDocumentReady?: (
    doc: GeneratedDocument,
    index: number,
    dataStream: UIMessageStreamWriter<ChatMessage>
  ) => void;
}

interface DocumentToolDeps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 400;
const DEFAULT_SAVE_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function saveDocWithRetry(
  params: {
    id: string;
    title: string;
    content: string;
    kind: "text";
    userId: string;
  },
  timeoutMs: number
): Promise<void> {
  await withRetry(
    () =>
      withQueryTimeout(
        () => saveDocument(params),
        timeoutMs,
        `saveDoc-${params.id.slice(0, 8)}`
      ),
    2,
    500
  );
}

function summarizeResult(savedCount: number, total: number): string {
  if (savedCount === total) {
    return total === 1
      ? "O documento foi criado com sucesso."
      : `Os ${total} documentos foram criados com sucesso.`;
  }
  if (savedCount === 0) {
    return total === 1
      ? "O documento foi gerado e está disponível para download. Não foi possível guardá-lo na base de dados (cold start) — os botões DOCX/ZIP funcionam na mesma."
      : `Os ${total} documentos foram gerados e estão disponíveis para download. Não foi possível guardá-los na base de dados (cold start) — os botões DOCX/ZIP funcionam na mesma.`;
  }
  return `${savedCount}/${total} documentos foram guardados. Os restantes estão disponíveis para download.`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Cria uma document tool com o padrão unificado de streaming + save.
 *
 * O ciclo encapsulado:
 * 1. pingDatabase() warm-up
 * 2. preProcess() se definido
 * 3. Emit Start com total
 * 4. Para cada documento: Id/Title/Kind/Clear → Delta chunks → Finish → save non-blocking → Progress
 * 5. Emit Done com {ids, titles}
 * 6. Promise.allSettled(saves)
 * 7. Return {ids, titles, content}
 */
export function createDocumentTool<TInput extends z.ZodTypeAny>(
  config: DocumentToolConfig<TInput>,
  { session, dataStream }: DocumentToolDeps
) {
  const {
    description,
    inputSchema,
    prefix,
    progressEventType,
    saveTimeoutMs = DEFAULT_SAVE_TIMEOUT_MS,
    preProcess,
    generateDocuments,
    onDocumentReady,
  } = config;

  return tool({
    description,
    inputSchema,
    execute: async (input: z.infer<TInput>) => {
      const userId = session?.user?.id;

      // 1. Warm-up da BD em background
      if (userId) {
        pingDatabase().catch(() => {
          /* ignorar — apenas warm-up */
        });
      }

      // 2. Pre-processing (ex: template warm-up)
      if (preProcess) {
        await preProcess(input);
      }

      // 3. Gerar documentos
      const documents = await generateDocuments(input, {
        userId,
        generateId: generateUUID,
      });

      const total = documents.length;
      const ids = documents.map((d) => d.id);
      const titles = documents.map((d) => d.title);

      // 4. Sinaliza início
      dataStream.write({
        type: `data-${prefix}Start`,
        data: total,
        transient: true,
      });

      let savedCount = 0;
      const savePromises: Promise<void>[] = [];

      for (let i = 0; i < total; i++) {
        const doc = documents[i];

        // Hook pre-stream (ex: Master emite data-masterTitle)
        if (onDocumentReady) {
          onDocumentReady(doc, i, dataStream);
        }

        // Status de progresso
        dataStream.write({
          type: "data-generationStatus",
          data: `Gerando ${total > 1 ? `${i + 1}/${total} — ` : ""}${doc.title}…`,
          transient: true,
        });

        // Stream metadata
        dataStream.write({
          type: `data-${prefix}Kind`,
          data: "text",
          transient: true,
        });
        dataStream.write({
          type: `data-${prefix}Id`,
          data: doc.id,
          transient: true,
        });
        dataStream.write({
          type: `data-${prefix}Title`,
          data: doc.title,
          transient: true,
        });
        dataStream.write({
          type: `data-${prefix}Clear`,
          data: null,
          transient: true,
        });

        // Stream conteúdo em chunks
        for (
          let offset = 0;
          offset < doc.content.length;
          offset += CHUNK_SIZE
        ) {
          dataStream.write({
            type: `data-${prefix}Delta`,
            data: doc.content.slice(offset, offset + CHUNK_SIZE),
            transient: true,
          });
        }

        dataStream.write({
          type: `data-${prefix}Finish`,
          data: null,
          transient: true,
        });

        // Save non-blocking
        if (userId) {
          const savePromise = saveDocWithRetry(
            {
              id: doc.id,
              title: doc.title,
              content: doc.content,
              kind: "text",
              userId,
            },
            saveTimeoutMs
          )
            .then(() => {
              savedCount++;
            })
            .catch((err) => {
              console.error(`[${prefix}] falha ao guardar doc ${i + 1}:`, err);
            });
          savePromises.push(savePromise);
        }

        // Progresso
        dataStream.write({
          type: progressEventType,
          data: i + 1,
          transient: true,
        });
      }

      // Sinaliza conclusão ANTES de aguardar saves
      dataStream.write({
        type: `data-${prefix}Done`,
        data: JSON.stringify({ ids, titles }),
        transient: true,
      });

      await Promise.allSettled(savePromises);

      return {
        ids,
        titles,
        content: summarizeResult(userId ? savedCount : total, total),
      };
    },
  });
}
