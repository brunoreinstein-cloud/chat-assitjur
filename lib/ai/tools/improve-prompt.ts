import { tool } from "ai";
import { z } from "zod";
import { improvePrompt } from "@/lib/ai/improve-prompt";

export const improvePromptTool = tool({
  description:
    "Melhora um prompt ou texto de instrução com base em boas práticas de engenharia de prompts (clareza, estrutura, contexto, formato de saída, persona, guardrails). Usa quando o utilizador pedir para melhorar, refinar ou reescrever um prompt, instrução ou pedido que vai ser usado com um modelo de linguagem.",
  inputSchema: z.object({
    prompt: z
      .string()
      .describe(
        "O texto do prompt ou instrução que o utilizador quer melhorar (até 4000 caracteres)."
      ),
  }),
  execute: async ({ prompt }, { abortSignal }) => {
    try {
      const result = await improvePrompt(prompt, abortSignal);
      return {
        improvedPrompt: result.improvedPrompt,
        diagnosis: result.diagnosis,
        notes: result.notes,
      };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Não foi possível melhorar o prompt.";
      return { error: message };
    }
  },
});
