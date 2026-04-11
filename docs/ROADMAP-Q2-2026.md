# AssistJur — Roadmap Q2 2026

**Formato:** Now / Next / Later
**Período:** Abril – Junho 2026
**Gerado em:** 2026-03-31

---

## Status Overview

6 sprints concluídos (499 testes, 6 agentes, Design System v3.0). Plataforma core funcional com chat, multi-agente, RBAC, guardrails e geração de documentos. Foco do Q2: **colocar em produção, solidificar o pipeline e fechar lacunas de UX**.

---

## NOW (Abril 2026) — Comprometido, alta confiança

| # | Iniciativa | Descrição | Status | Dependências |
|---|-----------|-----------|--------|-------------|
| 1 | **Deploy migrações 0029–0035** | RLS, versionamento de prompts, schema de créditos — testados localmente, pendentes em produção | Não iniciado | Acesso Supabase prod |
| 2 | **Intake automático** | Upload de PDF → extração automática de metadados → criação de Processo (sem formulário manual) | Não iniciado | Landmark mapper (concluído) |
| 3 | **Quality Report UI** | Dashboard frontend para o eval framework (backend completo: 14 casos, 5 agentes, 8 métricas) | Não iniciado | Eval backend (concluído) |
| 4 | **Estabilização AutuorIA** | Corrigir fallbacks do stream-handler, entitlements lookup, mensagens de modelo vazias — bugs de março | Em andamento | — |
| 5 | **Prompt Caching Middleware** | Prompt caching Anthropic/OpenAI via Language Model Middleware — reduzir custo de tokens de entrada | Em andamento | — |

---

## NEXT (Maio 2026) — Planejado, boa confiança, escopo definido mas não iniciado

| # | Iniciativa | Descrição | Status | Dependências |
|---|-----------|-----------|--------|-------------|
| 6 | **RAG Reranking** | Reranking pós-busca para melhorar relevância de chunks no Knowledge Base | Não iniciado | pgvector (concluído) |
| 7 | **Stream Resumption** | Redis + resumable-stream para continuação após reload de página | Não iniciado | Upstash Redis (infra opcional) |
| 8 | **MCP Real Activation** | Conectar stubs `@ai-sdk/mcp` em `mcp-config.ts` a servidores de ferramentas reais | Não iniciado | Infra de servidor MCP |
| 9 | **Dashboard de Uso de Tokens** | Rastrear consumo de LLM por usuário/modelo com dashboard visual | Não iniciado | Sistema de créditos (concluído) |
| 10 | **Multi-Step UI Feedback** | Indicadores de progresso para chamadas sequenciais de ferramentas no Agent Runner | Não iniciado | Pipeline progress stages (concluído) |

---

## LATER (Junho 2026+) — Direcional, escopo e timing flexíveis

| # | Iniciativa | Descrição | Notas |
|---|-----------|-----------|-------|
| 11 | **Knowledge Base Agent** | Agente dedicado de orquestração RAG com citações inline | Novo agente (#7) |
| 12 | **Generative UI** | Stream de componentes React dinamicamente (tabelas, formulários, relatórios interativos) | Grande esforço de UI |
| 13 | **Client-side Tools** | Ferramentas executadas no browser com dialogs de confirmação do usuário | Requer AI SDK client tools |
| 14 | **Feature Flags por Modelo** | A/B testing Claude vs GPT via Edge Config | Requer eval framework maduro |
| 15 | **Split-screen Revisor** | Visualização lado a lado: documento original vs. corrigido | Necessita design de UX |
| 16 | **Custom Data Streaming** | Metadados de mensagem: agentId, creditsUsed, documentsReferenced | AI SDK data stream parts |

---

## Riscos e Dependências

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| **Migrações não implantadas** | Bloqueia versionamento de prompts, RLS e créditos em prod | Prioridade #1 — implantar primeiro |
| **Redis não provisionado** | Bloqueia stream resumption e prompt caching em escala | Pode prosseguir sem Redis (degradação graciosa) |
| **Infra MCP indefinida** | Bloqueia ativação real de ferramentas MCP | Requer decisão de arquitetura |
| **Custo de tokens não rastreado** | Sem visibilidade de gasto LLM por usuário | Dashboard de tokens em NEXT |

---

## Notas de Capacidade

- 6 agentes em estado production-ready; foco muda de construção de features para **hardening e deploy**
- Itens NOW escopados para 1 engenheiro por ~4 semanas
- Itens NEXT dependem de NOW estar implantado — dependência sequencial
- Itens LATER são apostas estratégicas que podem ser reordenadas com base em feedback dos usuários pós-lançamento
