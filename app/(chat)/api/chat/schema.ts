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

/** Limite de caracteres do texto de uma parte do tipo "document" (PDF/DOCX). Texto acima é truncado no servidor antes da validação. ~2M ≈ 1500 páginas. */
export const MAX_DOCUMENT_PART_TEXT_LENGTH = 2_000_000;

/**
 * Limite de caracteres guardados na BD para partes "document".
 * O texto completo (até MAX_DOCUMENT_PART_TEXT_LENGTH) é enviado ao LLM para análise;
 * na BD guardamos apenas um excerto curto (para histórico/UI) — reduz INSERT de ~2M para ~100K chars.
 * ~100K ≈ 75 páginas, suficiente para exibir contexto no histórico.
 */
export const MAX_DOCUMENT_PART_TEXT_DB_LENGTH = 100_000;

/** Parte com texto extraído de PDF/DOCX (PI, Contestação, etc.). Texto vazio é aceite (ex.: ficheiro sem extração). */
const documentPartSchema = z.object({
  type: z.enum(["document"]),
  name: z.string().min(1).max(200),
  text: z.string().max(MAX_DOCUMENT_PART_TEXT_LENGTH),
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
    knowledgeDocumentIds: z.array(z.string().uuid()).max(50).optional(),
    /** Optional IDs of Arquivos (UserFile) to use as context in this chat only, without saving to the knowledge base. */
    archivoIds: z.array(z.string().uuid()).max(50).optional(),
    /** Agent id: built-in or UUID of a custom agent. When absent, defaults to assistente-geral. */
    agentId: z
      .union([
        z.enum([
          "assistente-geral",
          "revisor-defesas",
          "redator-contestacao",
          "avaliador-contestacao",
          "assistjur-master",
          "autuoria-revisor",
        ]),
        z.string().uuid(),
      ])
      .optional(),
    /** ID do processo trabalhista vinculado a este chat (opcional). */
    processoId: z.string().uuid().optional(),
  })
  .refine(
    (data) => data.message !== undefined || (data.messages?.length ?? 0) > 0,
    {
      message: "É necessário enviar 'message' ou 'messages' (array não vazio).",
      path: ["message"],
    }
  );

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
