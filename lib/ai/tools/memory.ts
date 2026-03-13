/**
 * Custom Memory Tool — padrão do Anthropic Cookbook.
 * Permite que os agentes guardem e recuperem memórias persistentes entre sessões:
 * dados de clientes, processos, preferências do advogado, contexto acumulado, etc.
 *
 * Uso: incluir `...createMemoryTools({ userId })` nas tools do streamText.
 */

import { tool } from "ai";
import { z } from "zod";
import {
  deleteUserMemory,
  listUserMemories,
  saveUserMemory,
} from "@/lib/db/queries";

/**
 * Cria o conjunto de memory tools para um utilizador específico.
 * As tools operam sempre no âmbito do userId — sem cross-user access.
 */
export function createMemoryTools({ userId }: { userId: string }) {
  /**
   * saveMemory: guarda (ou actualiza) um par chave-valor na memória persistente.
   */
  const saveMemory = tool({
    description:
      "Guarda uma informação importante sobre o cliente, processo ou preferências do advogado " +
      "para ser lembrada em futuras sessões. " +
      "Use chaves descritivas em snake_case (ex: 'cliente_nome', 'processo_numero', 'preferencia_formato_petica').",
    inputSchema: z.object({
      key: z
        .string()
        .min(1)
        .max(128)
        .describe(
          "Chave única para identificar a memória (snake_case, ex: 'cliente_nome', 'processo_1234_admissao')"
        ),
      value: z
        .string()
        .min(1)
        .describe(
          "Valor a memorizar. Texto livre ou JSON serializado para dados estruturados."
        ),
    }),
    execute: async ({ key, value }) => {
      await saveUserMemory({ userId, key, value });
      return { saved: true, key };
    },
  });

  /**
   * recallMemories: recupera todas as memórias activas do utilizador.
   */
  const recallMemories = tool({
    description:
      "Recupera todas as memórias guardadas para o utilizador actual. " +
      "Chame ao iniciar uma conversa para ter contexto de sessões anteriores " +
      "(clientes, processos, preferências já registados).",
    inputSchema: z.object({}),
    execute: async () => {
      const memories = await listUserMemories({ userId });
      if (!memories || memories.length === 0) {
        return {
          memories: [] as { key: string; value: string; updatedAt: string }[],
          count: 0,
          message: "Nenhuma memória guardada para este utilizador.",
        };
      }
      return {
        memories: memories.map((m) => ({
          key: m.key,
          value: m.value,
          updatedAt: m.updatedAt.toISOString(),
        })),
        count: memories.length,
      };
    },
  });

  /**
   * forgetMemory: apaga uma memória pela chave.
   */
  const forgetMemory = tool({
    description:
      "Apaga uma memória guardada pela chave. Use quando a informação ficou desactualizada " +
      "ou quando o utilizador pediu explicitamente para remover.",
    inputSchema: z.object({
      key: z
        .string()
        .min(1)
        .describe("Chave exacta da memória a apagar (ex: 'cliente_nome')"),
    }),
    execute: async ({ key }) => {
      await deleteUserMemory({ userId, key });
      return { deleted: true, key };
    },
  });

  return { saveMemory, recallMemories, forgetMemory } as const;
}

export type MemoryTools = ReturnType<typeof createMemoryTools>;
