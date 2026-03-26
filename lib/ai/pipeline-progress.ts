/**
 * Pipeline Progress — emite eventos de progresso para o data stream.
 *
 * Usado pelos agentes (Revisor, Master, Redator) para comunicar ao frontend
 * em que etapa do pipeline estão. O frontend consome via data-stream-handler
 * e exibe toasts de progresso com sonner.
 *
 * Etapas típicas do pipeline:
 *   1. Lendo documento...
 *   2. Extraindo metadados (CNJ, partes, pedidos)...
 *   3. Mapeando seções (landmarks)...
 *   4. Analisando pedidos (3/12)...
 *   5. Verificando flags de auditoria...
 *   6. Gerando parecer DOCX...
 *   7. Concluído ✅
 *
 * Referência: PLANO §15.5 item 4 (toasts de progresso).
 */

/** Tipo do evento de progresso emitido no data stream. */
export interface PipelineProgressEvent {
  type: "pipeline-progress";
  data: {
    step: string;
    label: string;
    current?: number;
    total?: number;
    status: "running" | "done" | "error";
  };
}

/** Steps pré-definidos para o pipeline de análise. */
export const PIPELINE_STEPS = {
  READING_DOCUMENT: "reading_document",
  EXTRACTING_METADATA: "extracting_metadata",
  MAPPING_LANDMARKS: "mapping_landmarks",
  ANALYZING_PEDIDOS: "analyzing_pedidos",
  AUDITING_FLAGS: "auditing_flags",
  GENERATING_DOCX: "generating_docx",
  GENERATING_XLSX: "generating_xlsx",
  INTAKE_PROCESSO: "intake_processo",
  SEARCHING_JURISPRUDENCIA: "searching_jurisprudencia",
  COMPLETE: "complete",
  ERROR: "error",
} as const;

/** Labels user-friendly para cada step. */
export const PIPELINE_LABELS: Record<string, string> = {
  [PIPELINE_STEPS.READING_DOCUMENT]: "Lendo documento...",
  [PIPELINE_STEPS.EXTRACTING_METADATA]:
    "Extraindo metadados (CNJ, partes, pedidos)...",
  [PIPELINE_STEPS.MAPPING_LANDMARKS]: "Mapeando seções do processo...",
  [PIPELINE_STEPS.ANALYZING_PEDIDOS]: "Analisando pedidos...",
  [PIPELINE_STEPS.AUDITING_FLAGS]: "Verificando flags de auditoria...",
  [PIPELINE_STEPS.GENERATING_DOCX]: "Gerando parecer DOCX...",
  [PIPELINE_STEPS.GENERATING_XLSX]: "Gerando planilha XLSX...",
  [PIPELINE_STEPS.INTAKE_PROCESSO]: "Criando processo na base...",
  [PIPELINE_STEPS.SEARCHING_JURISPRUDENCIA]: "Pesquisando jurisprudência...",
  [PIPELINE_STEPS.COMPLETE]: "Concluído ✅",
  [PIPELINE_STEPS.ERROR]: "Erro no processamento",
};

/**
 * Cria um evento de progresso para o data stream.
 *
 * @example
 * ```ts
 * dataStream.write(createProgressEvent("analyzing_pedidos", { current: 3, total: 12 }));
 * ```
 */
export function createProgressEvent(
  step: string,
  options?: {
    current?: number;
    total?: number;
    status?: "running" | "done" | "error";
    label?: string;
  }
): PipelineProgressEvent {
  return {
    type: "pipeline-progress",
    data: {
      step,
      label: options?.label ?? PIPELINE_LABELS[step] ?? step,
      current: options?.current,
      total: options?.total,
      status: options?.status ?? "running",
    },
  };
}

/**
 * Cria o evento de conclusão com passo "complete".
 */
export function createProgressComplete(): PipelineProgressEvent {
  return createProgressEvent(PIPELINE_STEPS.COMPLETE, { status: "done" });
}

/**
 * Cria o evento de erro.
 */
export function createProgressError(label?: string): PipelineProgressEvent {
  return createProgressEvent(PIPELINE_STEPS.ERROR, {
    status: "error",
    label: label ?? PIPELINE_LABELS[PIPELINE_STEPS.ERROR],
  });
}
