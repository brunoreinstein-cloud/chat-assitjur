import type { InferUITool, UIMessage, UIMessagePart } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/artifact";
import type { createDocument } from "./ai/tools/create-document";
import type { createRedatorContestacaoDocument } from "./ai/tools/create-redator-contestacao-document";
import type { createRevisorDefesaDocuments } from "./ai/tools/create-revisor-defesa-documents";
import type { getWeather } from "./ai/tools/get-weather";
import type { requestSuggestions } from "./ai/tools/request-suggestions";
import type { updateDocument } from "./ai/tools/update-document";
import type { Suggestion } from "./db/schema";

export interface DataPart {
  type: "append-message";
  message: string;
}

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type weatherTool = InferUITool<typeof getWeather>;
type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type createRevisorDefesaDocumentsTool = InferUITool<
  ReturnType<typeof createRevisorDefesaDocuments>
>;
type createRedatorContestacaoDocumentTool = InferUITool<
  ReturnType<typeof createRedatorContestacaoDocument>
>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;

export interface ChatTools {
  getWeather: weatherTool;
  createDocument: createDocumentTool;
  createRevisorDefesaDocuments: createRevisorDefesaDocumentsTool;
  createRedatorContestacaoDocument: createRedatorContestacaoDocumentTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
  /** Index signature required by AI SDK UITools */
  [key: string]:
    | weatherTool
    | createDocumentTool
    | createRevisorDefesaDocumentsTool
    | createRedatorContestacaoDocumentTool
    | updateDocumentTool
    | requestSuggestionsTool;
}

export interface CustomUIDataTypes {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  "chat-title": string;
  /** Enviado quando o dbBatch usou fallback (BD lenta); cliente mostra aviso "dados parciais". */
  "data-db-fallback": boolean;
  /** Mensagem de progresso do pipeline multi-chamadas (PDFs grandes). */
  "pipeline-progress": string;
  /** Dashboard de qualidade do pipeline (JSON stringificado com validationScore, blockSummary, etc.) */
  "pipeline-dashboard": string;
  /** Mensagem de progresso durante geração dos 3 docs Revisor (ex: "Gerando 2/3 — Roteiro Advogado..."). */
  generationStatus: string;
  /** Quantos docs do Revisor já foram gerados e guardados (0–3). */
  revisorProgress: number;
  // Eventos de stream exclusivos do Revisor — NÃO ativam o painel artifact (artifact.tsx usa useSWR
  // só para data-id/title/kind/clear/textDelta/finish). Prefixo rdoc isola o fluxo do Revisor.
  rdocId: string;
  rdocTitle: string;
  rdocKind: string;
  rdocClear: null;
  rdocDelta: string;
  rdocFinish: null;
  /** Index signature required by AI SDK UIDataTypes. kind stays ArtifactKind via explicit property above. */
  [key: string]: string | Suggestion | boolean | number | null | undefined;
}

/** Parte de uma mensagem do chat (texto, ficheiro, tool, etc.). */
export type ChatMessagePart = UIMessagePart<CustomUIDataTypes, ChatTools>;

export interface ChatMessage
  extends UIMessage<MessageMetadata, CustomUIDataTypes, ChatTools> {
  parts: ChatMessagePart[];
}

/** Rótulo opcional para documentos (PI/Contestação) no Revisor de Defesas */
export type DocumentTypeLabel = "pi" | "contestacao";

/** Item de uso recente devolvido por GET /api/credits */
export interface CreditsUsageItem {
  id: string;
  chatId: string | null;
  promptTokens: number;
  completionTokens: number;
  model: string | null;
  creditsConsumed: number;
  createdAt: string;
}

/** Resposta de GET /api/credits (saldo + histórico + threshold). */
export interface CreditsResponse {
  balance: number;
  recentUsage: CreditsUsageItem[];
  lowBalanceThreshold: number;
  /** true quando a BD demorou ou falhou e a API devolveu fallback */
  _partial?: boolean;
}

export interface Attachment {
  name: string;
  url: string;
  contentType: string;
  /** Caminho no Storage (para "Guardar em Arquivos"); presente quando o upload devolve pathname */
  pathname?: string;
  /** Texto extraído de PDF ou DOCX; presente quando o backend devolve extractedText */
  extractedText?: string;
  /** Tipo de documento para o Revisor: Petição Inicial ou Contestação */
  documentType?: DocumentTypeLabel;
  /** true quando o backend não conseguiu extrair texto do PDF/DOCX; utilizador deve colar o texto */
  extractionFailed?: boolean;
  /** Número de páginas do PDF (quando disponível) */
  pageCount?: number;
}
