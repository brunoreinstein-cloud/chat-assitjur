import { smoothStream, streamText } from "ai";
import { getModeloRevisorFromTitle, loadModeloRevisor } from "@/lib/ai/modelos";
import { updateDocumentPrompt } from "@/lib/ai/prompts";
import { getArtifactModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";

const SYSTEM_TEMPLATE_REVISOR = `És um assistente que preenche documentos do Revisor de Defesas Trabalhistas.
DEVES seguir à risca a estrutura do modelo abaixo. Mantém títulos, secções, tabelas e placeholders [entre colchetes].
Substitui os placeholders pelos dados apropriados ao caso (processo, partes, datas, temas, etc.) quando os tiveres.
Se não tiveres dados para um campo, mantém o placeholder ou indica [a preencher].
Não inventes factos. Não alteres a hierarquia nem o formato do modelo.
Responde APENAS com o conteúdo do documento, sem introduções.`;

export const textDocumentHandler = createDocumentHandler<"text">({
  kind: "text",
  onCreateDocument: async ({ title, dataStream }) => {
    let draftContent = "";

    const modeloType = getModeloRevisorFromTitle(title);
    const template = modeloType ? await loadModeloRevisor(modeloType) : null;

    const useTemplate = Boolean(template?.trim());
    const system = useTemplate
      ? `${SYSTEM_TEMPLATE_REVISOR}\n\n--- MODELO A SEGUIR ---\n\n${template}\n\n--- FIM DO MODELO ---`
      : "Write about the given topic. Markdown is supported. Use headings wherever appropriate.";

    const { fullStream } = streamText({
      model: getArtifactModel(),
      maxOutputTokens: 8192,
      system,
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: useTemplate
        ? `Preenche o documento conforme o modelo acima, para o caso indicado no título: "${title}".`
        : title,
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === "text-delta") {
        const { text } = delta;

        draftContent += text;

        dataStream.write({
          type: "data-textDelta",
          data: text,
          transient: true,
        });
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    let draftContent = "";

    const { fullStream } = streamText({
      model: getArtifactModel(),
      maxOutputTokens: 8192,
      system: updateDocumentPrompt(document.content, "text"),
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: description,
      providerOptions: {
        openai: {
          prediction: {
            type: "content",
            content: document.content,
          },
        },
      },
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === "text-delta") {
        const { text } = delta;

        draftContent += text;

        dataStream.write({
          type: "data-textDelta",
          data: text,
          transient: true,
        });
      }
    }

    return draftContent;
  },
});
