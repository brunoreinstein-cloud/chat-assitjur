/**
 * Tool para guardar o resultado da análise de risco por verba (Sprint 4.3).
 * Invocado pelos agentes (Master, Revisor) após classificar cada pedido trabalhista.
 * Chama upsertRiscoVerbaAction com posse verificada no servidor.
 */
import { tool } from "ai";
import { z } from "zod";
import {
  type UpsertVerbaResult,
  upsertRiscoVerbaAction,
} from "@/app/(chat)/processos/actions";

const RISCO_ENUM = z.enum(["provavel", "possivel", "remoto"]);

export const upsertRiscoVerba = tool({
  description:
    "Guarda ou actualiza a classificação de risco das verbas (pedidos) do processo trabalhista. " +
    "Use quando o agente concluir a análise de risco por verba. " +
    "Substitui todas as verbas anteriores pelas fornecidas (operação full-replace).",
  inputSchema: z.object({
    processoId: z
      .string()
      .uuid()
      .describe("UUID do processo trabalhista a actualizar."),
    verbas: z
      .array(
        z.object({
          verba: z
            .string()
            .min(1)
            .max(256)
            .describe("Nome da verba / pedido trabalhista."),
          risco: RISCO_ENUM.describe(
            "Classificação: provavel (>70%), possivel (30-70%), remoto (<30%)."
          ),
          valorMin: z
            .number()
            .int()
            .nonnegative()
            .optional()
            .describe("Valor mínimo estimado da condenação (R$, inteiro)."),
          valorMax: z
            .number()
            .int()
            .nonnegative()
            .optional()
            .describe("Valor máximo estimado da condenação (R$, inteiro)."),
        })
      )
      .min(1)
      .max(50)
      .describe("Lista de verbas com risco classificado."),
  }),
  execute: ({ processoId, verbas }): Promise<UpsertVerbaResult> =>
    upsertRiscoVerbaAction(processoId, verbas),
});
