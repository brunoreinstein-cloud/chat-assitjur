/**
 * GET /api/admin/costs — Agrega métricas de custo LLM por agente e período.
 * Fonte de dados: TaskExecution.result (TaskTelemetry) + TaskExecution.creditsUsed.
 *
 * Query params:
 *   days  — janela temporal em dias (default: 30)
 *
 * Requer header x-admin-key = ADMIN_CREDITS_SECRET.
 */
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/connection";
import { taskExecution } from "@/lib/db/schema";

const ADMIN_SECRET = process.env.ADMIN_CREDITS_SECRET;

function isAdminRequest(request: Request): boolean {
  if (!ADMIN_SECRET?.length) return false;
  return request.headers.get("x-admin-key") === ADMIN_SECRET;
}

export interface CostRow {
  taskId: string;
  execucoes: number;
  creditosUsados: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  latenciaMediaMs: number | null;
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(Number(searchParams.get("days") ?? "30"), 1), 365);

  try {
    const db = getDb();

    const rows = await db
      .select({
        taskId: taskExecution.taskId,
        execucoes: sql<number>`cast(count(*) as int)`,
        creditosUsados: sql<number>`cast(coalesce(sum(${taskExecution.creditsUsed}), 0) as int)`,
        totalTokens: sql<number>`cast(coalesce(sum(cast(${taskExecution.result}->>'totalTokens' as int)), 0) as int)`,
        inputTokens: sql<number>`cast(coalesce(sum(cast(${taskExecution.result}->>'inputTokens' as int)), 0) as int)`,
        outputTokens: sql<number>`cast(coalesce(sum(cast(${taskExecution.result}->>'outputTokens' as int)), 0) as int)`,
        latenciaMediaMs: sql<number | null>`cast(avg(cast(${taskExecution.result}->>'latencyMs' as int)) as int)`,
      })
      .from(taskExecution)
      .where(
        sql`${taskExecution.startedAt} >= now() - interval '${sql.raw(String(days))} days'`
      )
      .groupBy(taskExecution.taskId)
      .orderBy(sql`sum(${taskExecution.creditsUsed}) desc nulls last`);

    return NextResponse.json({ days, rows } satisfies { days: number; rows: CostRow[] });
  } catch (err) {
    console.error("[admin/costs] query error", err);
    return NextResponse.json({ error: "Failed to query costs" }, { status: 500 });
  }
}
