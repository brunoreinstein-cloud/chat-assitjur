/**
 * RAG especializado para Fase de Execução — Sprint 3.
 * Prompt de extração detalhado para blocos de execução: cálculos comparativos,
 * embargos, agravo de petição, penhoras, alvarás e situação atual.
 */

// ---------------------------------------------------------------------------
// Prompt especializado de Execução
// ---------------------------------------------------------------------------

/**
 * Retorna o prompt de extração especializado para blocos de execução.
 * @param baseRules Regras base compartilhadas (JSON format, fl. references, anti-hallucination)
 */
export function getExecucaoExtractionPrompt(baseRules: string): string {
  return `${baseRules}

CAMPOS A EXTRAIR DESTA SECÇÃO (Fase de Execução):

=== CÁLCULOS COMPARATIVOS ===
- calculos_reclamante_rda: Valor bruto + líquido + data de apresentação + índice de correção monetária + juros + contador/advogado responsável (fl. XX)
- calculos_reclamado_rte: Valor bruto + líquido + data de apresentação + índice de correção monetária + juros + contador/advogado responsável (fl. XX)
- laudo_perito_contabil: Valor bruto + líquido + data + metodologia adotada + nome do perito + observações relevantes (fl. XX)
- tabela_comparativa: Montar tabela comparativa OBRIGATÓRIA quando houver mais de 1 conta:
  "| ORIGEM | DATA | VALOR BRUTO | VALOR LÍQUIDO | ÍNDICE CORREÇÃO | JUROS | OBSERVAÇÃO |"
  Uma linha para cada conta (RDA, RTE, Perito).
- diferenca_rda_rte: Diferença percentual entre os cálculos das partes. Ex: "RDA R$ 150.000 vs RTE R$ 80.000 — diferença de 87,5%"
- verbas_controversas: Lista de verbas com divergência entre as contas (ex: "HE — RDA inclui reflexos, RTE não")

=== HOMOLOGAÇÃO ===
- homologacao_calculos: Decisão de homologação: qual cálculo foi adotado (RDA/RTE/Perito/misto) + data + juiz (fl. XX)
- sentenca_liquidacao: Sentença de liquidação, se houver — dispositivo completo + data (fl. XX)
- valores_homologados: Tabela de composição do débito homologado:
  "| VERBA | VALOR | OBSERVAÇÃO |"

=== EMBARGOS À EXECUÇÃO ===
- embargos_reclamada: Matérias arguidas pela reclamada nos embargos (lista numerada) (fl. XX)
- embargos_reclamante: Matérias arguidas pelo reclamante, se houver (fl. XX)
- sentenca_embargos: Resultado da sentença de embargos:
  "Acolhidos: [lista de matérias] | Rejeitados: [lista] | Fundamentação resumida (fl. XX)"
- isl: Impugnação à Sentença de Liquidação (ISL), se houver — matérias + resultado (fl. XX)

=== AGRAVO DE PETIÇÃO (AP) ===
- agravo_peticao_rte: Matérias do AP da reclamada (lista numerada) (fl. XX)
- agravo_peticao_rda: Matérias do AP do reclamante, se houver (fl. XX)
- acordao_ap: Resultado do acórdão do AP:
  "Turma/Câmara: [composição] | Relator: [nome]
   Matérias providas: [lista] | Matérias desprovidas: [lista]
   Data julgamento: [DD/MM/AAAA] | Data publicação DEJT: [DD/MM/AAAA] (fl. XX)"

=== DEPÓSITOS, GARANTIAS E PENHORAS ===
- depositos_recursais: Para CADA depósito, usar formato tabela:
  "| TIPO (RO/RR/Judicial/Garantia) | VALOR | DATA | BANCO/CONTA | STATUS (Pendente/Liberado/Convertido) | (fl. XX) |"
- apolices_seguro: Para CADA apólice:
  "| SEGURADORA | Nº APÓLICE | VALOR | VIGÊNCIA (início–fim) | STATUS (Vigente/Vencida/Cancelada) | (fl. XX) |"
  ⚠️ ALERTA: Apólice vencida sem renovação = marcar como "⚠️ ALERTA CRÍTICO: APÓLICE VENCIDA"
- penhoras_bloqueios: Para CADA penhora/bloqueio:
  "| TIPO (BACENJUD/RENAJUD/CNIB/Penhora de imóvel/Outro) | VALOR | DATA | STATUS (Efetivado/Liberado/Parcial/Cancelado) | (fl. XX) |"
- garantia_suficiente: Análise: a garantia total é suficiente para efeito suspensivo? SIM/NÃO + fundamentação + cálculo (total garantia vs total débito)

=== VALORES SOERGUIDOS (ALVARÁS) ===
- alvaras: Para CADA alvará expedido:
  "| Nº ALVARÁ | VALOR | DATA EXPEDIÇÃO | BENEFICIÁRIO | STATUS (Expedido/Pago/Cancelado) | (fl. XX) |"
- total_soerguido: Soma de todos os valores já levantados/pagos. Ex: "R$ 45.000,00 (alvarás fls. 890, 920, 945)"

=== OBRIGAÇÕES DE FAZER ===
- obrigacoes_fazer: Lista de obrigações de fazer determinadas:
  "- [obrigação]: [descrição] | Prazo: [dias/data] | Status: [Cumprida/Pendente/Multa aplicada] | (fl. XX)"
  Exemplos: retificação CTPS, entrega de guias CD/SD, fornecimento PPP, anotação em CTPS digital

=== SITUAÇÃO ATUAL DA EXECUÇÃO ===
- situacao_execucao: Classificar o momento processual atual na régua:
  Execução → [Liquidação | Citação | Penhora | Embargos | AP | Pagamento | Extinção]
  Indicar substatus específico.
- saldo_devedor_estimado: Se calculável: total homologado − total soerguido − depósitos convertidos
  Ex: "R$ 150.000 (homologado) − R$ 45.000 (soerguido) = R$ 105.000 saldo estimado"

REGRAS ESPECIAIS PARA EXECUÇÃO:
1. Cálculos comparativos: SEMPRE montar tabela RDA vs RTE vs Perito quando houver mais de uma conta. Mesmo que uma parte não tenha apresentado cálculos, registrar "Não apresentou cálculos".
2. Para depósitos/penhoras: indicar status ATUAL (Pendente/Liberado/Convertido/Cancelado).
3. Se houver múltiplas rodadas de cálculos (ex: antes e depois de embargos), documentar CADA rodada cronologicamente com datas.
4. Apólice de seguro garantia vencida sem renovação = marcar "⚠️ ALERTA CRÍTICO" no campo e na analysis.
5. Se o bloco contiver apenas cálculos de liquidação (sem embargos/AP), preencher só os campos de cálculos e homologação.`;
}
