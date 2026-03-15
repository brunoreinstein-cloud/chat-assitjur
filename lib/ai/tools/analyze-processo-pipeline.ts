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
      "Analyze a large labor process PDF (>200 pages or >200,000 characters) using a multi-call pipeline. " +
      "MANDATORY for documents over 200 pages or 200k characters. " +
      "Splits the document into thematic blocks (Petição Inicial, Contestação, Sentença, etc.) and " +
      "processes each block separately, then synthesizes a unified report with page references (fl. XXX). " +
      "For smaller documents (≤200 pages AND ≤200k chars), process normally without this tool.",
    inputSchema: z.object({
      documentText: z
        .string()
        .describe("Full extracted text of the PDF with [Pag. N] page markers"),
      pageCount: z.number().describe("Total number of pages in the PDF"),
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
        // Sonnet para extração (blocos 1–N) — rápido e barato
        extractionModelId: "anthropic/claude-sonnet-4.6",
        // Opus para compilação/síntese — mais inteligente
        synthesisModelId: "anthropic/claude-opus-4.6",
        // Sonnet para validação cruzada T001/F001/C001 — custo controlado
        validationModelId: "anthropic/claude-sonnet-4.6",
        moduleId,
        onProgress: (msg) => {
          dataStream.write({
            type: "data-pipeline-progress",
            data: msg,
          });
        },
      });

      // Enviar dados do dashboard de qualidade para o frontend
      dataStream.write({
        type: "data-pipeline-dashboard",
        data: JSON.stringify({
          validationScore: result.validationScore,
          totalTokens: result.totalTokens,
          blocksProcessed: result.blocks.length,
          validationErrors: result.validationErrors,
          blockSummary: result.blocks.map((b) => ({
            label: b.blockLabel,
            pageRange: b.pageRange,
            fieldsExtracted: Object.keys(b.extractedFields).length,
            tokensUsed: b.tokensUsed,
          })),
        }),
      });

      return {
        synthesizedReport: result.synthesizedReport,
        validationErrors: result.validationErrors,
        validationScore: result.validationScore,
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
