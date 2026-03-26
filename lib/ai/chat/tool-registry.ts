/**
 * Registro e ativação de tools para o chat.
 * Extraído de app/(chat)/api/chat/route.ts.
 */

import type { createUIMessageStream } from "ai";
import { analyzeProcessoPipeline } from "@/lib/ai/tools/analyze-processo-pipeline";
import { createDocument } from "@/lib/ai/tools/create-document";
import { createMasterDocuments } from "@/lib/ai/tools/create-master-documents";
import { createRedatorContestacaoDocument } from "@/lib/ai/tools/create-redator-contestacao-document";
import { createRevisorDefesaDocuments } from "@/lib/ai/tools/create-revisor-defesa-documents";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { requestApproval } from "@/lib/ai/tools/human-in-the-loop";
import { improvePromptTool } from "@/lib/ai/tools/improve-prompt";
import { createIntakeProcessoTool } from "@/lib/ai/tools/intake-processo";
import { createMemoryTools } from "@/lib/ai/tools/memory";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { runProcessoGates } from "@/lib/ai/tools/run-processo-gates";
import { createSearchDocumentTool } from "@/lib/ai/tools/search-document";
import { createSearchJurisprudenciaTool } from "@/lib/ai/tools/search-jurisprudencia";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { upsertRiscoVerba } from "@/lib/ai/tools/upsert-risco-verba";
import type { StreamExecuteContext } from "./types";

type DataStreamWriter = Parameters<
  Parameters<typeof createUIMessageStream>[0]["execute"]
>[0]["writer"];

/** Constrói o objecto de tools activado para o agente a partir do contexto do stream. */
export function buildToolsForAgent(
  ctx: StreamExecuteContext,
  dataStream: DataStreamWriter
) {
  const memoryTools = createMemoryTools({ userId: ctx.session.user.id });
  const tools = {
    getWeather,
    createDocument: createDocument({ session: ctx.session, dataStream }),
    updateDocument: updateDocument({ session: ctx.session, dataStream }),
    requestSuggestions: requestSuggestions({
      session: ctx.session,
      dataStream,
    }),
    improvePrompt: improvePromptTool,
    saveMemory: memoryTools.saveMemory,
    recallMemories: memoryTools.recallMemories,
    forgetMemory: memoryTools.forgetMemory,
    requestApproval,
    runProcessoGates,
    upsertRiscoVerba,
    searchJurisprudencia: createSearchJurisprudenciaTool({
      userId: ctx.session.user.id,
    }),
    // buscarNoProcesso criado com os textos completos em closure
    ...(ctx.documentTexts.size > 0
      ? {
          buscarNoProcesso: createSearchDocumentTool({
            documentTexts: ctx.documentTexts,
          }),
        }
      : {}),
  } as {
    getWeather: typeof getWeather;
    createDocument: ReturnType<typeof createDocument>;
    updateDocument: ReturnType<typeof updateDocument>;
    requestSuggestions: ReturnType<typeof requestSuggestions>;
    improvePrompt: typeof improvePromptTool;
    saveMemory: ReturnType<typeof createMemoryTools>["saveMemory"];
    recallMemories: ReturnType<typeof createMemoryTools>["recallMemories"];
    forgetMemory: ReturnType<typeof createMemoryTools>["forgetMemory"];
    requestApproval: typeof requestApproval;
    runProcessoGates: typeof runProcessoGates;
    upsertRiscoVerba: typeof upsertRiscoVerba;
    searchJurisprudencia: ReturnType<typeof createSearchJurisprudenciaTool>;
    buscarNoProcesso?: ReturnType<typeof createSearchDocumentTool>;
    createRevisorDefesaDocuments?: ReturnType<
      typeof createRevisorDefesaDocuments
    >;
    createRedatorContestacaoDocument?: ReturnType<
      typeof createRedatorContestacaoDocument
    >;
    analyzeProcessoPipeline?: ReturnType<typeof analyzeProcessoPipeline>;
    createMasterDocuments?: ReturnType<typeof createMasterDocuments>;
    intakeProcesso?: ReturnType<typeof createIntakeProcessoTool>;
  };
  if (ctx.agentConfig.useRevisorDefesaTools) {
    tools.createRevisorDefesaDocuments = createRevisorDefesaDocuments({
      session: ctx.session,
      dataStream,
    });
  }
  if (ctx.agentConfig.usePipelineTool) {
    tools.analyzeProcessoPipeline = analyzeProcessoPipeline({
      session: ctx.session,
      dataStream,
    });
  }
  if (ctx.agentConfig.useRedatorContestacaoTool) {
    tools.createRedatorContestacaoDocument = createRedatorContestacaoDocument({
      session: ctx.session,
      dataStream,
    });
  }
  if (ctx.agentConfig.useMasterDocumentsTool) {
    tools.createMasterDocuments = createMasterDocuments({
      session: ctx.session,
      dataStream,
    });
  }

  // intakeProcesso: só disponível quando chat não está vinculado a processo
  if (!ctx.processoId) {
    (tools as Record<string, unknown>).intakeProcesso =
      createIntakeProcessoTool({
        session: ctx.session,
        chatId: ctx.id,
      });
  }

  // Injetar MCP tools (Gmail, Drive, Notion, etc.) — já carregadas antes do stream.
  if (Object.keys(ctx.mcpTools).length > 0) {
    Object.assign(tools, ctx.mcpTools);
  }

  return tools;
}
