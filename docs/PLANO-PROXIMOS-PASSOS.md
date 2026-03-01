# Plano: Próximos passos do projeto

Documento de referência para alinhar tarefas imediatas, curto prazo e roadmap. Atualizar este ficheiro quando prioridades ou estado mudarem.

**Última atualização:** 2026-03-01 (revisão e reorganização; integração .agents; curto prazo em tabela).

---

## 1. Imediato (fazer primeiro)

| #   | Tarefa                                        | Detalhe                                                                                                                                 | Estado   |
|-----|-----------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|----------|
| 1   | **Validação pré-envio (PI + Contestação)**    | Validar no frontend ou em `/api/files/process` que existem documentos identificados como Petição Inicial e Contestação antes de permitir/enviar; evita que o advogado envie sem os obrigatórios. | Pendente |
| 2   | *(a definir)*                                 | Inserir aqui a próxima tarefa crítica assim que priorizada.                                                                             | —        |

### 1.1 Concluído (arquivo)

| #   | Tarefa             | Resolução                                                                                                                                 |
|-----|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| —   | Prebuild a passar  | Alinhada rota `/api/chat` com teste: `temperature: 0.2`, `maxOutputTokens: 8192` em `streamText`; prebuild e build passam.                 |

**Referência:** Validação pré-envio — secção 6 de [processo-revisor-upload-validacao.md](processo-revisor-upload-validacao.md); checklist em [PROJETO-REVISOR-DEFESAS.md](PROJETO-REVISOR-DEFESAS.md).

---

## 2. Curto prazo (próximas sprints)

| # | Tarefa | Detalhe | Referência |
|---|--------|---------|------------|
| 1 | **Lint e qualidade** | Manter `pnpm run format` e `pnpm run lint` antes de commits; considerar pre-commit hook (Ultracite). | — |
| 2 | **CredentialsSignin em produção** | Seguir passos da secção “Próximos passos quando vês CredentialsSignin em produção” (passos 1–3). | [vercel-setup.md § CredentialsSignin](vercel-setup.md#credentialssignin-login--guest) |
| 3 | **Deploy** | Usar checklist antes de cada deploy; incluir `pnpm run prebuild` (lint + test:unit) no fluxo. | [pre-deploy-checklist.md](pre-deploy-checklist.md) |
| 4 | **Skills (.agents)** | Executar `npx skills update` periodicamente; considerar skills opcionais (next-upgrade, prompt-engineering-patterns). | [.agents/README.md](../.agents/README.md), [SKILLS_REPORT.md § 5–6](SKILLS_REPORT.md) |

---

## 3. Roadmap de produto (SPEC)

O roadmap detalhado está em **[SPEC-AI-DRIVE-JURIDICO.md § 11. Roadmap](SPEC-AI-DRIVE-JURIDICO.md#11-roadmap-sugestão)**. Resumo:

| Fase        | Foco                                                                                                                                 |
|-------------|--------------------------------------------------------------------------------------------------------------------------------------|
| **Fase 1**  | Revisor sólido (v1): validação pré-envio, checklist "Antes de executar", CONFIRMAR/CORRIGIR no GATE 0.5, política de dados, OCR opcional. |
| **Fase 2**  | Base de conhecimento e escala: RAG (chunking, embeddings), UX (etapas FASE A/B, nomes dos DOCX).                                       |
| **Fase 3**  | Multi-agente e novos domínios: segundo agente (ex. Análise de contratos), selector na UI, export .docx nativo opcional.                |
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
| **SKILLS_REPORT.md** | “Próximas otimizações possíveis” e resumo de próximos passos (skills). |
| **.agents/README.md** | Skills instaladas, comandos (`npx skills list`, `npx skills update`), link para SKILLS_REPORT. |
| **.agents/SKILLS_ARCHITECTURE.md** | Categorias e mapa de dependências das skills. |
| **ux-ui-revisor-defesas.md** | Acessibilidade e próximo passo na mensagem de erro. |

**Sugestão:** Manter este plano como índice; alterações de prioridade ou novas tarefas imediatas devem ser atualizadas na secção 1 e, se relevante, no roadmap da SPEC.

---

## 5. Como atualizar este plano

1. **Imediato (secção 1):** Quando uma tarefa for concluída, movê-la para “Concluído (arquivo)” (1.1) e atualizar a tabela principal; inserir novas tarefas com número e descrição breve.
2. **Curto prazo (secção 2):** Adicionar ou remover linhas na tabela; manter referências aos docs quando existirem.
3. **Roadmap:** Alterações de fases ou metas devem ser feitas em **SPEC-AI-DRIVE-JURIDICO.md**; este doc mantém apenas o resumo e a ligação.
4. **AGENTS.md:** O AGENTS.md inclui referência a este plano na secção “Documentação do produto (Revisor de Defesas)”. Manter o link ao atualizar esse bloco.
