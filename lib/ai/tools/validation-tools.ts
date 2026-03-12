/**
 * Tools apenas com description e inputSchema para validar mensagens carregadas da BD
 * (validateUIMessages / safeValidateUIMessages). Não executam lógica.
 * Manter em sync com as tools reais em create-document, update-document, etc.
 */
import { type Tool, tool } from "ai";
import { z } from "zod";
import { artifactKinds } from "@/lib/artifacts/server";

const noop = async () => ({});

export const validationTools = {
  getWeather: tool({
    description:
      "Get the current weather at a location. You can provide either coordinates or a city name.",
    inputSchema: z.object({
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      city: z
        .string()
        .describe("City name (e.g., 'San Francisco', 'New York', 'London')")
        .optional(),
    }),
    execute: noop,
  }),
  createDocument: tool({
    description:
      "Create a document for a writing or content creation activities. This tool will call other functions that will generate the contents of the document based on the title and kind.",
    inputSchema: z.object({
      title: z.string(),
      kind: z.enum(artifactKinds),
    }),
    execute: noop,
  }),
  updateDocument: tool({
    description: "Update a document with the given description.",
    inputSchema: z.object({
      id: z.string().describe("The ID of the document to update"),
      description: z
        .string()
        .describe("The description of changes that need to be made"),
    }),
    execute: noop,
  }),
  requestSuggestions: tool({
    description:
      "Request writing suggestions for an existing document artifact. Only use this when the user explicitly asks to improve or get suggestions for a document they have already created. Never use for general questions.",
    inputSchema: z.object({
      documentId: z
        .string()
        .describe(
          "The UUID of an existing document artifact that was previously created with createDocument"
        ),
    }),
    execute: noop,
  }),
  improvePrompt: tool({
    description:
      "Improve a prompt or instruction text using prompt engineering best practices. Use when the user asks to improve, refine or rewrite a prompt or instruction.",
    inputSchema: z.object({
      prompt: z
        .string()
        .describe(
          "The prompt or instruction text to improve (up to 4000 characters)."
        ),
    }),
    execute: noop,
  }),
  createRevisorDefesaDocuments: tool({
    description:
      "Create the 3 Revisor documents (Avaliação, Roteiro Advogado, Roteiro Preposto) in one call. Use this in FASE B after the user CONFIRMs the GATE 0.5 summary. Pass the exact titles for each document. Optionally pass contextoResumo with the case summary (e.g. the text between GATE_0.5_RESUMO delimiters) so documents are filled with correct data.",
    inputSchema: z.object({
      avaliacaoTitle: z
        .string()
        .describe("Title for Doc 1: Avaliação / Parecer Executivo"),
      roteiroAdvogadoTitle: z
        .string()
        .describe("Title for Doc 2: Roteiro Advogado"),
      roteiroPrepostoTitle: z
        .string()
        .describe("Title for Doc 3: Roteiro Preposto"),
      contextoResumo: z
        .string()
        .optional()
        .describe(
          "Optional. Case summary / extracted data (e.g. content between --- GATE_0.5_RESUMO --- and --- /GATE_0.5_RESUMO ---). Use so the 3 documents are filled with the correct case data."
        ),
    }),
    execute: noop,
  }),
  createRedatorContestacaoDocument: tool({
    description:
      "Create the contestação minuta document for download. Use this once in FASE B after producing the full minuta text. Pass the suggested title (e.g. Contestacao_[Nº processo]_minuta) and the complete minuta content.",
    inputSchema: z.object({
      title: z
        .string()
        .describe(
          "Title for the document (suggested: Contestacao_[Nº processo]_minuta)"
        ),
      minutaContent: z.string().describe("Full text of the contestação minuta"),
    }),
    execute: noop,
  }),

  // Memory Tool stubs — necessários para validar histórico de mensagens
  // que contêm chamadas a estas tools. Schemas devem manter-se em sync
  // com createMemoryTools() em lib/ai/tools/memory.ts.
  saveMemory: tool({
    description:
      "Guarda uma informação importante sobre o cliente, processo ou preferências do advogado " +
      "para ser lembrada em futuras sessões.",
    inputSchema: z.object({
      key: z.string().min(1).max(128),
      value: z.string().min(1),
    }),
    execute: noop,
  }),
  recallMemories: tool({
    description:
      "Recupera todas as memórias guardadas para o utilizador actual.",
    inputSchema: z.object({}),
    execute: noop,
  }),
  forgetMemory: tool({
    description: "Apaga uma memória guardada pela chave.",
    inputSchema: z.object({
      key: z.string().min(1),
    }),
    execute: noop,
  }),

  // Human-in-the-Loop stub — valida histórico com chamadas a requestApproval.
  // Schema em sync com lib/ai/tools/human-in-the-loop.ts.
  requestApproval: tool({
    description:
      "Solicita aprovação do advogado antes de executar uma acção importante ou irreversível.",
    inputSchema: z.object({
      action: z.enum([
        "submit_document",
        "send_communication",
        "modify_data",
        "irreversible_action",
      ]),
      title: z.string().max(80),
      description: z.string().max(1000),
      items: z.array(z.string().max(200)).max(10).optional(),
      urgency: z.enum(["low", "medium", "high"]).default("medium"),
    }),
    execute: noop,
  }),
};

/** Tipagem para safeValidateUIMessages (espera Record<string, Tool<unknown, unknown>>). */
export const validationToolsForValidate = validationTools as Record<
  string,
  Tool<unknown, unknown>
>;
