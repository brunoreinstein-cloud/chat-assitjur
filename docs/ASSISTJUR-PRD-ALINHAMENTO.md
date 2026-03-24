# Alinhamento: PRD AssistJur.IA v1.0 vs estado atual

Documento de análise do **AssistJur-PRD-Spec-v1.0** (Módulo Contencioso Trabalhista) face ao código e documentação atuais. Objetivo: identificar gaps e definir próximos passos priorizados.

**Fonte PRD:** `AssistJur-PRD-Spec-v1.0.docx` (exportado em `docs/AssistJur-PRD-Spec-v1.0.html` para referência).

**Última atualização:** 2026-03-24 (Atualizado: Sprint 4 RF-07 + fases + riscos + peças; Sprint 5 RBAC; Sprint 6 ProcessoPanel + telemetria + painel de passivo.)

---

## 1. Resumo do PRD

### 1.1 Visão e escopo

- **Produto:** AssistJur.IA — plataforma SaaS de assistência jurídica com IA generativa para escritórios de advocacia trabalhista (médio porte, Brasil).
- **Módulo em foco:** Fluxo completo de gestão de ações trabalhistas — do recebimento da petição inicial ao protocolo da contestação.
- **Metas:** Reduzir tempo médio de elaboração de peças em até 60%; aumentar consistência técnica; rastreabilidade por processo; reutilização de teses (RAG); transparência de passivo para o cliente.

### 1.2 Personas (PRD)

| Persona | Objetivo principal | Acesso |
|--------|--------------------|--------|
| **P1 — Advogado Sênior / Sócio** | Supervisionar qualidade, aprovar estratégias, relatórios para cliente | Full access, aprovação, painel executivo |
| **P2 — Advogado Pleno** | Elaborar defesas no menor tempo; templates e pesquisa semântica | Carteira própria, elaboração, banco de teses |
| **P3 — Paralegal** | Cadastrar processos, notificar advogados, sem acesso à estratégia | Recebimento e protocolo |
| **P4 — Cliente (Empresa/RH)** | Ver passivo, provisões, andamentos | Read-only, portal, relatórios |

### 1.3 Requisitos funcionais principais (PRD)

| ID | Requisito | Resumo |
|----|-----------|--------|
| **RF-01** | Cadastro de processo | Número CNJ, reclamante, reclamada, vara, comarca, tribunal, rito, valor da causa, prazo fatal, contexto extra |
| **RF-02** | Fluxo de fases (state machine) | recebimento → analise_risco → estrategia → elaboracao → revisao → protocolo → audiencia → sentenca → recurso → encerrado |
| **RF-03** | Análise de risco por verba | AgentRisk: por verba (ex.: horas extras, FGTS) — classificação Remoto/Possível/Provável, valor min/max, tese defensiva, score global e provisão |
| **RF-04** | Base de conhecimento (RAG) | Ingestão acórdãos/OJs/súmulas/peças vencedoras; chunking semântico; busca pgvector com reranking; atualização mensal |
| **RF-05** | Elaboração de peças (AgentDrafter) | Contestação (ordinário/sumaríssimo), RO, Embargos, Razões Finais, Impugnação à liquidação |
| **RF-06** | Painel de passivo do cliente | Total processos ativos, breakdown de provisão, histórico de acordos, relatório PDF mensal, alertas |
| **RF-07** | Chat por processo × agente | Histórico separado por (processo, agente); contexto do processo injetado no system prompt; kickoff contextual; sugestões por fase |

### 1.4 Stack e dados (PRD)

- **Stack:** Next.js 15, React 19, Vercel AI SDK, Neon Postgres, pgvector, Auth.js v5, Vercel Blob.
- **Entidades principais:** `processos`, `risco_por_verba`, `pecas`, `chat_history_processo`, base de teses (RAG).
- **Agentes por fase:** AgentIngestor (recebimento), AgentRisk (análise de risco), AgentStrategy (estratégia), AgentDrafter (elaboração), AgentRevisor (revisão), AgentProtocol (protocolo).
- **API chat:** `POST /api/chat` com `processoId` (obrigatório) e `agentId`; contexto do processo buscado no servidor.

---

## 2. Estado atual do projeto

### 2.1 O que já existe

| Área | Estado atual | Referência |
|------|--------------|------------|
| **Chat + streaming** | useChat, `ToolLoopAgent` per-request, histórico por conversa (Chat + Message_v2) | `app/(chat)/api/chat/route.ts`, `lib/ai/chat-agent.ts` |
| **Multi-agente** | 5 agentes: Assistente Geral, Revisor de Defesas, Redator de Contestações, Avaliador de Contestação, AssistJur.IA Master; selector no header; `agentId` no body | `lib/ai/agents-registry.ts`, schema chat |
| **Base de conhecimento** | KnowledgeDocument + RAG (KnowledgeChunk, pgvector); threshold de similaridade; injeção no prompt | `lib/ai/knowledge-base.md`, queries |
| **Validação pré-envio** | PI + Contestação para Revisor; checklist "Antes de executar" | `multimodal-input.tsx`, `chat.tsx` |
| **Upload / OCR** | PDF/DOC/DOCX, extração e tipagem; OCR para escaneados | `api/files/upload`, `api/files/process` |
| **Entregas estruturadas** | 3 DOCX (Revisor): Avaliação, Roteiro Advogado, Roteiro Preposto | Agente Revisor, modelos em `lib/ai` |
| **Auth** | Auth.js v5, guest mode, warmup BD | `app/api/auth` |
| **Schema BD** | User, Chat, Message_v2, KnowledgeDocument, KnowledgeChunk; `Processo`, `TaskExecution`, `VerbaProcesso`, **`Peca`** (migração 0030); CRUD completo, chat por processo, fases e peças ligados. | `lib/db/schema.ts`, [PROCESSO-TASKEXECUTION.md](PROCESSO-TASKEXECUTION.md) |
| **Chat por processo** | ✅ `processoId` no body POST `/api/chat`; `getProcessoContexto()` injectado no system prompt; `ProcessoSelector` no topbar (dropdown + modal inline de criação); `setChatProcessoAction`. | `app/(chat)/api/chat/route.ts`, `components/processo-selector.tsx` |
| **Fases (state machine)** | ✅ `avancaFaseAction`, `setFaseAction`, `FASE_ORDER`, badge de fase na página do processo. | `lib/db/queries/processos.ts` |
| **AgentRisk / verbas** | ✅ `upsertRiscoVerba` tool + action; tabela `VerbaProcesso` populada por agente. | `lib/ai/tools/` |
| **Peças** | ✅ Tabela `Peca` (migração 0030); `savePecaAction`; link ao chat gerador. | `lib/db/migrations/0030_pecas.sql` |
| **RBAC** | ✅ `lib/rbac/roles.ts` (6 perfis + `can()`), `requirePermission`, `role` em JWT/Session, admin UI + API route, guards em todas as server actions, migração 0031. | `lib/rbac/` |
| **Telemetria** | ✅ `TaskTelemetry` (8 métricas: latência, tokens, steps, tools, finishReason, modelId) em `TaskExecution.result`; `buildAiSdkTelemetry` emite spans para Vercel/OpenTelemetry. | `lib/telemetry.ts` |
| **Painel de passivo** | ✅ `/processos/passivo` server component com agregação por risco + CSV export. Portal do cliente (read-only externo) ainda pendente. | `app/(chat)/processos/passivo/` |
| **Documentação** | SPEC AI Drive Jurídico, PROJETO-REVISOR-DEFESAS, AGENTES-IA-PERSONALIZADOS, PLANO-PROXIMOS-PASSOS | `docs/` |

### 2.2 Agentes atuais vs PRD

| PRD | Atual | Observação |
|-----|--------|------------|
| AgentIngestor (recebimento) | AssistJur.IA Master (M08 Cadastro eLaw) | Parcial: intake de PDF e extração de metadados existem em `Processo`; agente dedicado ao fluxo de recebimento não existe |
| AgentRisk (análise de risco) | — | RF-03 não implementado; schema `VerbaProcesso` existe mas sem agente |
| AgentStrategy (estratégia) | — | Não existe |
| AgentDrafter (elaboração) | Redator de Contestações | Parcial: redação de contestação; falta integração com entidade `Processo` e fases |
| AgentRevisor (revisão) | Revisor de Defesas | Alinhado ao fluxo GATE-1 → FASE A/B |
| AgentProtocol (protocolo) | — | Não existe |
| — (extra) | Avaliador de Contestação | Novo: avalia qualidade da contestação já redigida (score A–E) |
| — (extra) | AssistJur.IA Master | Novo: 14 módulos unificados; pipeline multi-chamadas; DOCX/XLSX/ZIP |
| — (extra) | Assistente Geral | Novo: assistente de uso geral com memória persistente |

---

## 3. Gaps (PRD vs atual)

### 3.1 Dados e modelo

| Gap | Descrição | Impacto |
|-----|-----------|--------|
| **Entidade Processo** | ✅ Schema `Processo` + CRUD completo + UI (ProcessoSelector inline, página processo, badge de fase). | — |
| **State machine (fases)** | ✅ `avancaFaseAction`, `setFaseAction`, `FASE_ORDER`, badge de fase na UI. | — |
| **Risco por verba** | ✅ Tabela `VerbaProcesso` + `upsertRiscoVerba` tool + action; painel de risco inline. | — |
| **Peças (pecas)** | ✅ Tabela `Peca` (migração 0030); `savePecaAction`; `blobUrl` e link ao chat gerador. Status granular (rascunho/aprovado/protocolado) ainda sem UI dedicada. | Baixo |
| **Chat por processo × agente** | ✅ `processoId` no body do chat; contexto injectado no system prompt; histórico por conversa (chatId) com `processoId` associado. | — |
| **Cliente e passivo** | ✅ Painel `/processos/passivo` com agregação por risco + CSV. Portal read-only externo (P4) e relatório PDF mensal ainda não existem. | Médio |
| **RBAC** | ✅ 6 perfis (`paralegal`, `adv_junior`, `adv_pleno`, `adv_senior`, `socio`, `cliente`) + `can()`; guards em server actions; admin UI. | — |

### 3.2 Funcionalidades

| Gap | Descrição | Estado |
|-----|-----------|--------|
| **Cadastro de processo (RF-01)** | CRUD de processos com validação CNJ e campos do PRD. | ✅ |
| **Fluxo de fases (RF-02)** | Transições de fase (manual ou via tool); UI refletindo fase atual. | ✅ |
| **AgentRisk (RF-03)** | `upsertRiscoVerba` tool; painel de risco. Agente dedicado `AgentRisk` autónomo não existe (tool activa no Master). | Parcial |
| **AgentDrafter integrado** | Elaboração atrelada ao processo + `savePecaAction` + Blob. Fluxo de aprovação (rascunho→aprovado→protocolado) sem UI dedicada. | Parcial |
| **Painel de passivo (RF-06)** | `/processos/passivo` com agregados + CSV. PDF mensal e alertas não existem. | Parcial |
| **Chat com processoId (RF-07)** | API e UI com ProcessoSelector; getProcessoContexto() injectado no system prompt. | ✅ |
| **Portal do cliente** | Área read-only externa (P4) com passivo e andamentos. | — |
| **Intake automático** | PDF uploaded → agente extrai metadados → cria/atualiza Processo automaticamente. | — |
| **Dashboard de custos** | View SQL (`llm-costs.ts`) calcula custo por token/modelo; falta ligar à UI admin. | Pendente |
| **useSemanticRerank nos agentes** | Flag `useSemanticRerank` já existe no código; Master e Revisor não a activam ainda. | Pendente |
| **searchJurisprudencia** | Tool criada; precisa de ser registada em `agent-assistjur-master` (registry e route). | Pendente |
| **Langfuse traceId** | `createLoggingMiddleware` emite spans no formato correcto; falta passar `traceId` para o SDK Langfuse. | Pendente |

### 3.3 API e Server Actions

- **Actions existentes:** `createProcessoAction`, `avancaFaseAction`, `setFaseAction`, `getProcessoContextoAction`, `upsertRiscoVerbaAction`, `savePecaAction`, `setChatProcessoAction`, `updateUserRole`.
- **Chat:** body com `processoId` (opcional) e `agentId`; contexto do processo injectado no system prompt quando presente.
- **Pendente:** `aprovaPecaAction` (transição rascunho→aprovado→protocolado com UI dedicada); endpoints REST para portal do cliente.

---

## 4. Próximos passos recomendados

### 4.1 Estado dos sprints PRD

| Sprint | Objetivo | Estado |
|--------|----------|--------|
| **1–3** | Schema Processo + CRUD + chat por processo + ProcessoPanel | ✅ Concluído |
| **4 (RF-07)** | `processoId` no chat; fases; AgentRisk/verbas; peças | ✅ Concluído (2026-03-24) |
| **5 (RBAC)** | 6 perfis, `can()`, guards, migração 0031 | ✅ Concluído (2026-03-24) |
| **6** | ProcessoPanel, telemetria (TaskTelemetry), painel de passivo | ✅ Concluído (2026-03-24) |
| **7 (RAG teses)** | Base de teses jurisprudenciais; `searchJurisprudencia` tool | Pendente (tool criada, falta registar) |
| **8 (E2E / observ.)** | Langfuse traceId, dashboard de custos, load tests, deploy final | Pendente |

### 4.2 Próximos passos concretos

| # | Tarefa | Detalhe | Ficheiro-chave |
|---|--------|---------|----------------|
| 1 | **Dashboard de custos → UI admin** | View SQL em `llm-costs.ts` calcula custo/token por modelo; criar componente no painel admin que consulta a view e apresenta tabela/gráfico por período e agente. | `lib/db/llm-costs.ts`, `app/(chat)/admin/` |
| 2 | **`useSemanticRerank: true`** | Flag já existe em `AgentConfig`; activar em Master e Revisor no `agents-registry.ts` e garantir que o pipeline RAG respeita a flag no `prepareCall`. | `lib/ai/agents-registry.ts`, `lib/ai/chat-agent.ts` |
| 3 | **Registar `searchJurisprudencia` no Master** | Tool já criada; adicionar à lista de tools activas do `assistjur-master` no registry e em `route.ts` (secção que monta tools por agente). | `lib/ai/agents-registry.ts`, `app/(chat)/api/chat/route.ts` |
| 4 | **Langfuse traceId** | `createLoggingMiddleware` já emite spans no formato correcto; instanciar o SDK Langfuse e passar `traceId` no `experimental_telemetry.metadata` (ou via `wrapLanguageModel`). | `lib/telemetry.ts`, `lib/ai/chat-agent.ts` |
| 5 | **Portal do cliente (RF-06 restante)** | Área read-only para P4: passivo, andamentos, relatório PDF mensal, alertas. | Novo `app/(portal)/` |
| 6 | **Intake automático** | PDF uploaded → agente extrai metadados → cria/atualiza `Processo` (`intakeStatus`). | `lib/ai/`, `app/(chat)/api/files/` |

### 4.3 O que manter do estado atual

- Revisor de Defesas e Redator de Contestações (como agentes de revisão e redação).
- Base de conhecimento e RAG (já alinhada ao PRD RF-04 em conceito).
- Validação pré-envio, checklist, política de dados, OCR, upload.
- Stack técnica (Next.js, Vercel AI SDK, Neon, Auth.js, Blob).

### 4.4 Roadmap do PRD (Sprints 1–8) — estado

| Sprint PRD | Foco | Estado |
|------------|------|--------|
| 1–3 | Schema, CRUD, chat por processo, ProcessoPanel | ✅ |
| 4 | AgentRisk, painel risco, upsertRiscoVerbas | ✅ (via tool, não agente autónomo) |
| 5 | AgentDrafter, Blob, fluxo aprovação peças | ✅ (sem UI de aprovação) |
| 6 | RBAC, painel passivo | ✅ (PDF mensal pendente) |
| 7 | RAG base teses, `searchJurisprudencia` | Parcial (tool criada, não registada) |
| 8 | E2E, load tests, Langfuse, dashboard custos, deploy | Pendente |

---

## 5. Questões abertas (do PRD)

| # | Questão | Opções (resumo) | Decisor |
|---|---------|------------------|---------|
| Q1 | Captura de intimações | PJe direta / Escavador / manual assistido | Sócio + Tech |
| Q2 | Limite de contexto no prompt | Últimas 20 / 40 msgs ou resumo automático | Tech |
| Q3 | Assinatura digital | ICP-Brasil (BirdID) / assinatura simples / D4Sign | Sócio + Jurídico |
| Q4 | Portal do cliente | Mesmo app /subdomínio / só PDF por e-mail | Sócio + Produto |
| Q5 | Precificação | Por processo / por assento / flat | Sócio + Comercial |

---

## 6. Referências

- **PRD (conteúdo):** `docs/AssistJur-PRD-Spec-v1.0.html` (export do DOCX).
- **Spec atual:** [SPEC-AI-DRIVE-JURIDICO.md](SPEC-AI-DRIVE-JURIDICO.md).
- **Plano de passos:** [PLANO-PROXIMOS-PASSOS.md](PLANO-PROXIMOS-PASSOS.md).
- **Revisor de Defesas:** [PROJETO-REVISOR-DEFESAS.md](PROJETO-REVISOR-DEFESAS.md).
- **Base de conhecimento / RAG:** [lib/ai/knowledge-base.md](../lib/ai/knowledge-base.md).
