# Plano: Próximos passos do projeto

Documento de referência para alinhar tarefas imediatas, curto prazo e roadmap. Atualizar este ficheiro quando prioridades ou estado mudarem.

**Última atualização:** 2025-02 (prebuild e build a passar; maxOutputTokens e upload-token corrigidos).

---

## 1. Imediato (fazer primeiro)

| # | Tarefa | Detalhe | Estado |
|---|--------|---------|--------|
| 1 | **Prebuild a passar** | O teste `agent-flow.test.ts` espera `temperature: 0.2` e `maxTokens: 8192` no código da rota `/api/chat`. | **Concluído** |
| 1b | Opção aplicada — Alinhar rota ao teste | Adicionados `temperature: 0.2` e `maxOutputTokens: 8192` na chamada `streamText` em `app/(chat)/api/chat/route.ts`. Teste atualizado para `maxOutputTokens`. Prebuild e **build** passam. | Concluído |

---

## 2. Curto prazo (próximas sprints)

- **Lint e qualidade:** Lint e formatação estão consistentes (Ultracite). Manter `pnpm run format` e `pnpm run lint` antes de commits; considerar pre-commit hook.
- **CredentialsSignin em produção:** Seguir os passos em [vercel-setup.md § Troubleshooting — Próximos passos quando vês CredentialsSignin](vercel-setup.md#próximos-passos-quando-vês-credentialssignin-em-produção).
- **Deploy:** Usar [pre-deploy-checklist.md](pre-deploy-checklist.md) antes de cada deploy; incluir `pnpm run prebuild` no fluxo (lint + test:unit).
- **Skills:** Ver [SKILLS_REPORT.md § Próximas otimizações](SKILLS_REPORT.md) para `npx skills update` e skills opcionais.

---

## 3. Roadmap de produto (SPEC)

O roadmap detalhado está em **[SPEC-AI-DRIVE-JURIDICO.md § 11. Roadmap](SPEC-AI-DRIVE-JURIDICO.md#11-roadmap-sugestão)**. Resumo:

| Fase | Foco |
|------|------|
| **Fase 1** | Revisor sólido (v1): validação pré-envio, checklist "Antes de executar", CONFIRMAR/CORRIGIR no GATE 0.5, política de dados, OCR opcional. |
| **Fase 2** | Base de conhecimento e escala: RAG (chunking, embeddings), UX (etapas FASE A/B, nomes dos DOCX). |
| **Fase 3** | Multi-agente e novos domínios: segundo agente (ex. Análise de contratos), selector na UI, export .docx nativo opcional. |
| **Fase 4** | Produto e escala: multi-inquilino, integração processual (PJe/e-SAJ), certificações. |

Priorizar itens da Fase 1 conforme [PROJETO-REVISOR-DEFESAS.md](PROJETO-REVISOR-DEFESAS.md) e [processo-revisor-upload-validacao.md](processo-revisor-upload-validacao.md).

**Próximo item sugerido (Fase 1):** Validação pré-envio (PI + Contestação) no frontend ou em `/api/files/process`, para evitar que o advogado envie sem ter os documentos obrigatórios — ver secção 6 de [processo-revisor-upload-validacao.md](processo-revisor-upload-validacao.md).

---

## 4. Onde estão “próximos passos” na doc

| Documento | Secção / conteúdo |
|-----------|-------------------|
| **vercel-setup.md** | “Próximos passos quando vês CredentialsSignin em produção” (passos 1–3). |
| **pre-deploy-checklist.md** | Tabela “Falha → Próximo passo” e checklist manual. |
| **SPEC-AI-DRIVE-JURIDICO.md** | § 11 Roadmap (Fases 1–4). |
| **SKILLS_REPORT.md** | “Próximas otimizações possíveis” e tabela de próximos passos (skills). |
| **ux-ui-revisor-defesas.md** | Acessibilidade e próximo passo na mensagem de erro. |

**Sugestão:** Manter este plano como índice; alterações de prioridade ou novas tarefas imediatas devem ser atualizadas na secção 1 e, se relevante, no roadmap da SPEC.

---

## 5. Como atualizar este plano

1. **Imediato (secção 1):** Quando uma tarefa for concluída, marcar estado (ex.: “Concluído”) e mover para “Curto prazo” ou arquivar.
2. **Novas tarefas:** Inserir na secção 1 (imediato) ou 2 (curto prazo) com número e descrição breve.
3. **Roadmap:** Alterações de fases ou metas devem ser feitas em **SPEC-AI-DRIVE-JURIDICO.md**; este doc mantém apenas o resumo e a ligação.
4. **Referência no AGENTS.md:** Incluir link para `docs/PLANO-PROXIMOS-PASSOS.md` na secção de documentação relevante.
