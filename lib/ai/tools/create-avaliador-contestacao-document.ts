import type { UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { generateRevisorDocumentContent } from "@/artifacts/text/server";
import type { ChatMessage } from "@/lib/types";
import { createDocumentTool } from "./document-tool-base";

interface CreateAvaliadorContestacaoDocumentProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

const inputSchema = z.object({
  avaliacaoTitle: z
    .string()
    .describe("Title for the Avaliação de Qualidade da Contestação document"),
  contextoResumo: z
    .string()
    .optional()
    .describe(
      "Case evaluation summary (content between --- GATE_0.5_AVALIACAO --- and --- /GATE_0.5_AVALIACAO ---). Used to fill the document with correct data."
    ),
});

/**
 * Ferramenta que gera 1 DOCX do Avaliador (Avaliação de Qualidade da Contestação).
 * Segue o mesmo padrão de stream + retry do createRevisorDefesaDocuments,
 * simplificado para um único documento.
 */
export const createAvaliadorContestacaoDocument = ({
  session,
  dataStream,
}: CreateAvaliadorContestacaoDocumentProps) =>
  createDocumentTool(
    {
      description:
        "Create the Avaliação de Qualidade da Contestação document (1 DOCX). Use this in FASE B after the user CONFIRMs the GATE 0.5 summary. Pass the title and contextoResumo with the evaluation summary (text between GATE_0.5_AVALIACAO delimiters).",
      inputSchema,
      prefix: "rdoc",
      progressEventType: "data-revisorProgress",
      saveTimeoutMs: 8000,
      async generateDocuments(input, ctx) {
        const content =
          (await generateRevisorDocumentContent(
            input.avaliacaoTitle,
            input.contextoResumo
          )) ?? "";
        return [
          {
            id: ctx.generateId(),
            title: input.avaliacaoTitle,
            content,
          },
        ];
      },
    },
    { session, dataStream }
  );
