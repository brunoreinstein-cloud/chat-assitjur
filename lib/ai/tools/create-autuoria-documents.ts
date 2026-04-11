import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import {
  createQuadroDocxBuffer,
  createRevisadaDocxBuffer,
  type QuadroData,
} from "@/lib/autuoria-docx";
import { pingDatabase, saveDocument } from "@/lib/db/queries";
import { isDatabaseConnectionError, isLikelyDatabaseError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

/** Tentativas máximas de guardar na BD. */
const SAVE_MAX_RETRIES = 3;
const SAVE_RETRY_BASE_MS = 500;
const SAVE_ATTEMPT_TIMEOUT_MS = 5000;

interface CreateAutuoriaDocumentsProps {
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
      const delay = SAVE_RETRY_BASE_MS * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Ferramenta AutuorIA: gera 2 DOCX (Quadro de Correções em paisagem + Contestação Revisada
 * com marcações coloridas e comentários Word) em paralelo.
 */
export const createAutuoriaDocuments = ({
  session,
  dataStream,
}: CreateAutuoriaDocumentsProps) =>
  tool({
    description:
      "Generate the 2 AutuorIA documents: Quadro de Correções (landscape DOCX with audit tables) and Contestação Revisada (DOCX with colored markings and Word comments). Call this after completing the audit analysis. Provide structured quadroData (JSON with 8 sections) and revisadaContent (full contestation text with [INS], [DEL], [COMMENT] markers).",
    inputSchema: z.object({
      quadroData: z.object({
        cabecalho: z.object({
          processo: z.string(),
          reclamante: z.string(),
          reclamada: z.string(),
          cnpj: z.string().optional(),
          dtc: z.string(),
          daj: z.string(),
          posicaoProcessual: z.string().optional(),
          teseCentral: z.string(),
          teseCentralStatus: z
            .enum(["adequada", "parcial", "inadequada"])
            .describe("adequada=✅, parcial=⚠️, inadequada=❌"),
        }),
        prescricao: z.array(
          z.object({
            tipo: z.string(),
            calculo: z.string(),
            dataLimite: z.string(),
            status: z.string(),
          })
        ),
        correcoes: z.array(
          z.object({
            numero: z.number(),
            pedido: z.string(),
            secaoDefesa: z.string(),
            impugnado: z
              .enum(["S", "NÃO", "PARCIAL"])
              .describe("S=Sim, NÃO=Não, PARCIAL=Parcial"),
            status: z
              .enum(["ok", "falha", "atencao"])
              .describe("ok=✅, falha=❌, atencao=⚠️"),
            criticidade: z
              .enum(["critico", "medio", "baixo", "informativo"])
              .describe("critico=🔴, medio=🟡, baixo=🟢, informativo=⚪"),
            tipo: z.string(),
            acaoRecomendada: z.string(),
          })
        ),
        checklist: z.array(
          z.object({
            defesa: z.string(),
            status: z
              .enum(["ok", "falha", "desnecessaria"])
              .describe("ok=✅, falha=❌, desnecessaria=Desnecessária"),
            obs: z.string(),
          })
        ),
        correcoesEscrita: z
          .array(
            z.object({
              tipo: z.string(),
              localizacao: z.string(),
              original: z.string(),
              correcao: z.string(),
            })
          )
          .default([]),
        documentosDefesa: z
          .array(
            z.object({
              assunto: z.string(),
              documento: z.string(),
              presente: z
                .enum(["presente", "ausente", "parcial"])
                .describe("presente=✅, ausente=❌, parcial=⚠️"),
            })
          )
          .default([]),
        docsReclamanteImpugnados: z
          .array(
            z.object({
              documento: z.string(),
              impugnado: z.string(),
              observacao: z.string(),
            })
          )
          .default([]),
        resumoIntervencoes: z
          .array(
            z.object({
              tipo: z.string(),
              qtd: z.number(),
              obs: z.string(),
            })
          )
          .default([]),
        ajustesPeca: z
          .array(
            z.object({
              tipo: z.string(),
              localizacao: z.string(),
              descricao: z.string(),
            })
          )
          .default([]),
      }),
      revisadaContent: z
        .string()
        .describe(
          "Full contestation text with markers: [INS]...[/INS] for insertions (blue), [DEL]...[/DEL] for deletions (red strikethrough), [COMMENT id=N]...[/COMMENT] for Word comments."
        ),
      quadroTitle: z
        .string()
        .describe(
          "Filename for Quadro: QUADRO_CORRECOES_-_[RECLAMANTE]_x_[EMPRESA]_-_[Nº]"
        ),
      revisadaTitle: z
        .string()
        .describe(
          "Filename for Revisada: CONTESTACAO_REVISADA_-_[RECLAMANTE]_x_[EMPRESA]_-_[Nº]"
        ),
    }),
    execute: async ({
      quadroData,
      revisadaContent,
      quadroTitle,
      revisadaTitle,
    }) => {
      const ids = [generateUUID(), generateUUID()];
      const titles = [quadroTitle, revisadaTitle];
      const userId = session?.user?.id;

      // Warm up DB connection
      if (userId) {
        pingDatabase().catch(() => {
          /* intentional noop */
        });
      }

      // Signal: 2 documents incoming
      dataStream.write({
        type: "data-autuoriaStart",
        data: 2,
        transient: true,
      });

      // Generate both DOCXs in parallel
      dataStream.write({
        type: "data-generationStatus",
        data: "Gerando Quadro de Correções e Contestação Revisada…",
        transient: true,
      });

      const [quadroBuffer, revisadaBuffer] = await Promise.all([
        createQuadroDocxBuffer(quadroData as QuadroData),
        createRevisadaDocxBuffer(revisadaContent, revisadaTitle),
      ]);

      // Store content as JSON for DB persistence (text representation for re-generation)
      const quadroContentJson = JSON.stringify(quadroData);
      const revisadaContentText = revisadaContent;

      let savedCount = 0;
      const savePromises: Promise<void>[] = [];

      // Stream Quadro document info
      const docs = [
        {
          id: ids[0],
          title: titles[0],
          content: quadroContentJson,
          buffer: quadroBuffer,
        },
        {
          id: ids[1],
          title: titles[1],
          content: revisadaContentText,
          buffer: revisadaBuffer,
        },
      ];

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];

        dataStream.write({
          type: "data-autuoriaId",
          data: doc.id,
          transient: true,
        });
        dataStream.write({
          type: "data-autuoriaTitle",
          data: doc.title,
          transient: true,
        });
        dataStream.write({
          type: "data-autuoriaKind",
          data: "text",
          transient: true,
        });
        dataStream.write({
          type: "data-autuoriaClear",
          data: null,
          transient: true,
        });

        // Stream content in chunks (text representation)
        const textContent = doc.content;
        const CHUNK_SIZE = 400;
        for (
          let offset = 0;
          offset < textContent.length;
          offset += CHUNK_SIZE
        ) {
          dataStream.write({
            type: "data-autuoriaDelta",
            data: textContent.slice(offset, offset + CHUNK_SIZE),
            transient: true,
          });
        }

        dataStream.write({
          type: "data-autuoriaFinish",
          data: null,
          transient: true,
        });

        // Save to DB in background
        if (userId) {
          const docIndex = i + 1;
          const savePromise = saveWithRetry({
            id: doc.id,
            title: doc.title,
            content: doc.content,
            kind: "text",
            userId,
          })
            .then(() => {
              savedCount++;
            })
            .catch((saveError) => {
              console.error(
                `[createAutuoriaDocuments] falha ao guardar doc ${docIndex}:`,
                saveError
              );
            });
          savePromises.push(savePromise);
        }

        dataStream.write({
          type: "data-autuoriaProgress",
          data: i + 1,
          transient: true,
        });
      }

      // Signal completion
      dataStream.write({
        type: "data-autuoriaDone",
        data: JSON.stringify({ ids, titles }),
        transient: true,
      });

      await Promise.allSettled(savePromises);

      return {
        ids,
        titles,
        content:
          savedCount === 2
            ? "Os 2 documentos AutuorIA foram criados: Quadro de Correções e Contestação Revisada."
            : savedCount === 0
              ? "Os 2 documentos foram gerados e estão disponíveis para download. Não foi possível guardá-los na base de dados."
              : `${savedCount}/2 documentos foram guardados. Os restantes estão disponíveis para download.`,
      };
    },
  });
