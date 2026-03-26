/**
 * Relatório de qualidade — Sprint 6 §1.3
 *
 * Agrega métricas de TaskTelemetry por processo, agente e período.
 * Fonte: TaskExecution.result (JSON) no PostgreSQL.
 *
 * Funções puras que recebem dados e retornam agregações —
 * não dependem de DB diretamente (facilita testing).
 */

// ─── Tipos ───────────────────────────────────────────────────────────

export interface TaskTelemetryRecord {
  id: string;
  processoId: string | null;
  taskId: string;
  chatId: string | null;
  status: "running" | "complete" | "error";
  creditsUsed: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  result: {
    latencyMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    stepsCount?: number;
    toolsUsed?: string[];
    finishReason?: string;
    modelId?: string;
  } | null;
}

export interface AgentMetrics {
  agentId: string;
  totalExecutions: number;
  completedExecutions: number;
  errorExecutions: number;
  /** Latência média (ms) */
  avgLatencyMs: number;
  /** Latência p95 (ms) */
  p95LatencyMs: number;
  /** Tokens médios por request */
  avgTokens: number;
  /** Total de tokens consumidos */
  totalTokens: number;
  /** Créditos totais consumidos */
  totalCredits: number;
  /** Steps médios por request */
  avgSteps: number;
  /** Tools mais usadas (top 5) */
  topTools: Array<{ tool: string; count: number }>;
  /** Distribuição de finish reasons */
  finishReasons: Record<string, number>;
  /** Modelos usados */
  models: Record<string, number>;
}

export interface QualityReport {
  /** Período do relatório */
  period: { from: Date; to: Date };
  /** Métricas por agente */
  byAgent: AgentMetrics[];
  /** Totais consolidados */
  totals: {
    executions: number;
    tokens: number;
    credits: number;
    avgLatencyMs: number;
    errorRate: number;
  };
  /** Gerado em */
  generatedAt: string;
}

// ─── Funções de agregação ────────────────────────────────────────────

/**
 * Calcula métricas para um agente a partir de registos de TaskExecution.
 */
export function computeAgentMetrics(
  agentId: string,
  records: TaskTelemetryRecord[]
): AgentMetrics {
  const completed = records.filter((r) => r.status === "complete");
  const errors = records.filter((r) => r.status === "error");

  // Extrair telemetria dos registos completos
  const telemetry = completed
    .map((r) => r.result)
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const latencies = telemetry
    .map((t) => t.latencyMs ?? 0)
    .filter((l) => l > 0)
    .sort((a, b) => a - b);

  const tokenCounts = telemetry.map((t) => t.totalTokens ?? 0);
  const stepCounts = telemetry.map((t) => t.stepsCount ?? 0);

  // Tool frequency
  const toolFreq = new Map<string, number>();
  for (const t of telemetry) {
    for (const tool of t.toolsUsed ?? []) {
      toolFreq.set(tool, (toolFreq.get(tool) ?? 0) + 1);
    }
  }
  const topTools = [...toolFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tool, count]) => ({ tool, count }));

  // Finish reason distribution
  const finishReasons: Record<string, number> = {};
  for (const t of telemetry) {
    const reason = t.finishReason ?? "unknown";
    finishReasons[reason] = (finishReasons[reason] ?? 0) + 1;
  }

  // Model distribution
  const models: Record<string, number> = {};
  for (const t of telemetry) {
    const model = t.modelId ?? "unknown";
    models[model] = (models[model] ?? 0) + 1;
  }

  // Credits
  const totalCredits = records.reduce(
    (sum, r) => sum + (r.creditsUsed ?? 0),
    0
  );

  return {
    agentId,
    totalExecutions: records.length,
    completedExecutions: completed.length,
    errorExecutions: errors.length,
    avgLatencyMs:
      latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0,
    p95LatencyMs:
      latencies.length > 0
        ? (latencies[Math.floor(latencies.length * 0.95)] ??
          latencies.at(-1) ??
          0)
        : 0,
    avgTokens:
      tokenCounts.length > 0
        ? Math.round(
            tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length
          )
        : 0,
    totalTokens: tokenCounts.reduce((a, b) => a + b, 0),
    totalCredits,
    avgSteps:
      stepCounts.length > 0
        ? Math.round(
            (stepCounts.reduce((a, b) => a + b, 0) / stepCounts.length) * 10
          ) / 10
        : 0,
    topTools,
    finishReasons,
    models,
  };
}

/**
 * Gera relatório de qualidade completo.
 */
export function buildQualityReport(
  records: TaskTelemetryRecord[],
  period: { from: Date; to: Date }
): QualityReport {
  // Agrupar por agente (taskId)
  const byAgent = new Map<string, TaskTelemetryRecord[]>();
  for (const record of records) {
    const agentId = record.taskId;
    const list = byAgent.get(agentId) ?? [];
    list.push(record);
    byAgent.set(agentId, list);
  }

  const agentMetrics = [...byAgent.entries()].map(([agentId, recs]) =>
    computeAgentMetrics(agentId, recs)
  );

  // Totais
  const totalExecutions = records.length;
  const totalTokens = agentMetrics.reduce((s, a) => s + a.totalTokens, 0);
  const totalCredits = agentMetrics.reduce((s, a) => s + a.totalCredits, 0);
  const totalErrors = agentMetrics.reduce((s, a) => s + a.errorExecutions, 0);
  const allLatencies = agentMetrics
    .filter((a) => a.avgLatencyMs > 0)
    .map((a) => a.avgLatencyMs);
  const avgLatency =
    allLatencies.length > 0
      ? Math.round(
          allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length
        )
      : 0;

  return {
    period,
    byAgent: agentMetrics,
    totals: {
      executions: totalExecutions,
      tokens: totalTokens,
      credits: totalCredits,
      avgLatencyMs: avgLatency,
      errorRate:
        totalExecutions > 0
          ? Math.round((totalErrors / totalExecutions) * 100) / 100
          : 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Formata relatório como markdown.
 */
export function formatQualityReport(report: QualityReport): string {
  const lines: string[] = [
    "## Relatório de Qualidade — AssistJur",
    "",
    `**Período:** ${report.period.from.toISOString().slice(0, 10)} a ${report.period.to.toISOString().slice(0, 10)}`,
    "",
    "### Totais",
    "| Métrica | Valor |",
    "|---------|-------|",
    `| Execuções | ${report.totals.executions} |`,
    `| Tokens totais | ${report.totals.tokens.toLocaleString("pt-BR")} |`,
    `| Créditos | ${report.totals.credits} |`,
    `| Latência média | ${report.totals.avgLatencyMs}ms |`,
    `| Taxa de erro | ${(report.totals.errorRate * 100).toFixed(1)}% |`,
    "",
  ];

  if (report.byAgent.length > 0) {
    lines.push("### Por Agente");
    lines.push("| Agente | Execuções | Score | Tokens | Latência | Erros |");
    lines.push("|--------|-----------|-------|--------|----------|-------|");
    for (const agent of report.byAgent) {
      const successRate =
        agent.totalExecutions > 0
          ? Math.round(
              (agent.completedExecutions / agent.totalExecutions) * 100
            )
          : 0;
      lines.push(
        `| ${agent.agentId} | ${agent.totalExecutions} | ${successRate}% | ${agent.avgTokens} avg | ${agent.avgLatencyMs}ms | ${agent.errorExecutions} |`
      );
    }
  }

  return lines.join("\n");
}
