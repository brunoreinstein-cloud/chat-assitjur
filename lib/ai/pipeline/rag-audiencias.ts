/**
 * RAG especializado para Audiências — Sprint 3.
 * Prompt de extração detalhado para blocos de "Ata de Audiência" / instrução processual.
 * Extrai depoimentos item a item, presenças, propostas de acordo e decisões interlocutórias.
 */

// ---------------------------------------------------------------------------
// Prompt especializado de Audiências
// ---------------------------------------------------------------------------

/**
 * Retorna o prompt de extração especializado para blocos de audiência.
 * @param baseRules Regras base compartilhadas (JSON format, fl. references, anti-hallucination)
 */
export function getAudienciasExtractionPrompt(baseRules: string): string {
  return `${baseRules}

CAMPOS A EXTRAIR DESTA SECÇÃO (Ata de Audiência / Instrução Processual):

=== DADOS DA AUDIÊNCIA ===
- audiencia_data: Data da audiência (DD/MM/AAAA)
- audiencia_tipo: Tipo (UNA / Instrução / Julgamento / Conciliação / Inicial)
- audiencia_modalidade: Presencial / Telepresencial / Híbrida
- audiencia_id_pje: ID do ato no PJe (se disponível)

=== PRESENÇA DAS PARTES ===
- reclamante_presente: SIM/NÃO + nome completo
- reclamada_presente: SIM/NÃO + nome da empresa
- preposto_nome: Nome completo do preposto
- preposto_qualificacao: Cargo/função do preposto na empresa + tempo de empresa
- advogado_rte_audiencia: Nome + OAB do advogado da reclamada presente na audiência
- advogado_rda_audiencia: Nome + OAB do advogado do reclamante presente na audiência
- confissao_ficta: SIM/NÃO — se houve confissão ficta, indicar de qual parte e motivo. Se NÃO houve, registrar explicitamente "Não houve confissão ficta."

=== DEPOIMENTO DO RECLAMANTE ===
- depoimento_reclamante: Transcrever ITEM POR ITEM cada declaração relevante do reclamante.
  Formato obrigatório para CADA item:
  "- [TEMA]: [declaração literal ou resumo fiel] (fl. XX) | IMPACTO: [favorável/desfavorável à reclamada] | RELEVÂNCIA: [alta/média/baixa]"

  OBRIGATÓRIO:
  • Não resumir múltiplos pontos num só item. Cada facto declarado = 1 item separado.
  • Preferir transcrição literal. Se resumir, indicar "[resumido]" no item.
  • Atenção especial a: admissões que fragilizam pedidos, contradições com a PI, datas mencionadas.

=== DEPOIMENTO DO PREPOSTO ===
- depoimento_preposto: Transcrever ITEM POR ITEM cada declaração relevante do preposto.
  Mesmo formato obrigatório acima.

  ATENÇÃO ESPECIAL:
  • Admissões/confissões prejudiciais à reclamada (marcar IMPACTO: desfavorável + RELEVÂNCIA: alta)
  • Declarações tipo "não sei / não lembro" — registrar tema e impacto
  • Contradições com a contestação ou documentos da empresa

=== TESTEMUNHAS ===
- testemunhas: Para CADA testemunha extraída, usar formato:
  "TESTEMUNHA [N] — [parte que arrolou: RDA/RTE]:
   Nome: [nome completo]
   Qualificação: [cargo/relação com as partes]
   Pontos-chave: [item1] (fl. XX); [item2] (fl. XX); [item3] (fl. XX)
   Contradita: [SIM — motivo / NÃO]
   Dispensada: [SIM — motivo / NÃO]"

=== PROPOSTAS DE ACORDO ===
- propostas_acordo: Para CADA proposta mencionada:
  "Data: [DD/MM/AAAA] | Valor proposto: R$ [valor] | Proponente: [RDA/RTE/Juiz] | Resultado: [aceita/recusada/contraproposta de R$ XX] (fl. XX)"

=== DECISÕES INTERLOCUTÓRIAS ===
- decisoes_interlocutorias: Lista de decisões proferidas em audiência:
  "- [tipo]: [descrição] (fl. XX)"
  Exemplos: indeferimento de prova testemunhal, adiamento, determinação de perícia, etc.

=== PROVAS ===
- provas_produzidas: Provas admitidas e produzidas em audiência (documentos, depoimentos, oitivas)
- provas_indeferidas: Provas requeridas e indeferidas, com fundamentação do juiz

=== PROTESTOS E REQUERIMENTOS ===
- protestos_requerimentos: Registrar TODOS os protestos, requerimentos de nulidade, impugnações e ressalvas feitos em audiência pelas partes

REGRAS ESPECIAIS PARA AUDIÊNCIAS:
1. Se houver MÚLTIPLAS audiências no bloco, criar sub-objetos no JSON:
   { "audiencia_1": { ...campos... }, "audiencia_2": { ...campos... } }
   Manter a ordem cronológica.
2. Depoimentos: preferir transcrição literal do texto. Se precisar resumir, indicar "[resumido]".
3. Confissão ficta é CRÍTICA: se não encontrada explicitamente, marcar "Não houve confissão ficta (não mencionada nos autos)".
4. Impacto de cada item de depoimento: avaliar do ponto de vista da RECLAMADA (cliente).
5. Se o bloco contiver apenas ata de conciliação (sem instrução), registrar: audiencia_tipo = "Conciliação" e preencher apenas propostas_acordo.`;
}
