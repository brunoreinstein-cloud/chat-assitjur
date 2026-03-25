/**
 * Logging Middleware — regista token usage, latência e modelId por chamada LLM.
 *
 * Dois níveis:
 * - `logStepUsage`: log por step (tool call individual) — chamado em onStepFinish.
 * - `logRequestUsage`: log consolidado por request (totalUsage) — chamado em onFinish.
 *
 * Em produção, logs vão para stdout (structured JSON) para ingestão no
 * sistema de observabilidade (OTel, Vercel Logs, etc.).
 * Em dev, logs formatados no console para debugging rápido.
 */

const isDev = process.env.NODE_ENV === "development";

export interface StepUsageInfo {
  stepNumber: number;
  finishReason: string;
  toolNames: string[];
  inputTokens: number;
  outputTokens: number;
  modelId?: string;
}

export interface RequestUsageInfo {
  chatId: string;
  agentId?: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalSteps: number;
  durationMs: number;
}

/** Log por step — chamado em onStepFinish do agente. */
export function logStepUsage(info: StepUsageInfo): void {
  if (isDev) {
    const toolsStr = info.toolNames.length > 0 ? info.toolNames.join(",") : "-";
    console.info(
      `[llm-step] step=${info.stepNumber} finish=${info.finishReason} tools=[${toolsStr}] tokens=in:${info.inputTokens}/out:${info.outputTokens}`
    );
  }
}

/** Log consolidado por request — chamado em onFinish do agente. */
export function logRequestUsage(info: RequestUsageInfo): void {
  if (isDev) {
    console.info(
      `[llm-request] chat=${info.chatId} agent=${info.agentId ?? "-"} model=${info.modelId} tokens=in:${info.inputTokens}/out:${info.outputTokens} steps=${info.totalSteps} duration=${info.durationMs}ms`
    );
    return;
  }

  // Production: structured JSON para observabilidade
  console.log(
    JSON.stringify({
      type: "llm_request",
      chatId: info.chatId,
      agentId: info.agentId,
      modelId: info.modelId,
      inputTokens: info.inputTokens,
      outputTokens: info.outputTokens,
      totalSteps: info.totalSteps,
      durationMs: info.durationMs,
      timestamp: new Date().toISOString(),
    })
  );
}
