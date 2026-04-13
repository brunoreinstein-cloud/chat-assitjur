import type { UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { generateRevisorDocumentContent } from "@/artifacts/text/server";
import {
  getModeloRevisorFromTitle,
  loadModeloRevisor,
  type ModeloRevisor,
} from "@/lib/ai/modelos";
import type { ChatMessage } from "@/lib/types";
import { createDocumentTool } from "./document-tool-base";

interface CreateRevisorDefesaDocumentsProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

const inputSchema = z.object({
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
});

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
  createDocumentTool(
    {
      description:
        "Create the 3 Revisor documents (Avaliação, Roteiro Advogado, Roteiro Preposto) in one call. Use this in FASE B after the user CONFIRMs the GATE 0.5 summary. Pass the exact titles for each document. Optionally pass contextoResumo with the case summary (e.g. the text between GATE_0.5_RESUMO delimiters) so documents are filled with correct data.",
      inputSchema,
      prefix: "rdoc",
      progressEventType: "data-revisorProgress",
      async preProcess(input) {
        // Pré-aquece a cache de templates ANTES de iniciar as 3 gerações em paralelo.
        const titles = [
          input.avaliacaoTitle,
          input.roteiroAdvogadoTitle,
          input.roteiroPrepostoTitle,
        ];
        const uniqueModeloTypes = [
          ...new Set(
            titles
              .map(getModeloRevisorFromTitle)
              .filter((t): t is Exclude<ModeloRevisor, null> => t !== null)
          ),
        ];
        await Promise.all(uniqueModeloTypes.map(loadModeloRevisor));
      },
      async generateDocuments(input, ctx) {
        const titles = [
          input.avaliacaoTitle,
          input.roteiroAdvogadoTitle,
          input.roteiroPrepostoTitle,
        ];
        // Inicia as 3 gerações em paralelo; cada doc usa o título para detectar o template.
        const contents = await Promise.all(
          titles.map((title) =>
            generateRevisorDocumentContent(title, input.contextoResumo)
          )
        );
        return titles.map((title, i) => ({
          id: ctx.generateId(),
          title,
          content: contents[i] ?? "",
        }));
      },
    },
    { session, dataStream }
  );
