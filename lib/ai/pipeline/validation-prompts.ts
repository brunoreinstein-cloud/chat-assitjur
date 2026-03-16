/**
 * Prompts de validação cruzada dinâmicos por módulo.
 * Cada módulo define seus campos obrigatórios adicionais para o score de completude.
 */

// ---------------------------------------------------------------------------
// Campos obrigatórios por módulo
// ---------------------------------------------------------------------------

const BASE_FIELDS = [
  "numero_processo",
  "vara",
  "reclamante",
  "reclamada",
  "advogado_reclamante",
  "data_admissao",
  "data_demissao",
  "funcao_cargo",
  "ultimo_salario",
  "pedidos",
  "valor_causa",
  "tipo_sentenca",
  "pedidos_deferidos",
  "valor_condenacao",
  "honorarios",
  "data_sentenca",
  "resultado_recurso",
  "valor_liquido",
  "data_transito",
];

const AUDIENCIA_FIELDS = [
  "audiencia_data",
  "audiencia_tipo",
  "depoimento_reclamante",
  "depoimento_preposto",
  "testemunhas",
];

const EXECUCAO_FIELDS = [
  "calculos_reclamante_rda",
  "calculos_reclamado_rte",
  "homologacao_calculos",
  "situacao_execucao",
];

/** Campos adicionais do M03 (seções 17-20). */
const M03_EXTRA_FIELDS = [
  "performance_classificacao",
  "cobertura_processual",
  "nulidades_conclusao",
  "causa_raiz_condenacao",
  "recomendacoes_preventivas",
  "proximos_passos",
  "prognostico",
  "cronologia_processual",
  "momento_processual",
  "composicao_acordao",
];

/** Campos adicionais do M07 (Auditoria). */
const M07_EXTRA_FIELDS = [
  "diagnostico_integridade",
  "score_acordo",
  "analise_estrategica",
  "sintese_executiva",
];

const MODULE_EXTRA_FIELDS: Record<string, string[]> = {
  M03: M03_EXTRA_FIELDS,
  M13: M03_EXTRA_FIELDS,
  M07: M07_EXTRA_FIELDS,
};

// ---------------------------------------------------------------------------
// Gerador de prompt
// ---------------------------------------------------------------------------

/** Retorna o prompt de validação cruzada dinâmico para o módulo. */
export function getValidationPrompt(moduleId: string): string {
  const extraFields = MODULE_EXTRA_FIELDS[moduleId] ?? [];
  const extraFieldsList = extraFields.join(", ");
  const extraCount = extraFields.length;

  const extraSection =
    extraCount > 0
      ? `\nCampos adicionais do módulo ${moduleId} (${extraCount}) — contar SEMPRE para este módulo:
${extraFieldsList}
`
      : "";

  const maxTotal =
    BASE_FIELDS.length +
    AUDIENCIA_FIELDS.length +
    EXECUCAO_FIELDS.length +
    extraCount;

  return `Você é um auditor jurídico. Analise o relatório abaixo e execute 5 validações:

## T001 — VALIDAÇÃO TEMPORAL
Verifique se as datas extraídas estão em ordem cronológica:
admissão < demissão < ajuizamento < sentença < acórdão < trânsito em julgado
Reporte CADA inversão temporal encontrada.

## F001 — VALIDAÇÃO FINANCEIRA
Verifique:
- Valores em formato R$ válido (R$ #.###,##)
- |Total - (Parcelas somadas)| < 0.5% do Total (quando aplicável)
- Honorários ≤ 15% do valor total
- Valor da causa > 0
Reporte CADA inconsistência financeira.

## C001 — VALIDAÇÃO DE CLASSIFICAÇÃO
Verifique se as classificações são válidas:
- tipo_sentença ∈ {procedente, improcedente, parcialmente procedente, extinto, acordo, homologação}
- rito ∈ {ordinário, sumaríssimo, sumário} (quando informado)
- fase ∈ {conhecimento, recursal, execução, encerrado} (quando informado)
Reporte classificações inválidas ou ausentes obrigatórias.

## A001 — VALIDAÇÃO DE AUDIÊNCIA
Verifique consistência dos dados de audiência:
- Se há data de audiência, deve haver registro de presenças das partes
- Se houve audiência de instrução, deve haver ao menos 1 depoimento (reclamante OU preposto)
- Se há testemunha listada, deve ter pelo menos 1 ponto-chave registrado
- Se há confissão ficta, deve indicar de qual parte e motivo
Reporte CADA inconsistência de audiência encontrada.

## E001 — VALIDAÇÃO DE EXECUÇÃO
Verifique consistência dos dados de execução:
- Se há cálculos RDA, deve haver cálculos RTE (e vice-versa, quando em fase de execução)
- Valores de depósitos/garantias devem estar em formato R$ válido
- Se há embargos à execução, deve haver sentença de embargos (ou indicar "pendente de julgamento")
- Datas de cálculos em ordem cronológica
- Se há apólice de seguro garantia, verificar se vigência não está vencida
Reporte CADA inconsistência de execução encontrada.

## SCORE DE COMPLETUDE
Conte quantos dos seguintes campos obrigatórios estão preenchidos (com valor real, não "Não localizado"):

Campos base (${BASE_FIELDS.length}):
${BASE_FIELDS.join(", ")}

Campos audiência (${AUDIENCIA_FIELDS.length}) — contar apenas se existir seção de audiência no relatório:
${AUDIENCIA_FIELDS.join(", ")}

Campos execução (${EXECUCAO_FIELDS.length}) — contar apenas se existir seção de execução no relatório:
${EXECUCAO_FIELDS.join(", ")}
${extraSection}
IMPORTANTE: total_count é dinâmico — ${BASE_FIELDS.length} base + ${AUDIENCIA_FIELDS.length} se há audiência + ${EXECUCAO_FIELDS.length} se há execução${extraCount > 0 ? ` + ${extraCount} campos do módulo ${moduleId}` : ""}.
Máximo possível: ${maxTotal}.
Se o relatório não contém seção de audiência, não conte os campos de audiência.
Se o relatório não contém seção de execução, não conte os campos de execução.

Responda em JSON:
{
  "temporal_errors": ["descrição do erro 1", ...],
  "financial_errors": ["descrição do erro 1", ...],
  "classification_errors": ["descrição do erro 1", ...],
  "audiencia_errors": ["descrição do erro 1", ...],
  "execucao_errors": ["descrição do erro 1", ...],
  "filled_count": <número>,
  "total_count": <${BASE_FIELDS.length} a ${maxTotal}, conforme seções presentes>,
  "completude_score": <0-100>
}`;
}
