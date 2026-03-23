import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { generateRevisorDocumentContent } from "@/artifacts/text/server";
import { pingDatabase, saveDocument } from "@/lib/db/queries";
import { isDatabaseConnectionError, isLikelyDatabaseError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

const CHUNK_SIZE = 400;
const SAVE_MAX_RETRIES = 3;
const SAVE_RETRY_BASE_MS = 2000;
const SAVE_ATTEMPT_TIMEOUT_MS = 8000;

interface CreateAvaliadorContestacaoDocumentProps {
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
 * Ferramenta que gera 1 DOCX do Avaliador (Avaliação de Qualidade da Contestação).
 * Segue o mesmo padrão de stream + retry do createRevisorDefesaDocuments,
 * simplificado para um único documento.
 */
export const createAvaliadorContestacaoDocument = ({
  session,
  dataStream,
}: CreateAvaliadorContestacaoDocumentProps) =>
  tool({
    description:
      "Create the Avaliação de Qualidade da Contestação document (1 DOCX). Use this in FASE B after the user CONFIRMs the GATE 0.5 summary. Pass the title and contextoResumo with the evaluation summary (text between GATE_0.5_AVALIACAO delimiters).",
    inputSchema: z.object({
      avaliacaoTitle: z
        .string()
        .describe(
          "Title for the Avaliação de Qualidade da Contestação document"
        ),
      contextoResumo: z
        .string()
        .optional()
        .describe(
          "Case evaluation summary (content between --- GATE_0.5_AVALIACAO --- and --- /GATE_0.5_AVALIACAO ---). Used to fill the document with correct data."
        ),
    }),
    execute: async ({ avaliacaoTitle, contextoResumo }) => {
      const id = generateUUID();
      const userId = session?.user?.id;

      if (userId) {
        pingDatabase().catch(() => {
          /* warm-up */
        });
      }

      dataStream.write({
        type: "data-generationStatus",
        data: `Gerando Avaliação de Qualidade — ${avaliacaoTitle}…`,
        transient: true,
      });

      const content =
        (await generateRevisorDocumentContent(
          avaliacaoTitle,
          contextoResumo
        )) ?? "";

      // Stream para o cliente via revisor-content-store
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
        data: avaliacaoTitle,
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

      let saved = false;
      if (userId) {
        try {
          await saveWithRetry({
            id,
            title: avaliacaoTitle,
            content,
            kind: "text",
            userId,
          });
          saved = true;
        } catch (saveError) {
          console.error(
            "[createAvaliadorContestacaoDocument] falha ao guardar doc:",
            saveError
          );
        }
      } else {
        saved = true;
      }

      dataStream.write({
        type: "data-revisorProgress",
        data: 1,
        transient: true,
      });

      return {
        ids: [id],
        titles: [avaliacaoTitle],
        content: saved
          ? "O documento Avaliação de Qualidade da Contestação foi criado."
          : "O documento foi gerado e está disponível para download. Não foi possível guardá-lo na base de dados.",
      };
    },
  });
