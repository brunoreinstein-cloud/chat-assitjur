# Revisão completa — Agente Revisor de Defesas (agentId: revisor-defesas)

Documento de revisão do agente **Revisor de Defesas Trabalhistas**: configuração, fluxo, ferramentas, UI e consistência com o checklist.

---

## 1. Resumo executivo

| Item | Estado | Notas |
|------|--------|--------|
| **Configuração (agents-registry)** | ✅ | `useRevisorDefesaTools: true`, `allowedModelIds: nonReasoningChatModelIds` |
| **Instruções (agent-revisor-defesas.ts)** | ✅ | v3.2, XML, GATE-1 → FASE A → GATE 0.5 → FASE B → ENTREGA |
| **Aviso IA (Doc 1 apenas)** | ✅ Corrigido | Alinhado role + output_format + modelos (Doc 2 e 3 sem aviso) |
| **Validação PI + Contestação (API)** | ✅ | route.ts exige ambos quando revisor e há partes document |
| **Ferramenta createRevisorDefesaDocuments** | ✅ | Uma chamada com 3 títulos + contextoResumo; geração em paralelo |
| **UI: RevisorPhaseBanner** | ✅ | FASE A, GATE 0.5 (CONFIRMAR/CORRIGIR), FASE B, erro |
| **UI: RevisorChecklist** | ✅ | PI, Contestação, Base de conhecimento (empty state) |
| **Modelos (nonReasoning)** | ✅ | Revisor restrito a modelos sem thinking para tools ativas |

---

## 2. Onde está cada parte

| Componente | Ficheiro / local |
|------------|-------------------|
| **Id do agente** | `AGENT_ID_REVISOR_DEFESAS = "revisor-defesas"` em `lib/ai/agents-registry.ts` e `lib/ai/agents-registry-metadata.ts` |
| **Instruções** | `lib/ai/agent-revisor-defesas.ts` → `AGENTE_REVISOR_DEFESAS_INSTRUCTIONS` |
| **Config (tools, modelos)** | `lib/ai/agents-registry.ts` → `AGENT_CONFIGS[AGENT_ID_REVISOR_DEFESAS]` |
| **Injeção no chat** | `app/(chat)/api/chat/route.ts`: `effectiveAgentInstructions` / `agentConfig.instructions`; tools: `createRevisorDefesaDocuments` quando `useRevisorDefesaTools` |
| **Validação PI+Contestação** | `app/(chat)/api/chat/route.ts`: bloqueio 400 se agente revisor e faltar PI ou Contestação em document parts |
| **Delimitadores GATE 0.5** | `lib/ai/agent-revisor-defesas.ts` → `GATE_05_RESUMO_START` / `GATE_05_RESUMO_END` |
| **Banner de fase** | `components/revisor-phase-banner.tsx` (FASE A, CONFIRMAR/CORRIGIR, FASE B, erro) |
| **Checklist PI/Contestação/Base** | `components/revisor-checklist.tsx` |
| **Botões CONFIRMAR/CORRIGIR** | `components/messages.tsx` + `message.tsx` (`gate05ConfirmInline`) quando última mensagem assistant tem GATE_0.5_RESUMO |
| **Ferramenta 3 DOCX** | `lib/ai/tools/create-revisor-defesa-documents.ts` |
| **Geração conteúdo** | `artifacts/text/server.ts` → `generateRevisorDocumentContent`; modelos em `lib/ai/modelos/` |
| **Modelos de documento** | `lib/ai/modelos/MODELO_PARECER_EXECUTIVO.txt`, `MODELO_ROTEIRO_ADVOGADO.txt`, `MODELO_ROTEIRO_PREPOSTO.txt` |
| **Schema body chat** | `app/(chat)/api/chat/schema.ts`: `agentId` enum inclui `revisor-defesas` |
| **Documentação** | `docs/PROJETO-REVISOR-DEFESAS.md`, `.agents/skills/revisor-defesas-context/SKILL.md` |

---

## 3. Fluxo de trabalho (instruções)

Conforme `AGENTE_REVISOR_DEFESAS_INSTRUCTIONS`:

1. **GATE-1** — (A) Petição Inicial e (B) Contestação obrigatórios. Se faltar, PARAR. Opcionais: (C)(D)(E). Memória da conversa: usar histórico; se PI e Contestação já existirem em mensagens anteriores, não pedir de novo.
2. **FASE A** — Extração e mapeamento. PROIBIDO gerar os 3 DOCX nesta fase.
3. **GATE 0.5** — Exibir resumo entre `--- GATE_0.5_RESUMO ---` e `--- /GATE_0.5_RESUMO ---`. Aguardar CONFIRMAR ou CORRIGIR.
4. **FASE B** — Chamar **uma vez** `createRevisorDefesaDocuments` com os 3 títulos e `contextoResumo` = texto do resumo GATE 0.5. Não usar `createDocument` três vezes.
5. **ENTREGA** — Indicar os 3 documentos, links/refs e ressalvas (revisão humana obrigatória no Doc 1).

---

## 4. Regras e proibições (checklist)

- **Siglas:** Uso interno apenas (RTE, RDO, DAJ, DTC); nos DOCX sempre por extenso.
- **Sinalização:** 🔴🟡🟢 (criticidade) e ✅/❌/⚠️ (avaliação da defesa) em todos os docs quando um pedido/tema aparecer.
- **Proibições:** Não redigir peças; não inventar fatos/jurisprudência; não dar valores em R$/%; não instruir testemunha (art. 342 CP); linguagem consultiva (não imperativa).
- **Aviso IA:** Apenas no Doc 1 (Avaliação da defesa). Docs 2 e 3 (Roteiro Advogado, Roteiro Preposto) sem aviso.

---

## 5. API e validação

- **POST /api/chat:** Body pode incluir `agentId: "revisor-defesas"`. Se não enviado, usa `DEFAULT_AGENT_ID_WHEN_EMPTY` (assistente-geral).
- **Validação PI+Contestação:** Quando `agentConfig.useRevisorDefesaTools` e a mensagem do utilizador tem partes do tipo `document`, o route exige que existam pelo menos uma parte com `documentType === "pi"` e uma com `documentType === "contestacao"`. Caso contrário, responde 400 com mensagem a pedir PI e Contestação.
- **Tools ativas:** Para revisor, apenas quando o modelo **não** é reasoning/thinking (`nonReasoningChatModelIds`), para garantir que `createRevisorDefesaDocuments` está disponível e a primeira resposta é mais rápida.

---

## 6. UI específica do revisor

- **RevisorPhaseBanner:** Visível quando `agentId === "revisor-defesas"` e não readonly. Mostra:
  - FASE A — Extração e mapeamento (enquanto não há GATE_0.5_RESUMO e há mensagem assistant em streaming/última).
  - CONFIRMAR / CORRIGIR (quando a última mensagem assistant contém os delimitadores GATE_0.5 e o utilizador ainda não respondeu).
  - FASE B — Gerando os 3 documentos + cronómetro (após CONFIRMAR e em streaming).
  - Mensagem de erro (após CONFIRMAR e status === "error").
- **RevisorChecklist:** No empty state (messageCount === 0), variante central ou inline: PI, Contestação, Base de conhecimento (opcional). Usa `attachments` e `knowledgeDocumentIds`.
- **Gate 0.5 inline:** Em `message.tsx`, quando a mensagem é a do gate 0.5 e o utilizador não respondeu, pode mostrar CONFIRMAR/CORRIGIR inline além do banner.

---

## 7. Modelos de documento (modelos/)

- **MODELO_PARECER_EXECUTIVO.txt** — Doc 1 (Avaliação). Contém o aviso "Relatório gerado por IA. Revisão humana necessária e obrigatória."
- **MODELO_ROTEIRO_ADVOGADO.txt** — Doc 2. Sem aviso IA (removido na revisão).
- **MODELO_ROTEIRO_PREPOSTO.txt** — Doc 3. Sem aviso IA (removido na revisão).

A escolha do modelo é feita por `getModeloRevisorFromTitle(title)` em `lib/ai/modelos/index.ts` (palavras-chave no título).

---

## 8. Correções aplicadas nesta revisão

1. **Aviso IA apenas no Doc 1**
   - **agent-revisor-defesas.ts:** No `<role>`, alterado de "em todos os 3 DOCX" para "apenas no Doc 1 (Avaliação da defesa); nos Docs 2 e 3 não inclua esse aviso", alinhado ao `<output_format>` e ao checklist.
   - **MODELO_ROTEIRO_ADVOGADO.txt** e **MODELO_ROTEIRO_PREPOSTO.txt:** Removida a linha "Relatório gerado por IA. Revisão humana necessária e obrigatória." dos templates, para não ser preenchida pelo modelo nos Docs 2 e 3.

---

## 9. Referências

- **Checklist desenvolvimento:** `.agents/skills/revisor-defesas-context/SKILL.md`
- **Documentação produto:** `docs/PROJETO-REVISOR-DEFESAS.md`
- **Processo upload/validação:** `docs/processo-revisor-upload-validacao.md`
- **UX/UI:** `docs/ux-ui-revisor-defesas.md` (se existir)
- **Agentes e API:** `docs/AGENTES-IA-PERSONALIZADOS.md`
