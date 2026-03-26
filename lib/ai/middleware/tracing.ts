/**
 * Tracing estruturado para requests LLM — Sprint 6 §14.6.1
 *
 * Cria spans OpenTelemetry com atributos semânticos para cada request:
 * - Span root: llm.request (userId, agentId, chatId, model)
 * - Span filho: llm.step (stepNumber, toolNames, tokens)
 * - Span filho: llm.tool (toolName, duration, success)
 *
 * Integra com @vercel/otel (já registado em instrumentation.ts).
 * Em produção, spans são exportados para Vercel Observability.
 * Em dev, spans são visíveis no console via logging.ts.
 */

import type { Span } from "@opentelemetry/api";
import { getTracer, withSpan } from "@/lib/telemetry";

// ─── Tipos ───────────────────────────────────────────────────────────

export interface LlmRequestSpanAttributes {
  userId: string;
  agentId: string;
  chatId: string;
  modelId: string;
  processoId?: string;
  /** Se é modelo de reasoning (extended thinking) */
  isReasoning?: boolean;
}

export interface LlmStepSpanAttributes {
  stepNumber: number;
  finishReason: string;
  toolNames: string[];
  inputTokens: number;
  outputTokens: number;
  modelId: string;
}

export interface LlmToolSpanAttributes {
  toolName: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface LlmRequestSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalSteps: number;
  totalToolCalls: number;
  durationMs: number;
  finishReason: string;
  toolsUsed: string[];
}

// ─── Span helpers ────────────────────────────────────────────────────

/**
 * Cria o span root para um request LLM.
 * Retorna o span para que o caller possa adicionar atributos filhos.
 */
export function startLlmRequestSpan(attrs: LlmRequestSpanAttributes): Span {
  const tracer = getTracer();
  const span = tracer.startSpan("llm.request", {
    attributes: {
      "llm.user_id": attrs.userId,
      "llm.agent_id": attrs.agentId,
      "llm.chat_id": attrs.chatId,
      "llm.model_id": attrs.modelId,
      ...(attrs.processoId ? { "llm.processo_id": attrs.processoId } : {}),
      ...(attrs.isReasoning !== undefined
        ? { "llm.is_reasoning": attrs.isReasoning }
        : {}),
    },
  });
  return span;
}

/**
 * Regista atributos de um step no span do request.
 * Chamado em onStepFinish.
 */
export function recordLlmStep(
  parentSpan: Span,
  attrs: LlmStepSpanAttributes
): void {
  const tracer = getTracer();
  const stepSpan = tracer.startSpan(
    `llm.step.${attrs.stepNumber}`,
    {
      attributes: {
        "llm.step.number": attrs.stepNumber,
        "llm.step.finish_reason": attrs.finishReason,
        "llm.step.tool_names": attrs.toolNames.join(","),
        "llm.step.input_tokens": attrs.inputTokens,
        "llm.step.output_tokens": attrs.outputTokens,
        "llm.step.model_id": attrs.modelId,
      },
    },
    undefined
  );
  stepSpan.end();

  // Acumular totais no span pai
  parentSpan.setAttribute(
    `llm.steps.${attrs.stepNumber}.tools`,
    attrs.toolNames.join(",")
  );
}

/**
 * Regista o resultado de uma tool call.
 */
export function recordToolCall(attrs: LlmToolSpanAttributes): void {
  const tracer = getTracer();
  const toolSpan = tracer.startSpan(`llm.tool.${attrs.toolName}`, {
    attributes: {
      "llm.tool.name": attrs.toolName,
      "llm.tool.duration_ms": attrs.durationMs,
      "llm.tool.success": attrs.success,
      ...(attrs.error ? { "llm.tool.error": attrs.error } : {}),
    },
  });
  toolSpan.end();
}

/**
 * Finaliza o span root com resumo do request.
 */
export function finishLlmRequestSpan(
  span: Span,
  summary: LlmRequestSummary
): void {
  span.setAttributes({
    "llm.total_input_tokens": summary.totalInputTokens,
    "llm.total_output_tokens": summary.totalOutputTokens,
    "llm.total_tokens": summary.totalInputTokens + summary.totalOutputTokens,
    "llm.total_steps": summary.totalSteps,
    "llm.total_tool_calls": summary.totalToolCalls,
    "llm.duration_ms": summary.durationMs,
    "llm.finish_reason": summary.finishReason,
    "llm.tools_used": summary.toolsUsed.join(","),
  });
  span.end();
}

// ─── High-level wrapper ──────────────────────────────────────────────

/**
 * Wrapper que executa uma função dentro de um span LLM request.
 * Uso simplificado para operações que não precisam de step tracking granular.
 */
export function withLlmRequestSpan<T>(
  attrs: LlmRequestSpanAttributes,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan("llm.request", fn, {
    "llm.user_id": attrs.userId,
    "llm.agent_id": attrs.agentId,
    "llm.chat_id": attrs.chatId,
    "llm.model_id": attrs.modelId,
  });
}
