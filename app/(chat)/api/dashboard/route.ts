/**
 * POST /api/dashboard
 * Natural Language Postgres — Cookbook pattern.
 *
 * Recebe uma query em linguagem natural (PT-BR) e devolve dados de uso
 * do utilizador filtrados pelos parâmetros extraídos pelo LLM via generateObject.
 *
 * O modelo nunca gera SQL directamente: extrai parâmetros tipados (schema Zod),
 * que depois alimentam uma query Drizzle ORM fortemente tipada.
 * Elimina risco de SQL-injection e mantém isolamento por userId.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getTitleModel } from "@/lib/ai/providers";
import { withLlmCache } from "@/lib/cache/llm-response-cache";
import { getRecentUsage } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

/** Schema dos filtros extraídos pelo LLM. */
const DashboardFilterSchema = z.object({
  /** Data de início (ISO YYYY-MM-DD) ou null se não mencionada. */
  dateFrom: z
    .string()
    .nullable()
    .describe("Data de início do período (formato YYYY-MM-DD) ou null"),
  /** Data de fim (ISO YYYY-MM-DD) ou null se não mencionada. */
  dateTo: z
    .string()
    .nullable()
    .describe("Data de fim do período (formato YYYY-MM-DD) ou null"),
  /**
   * ID do modelo LLM a filtrar (ex: "anthropic/claude-sonnet-4-5") ou null.
   * Mapear referências como "claude", "gpt", "gemini" para o prefixo correcto.
   */
  model: z
    .string()
    .nullable()
    .describe(
      "ID do modelo LLM a filtrar (ex: anthropic/claude-sonnet-4-5) ou null. " +
        "Mapear 'claude'→'anthropic/', 'gpt'→'openai/', 'gemini'→'google/' como prefixo parcial."
    ),
  /** ID do agente a filtrar (revisor-defesas, redator-contestacao, assistente-geral, etc.) ou null. */
  agentId: z
    .string()
    .nullable()
    .describe(
      "ID do agente a filtrar ou null. " +
        "Exemplos: revisor-defesas, redator-contestacao, assistente-geral, assistjur-master."
    ),
  /** Filtrar por créditos consumidos mínimos por pedido ou null. */
  minCredits: z
    .number()
    .int()
    .nullable()
    .describe("Mínimo de créditos consumidos por pedido ou null"),
  /** Número máximo de registos a devolver (1–200). Default: 50. */
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .nullable()
    .describe("Número máximo de registos a devolver (1–200). Default: 50."),
});

export type DashboardFilter = z.infer<typeof DashboardFilterSchema>;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let body: { query?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }

  const rawQuery = body.query?.trim();
  if (!rawQuery || rawQuery.length < 3) {
    return Response.json(
      { error: "Parâmetro 'query' obrigatório (mínimo 3 caracteres)" },
      { status: 400 }
    );
  }
  if (rawQuery.length > 512) {
    return Response.json(
      { error: "Query demasiado longa (máximo 512 caracteres)" },
      { status: 400 }
    );
  }

  const today = new Date().toISOString().split("T")[0];

  // 1. Extrai filtros tipados via LLM (generateObject → DashboardFilterSchema)
  // Cached: mesma query → mesmos filtros (TTL 10 min — queries repetidas no mesmo dia)
  const { object: filters } = await generateObject({
    model: withLlmCache(getTitleModel(), "dashboard-filter", 600),
    schema: DashboardFilterSchema,
    prompt:
      `Hoje é ${today}. Extrai filtros para o dashboard de uso da IA AssistJur a partir desta query em português:\n\n"${rawQuery}"\n\n` +
      "Retorna null para campos não mencionados na query. " +
      "Para datas relativas (ontem, semana passada, este mês) calcula as datas absolutas. " +
      "Para modelos parciais (claude, gpt, gemini) usa o prefixo do provider como valor parcial.",
  });

  // 2. Executa query tipada no Drizzle ORM com os filtros extraídos
  const limit = filters.limit ?? 50;
  const usageRows = await getRecentUsage({
    userId: session.user.id,
    limit,
    dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
    dateTo: filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`) : undefined,
    modelPrefix: filters.model ?? undefined,
    minCredits: filters.minCredits ?? undefined,
  });

  return Response.json({
    filters,
    query: rawQuery,
    count: usageRows?.length ?? 0,
    usage: usageRows ?? [],
  });
}
