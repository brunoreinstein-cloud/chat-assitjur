/**
 * Construtores de relatórios auxiliares do pipeline multi-chamadas.
 */

import { type BlockResult } from "./types";

// ---------------------------------------------------------------------------
// Contexto compacto para pré-validação (Padrão C)
// ---------------------------------------------------------------------------

/**
 * Constrói um resumo compacto dos campos extraídos de todos os blocos.
 * Usado como input do Sonnet Validator ANTES da síntese pelo Opus,
 * permitindo detectar T001/F001/C001/A001/E001 sobre os dados brutos.
 */
export function buildCompactValidationContext(
  blockResults: BlockResult[]
): string {
  return blockResults
    .map((br) => {
      const fieldsStr = Object.entries(br.extractedFields)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n");
      // Inclui rawAnalysis (texto livre do Sonnet Extractor) para que o Validator
      // tenha contexto suficiente para detectar T001/F001 — e.g., datas fora de
      // sequência que só são visíveis na narrativa, não nos campos isolados.
      const analysis = br.rawAnalysis?.trim()
        ? `\nAnálise:\n${br.rawAnalysis.slice(0, 2000)}` // cap 2K chars por bloco
        : "";
      return `### ${br.blockLabel} (pp. ${br.pageRange[0]}–${br.pageRange[1]})\n${fieldsStr || "  (sem campos extraídos)"}${analysis}`;
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Relatório de fallback (quando a síntese Opus falha)
// ---------------------------------------------------------------------------

/**
 * Gera um relatório parcial estruturado a partir dos campos extraídos pelos blocos.
 * Usado como fallback quando a chamada de síntese do Opus falha ou excede o timeout.
 * O advogado recebe dados reais em vez de uma mensagem de erro em branco.
 */
export function buildFallbackReport(
  blockResults: BlockResult[],
  moduleId: string
): string {
  const header = `# ⚠️ RELATÓRIO PARCIAL — ANÁLISE INCOMPLETA

> **Atenção:** A redação automática completa não foi concluída devido a uma instabilidade técnica.
> As informações abaixo foram extraídas diretamente do processo e são precisas,
> mas estão apresentadas de forma simplificada, sem a formatação completa do relatório ${moduleId}.
> Recomenda-se re-executar a análise para obter o relatório completo.

---
`;

  const sections = blockResults
    .map((br) => {
      if (Object.keys(br.extractedFields).length === 0) {
        return null;
      }
      const fields = Object.entries(br.extractedFields)
        .filter(([, v]) => v && !v.includes("Não localizado"))
        .map(([k, v]) => `**${k}:** ${v}`)
        .join("\n\n");
      return fields
        ? `## ${br.blockLabel} (fl. ${br.pageRange[0]}–${br.pageRange[1]})\n\n${fields}`
        : null;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  return `${header}${sections || "Nenhum campo extraído com sucesso."}`;
}
