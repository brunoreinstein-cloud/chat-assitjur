/**
 * Pipeline multi-chamadas para processar PDFs grandes (>500 pgs) de processos trabalhistas.
 * Divide o texto em blocos temáticos e faz chamadas Claude API sequenciais,
 * seguidas de uma chamada de síntese para gerar o relatório unificado.
 */

import {
  processBlockWithRetry,
  splitBlockIntoSubBlocks,
} from "./block-processor";
import { createSemaphore } from "./concurrency";
import {
  BLOCK_CALL_TIMEOUT_MS,
  BLOCK_EXTRACTION_CONCURRENCY,
  CRITICAL_BLOCK_LABELS,
  MAX_BLOCK_CHARS,
  VALIDATION_CALL_TIMEOUT_MS,
} from "./constants";
import { runCrossValidation, validatePageReferences } from "./cross-validation";
import { humanizeBlockLabel } from "./extraction-prompts";
import {
  buildCompactValidationContext,
  buildFallbackReport,
} from "./report-builders";
import {
  mergeSectionsIntoBlocks,
  splitIntoSections,
} from "./split-processo-sections";
import { getModuleSynthesisConfig } from "./synthesis-prompts";
import { synthesizeResults } from "./synthesize";
import type { BlockResult, PipelineConfig, PipelineResult } from "./types";

// ---------------------------------------------------------------------------
// Re-exports para compatibilidade retroativa
// ---------------------------------------------------------------------------

export { validatePageReferences } from "./cross-validation";
export { BASE_EXTRACTION_RULES } from "./extraction-prompts";
export * from "./types";

// ---------------------------------------------------------------------------
// Pipeline principal
// ---------------------------------------------------------------------------

export async function runMultiCallPipeline(
  config: PipelineConfig
): Promise<PipelineResult> {
  const {
    fullText,
    pageCount,
    extractionModelId,
    synthesisModelId,
    validationModelId,
    moduleId,
    onProgress,
    abortSignal,
  } = config;

  // Estimativa de tempo baseada no nº de páginas (referência para o advogado)
  const estimatedMinutes =
    pageCount <= 100 ? "1–2" : pageCount <= 300 ? "2–3" : "3–5";
  onProgress?.(
    `📋 Processo de **${pageCount} páginas** recebido. Estimativa: **${estimatedMinutes} minutos**. Pode continuar navegando — avisaremos quando estiver pronto.`
  );

  // 1. Dividir em secções temáticas
  const sections = splitIntoSections(fullText);

  // 2. Agrupar em blocos (target 5-7)
  const blocks = mergeSectionsIntoBlocks(sections, 6);
  const blockNames = blocks.map((b) => humanizeBlockLabel(b.label)).join(", ");
  onProgress?.(`📖 Estrutura identificada. Seções a analisar: ${blockNames}.`);

  // 3. Chamadas 1–N: Extração por bloco (Sonnet — rápido/barato)
  //    Blocos > MAX_BLOCK_CHARS são divididos em sub-blocos (sub-loop sequencial).
  //    Blocos críticos (Sentença, Acórdão, etc.) têm retry em caso de falha.
  //
  //    PARALELISMO: os N blocos de topo correm em simultâneo com concorrência
  //    máxima BLOCK_EXTRACTION_CONCURRENCY (3). Cada bloco mantém o sub-loop
  //    sequencial para garantir a fusão correcta de campos entre sub-blocos.
  //    Resultados são recolhidos por índice para preservar a ordem original.
  let totalTokens = 0;

  const sem = createSemaphore(BLOCK_EXTRACTION_CONCURRENCY);
  const blockResultsOrdered = await Promise.all(
    blocks.map((block, _i) =>
      sem(async () => {
        // Sub-blocos: dividir se excede MAX_BLOCK_CHARS
        const subBlocks =
          block.text.length > MAX_BLOCK_CHARS
            ? splitBlockIntoSubBlocks(block, MAX_BLOCK_CHARS)
            : [block];

        // Sub-blocos de documentos muito extensos — mensagem omitida ao utilizador
        // (detalhe interno irrelevante para o advogado)

        const mergedFields: Record<string, string> = {};
        const mergedAnalysisParts: string[] = [];
        let mergedTokens = 0;
        let anySuccess = false;

        for (let j = 0; j < subBlocks.length; j++) {
          const sub = subBlocks[j];
          const subLabel =
            subBlocks.length > 1
              ? `${block.label} (sub-bloco ${j + 1}/${subBlocks.length})`
              : block.label;

          onProgress?.(
            `📄 Lendo ${humanizeBlockLabel(subLabel)} (páginas ${sub.pageRange[0]}–${sub.pageRange[1]})...`
          );

          try {
            const result = await processBlockWithRetry(
              sub,
              extractionModelId,
              BLOCK_CALL_TIMEOUT_MS,
              CRITICAL_BLOCK_LABELS.test(sub.label) ? 1 : 0,
              onProgress,
              abortSignal
            );
            // Merge fields: valores posteriores sobrescrevem, salvo divergência
            for (const [key, value] of Object.entries(result.extractedFields)) {
              if (mergedFields[key] && mergedFields[key] !== value) {
                mergedFields[key] =
                  `DIVERGÊNCIA: ${mergedFields[key]} | ${value}`;
              } else {
                mergedFields[key] = value;
              }
            }
            mergedAnalysisParts.push(result.rawAnalysis);
            mergedTokens += result.tokensUsed;
            anySuccess = true;
            onProgress?.(
              `✓ ${humanizeBlockLabel(subLabel)} analisado — ${Object.keys(result.extractedFields).length} informações extraídas.`
            );
          } catch {
            // Falha interna — não expor detalhes técnicos ao advogado
            mergedAnalysisParts.push(
              `⚠️ Seção com leitura incompleta: ${subLabel}`
            );
            onProgress?.(
              `⚠️ ${humanizeBlockLabel(subLabel)}: leitura parcial — continuando com as demais seções.`
            );
          }
        }

        if (!anySuccess) {
          onProgress?.(
            `⚠️ ${humanizeBlockLabel(block.label)}: não foi possível ler esta seção — o restante do processo será analisado normalmente.`
          );
        }

        return {
          blockLabel: block.label,
          pageRange: block.pageRange,
          extractedFields: mergedFields,
          rawAnalysis: mergedAnalysisParts.join("\n\n"),
          tokensUsed: mergedTokens,
        } satisfies BlockResult;
      })
    )
  );

  const blockResults: BlockResult[] = blockResultsOrdered;

  // ─────────────────────────────────────────────────────────────────────────
  // PADRÃO C — Validar ANTES de sintetizar
  //
  //  4. [Sonnet Validator] Pré-validação cruzada T001/F001/C001/A001/E001
  //     Usa o contexto compacto dos blocos (campos extraídos), não o relatório
  //     final (que ainda não existe). O Opus Redactor receberá estes alertas.
  //
  //  5. [Opus Redactor]   Síntese/redação com contexto validado
  //     O Opus conhece os problemas antes de escrever — pode resolver conflitos
  //     inline e produzir um relatório mais preciso.
  //
  //  6. Validação de referências de página (local, sem LLM) — pós-síntese
  // ─────────────────────────────────────────────────────────────────────────

  // 4. Pré-validação cruzada (Sonnet Validator) — ANTES do Opus
  onProgress?.("🔎 Verificando consistência dos dados extraídos...");
  const compactContext = buildCompactValidationContext(blockResults);
  const preValidation = await runCrossValidation(
    compactContext,
    validationModelId,
    VALIDATION_CALL_TIMEOUT_MS,
    blocks.map((b) => ({ label: b.label, primaryPhase: b.primaryPhase })),
    moduleId,
    abortSignal
  );
  totalTokens += preValidation.tokensUsed;

  // Construir o resumo de alertas a passar ao Opus (só quando há erros)
  const validationAlertsForOpus =
    preValidation.errors.length > 0
      ? preValidation.errors.join("\n")
      : undefined;

  if (preValidation.errors.length > 0) {
    onProgress?.(
      `⚠️ ${preValidation.errors.length} inconsistência(s) detectada(s) nos dados — serão sinalizadas no relatório.`
    );
  } else {
    onProgress?.("✓ Dados verificados e consistentes.");
  }

  // 5. Compilação/síntese (Opus Redactor) — recebe alertas do Validator
  const synthesisConfig = getModuleSynthesisConfig(moduleId);
  onProgress?.(
    `✍️ Redigindo o relatório completo (${synthesisConfig.sections.length} seções). Esta é a etapa mais longa — mais 1–2 minutos...`
  );
  // Síntese com fallback garantido: se o Opus falhar (timeout, erro de API),
  // o advogado recebe um relatório parcial estruturado em vez de erro em branco.
  let synthesizedReport: string;
  let synthesisTokens = 0;

  try {
    const synthesized = await synthesizeResults(
      blockResults,
      moduleId,
      synthesisModelId,
      synthesisConfig.synthesisTimeoutMs,
      synthesisConfig.maxOutputTokens,
      validationAlertsForOpus,
      abortSignal
    );
    synthesizedReport = synthesized.report;
    synthesisTokens = synthesized.tokensUsed;
  } catch {
    // Fallback: síntese falhou → entregar campos extraídos formatados.
    // O advogado recebe dados reais, sinalizados como relatório parcial.
    onProgress?.(
      "⚠️ A redação do relatório completo encontrou uma instabilidade. Entregando relatório parcial com os dados extraídos..."
    );
    synthesizedReport = buildFallbackReport(blockResults, moduleId);
  }

  totalTokens += synthesisTokens;

  // 6. Validação de referências de página (local, sem LLM) — pós-síntese
  const pageRefErrors = validatePageReferences(synthesizedReport);
  const allErrors = [...pageRefErrors, ...preValidation.errors];

  onProgress?.(
    `✅ Análise concluída com **${preValidation.score.completude}% de completude**. Gerando documento...`
  );

  return {
    blocks: blockResults,
    synthesizedReport,
    validationErrors: allErrors,
    validationScore: preValidation.score,
    totalTokens,
  };
}
