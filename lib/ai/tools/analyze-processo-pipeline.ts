/**
 * Tool que permite ao Master agent processar PDFs grandes (>500 pgs)
 * usando o pipeline multi-chamadas com divisão temática.
 */

import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";

import { runMultiCallPipeline } from "@/lib/ai/pipeline/multi-call-pipeline";
import type { ChatMessage } from "@/lib/types";

interface AnalyzeProcessoPipelineProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

export const analyzeProcessoPipeline = ({
  dataStream,
}: AnalyzeProcessoPipelineProps) =>
  tool({
    description:
      "Analyze a large labor process PDF (>500 pages or >200,000 characters) using a multi-call pipeline. " +
      "Splits the document into thematic blocks (Petição Inicial, Contestação, Sentença, etc.) and " +
      "processes each block separately, then synthesizes a unified report with page references (fl. XXX). " +
      "Use this tool ONLY for large documents. For smaller documents, process normally.",
    inputSchema: z.object({
      documentText: z
        .string()
        .describe(
          "Full extracted text of the PDF with [Pag. N] page markers"
        ),
      pageCount: z
        .number()
        .describe("Total number of pages in the PDF"),
      moduleId: z
        .string()
        .default("M03")
        .describe(
          "Module ID for the report format (e.g. M03 for relatorio-master, M12 for modelo-br)"
        ),
    }),
    execute: async ({ documentText, pageCount, moduleId }) => {
      const result = await runMultiCallPipeline({
        fullText: documentText,
        pageCount,
        modelId: "anthropic/claude-sonnet-4.6",
        moduleId,
        onProgress: (msg) => {
          // Enviar progresso como dado custom (exibido pelo cliente se suportado)
          dataStream.write({
            type: "data-pipeline-progress",
            data: msg,
          });
        },
      });

      return {
        synthesizedReport: result.synthesizedReport,
        validationErrors: result.validationErrors,
        totalTokens: result.totalTokens,
        blocksProcessed: result.blocks.length,
        blockSummary: result.blocks.map((b) => ({
          label: b.blockLabel,
          pageRange: b.pageRange,
          fieldsExtracted: Object.keys(b.extractedFields).length,
        })),
      };
    },
  });
