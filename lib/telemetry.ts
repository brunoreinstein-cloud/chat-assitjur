/**
 * Utilitários de telemetria OpenTelemetry para o pipeline RAG e LLM.
 * Complementa o experimental_telemetry do AI SDK com spans customizados.
 *
 * Registado via instrumentation.ts → @vercel/otel.
 */

import { type Span, SpanStatusCode, trace } from "@opentelemetry/api";

const TRACER_NAME = "chatbot";

/** Tracer singleton reutilizado em toda a aplicação. */
export function getTracer() {
  return trace.getTracer(TRACER_NAME);
}

/**
 * Executa uma função dentro de um span OpenTelemetry.
 * Define o status como ERROR automaticamente se a função lançar exceção.
 *
 * @example
 * const result = await withSpan("rag.retrieve", async (span) => {
 *   span.setAttribute("rag.document_count", ids.length);
 *   return await retrieveKnowledgeContext(...);
 * });
 */
export function withSpan<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(spanName, async (span) => {
    try {
      if (attributes) {
        span.setAttributes(attributes);
      }
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Constrói o objeto experimental_telemetry do AI SDK com metadados completos.
 * Inclui agentId, model, userId e chatId para filtragem em dashboards (Vercel, Langfuse, etc.).
 */
export function buildAiSdkTelemetry(opts: {
  isEnabled: boolean;
  functionId?: string;
  agentId?: string;
  model?: string;
  userId?: string;
  chatId?: string;
}) {
  return {
    isEnabled: opts.isEnabled,
    functionId: opts.functionId ?? "stream-text",
    metadata: {
      ...(opts.agentId ? { agentId: opts.agentId } : {}),
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.userId ? { userId: opts.userId } : {}),
      ...(opts.chatId ? { chatId: opts.chatId } : {}),
    },
  } as const;
}
