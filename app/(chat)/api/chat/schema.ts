import { z } from "zod";

const textPartSchema = z.object({
	type: z.enum(["text"]),
	text: z.string().max(2000),
});

const filePartSchema = z.object({
	type: z.enum(["file"]),
	mediaType: z.enum(["image/jpeg", "image/png"]),
	name: z.string().min(1).max(100),
	url: z.string().url(),
});

/** Parte com texto extraído de PDF/DOCX (PI, Contestação, etc.). Texto vazio é aceite (ex.: ficheiro sem extração). */
const documentPartSchema = z.object({
	type: z.enum(["document"]),
	name: z.string().min(1).max(200),
	text: z.string().max(500_000),
	/** Rótulo para o Revisor: "pi" = Petição Inicial, "contestacao" = Contestação */
	documentType: z.enum(["pi", "contestacao"]).optional(),
});

const partSchema = z.union([
	textPartSchema,
	filePartSchema,
	documentPartSchema,
]);

const userMessageSchema = z.object({
	id: z.string().uuid(),
	role: z.enum(["user"]),
	parts: z.array(partSchema),
});

// For tool approval flows, we accept all messages (more permissive schema)
const messageSchema = z.object({
	id: z.string(),
	role: z.string(),
	parts: z.array(z.any()),
});

export const postRequestBodySchema = z
	.object({
		id: z.string().uuid(),
		// Either a single new message or all messages (for tool approvals)
		message: userMessageSchema.optional(),
		messages: z.array(messageSchema).optional(),
		selectedChatModel: z.string().min(1),
		selectedVisibilityType: z.enum(["public", "private"]),
		/** Optional agent guidance prompt: instructions that orient how the assistant should respond (persona, tone, format). */
		agentInstructions: z.string().max(4000).optional(),
		/** Optional IDs of knowledge base documents to inject as context for this request. */
		knowledgeDocumentIds: z.array(z.string().uuid()).max(20).optional(),
	})
	.refine(
		(data) => data.message !== undefined || (data.messages?.length ?? 0) > 0,
		{
			message: "É necessário enviar 'message' ou 'messages' (array não vazio).",
			path: ["message"],
		},
	);

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
