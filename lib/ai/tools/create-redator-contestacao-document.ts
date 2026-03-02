import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { saveDocument } from "@/lib/db/queries";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

const CHUNK_SIZE = 400;

interface CreateRedatorContestacaoDocumentProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

/**
 * Ferramenta que gera um DOCX de contestação (minuta) para download.
 * Usada na FASE B do Redator: o modelo envia o texto completo da minuta e o título sugerido.
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
        await saveDocument({
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
