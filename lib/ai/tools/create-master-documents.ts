import type { UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import type { ChatMessage } from "@/lib/types";
import { createDocumentTool } from "./document-tool-base";

interface CreateMasterDocumentsProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

const inputSchema = z.object({
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
});

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
  createDocumentTool(
    {
      description:
        "Create one or more Master agent documents (DOCX) and stream them to the client for direct download. Use this instead of createDocument when generating final reports. Pass each document with title and markdown content.",
      inputSchema,
      prefix: "mdoc",
      progressEventType: "data-masterProgress",
      onDocumentReady(doc, index, ds) {
        // Anuncia título real para o skeleton antes de iniciar o stream do doc
        ds.write({
          type: "data-masterTitle",
          data: JSON.stringify({ index, title: doc.title }),
          transient: true,
        });
      },
      generateDocuments(input, ctx) {
        return Promise.resolve(
          input.documents.map((docInput) => {
            let content = docInput.content;
            // Template Lock: substituir {PLACEHOLDER} pelo valor mapeado
            if (
              docInput.placeholders &&
              Object.keys(docInput.placeholders).length > 0
            ) {
              for (const [key, value] of Object.entries(
                docInput.placeholders
              )) {
                content = content.replaceAll(`{${key}}`, value);
              }
            }
            return {
              id: ctx.generateId(),
              title: docInput.title,
              content,
            };
          })
        );
      },
    },
    { session, dataStream }
  );
