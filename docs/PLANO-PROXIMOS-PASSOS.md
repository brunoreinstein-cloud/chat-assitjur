# Plano: Próximos passos do projeto

Documento de referência para alinhar tarefas imediatas, curto prazo e roadmap. Atualizar este ficheiro quando prioridades ou estado mudarem.

**Última atualização:** 2026-03-24 (Arquivados: Sprint 4 RF-07 + fases + riscos + peças; Sprint 5 RBAC; Sprint 6 ProcessoPanel + Telemetria + Painel de Passivo + Migrações manuais.)

---

## 1. Imediato (fazer primeiro)

| #   | Tarefa                                        | Detalhe                                                                                                                                 | Estado   |
|-----|-----------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|----------|
| 1   | **Executar migrações manuais em produção** | `pnpm tsx lib/db/apply-manual-migrations.ts` (com `POSTGRES_URL` de produção) — aplica `0029_processo_intake.sql`, `0030_pecas.sql`, `0031_user_role.sql`. Localmente já aplicadas. | — |
| 2   | **Intake automático** | PDF uploaded → agente extrai metadados → cria/atualiza processo automaticamente (sem formulário manual). Ver PRD §3 e `intakeStatus` no schema. | — |
| 3   | **Relatório de qualidade** | UI que lê `TaskExecution.result` (8 métricas `TaskTelemetry`) e apresenta dashboard por processo/agente. | — |

### 1.1 Concluído (arquivo)

| #   | Tarefa             | Resolução                                                                                                                                 |
|-----|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| —   | **Sprint 6 — ProcessoPanel + Telemetria + Painel de Passivo** (2026-03-24) | `ProcessoSelector` no topbar do chat (dropdown + modal inline de criação); `setChatProcessoAction`; `processoIdRef` em `ChatRequestRefs`. Telemetria: `TaskTelemetry` (8 métricas: latência, tokens, steps, tools, finishReason, modelId) em `TaskExecution.result`. Painel `/processos/passivo`: server component com agregação por risco + CSV export. Migrações `0029`/`0030`/`0031` aplicadas via `lib/db/apply-manual-migrations.ts`. |
| —   | **Sprint 5 — RBAC** (2026-03-24) | `lib/rbac/roles.ts` (6 perfis + `can()`), `lib/rbac/guards.ts` (`requirePermission`), `role` em JWT/Session, `updateUserRole`, admin RBAC UI + API route, guards em todas as server actions, migração `0031_user_role.sql`. |
| —   | **Sprint 4 — RF-07 + Fases + Riscos + Peças** (2026-03-24) | `processoId` no body POST /api/chat; injeção de contexto no system prompt; `TaskExecution` auto-link; `avancaFaseAction` + `setFaseAction`; `FASE_ORDER` state machine; badge de fases na página do processo; `upsertRiscoVerba` tool + action; tabela `Peca`; `savePecaAction`; migração `0030_pecas.sql`. |
| —   | **ToolLoopAgent (AI SDK Agents)** | `streamText` substituído por `ToolLoopAgent` per-request em `lib/ai/chat-agent.ts`. `callOptionsSchema` + `prepareCall` para injeção de RAG/contexto. Créditos em `agent.onFinish`. Ver [AI-SDK-AGENTS-PROXIMOS-PASSOS.md](AI-SDK-AGENTS-PROXIMOS-PASSOS.md). |
| —   | **Novos agentes: Avaliador, Master, Assistente Geral** | 5 agentes built-in: `assistente-geral`, `revisor-defesas`, `redator-contestacao`, `avaliador-contestacao`, `assistjur-master`. Registry em `lib/ai/agents-registry.ts`. Ver [AGENTES-IA-PERSONALIZADOS.md](AGENTES-IA-PERSONALIZADOS.md). |
| —   | **Memory tools** | `saveMemory`, `recallMemories`, `forgetMemory` — memória persistente por userId. `useMemoryTools: true` em todos os agentes. Ver [MEMORY-TOOLS.md](MEMORY-TOOLS.md). |
| —   | **Human-in-the-Loop (HITL)** | `requestApproval` (tool sem execute) — AI SDK pausa o stream; frontend mostra diálogo. Ativo em Redator e Master. Ver [HUMAN-IN-THE-LOOP.md](HUMAN-IN-THE-LOOP.md). |
| —   | **Pipeline multi-chamadas** | `analyzeProcessoPipeline` — PDFs >500 pgs divididos em blocos temáticos. Ativo no Master (`usePipelineTool: true`). |
| —   | **AssistJur Master Documents + ZIP** | `createMasterDocuments` gera DOCX/XLSX/JSON + download ZIP. `maxOutputTokens: 16000` no Master. Ver [AGENTE-ASSISTJUR-MASTER.md](AGENTE-ASSISTJUR-MASTER.md). |
| —   | **Schema Processo / TaskExecution** | Tabelas `Processo`, `TaskExecution`, `VerbaProcesso` criadas com schema completo (fase, riscoGlobal, intake, cache PDF). Ver [PROCESSO-TASKEXECUTION.md](PROCESSO-TASKEXECUTION.md). |
| —   | **Decisão: evolução para "por processo"** | Adoptado: schema Processo já criado; próximo passo é ligar o chat ao processo (RF-07). |
| —   | Prebuild a passar  | Alinhada rota `/api/chat` com teste: `temperature: 0.2`, `maxOutputTokens: 8192`; prebuild e build passam.                 |
| —   | **Validação pré-envio (PI + Contestação)** | Frontend: `validateRevisorPiContestacao` em `multimodal-input.tsx` (agente Revisor, primeira mensagem ou anexos com documentos). Backend: validação em `POST /api/chat` quando Revisor e mensagem tem partes document. |
| —   | **Checklist "Antes de executar"** | `RevisorChecklist` renderizado em `chat.tsx` (acima do input), com `attachments`, `knowledgeDocumentIds`, `messageCount`. |
| —   | **Política "dados não usados para treino"** | Texto em `lib/ai/data-policy.ts`; componente `DataPolicyLink` com dialog; link "Como usamos os seus dados" no footer do chat. |
| —   | **Aviso revisão humana em Doc 2 e Doc 3** | Modelos `MODELO_ROTEIRO_ADVOGADO.txt` e `MODELO_ROTEIRO_PREPOSTO.txt` atualizados com a mesma frase do Doc 1; instruções do agente alinhadas. |
| —   | **OCR** | Já implementado em `app/(chat)/api/files/upload/route.ts` (até 50 páginas); `/api/files/process` usa `runExtractionAndClassification`. |
| —   | **RAG (Fase 2)** | Tabela `KnowledgeChunk` com pgvector; chunking e embeddings no POST /api/knowledge; no chat, embedding da pergunta e busca top-k; fallback para injeção direta. Ver [lib/ai/knowledge-base.md](../lib/ai/knowledge-base.md). |
| —   | **RAG: threshold de similaridade** | Variável `RAG_MIN_SIMILARITY` (0–1); só chunks com similarity >= valor são injetados no prompt (pgvector e Qdrant). Análise do template Vercel em [TEMPLATE-RAG-VERCEL-ANALISE.md](TEMPLATE-RAG-VERCEL-ANALISE.md). |
| —   | **UX etapas / DOCX (Fase 2)** | Banner com "FASE A — Extração e mapeamento"; "FASE B" com nomes dos 3 documentos; instruções do agente a indicar os 3 nomes na ENTREGA. |
| —   | **Multi-agente (Fase 3)** | Registry em `lib/ai/agents-registry.ts`; agentes Revisor de Defesas e Redator de Contestações; `agentId` no body do chat; selector no header. Export .docx ficou opcional. |
| —   | **UX: novo chat sem agente + agente visível** | Novo chat abre sem agente pré-selecionado; sidebar e header com opção "Selecionar agente"; greeting dinâmico (agente atual ou "Escolha um agente"); envio bloqueado sem agente (toast + API 400). Ver sugestões em [ux-ui-revisor-defesas.md](ux-ui-revisor-defesas.md) e lista abaixo. |
| —   | **BD/Auth: warmup guest + timeout 12s + histórico** | POST `/api/auth/guest` faz warmup da BD com retry (até 3 tentativas, 8s cada) antes do sign-in. Timeout por query no chat reduzido para 12s (`PER_QUERY_TIMEOUT_MS` / `CREDITS_IN_BATCH_TIMEOUT_MS`) para falhar mais cedo em serverless. Histórico de chats: `historyFetcher` com `credentials: "include"` em `agent-sidebar` e `sidebar-history` para garantir que a sessão é enviada. Ver [CHECKLIST-REVISAO-BD-E-AUTH.md](CHECKLIST-REVISAO-BD-E-AUTH.md) e [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md). |

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
| 6 | **RAG (base de conhecimento)** | Implementado (Fase 2); threshold de similaridade (`RAG_MIN_SIMILARITY`) já disponível. **Melhorias recomendadas:** (1) multi-query / query expansion; (2) tool "pesquisar na base" (opcional); (3) tool "adicionar à base"; (4) reranking; (5) chunking semântico; (6) **HyDE opcional** e **classificação "só RAG para perguntas"** (ver template Internal Knowledge Base). | [TEMPLATE-RAG-VERCEL-ANALISE.md](TEMPLATE-RAG-VERCEL-ANALISE.md), [TEMPLATE-INTERNAL-KNOWLEDGE-BASE-ANALISE.md](TEMPLATE-INTERNAL-KNOWLEDGE-BASE-ANALISE.md), [lib/ai/knowledge-base.md](../lib/ai/knowledge-base.md) |
| 7 | **Modo Split-Screen (Revisor)** | Sugestão UX: ao gerar o parecer, ver documento original de um lado e sugestões da IA do outro, com highlights ligando os dois — padrão em ferramentas jurídicas de revisão. | Especificar em SPEC ou PROJETO-REVISOR-DEFESAS.md |
| 8 | **Mais melhorias UX/UI chat** | (1) Indicador de modelo LLM ao lado do agente no header. (2) Breadcrumb ou título da conversa visível no topo. (3) Reduzir redundância: agente mostrado na sidebar + header + greeting — considerar um único ponto de verdade com destaque. (4) Botão "Faça anexar PI e Contestação" só quando Revisor selecionado. (5) Acessibilidade: garantir que o seletor de agente tenha foco lógico e anúncio para leitores de ecrã. | [ux-ui-revisor-defesas.md](ux-ui-revisor-defesas.md) |
| 9 | **Workflow DevKit (useworkflow.dev)** | Avaliar adopção para workflows duráveis (Revisor GATE-1→FASE A→GATE 0.5→FASE B), retries em tool calls, human-in-the-loop no GATE 0.5, observabilidade e (futuro) sleep/agendamento. POC mínima recomendada antes de integrar no chat. | [WORKFLOW-DEVKIT-PROXIMOS-PASSOS.md](WORKFLOW-DEVKIT-PROXIMOS-PASSOS.md) |
| ~~10~~ | ~~**AI SDK Agents (ToolLoopAgent, call options)**~~ | ✅ **Concluído (2026-03-23).** `streamText` substituído por `ToolLoopAgent` per-request em `lib/ai/chat-agent.ts`. `callOptionsSchema` (Zod) + `prepareCall` para injeção de system prompt/RAG. Créditos em `agent.onFinish`. `abortSignal` propagado. DevTools activo. Ver [AI-SDK-AGENTS-PROXIMOS-PASSOS.md](AI-SDK-AGENTS-PROXIMOS-PASSOS.md). | [AI-SDK-AGENTS-PROXIMOS-PASSOS.md](AI-SDK-AGENTS-PROXIMOS-PASSOS.md) |
| 11 | **AssistJur PRD — completar modelo “por processo”** | Concluído (✅): schema, chat por processo, fases, AgentRisk/verbas, peças, RBAC, ProcessoPanel, telemetria. **Pendente:** (1) Criar processo inline no chat (modal no `ProcessoSelector`); (2) Painel de passivo agregado; (3) Intake automático (PDF → cria processo automaticamente); (4) Relatório de qualidade via `TaskExecution.result`. Ver [ASSISTJUR-PRD-ALINHAMENTO.md](ASSISTJUR-PRD-ALINHAMENTO.md). | [ASSISTJUR-PRD-ALINHAMENTO.md](ASSISTJUR-PRD-ALINHAMENTO.md) |

---

## 3. Médio prazo (Cookbook — features não implementadas)

| # | Tarefa | Detalhe | Estado |
|---|--------|---------|--------|
| 1 | **Track Token Usage** | Capturar `usage` do stream no `onFinish` callback e persistir por chat/utilizador na BD. Dashboard de consumo por modelo — útil para billing e controlo de custos. | — |
| 2 | **Call Tools Multiple Steps — UI feedback** | `maxSteps` já está configurado. Falta UI de feedback por step: spinner/badge por tool call para o utilizador ver o progresso em tempo real quando a IA executa múltiplas ferramentas sequencialmente. | — |
| 3 | **Knowledge Base Agent** | Agente dedicado que orquestra RAG → reranking → síntese com citações inline. Diferente do RAG actual que é chamado passivamente pela route — este agente decide activamente quando e como consultar a base. | — |
| 4 | **MCP Tools — activação real** | Instalar `@ai-sdk/mcp` quando disponível no registry. Substituir o stub em `lib/ai/mcp-config.ts` por `experimental_createMCPClient` para activar ferramentas MCP reais. | — |

---

## 4. Longo prazo (arquitectura)

| # | Tarefa | Detalhe |
|---|--------|---------|
| 1 | **Streaming com artefactos progressivos** | Usar `streamObject` para gerar tabelas/gráficos progressivamente enquanto o LLM responde, em vez de aguardar a resposta completa. |
| 2 | **Multi-agent handoff** | Roteamento entre agentes especializados (pesquisa, redacção, análise) via handoff pattern — um agente delega explicitamente para outro conforme o tipo de tarefa. |
| 3 | **Avaliação de qualidade RAG** | Pipeline de avaliação automática (RAGAS ou similar) para medir precision/recall dos chunks recuperados. Permite iterar sobre chunking, embeddings e threshold de forma orientada a dados. |

---

## 5. Roadmap de produto (SPEC)

O roadmap detalhado está em **[SPEC-AI-DRIVE-JURIDICO.md § 11. Roadmap](SPEC-AI-DRIVE-JURIDICO.md#11-roadmap-sugestão)**. Resumo:

| Fase        | Foco                                                                                                                                 |
|-------------|--------------------------------------------------------------------------------------------------------------------------------------|
| **Fase 1**  | Revisor sólido (v1): validação pré-envio, checklist "Antes de executar", CONFIRMAR/CORRIGIR no GATE 0.5, política de dados, OCR opcional. |
| **Fase 2**  | Base de conhecimento e escala: RAG (chunking, embeddings), UX (etapas FASE A/B, nomes dos DOCX).                                       |
| **Fase 3**  | Multi-agente: Revisor de Defesas e Redator de Contestações; selector na UI; export .docx nativo opcional.                |
| **Fase 4**  | Produto e escala: multi-inquilino, integração processual (PJe/e-SAJ), certificações.                                                   |

Priorizar itens da Fase 1 conforme [PROJETO-REVISOR-DEFESAS.md](PROJETO-REVISOR-DEFESAS.md) e [processo-revisor-upload-validacao.md](processo-revisor-upload-validacao.md).

---

## 6. Onde estão “próximos passos” na documentação

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
| **SUGESTOES-FUTURO.md** | Sugestões técnicas para o futuro: RAG (try/catch + toDatabaseError), rotas com BD e tratamento 503, logger centralizado em vez de console. |
| **WORKFLOW-DEVKIT-PROXIMOS-PASSOS.md** | Benefícios do Workflow DevKit (useworkflow.dev) aplicáveis ao sistema: workflows duráveis, steps com retry, human-in-the-loop, observabilidade; próximos passos (doc, POC, avaliação integração chat/Revisor). |
| **TEMPLATE-RAG-VERCEL-ANALISE.md** | Comparação com o template RAG da Vercel; melhorias recomendadas (threshold já implementado; multi-query, tools pesquisar/adicionar, reranking) e prioridades. |
| **TEMPLATE-INTERNAL-KNOWLEDGE-BASE-ANALISE.md** | Análise do template Internal Knowledge Base (middleware, HyDE, classificação question/statement); recomendações: HyDE opcional, classificação "só RAG para perguntas". |
| **AI-SDK-AGENTS-PROXIMOS-PASSOS.md** | Análise da doc AI SDK Agents (ToolLoopAgent, workflows, loop control, call options, memory, subagents); estado atual do projeto e próximos passos implantáveis (migração para ToolLoopAgent, prepareCall para RAG, prepareStep, memória, subagentes). |
| **ASSISTJUR-PRD-ALINHAMENTO.md** | Resumo do PRD AssistJur.IA v1.0 (Contencioso Trabalhista), estado atual do projeto, gaps (processo, fases, AgentRisk, peças, chat por processo×agente, RBAC, passivo) e próximos passos priorizados; referência aos Sprints 1–8 do PRD e questões abertas. |

**Sugestão:** Manter este plano como índice; alterações de prioridade ou novas tarefas imediatas devem ser atualizadas na secção 1 e, se relevante, no roadmap da SPEC.

---

## 7. Como atualizar este plano

1. **Imediato (secção 1):** Quando uma tarefa for concluída, movê-la para “Concluído (arquivo)” (1.1) e atualizar a tabela principal; inserir novas tarefas com número e descrição breve.
2. **Curto prazo (secção 2):** Adicionar ou remover linhas na tabela; manter referências aos docs quando existirem.
3. **Roadmap:** Alterações de fases ou metas devem ser feitas em **SPEC-AI-DRIVE-JURIDICO.md**; este doc mantém apenas o resumo e a ligação.
4. **AGENTS.md:** O AGENTS.md inclui referência a este plano na secção “Documentação do produto (Revisor de Defesas)”. Manter o link ao atualizar esse bloco.
