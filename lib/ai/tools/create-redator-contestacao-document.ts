import type { UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import type { ChatMessage } from "@/lib/types";
import { createDocumentTool } from "./document-tool-base";

interface CreateRedatorContestacaoDocumentProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

const inputSchema = z.object({
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
});

/**
 * Ferramenta que gera um DOCX de contestação (minuta) para download.
 * Usada na FASE B do Redator: o modelo envia o texto completo da minuta e o título sugerido.
 * Usa prefixo data-redator* para evitar colisão com o artifact panel (data-*).
 * Inclui pingDatabase warm-up e retry com backoff (mesmo padrão do Revisor e Master).
 */
export const createRedatorContestacaoDocument = ({
  session,
  dataStream,
}: CreateRedatorContestacaoDocumentProps) =>
  createDocumentTool(
    {
      description:
        "Create the contestação minuta document for download. Use this once in FASE B after producing the full minuta text. Pass the suggested title (e.g. Contestacao_[Nº processo]_minuta) and the complete minuta content (with campos pendentes 🟡🔴🔵). The document will be available for download as DOCX.",
      inputSchema,
      prefix: "redator",
      progressEventType: "data-redatorProgress",
      generateDocuments(input, ctx) {
        return Promise.resolve([
          {
            id: ctx.generateId(),
            title: input.title,
            content: input.minutaContent ?? "",
          },
        ]);
      },
    },
    { session, dataStream }
  );
