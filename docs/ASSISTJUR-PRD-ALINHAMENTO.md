# Alinhamento: PRD AssistJur.IA v1.0 vs estado atual

Documento de análise do **AssistJur-PRD-Spec-v1.0** (Módulo Contencioso Trabalhista) face ao código e documentação atuais. Objetivo: identificar gaps e definir próximos passos priorizados.

**Fonte PRD:** `AssistJur-PRD-Spec-v1.0.docx` (exportado em `docs/AssistJur-PRD-Spec-v1.0.html` para referência).

**Última atualização:** 2026-03-23 (Atualizado: schema Processo implementado; 5 agentes; ToolLoopAgent em produção.)

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
| **Schema BD** | User, Chat, Message_v2, KnowledgeDocument, KnowledgeChunk; **`Processo`, `TaskExecution`, `VerbaProcesso` já existem** (fase, riscoGlobal, intake, cache PDF); CRUD e chat com `processoId` ainda pendentes | `lib/db/schema.ts`, [PROCESSO-TASKEXECUTION.md](PROCESSO-TASKEXECUTION.md) |
| **RBAC** | Não implementado (PRD: paralegal, adv_junior, adv_pleno, adv_senior, socio, cliente) | — |
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
| **Entidade Processo** | ✅ Schema `Processo` criado com todos os campos principais do PRD (numeroAutos, reclamante, reclamada, vara, fase, riscoGlobal, provisao, prazoFatal, intake, cache PDF). Falta: CRUD completo de API, UI e ligação ao chat via `processoId`. | Médio — schema feito; lógica e UI pendentes |
| **State machine (fases)** | Campo `fase` existe no schema. Falta: `avancaFaseAction`, validação de transições e badge de fase na UI. | Médio |
| **Risco por verba** | ✅ Tabela `VerbaProcesso` criada (verba, risco, valorMin, valorMax). Falta: AgentRisk e UI de painel de risco. | Médio |
| **Peças (pecas)** | Versões de peças por processo (contestação, RO, etc.), status (rascunho, em_revisao, aprovado, protocolado), blob_url. Não existe. | Alto |
| **Chat por processo × agente** | PRD: histórico por (processoId, agentId). Hoje: histórico por chatId (conversa), com agentId no chat. Não há “sessão por processo + agente”. | Alto |
| **Cliente e passivo** | Entidade cliente, painel de passivo (RF-06), relatório PDF. Não existe. | Médio |
| **RBAC** | 5 perfis (paralegal, adv_junior, adv_pleno, adv_senior, socio) + cliente. Não implementado. | Médio |

### 3.2 Funcionalidades

| Gap | Descrição |
|-----|-----------|
| **Cadastro de processo (RF-01)** | CRUD de processos com validação CNJ e campos do PRD. |
| **Fluxo de fases (RF-02)** | Transições de fase (manual ou via tool); UI refletindo fase atual. |
| **AgentRisk (RF-03)** | Agente que produz análise de risco por verba (generateObject), persistência em `risco_por_verba`. |
| **AgentDrafter integrado** | Elaboração atrelada ao processo e à fase “elaboracao”; gravação de peças em `pecas` e Blob. |
| **Painel de passivo (RF-06)** | Por cliente: totais, provisão, histórico de acordos, PDF, alertas. |
| **Chat com processoId (RF-07)** | API e UI: seleção de processo; getProcessoContexto(); histórico por (processoId, agentId). |
| **Portal do cliente** | Área read-only para cliente (P4) com passivo e andamentos. |

### 3.3 API e Server Actions (PRD)

- **API:** GET/POST processos, GET processo/:id/contexto, GET processo/:id/passivo, GET/DELETE processo/:id/chat/:agentId.
- **Actions:** createProcessoAction, avancaFaseAction, getProcessoContextoAction, upsertRiscoVerbaAction, savePecaAction, aprovaPecaAction.
- **Chat:** body com `processoId` (obrigatório) e `agentId`; contexto sempre buscado no servidor.

Hoje: chat usa `chatId` e opcionalmente `knowledgeDocumentIds`; não há `processoId` nem endpoints de processo/contexto/passivo.

---

## 4. Próximos passos recomendados

### 4.1 Priorização sugerida

A ordem abaixo equilibra dependências do PRD e reuso do que já existe (Revisor, Redator, RAG, upload).

| Ordem | Objetivo | Entregas | Estado | Depende de |
|-------|----------|----------|--------|------------|
| **1** | ~~Alinhar documentação e decisões~~ | ~~Decidir se evoluímos para “por processo”~~ | ✅ Concluído (schema criado) | — |
| **2** | ~~Modelo de dados “processo”~~ | Schema `Processo`, `TaskExecution`, `VerbaProcesso` com todos os campos principais | ✅ Schema criado — CRUD API e UI pendentes | — |
| **3** | **Chat “por processo” (RF-07)** | `processoId` no body do chat; `getProcessoContexto()`; ligar `TaskExecution` ao `chatId`; ProcessoPanel na UI | — | #2 ✅ |
| **4** | **State machine (fases)** | `avancaFaseAction`, validação de transições; badge de fase na UI | — | #2 ✅ |
| **5** | **AgentRisk + risco por verba (RF-03)** | Agente AgentRisk; `upsertRiscoVerbaAction`; painel de risco na UI | — | #2 ✅, #4 |
| **6** | **Peças e AgentDrafter integrado (RF-05)** | Tabela `pecas`; `savePecaAction` (Blob); `aprovaPecaAction`; Redator recebendo contexto do processo | — | #2 ✅, #4 |
| **7** | **RBAC (perfis PRD)** | Roles em User ou sessão; middleware por rota; visibilidade por perfil | — | Auth atual |
| **8** | **Painel de passivo e cliente (RF-06)** | Entidade cliente; agregados; relatório PDF; alertas | — | #2 ✅, #7 |

### 4.2 O que manter do estado atual

- Revisor de Defesas e Redator de Contestações (como agentes de revisão e redação).
- Base de conhecimento e RAG (já alinhada ao PRD RF-04 em conceito).
- Validação pré-envio, checklist, política de dados, OCR, upload.
- Stack técnica (Next.js, Vercel AI SDK, Neon, Auth.js, Blob).

### 4.3 Roadmap do PRD (Sprints 1–8) — referência

O PRD descreve 8 sprints de 2 semanas. Para alinhar:

- **Sprint 1:** Schema + CRUD processos + createProcessoAction, avancaFaseAction.
- **Sprint 2:** /api/chat com contexto de processo, persistência histórico processo×agente.
- **Sprint 3:** ProcessoPanel, useProcessoChat, layout two-panel.
- **Sprint 4:** AgentRisk, painel risco, upsertRiscoVerbas.
- **Sprint 5:** AgentDrafter, Blob, fluxo aprovação peças.
- **Sprint 6:** RBAC, painel passivo, PDF mensal.
- **Sprint 7:** RAG base teses, tool searchTeses.
- **Sprint 8:** E2E, load tests, Sentry, deploy.

O plano atual do repositório (PLANO-PROXIMOS-PASSOS.md) pode ser atualizado para incluir estes itens como “curto/médio prazo” conforme a priorização acima.

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
