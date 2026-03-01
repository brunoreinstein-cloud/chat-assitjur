import type { InferUITool, UIMessage, UIMessagePart } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/artifact";
import type { createDocument } from "./ai/tools/create-document";
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
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;

export interface ChatTools {
  getWeather: weatherTool;
  createDocument: createDocumentTool;
  createRevisorDefesaDocuments: createRevisorDefesaDocumentsTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
  /** Index signature required by AI SDK UITools */
  [key: string]:
    | weatherTool
    | createDocumentTool
    | createRevisorDefesaDocumentsTool
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
  /** Index signature required by AI SDK UIDataTypes. kind stays ArtifactKind via explicit property above. */
  [key: string]: string | Suggestion | null | undefined;
}

/** Parte de uma mensagem do chat (texto, ficheiro, tool, etc.). */
export type ChatMessagePart = UIMessagePart<CustomUIDataTypes, ChatTools>;

export interface ChatMessage
  extends UIMessage<MessageMetadata, CustomUIDataTypes, ChatTools> {
  parts: ChatMessagePart[];
}

/** Rótulo opcional para documentos (PI/Contestação) no Revisor de Defesas */
export type DocumentTypeLabel = "pi" | "contestacao";

export interface Attachment {
  name: string;
  url: string;
  contentType: string;
  /** Texto extraído de PDF ou DOCX; presente quando o backend devolve extractedText */
  extractedText?: string;
  /** Tipo de documento para o Revisor: Petição Inicial ou Contestação */
  documentType?: DocumentTypeLabel;
  /** true quando o backend não conseguiu extrair texto do PDF/DOCX; utilizador deve colar o texto */
  extractionFailed?: boolean;
}
