import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/artifact";
import type { createDocument } from "./ai/tools/create-document";
import type { createRevisorDefesaDocuments } from "./ai/tools/create-revisor-defesa-documents";
import type { getWeather } from "./ai/tools/get-weather";
import type { requestSuggestions } from "./ai/tools/request-suggestions";
import type { updateDocument } from "./ai/tools/update-document";
import type { Suggestion } from "./db/schema";

export type DataPart = { type: "append-message"; message: string };

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

export type ChatTools = {
	getWeather: weatherTool;
	createDocument: createDocumentTool;
	createRevisorDefesaDocuments: createRevisorDefesaDocumentsTool;
	updateDocument: updateDocumentTool;
	requestSuggestions: requestSuggestionsTool;
};

export type CustomUIDataTypes = {
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
};

export type ChatMessage = UIMessage<
	MessageMetadata,
	CustomUIDataTypes,
	ChatTools
>;

/** Rótulo opcional para documentos (PI/Contestação) no Revisor de Defesas */
export type DocumentTypeLabel = "pi" | "contestacao";

export type Attachment = {
	name: string;
	url: string;
	contentType: string;
	/** Texto extraído de PDF ou DOCX; presente quando o backend devolve extractedText */
	extractedText?: string;
	/** Tipo de documento para o Revisor: Petição Inicial ou Contestação */
	documentType?: DocumentTypeLabel;
	/** true quando o backend não conseguiu extrair texto do PDF/DOCX; utilizador deve colar o texto */
	extractionFailed?: boolean;
};
