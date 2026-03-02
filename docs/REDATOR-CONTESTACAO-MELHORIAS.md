# Melhorias a implementar — Agente Redator de Contestações

Sugestões priorizadas para o `lib/ai/agent-redator-contestacao.ts` e fluxo associado. Atualizar conforme implementação.

---

## 1. Instruções e prompt (agent-redator-contestacao.ts)

| # | Melhoria | Detalhe | Prioridade | Feito |
|---|----------|---------|------------|-------|
| 1.1 | **Detecção explícita de Modo 1 vs Modo 2** | Instruir o modelo a declarar no primeiro output: "MODO 1 — MODELO" ou "MODO 2 — TESES (@bancodetese)" consoante o conteúdo da Base de conhecimento (estrutura de contestação vs teses avulsas). Reduz ambiguidade. | Média | ✅ |
| 1.2 | **Resposta padrão única para GATE -1** | Quando (A) ou (B) falhem, usar um único bloco de texto (template) com checklist e "O que enviar", em vez de deixar o modelo improvisar. Alinha à mensagem que já descreveste (ex.: tabela B/C e "Próximo passo"). | Média | ✅ |
| 1.3 | **Exemplo de "CONFIRMAR" no Gate 0.5** | Incluir no Bloco 3 um exemplo literal: "O utilizador pode responder apenas: CONFIRMAR" ou "CORRIGIR: Nº processo = 0000000-00.2024.5.02.0000". Facilita o parsing no frontend se no futuro quiseres botões. | Baixa | ✅ |
| 1.4 | **Reforço anti-alucinação no Modo 2** | Uma linha explícita: "No Modo 2, cada tese na peça deve poder ser apontada num trecho da Base de conhecimento. Se não encontrar trecho, marque como lacuna (Bloco 8) e não invente." | Média | ✅ |
| 1.5 | **Prescrição: tabela obrigatória** | Na Regra 4, exigir que a análise de prescrição seja entregue em tabela (DAJ | DTC | Admissão | Limite bienal | Corte quinquenal | Conclusão) antes de redigir a preliminar. Já está no Bloco 7; reforçar no Bloco 4. | Baixa | ✅ |

---

## 2. UX e fluxo (frontend + API)

| # | Melhoria | Detalhe | Prioridade |
|---|----------|---------|------------|
| 2.1 | **Validação pré-envio (PI obrigatória)** | À imagem do Revisor (PI + Contestação), validar no frontend e/ou em `POST /api/chat`: quando o agente for Redator, exigir pelo menos um anexo ou parte de texto (ex.: documento com `documentType: "pi"`) antes de aceitar. Opcional: permitir "enviar sem PI" com aviso. | Alta |
| 2.2 | **Checklist "Antes de redigir" para Redator** | Componente semelhante ao `RevisorChecklist`, com itens: PI anexada; Modelo ou Base de conhecimento (@bancodetese) selecionada; opcional: documentos de defesa. Só informativo ou com bloqueio suave. | Média |
| 2.3 | **Botões CONFIRMAR / CORRIGIR no Gate 0.5** | Quando o modelo emitir o "MAPA DE EXTRAÇÃO PRELIMINAR — AGUARDANDO CONFIRMAÇÃO", o frontend detectar (por marcador ou padrão) e mostrar botões "CONFIRMAR" e "CORRIGIR" que preenchem a caixa de mensagem. Requer convenção no texto do agente (ex.: bloco delimitado). | Média |
| 2.4 | **Indicador de etapa (FASE A / GATE 0.5 / FASE B)** | Banner ou badge no chat: "FASE A — Extração" / "Aguardando confirmação" / "FASE B — Redação", como no Revisor. Melhora perceção de progresso. | Baixa |

---

## 3. Base de conhecimento e RAG

| # | Melhoria | Detalhe | Prioridade |
|---|----------|---------|------------|
| 3.1 | **Banco padrão (RAG)** | ✅ Feito: banco em RAG com seed `pnpm run db:seed-redator-banco`; quando o utilizador não seleciona documentos, o sistema injeta o documento "Banco de Teses Padrão" via RAG. | — |
| 3.2 | **Reranking dos chunks (Modo 2)** | Quando há muitos chunks recuperados, aplicar um passo de reranking (por relevância ao pedido ou por ordem lógica) antes de montar o contexto. Descrito em `lib/ai/knowledge-base.md` como melhoria futura. | Baixa |
| 3.3 | **Aviso quando só banco padrão** | No primeiro turno, se o contexto for apenas o banco RAG padrão (sem docs do utilizador), o agente pode dizer uma linha: "Estou a usar o Banco de Teses Padrão. Para usar teses do seu escritório, selecione documentos na Base de conhecimento." | Baixa |

---

## 4. Entrega e artefactos

| # | Melhoria | Detalhe | Prioridade | Feito |
|---|----------|---------|------------|-------|
| 4.1 | **Export DOCX nativo** | O Revisor gera os 3 DOCX via tool `createRevisorDefesaDocuments`. O Redator hoje entrega minuta em texto/artefacto no chat. Considerar tool semelhante para gerar um DOCX de contestação (com campos pendentes em destaque), para download direto. | Alta | ✅ |
| 4.2 | **Nomes de ficheiros na ENTREGA** | Se houver artefacto DOCX, indicar nas instruções o nome sugerido (ex.: `Contestacao_[numero_processo]_minuta.docx`) para consistência. | Baixa | ✅ |
| 4.3 | **Relatório de Revisão Assistida em bloco único** | Reforçar que o Bloco 9 deve ser um único bloco no chat (não intercalado com outros textos), com secções numeradas, para facilitar cópia ou export. | Baixa | ✅ |

---

## 5. Documentação e produto

| # | Melhoria | Detalhe | Prioridade |
|---|----------|---------|------------|
| 5.1 | **Doc dedicado ao Redator** | Criar `docs/PROJETO-REDATOR-CONTESTACOES.md` (ou secção em PROJETO-REVISOR-DEFESAS) com: fluxo GATE -1 → -1A → 0 → 0.5 → FASE A/B, modos Modelo vs @bancodetese, uso do banco RAG, checklist e validação. | Média |
| 5.2 | **PLANO-PROXIMOS-PASSOS** | Incluir na secção "Curto prazo" ou "Imediato" itens relativos ao Redator: validação pré-envio PI, checklist, CONFIRMAR no Gate 0.5, export DOCX. | Média |
| 5.3 | **SPEC e métricas** | Em SPEC-AI-DRIVE-JURIDICO.md, acrescentar métrica de "Conclusão do fluxo Redator" (ex.: % de conversas que chegam à minuta + Relatório de Revisão) e referir o Redator no roadmap onde fizer sentido. | Baixa |

---

## 6. Resumo de prioridades

- **Alta:** Validação pré-envio (PI) para Redator (2.1); Export DOCX da minuta (4.1).
- **Média:** Template único de saída para GATE -1 (1.2); Detecção explícita Modo 1/2 (1.1); Reforço anti-alucinação Modo 2 (1.4); Checklist "Antes de redigir" (2.2); Botões CONFIRMAR/CORRIGIR Gate 0.5 (2.3); Doc dedicado Redator (5.1); PLANO atualizado (5.2).
- **Baixa:** Restantes itens (exemplos CONFIRMAR, tabela prescrição, indicador de etapa, reranking, aviso banco padrão, nomes de ficheiros, Bloco 9 único, métricas SPEC).

---

*Documento criado a partir da análise de `lib/ai/agent-redator-contestacao.ts`, PLANO-PROXIMOS-PASSOS.md, SPEC-AI-DRIVE-JURIDICO.md e AGENTES-IA-PERSONALIZADOS.md. Atualizar conforme as melhorias forem implementadas.*
