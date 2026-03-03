# Plano: Próximos passos do projeto

Documento de referência para alinhar tarefas imediatas, curto prazo e roadmap. Atualizar este ficheiro quando prioridades ou estado mudarem.

**Última atualização:** 2026-03-03 (Multi-agente: Revisor de Defesas e Redator de Contestações; agente Análise de contratos removido.)

---

## 1. Imediato (fazer primeiro)

| #   | Tarefa                                        | Detalhe                                                                                                                                 | Estado   |
|-----|-----------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|----------|
| 1   | *(a definir)*                                 | Inserir aqui a próxima tarefa crítica assim que priorizada.                                                                             | —        |

### 1.1 Concluído (arquivo)

| #   | Tarefa             | Resolução                                                                                                                                 |
|-----|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| —   | Prebuild a passar  | Alinhada rota `/api/chat` com teste: `temperature: 0.2`, `maxOutputTokens: 8192` em `streamText`; prebuild e build passam.                 |
| —   | **Validação pré-envio (PI + Contestação)** | Frontend: `validateRevisorPiContestacao` em `multimodal-input.tsx` (agente Revisor, primeira mensagem ou anexos com documentos). Backend: validação em `POST /api/chat` quando Revisor e mensagem tem partes document. |
| —   | **Checklist "Antes de executar"** | `RevisorChecklist` renderizado em `chat.tsx` (acima do input), com `attachments`, `knowledgeDocumentIds`, `messageCount`. |
| —   | **Política "dados não usados para treino"** | Texto em `lib/ai/data-policy.ts`; componente `DataPolicyLink` com dialog; link "Como usamos os seus dados" no footer do chat. |
| —   | **Aviso revisão humana em Doc 2 e Doc 3** | Modelos `MODELO_ROTEIRO_ADVOGADO.txt` e `MODELO_ROTEIRO_PREPOSTO.txt` atualizados com a mesma frase do Doc 1; instruções do agente alinhadas. |
| —   | **OCR** | Já implementado em `app/(chat)/api/files/upload/route.ts` (até 50 páginas); `/api/files/process` usa `runExtractionAndClassification`. |
| —   | **RAG (Fase 2)** | Tabela `KnowledgeChunk` com pgvector; chunking e embeddings no POST /api/knowledge; no chat, embedding da pergunta e busca top-k; fallback para injeção direta. Ver [lib/ai/knowledge-base.md](../lib/ai/knowledge-base.md). |
| —   | **UX etapas / DOCX (Fase 2)** | Banner com "FASE A — Extração e mapeamento"; "FASE B" com nomes dos 3 documentos; instruções do agente a indicar os 3 nomes na ENTREGA. |
| —   | **Multi-agente (Fase 3)** | Registry em `lib/ai/agents-registry.ts`; agentes Revisor de Defesas e Redator de Contestações; `agentId` no body do chat; selector no header. Export .docx ficou opcional. |
| —   | **UX: novo chat sem agente + agente visível** | Novo chat abre sem agente pré-selecionado; sidebar e header com opção "Selecionar agente"; greeting dinâmico (agente atual ou "Escolha um agente"); envio bloqueado sem agente (toast + API 400). Ver sugestões em [ux-ui-revisor-defesas.md](ux-ui-revisor-defesas.md) e lista abaixo. |

**Referência:** Validação pré-envio — secção 6 de [processo-revisor-upload-validacao.md](processo-revisor-upload-validacao.md); checklist em [PROJETO-REVISOR-DEFESAS.md](PROJETO-REVISOR-DEFESAS.md).

---

## 2. Curto prazo (próximas sprints)

| # | Tarefa | Detalhe | Referência |
|---|--------|---------|------------|
| 1 | **Lint e qualidade** | Manter `pnpm run format` e `pnpm run lint` antes de commits. Antes de push: `pnpm run build` ou `pnpm run prepush`. CI: `.github/workflows/build.yml` replica o build da Vercel em cada push/PR para `main`. | [pre-deploy-checklist.md](pre-deploy-checklist.md) |
| 2 | **CredentialsSignin em produção** | Seguir passos da secção “Próximos passos quando vês CredentialsSignin em produção” (passos 1–3). | [vercel-setup.md § CredentialsSignin](vercel-setup.md#credentialssignin-login--guest) |
| 3 | **Deploy** | Usar checklist antes de cada deploy; incluir `pnpm run prebuild` (lint + test:unit) no fluxo. | [pre-deploy-checklist.md](pre-deploy-checklist.md) |
| 4 | **Skills (.agents)** | Executar `npx skills update` periodicamente; CI já faz `npx skills check` em push em main e semanalmente (.github/workflows/skills-check.yml). | [.agents/README.md](../.agents/README.md), [SKILLS_REPORT.md](SKILLS_REPORT.md) |
| 5 | **Upgrade Next.js** | Usar a skill **@next-upgrade** ao planear ou executar upgrade do Next.js. | [next-upgrade.md](next-upgrade.md) |
| 6 | **RAG (base de conhecimento)** | Implementado (Fase 2). Melhorias futuras: reranking, chunking semântico. | [lib/ai/knowledge-base.md](../lib/ai/knowledge-base.md) |
| 7 | **Modo Split-Screen (Revisor)** | Sugestão UX: ao gerar o parecer, ver documento original de um lado e sugestões da IA do outro, com highlights ligando os dois — padrão em ferramentas jurídicas de revisão. | Especificar em SPEC ou PROJETO-REVISOR-DEFESAS.md |
| 8 | **Mais melhorias UX/UI chat** | (1) Indicador de modelo LLM ao lado do agente no header. (2) Breadcrumb ou título da conversa visível no topo. (3) Reduzir redundância: agente mostrado na sidebar + header + greeting — considerar um único ponto de verdade com destaque. (4) Botão "Faça anexar PI e Contestação" só quando Revisor selecionado. (5) Acessibilidade: garantir que o seletor de agente tenha foco lógico e anúncio para leitores de ecrã. | [ux-ui-revisor-defesas.md](ux-ui-revisor-defesas.md) |

---

## 3. Roadmap de produto (SPEC)

O roadmap detalhado está em **[SPEC-AI-DRIVE-JURIDICO.md § 11. Roadmap](SPEC-AI-DRIVE-JURIDICO.md#11-roadmap-sugestão)**. Resumo:

| Fase        | Foco                                                                                                                                 |
|-------------|--------------------------------------------------------------------------------------------------------------------------------------|
| **Fase 1**  | Revisor sólido (v1): validação pré-envio, checklist "Antes de executar", CONFIRMAR/CORRIGIR no GATE 0.5, política de dados, OCR opcional. |
| **Fase 2**  | Base de conhecimento e escala: RAG (chunking, embeddings), UX (etapas FASE A/B, nomes dos DOCX).                                       |
| **Fase 3**  | Multi-agente: Revisor de Defesas e Redator de Contestações; selector na UI; export .docx nativo opcional.                |
| **Fase 4**  | Produto e escala: multi-inquilino, integração processual (PJe/e-SAJ), certificações.                                                   |

Priorizar itens da Fase 1 conforme [PROJETO-REVISOR-DEFESAS.md](PROJETO-REVISOR-DEFESAS.md) e [processo-revisor-upload-validacao.md](processo-revisor-upload-validacao.md).

---

## 4. Onde estão “próximos passos” na documentação

| Documento | Secção / conteúdo |
|-----------|-------------------|
| **vercel-setup.md** | “CredentialsSignin (login / guest)”: “Próximos passos quando vês CredentialsSignin em produção” (passos 1–3). |
| **pre-deploy-checklist.md** | Tabela “Falha → Próximo passo” e checklist manual. |
| **chat-guest-review.md** | Recomendações opcionais (UX/a11y GuestGate, E2E guest, docs). |
| **SPEC-AI-DRIVE-JURIDICO.md** | § 11 Roadmap (Fases 1–4). |
| **AGENTES-IA-PERSONALIZADOS.md** | Descrição da oferta “agentes personalizados” (agentes pré-definidos + instruções + base de conhecimento); referência técnica e evolução futura. |
| **SKILLS_REPORT.md** | “Próximas otimizações possíveis” e resumo de próximos passos (skills); CI skills check. |
| **next-upgrade.md** | Uso da skill @next-upgrade ao atualizar o Next.js. |
| **.agents/README.md** | Skills instaladas, comandos (`npx skills list`, `npx skills update`), link para SKILLS_REPORT. |
| **.agents/SKILLS_ARCHITECTURE.md** | Categorias e mapa de dependências das skills. |
| **ux-ui-revisor-defesas.md** | Acessibilidade e próximo passo na mensagem de erro. |
| **AVALIACAO-UPLOAD-ARQUIVOS-CONHECIMENTO.md** | Avaliação da proposta: guardar anexos em “Arquivos”, Arquivos → Conhecimento, Chat → Conhecimento; conclusões e próximos passos. |

**Sugestão:** Manter este plano como índice; alterações de prioridade ou novas tarefas imediatas devem ser atualizadas na secção 1 e, se relevante, no roadmap da SPEC.

---

## 5. Como atualizar este plano

1. **Imediato (secção 1):** Quando uma tarefa for concluída, movê-la para “Concluído (arquivo)” (1.1) e atualizar a tabela principal; inserir novas tarefas com número e descrição breve.
2. **Curto prazo (secção 2):** Adicionar ou remover linhas na tabela; manter referências aos docs quando existirem.
3. **Roadmap:** Alterações de fases ou metas devem ser feitas em **SPEC-AI-DRIVE-JURIDICO.md**; este doc mantém apenas o resumo e a ligação.
4. **AGENTS.md:** O AGENTS.md inclui referência a este plano na secção “Documentação do produto (Revisor de Defesas)”. Manter o link ao atualizar esse bloco.
