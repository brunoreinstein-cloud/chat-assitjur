import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { generateRevisorDocumentContent } from "@/artifacts/text/server";
import { pingDatabase, saveDocument } from "@/lib/db/queries";
import { isDatabaseConnectionError, isLikelyDatabaseError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

const CHUNK_SIZE = 400;
/** Tentativas máximas de guardar na BD (apenas erros de ligação transitórios). */
const SAVE_MAX_RETRIES = 3;
/** Atraso base entre tentativas (ms). Backoff exponencial: base * 2^(attempt-1). */
const SAVE_RETRY_BASE_MS = 2000;
/**
 * Timeout por tentativa de save (ms). Dá mais margem para cold start do Supabase
 * sem bloquear demasiado tempo por tentativa (3 tentativas × 8s = 24s máx por doc).
 */
const SAVE_ATTEMPT_TIMEOUT_MS = 8000;

interface CreateRevisorDefesaDocumentsProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

function isRetryableDbError(error: unknown): boolean {
  // Não retentar statement timeout — já esperámos o suficiente nessa tentativa.
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
      // Exponential backoff: 2s, 4s, 8s, …
      const delay = SAVE_RETRY_BASE_MS * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Ferramenta que gera os 3 DOCX do Revisor (Avaliação, Roteiro Advogado, Roteiro Preposto)
 * em paralelo e depois faz stream para o cliente na ordem. Reduz o tempo total em produção
 * de ~(T1+T2+T3) para ~max(T1,T2,T3) + tempo de envio.
 * Inclui retry com backoff para cold start do Supabase.
 */
export const createRevisorDefesaDocuments = ({
  session,
  dataStream,
}: CreateRevisorDefesaDocumentsProps) =>
  tool({
    description:
      "Create the 3 Revisor documents (Avaliação, Roteiro Advogado, Roteiro Preposto) in one call. Use this in FASE B after the user CONFIRMs the GATE 0.5 summary. Pass the exact titles for each document. Optionally pass contextoResumo with the case summary (e.g. the text between GATE_0.5_RESUMO delimiters) so documents are filled with correct data.",
    inputSchema: z.object({
      avaliacaoTitle: z
        .string()
        .describe("Title for Doc 1: Avaliação / Parecer Executivo"),
      roteiroAdvogadoTitle: z
        .string()
        .describe("Title for Doc 2: Roteiro Advogado"),
      roteiroPrepostoTitle: z
        .string()
        .describe("Title for Doc 3: Roteiro Preposto"),
      contextoResumo: z
        .string()
        .optional()
        .describe(
          "Optional. Case summary / extracted data (e.g. content between --- GATE_0.5_RESUMO --- and --- /GATE_0.5_RESUMO ---). Use so the 3 documents are filled with the correct case data."
        ),
    }),
    execute: async ({
      avaliacaoTitle,
      roteiroAdvogadoTitle,
      roteiroPrepostoTitle,
      contextoResumo,
    }) => {
      const titles = [
        avaliacaoTitle,
        roteiroAdvogadoTitle,
        roteiroPrepostoTitle,
      ];
      const ids = [generateUUID(), generateUUID(), generateUUID()];
      const userId = session?.user?.id;

      // Aquece a ligação à BD em background enquanto a IA gera conteúdo (~20-40s).
      // Resolve o cold start do Supabase: quando chegar a hora dos saves, a ligação já está ativa.
      if (userId) {
        pingDatabase().catch(() => {
          /* ignorar — apenas warm-up */
        });
      }

      // Inicia as 3 gerações em paralelo; cada doc é enviado ao cliente assim que fica pronto (na ordem),
      // reduzindo o tempo até o primeiro documento aparecer em produção.
      const contentPromises = titles.map((title) =>
        generateRevisorDocumentContent(title, contextoResumo)
      );

      // Sinaliza ao cliente: 3 documentos do Revisor a chegar
      dataStream.write({
        type: "data-rdocStart",
        data: 3,
        transient: true,
      });

      let savedCount = 0;

      for (let i = 0; i < 3; i++) {
        // Indicador de progresso: mostra qual documento está a ser gerado
        dataStream.write({
          type: "data-generationStatus",
          data: `Gerando ${i + 1}/3 — ${titles[i]}…`,
          transient: true,
        });

        const content = (await contentPromises[i]) ?? "";

        const id = ids[i];
        const title = titles[i];

        // Prefixo rdoc: estes eventos NÃO ativam o painel artifact (artifact.tsx/useSWR)
        // nem fazem GET /api/document. O conteúdo vai apenas para o revisor-content-store.
        dataStream.write({
          type: "data-rdocKind",
          data: "text",
          transient: true,
        });
        dataStream.write({
          type: "data-rdocId",
          data: id,
          transient: true,
        });
        dataStream.write({
          type: "data-rdocTitle",
          data: title,
          transient: true,
        });
        dataStream.write({
          type: "data-rdocClear",
          data: null,
          transient: true,
        });

        for (let offset = 0; offset < content.length; offset += CHUNK_SIZE) {
          const chunk = content.slice(offset, offset + CHUNK_SIZE);
          dataStream.write({
            type: "data-rdocDelta",
            data: chunk,
            transient: true,
          });
        }

        dataStream.write({
          type: "data-rdocFinish",
          data: null,
          transient: true,
        });

        if (userId) {
          try {
            await saveWithRetry({ id, title, content, kind: "text", userId });
            savedCount++;
          } catch (saveError) {
            // Regista o erro mas não interrompe — o utilizador já viu o conteúdo no stream
            // e pode fazer download via store em memória.
            console.error(
              `[createRevisorDefesaDocuments] falha ao guardar doc ${i + 1}:`,
              saveError
            );
          }
        }
        // Notifica quantos docs estão concluídos (para skeletons no chat)
        dataStream.write({
          type: "data-revisorProgress",
          data: i + 1,
          transient: true,
        });
      }

      // Sinaliza ao cliente: todos os 3 documentos do Revisor foram enviados
      dataStream.write({
        type: "data-rdocDone",
        data: JSON.stringify({ ids, titles }),
        transient: true,
      });

      // Sempre retorna todos os IDs — o conteúdo está no revisor-content-store
      // no cliente, pelo que downloads funcionam mesmo quando o save na BD falhou.
      return {
        ids,
        titles,
        content:
          savedCount === 3
            ? "Os 3 documentos foram criados: Avaliação, Roteiro Advogado, Roteiro Preposto."
            : savedCount === 0
              ? "Os 3 documentos foram gerados e estão disponíveis para download. Não foi possível guardá-los na base de dados (cold start) — os botões DOCX/ZIP funcionam na mesma."
              : `${savedCount}/3 documentos foram guardados. Os restantes estão disponíveis para download.`,
      };
    },
  });
