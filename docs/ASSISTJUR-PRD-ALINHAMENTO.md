# Alinhamento: PRD AssistJur.IA v1.0 vs estado atual

Documento de análise do **AssistJur-PRD-Spec-v1.0** (Módulo Contencioso Trabalhista) face ao código e documentação atuais. Objetivo: identificar gaps e definir próximos passos priorizados.

**Fonte PRD:** `AssistJur-PRD-Spec-v1.0.docx` (exportado em `docs/AssistJur-PRD-Spec-v1.0.html` para referência).

**Última atualização:** 2026-03-09

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
| **Chat + streaming** | useChat, streamText, histórico por conversa (Chat + Message_v2) | `app/(chat)/api/chat/route.ts` |
| **Multi-agente** | Revisor de Defesas, Redator de Contestações; selector no header; `agentId` no body | `lib/ai/agents-registry.ts`, schema chat |
| **Base de conhecimento** | KnowledgeDocument + RAG (KnowledgeChunk, pgvector); threshold de similaridade; injeção no prompt | `lib/ai/knowledge-base.md`, queries |
| **Validação pré-envio** | PI + Contestação para Revisor; checklist "Antes de executar" | `multimodal-input.tsx`, `chat.tsx` |
| **Upload / OCR** | PDF/DOC/DOCX, extração e tipagem; OCR para escaneados | `api/files/upload`, `api/files/process` |
| **Entregas estruturadas** | 3 DOCX (Revisor): Avaliação, Roteiro Advogado, Roteiro Preposto | Agente Revisor, modelos em `lib/ai` |
| **Auth** | Auth.js v5, guest mode, warmup BD | `app/api/auth` |
| **Schema BD** | User, Chat, Message_v2, KnowledgeDocument, KnowledgeChunk; **não** existe entidade Processo nem fluxo de fases | `lib/db/schema.ts` |
| **RBAC** | Não implementado (PRD: paralegal, adv_junior, adv_pleno, adv_senior, socio, cliente) | — |
| **Documentação** | SPEC AI Drive Jurídico, PROJETO-REVISOR-DEFESAS, AGENTES-IA-PERSONALIZADOS, PLANO-PROXIMOS-PASSOS | `docs/` |

### 2.2 Agentes atuais vs PRD

| PRD | Atual | Observação |
|-----|--------|------------|
| AgentIngestor (recebimento) | — | Não existe agente dedicado ao cadastro/triagem |
| AgentRisk (análise de risco) | — | Não existe; RF-03 não implementado |
| AgentStrategy (estratégia) | — | Não existe |
| AgentDrafter (elaboração) | Redator de Contestações | Parcial: redação de contestação; falta integração com “processo” e fases |
| AgentRevisor (revisão) | Revisor de Defesas | Alinhado ao fluxo de revisão de defesas (GATE-1 → FASE A/B) |
| AgentProtocol (protocolo) | — | Não existe |

---

## 3. Gaps (PRD vs atual)

### 3.1 Dados e modelo

| Gap | Descrição | Impacto |
|-----|-----------|--------|
| **Entidade Processo** | PRD exige `processos` (numero_autos, reclamante, reclamada, vara, fase, risco_global, provisao, prazo_fatal, cliente_id, adv_responsavel_id, etc.). Hoje não existe; o chat é “por conversa”, não “por processo”. | Alto — base para RF-01, RF-02, RF-07 |
| **State machine (fases)** | PRD: recebimento → analise_risco → … → encerrado. Hoje não há modelo de fases nem transições. | Alto |
| **Risco por verba** | Tabela `risco_por_verba` e AgentRisk (RF-03). Não existe. | Alto |
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

| Ordem | Objetivo | Entregas | Depende de |
|-------|----------|----------|------------|
| **1** | Alinhar documentação e decisões | Incorporar PRD na SPEC ou criar SPEC-AssistJur; decidir se evoluímos o produto atual para “por processo” ou mantemos dois modos (chat livre vs. processo). | — |
| **2** | Modelo de dados “processo” | Schema: `processos` (e, se aplicável, `clientes`); migrations; CRUD mínimo (create, list, get by id). | Decisão de produto |
| **3** | Chat “por processo” (RF-07) | `processoId` no body do chat; getProcessoContexto(); histórico por (processoId, agentId) — nova tabela ou extensão de Chat. ProcessoPanel na UI (selecionar/criar processo). | #2 |
| **4** | State machine (fases) | Campo `fase` em processos; enum; avancaFaseAction (e opcionalmente tool do agente). UI: badge de fase. | #2 |
| **5** | AgentRisk + risco por verba (RF-03) | Agente AgentRisk; schema `risco_por_verba`; generateObject + upsertRiscoVerbaAction; painel de risco na UI. | #2, #4 |
| **6** | Peças e AgentDrafter integrado (RF-05) | Tabela `pecas`; savePecaAction (Blob); aprovaPecaAction; AgentDrafter (ou Redator) recebendo contexto do processo e gravando peça. | #2, #4 |
| **7** | RBAC (perfis PRD) | Roles em User ou sessão; middleware por rota/action; visibilidade de componentes por perfil. | Auth atual |
| **8** | Painel de passivo e cliente (RF-06) | Entidade cliente; agregados por cliente; relatório PDF; alertas. Opcional: portal do cliente. | #2, #7 |

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
