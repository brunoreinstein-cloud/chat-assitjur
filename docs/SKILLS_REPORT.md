# Relatório: Arquitetura de Skills e Lacunas

**Data:** 2026-03-01  
**Projeto:** Chatbot — AI Drive Jurídico (Agente Revisor de Defesas Trabalhistas)  
**Fonte de skills:** [skills.sh](https://skills.sh)  
**Referência:** [SPEC-AI-DRIVE-JURIDICO.md](./SPEC-AI-DRIVE-JURIDICO.md), [AGENTS.md](../AGENTS.md)

---

## 1. Mapeamento do projeto

### 1.1 Estrutura e finalidade

| Dimensão | Detalhe |
|----------|---------|
| **Nome / produto** | AI Drive Jurídico — plataforma de document intelligence para advogados e equipas jurídicas. |
| **Stack** | Next.js 16 (App Router), React 19, Vercel AI SDK, AI Gateway, PostgreSQL (Supabase/Neon), Drizzle ORM, Auth.js v5, Vercel Blob / Supabase Storage, Ultracite (Biome). |
| **Finalidade** | Chat com agente especializado (Revisor de Defesas Trabalhistas), base de conhecimento injetada no prompt, ferramentas (createDocument, updateDocument, sugestões), histórico, upload de ficheiros, fluxo GATE-1 → FASE A → GATE 0.5 → FASE B → 3 DOCX. |
| **Pastas relevantes** | `app/(chat)/`, `app/(auth)/`, `lib/ai/`, `lib/db/`, `components/`, `scripts/`, `.agents/skills/`. |

### 1.2 Agentes e fluxos principais

- **Agente principal:** instruções em `lib/ai/agent-revisor-defesas.ts` → `AGENTE_REVISOR_DEFESAS_INSTRUCTIONS`, injetadas no system prompt em `app/(chat)/api/chat/route.ts`.
- **Fluxos:** (1) chat em streaming com LLM e tools, (2) seleção de documentos da base de conhecimento (`knowledgeDocumentIds`), (3) autenticação e modo visitante, (4) persistência de mensagens/chats (Drizzle/Postgres), (5) upload e extração de texto (PI/Contestação), (6) validação GATE-1 / GATE 0.5 e geração dos 3 DOCX.
- **Uso de LLM:** `streamText`, tools (createDocument, updateDocument, requestSuggestions, getWeather), system prompt com knowledge context e agent instructions opcionais.
- **Integrações:** Vercel AI Gateway, Supabase (Auth, Storage, Postgres), Vercel Blob (opcional), Redis (opcional, rate limit).

### 1.3 Necessidades de capabilities (derivadas da spec e do código)

| Área | Necessidades |
|------|--------------|
| **Core** | Descoberta de skills (find-skills), criação de skills e documentação (skill-creator). |
| **Dev** | Next.js (convenções, RSC, cache, upgrade), React (hooks, performance), Postgres/Supabase, debugging, testes E2E/UI, UI/a11y. |
| **IA / Agents** | AI SDK (streamText, useChat, tools, embeddings), prompt engineering, RAG (evolução da base de conhecimento), contexto do Revisor de Defesas. |
| **Product** | Opcional: copy, marketing-psychology para materiais ou onboarding. |
| **Ops** | Opcional: docker, security, performance. |

---

## 2. Skills instaladas (estado atual)

Todas em `.agents/skills/`. Instalação via `npx skills add <repo> --skill <nome> -a cursor -y`.

### 2.1 Lista completa

| # | Skill | Repositório | Categoria lógica |
|---|-------|-------------|-------------------|
| 1 | find-skills | vercel-labs/skills | Core |
| 2 | skill-creator | anthropics/skills | Core |
| 3 | next-best-practices | vercel-labs/next-skills | Dev |
| 4 | next-cache-components | vercel-labs/next-skills | Dev |
| 5 | next-upgrade | vercel-labs/next-skills | Dev |
| 6 | vercel-react-best-practices | vercel-labs/agent-skills | Dev |
| 7 | web-design-guidelines | vercel-labs/agent-skills | Dev |
| 8 | supabase-postgres-best-practices | supabase/agent-skills | Dev |
| 9 | systematic-debugging | obra/superpowers | Dev |
| 10 | webapp-testing | anthropics/skills | Dev |
| 11 | ai-sdk | vercel/ai | IA |
| 12 | prompt-engineering-patterns | wshobson/agents | IA |
| 13 | rag-implementation | wshobson/agents | IA |
| 14 | revisor-defesas-context | (interno) | IA / domínio |

**Estado:** ✅ 14 skills instaladas e disponíveis para Cursor (e outros agentes configurados pelo CLI).

### 2.2 Resumo por categoria

- **Core:** 2 (find-skills, skill-creator)
- **Dev:** 8 (next-*, vercel-react-*, web-design-*, supabase-*, systematic-debugging, webapp-testing)
- **IA:** 4 (ai-sdk, prompt-engineering-patterns, rag-implementation, revisor-defesas-context)
- **Product:** 0 instaladas
- **Ops:** 0 instaladas

---

## 3. Lacunas cobertas nesta revisão (skills que estavam faltantes e foram instaladas)

| Skill | Repositório | Motivo |
|-------|-------------|--------|
| **prompt-engineering-patterns** | wshobson/agents | Melhorar system prompt e instruções do agente revisor (padrões, estrutura). |
| **rag-implementation** | wshobson/agents | Alinhado à evolução RAG em `lib/ai/knowledge-base.md` (chunking, embeddings, busca por similaridade). |
| **webapp-testing** | anthropics/skills | Projeto já usa Playwright; skill para testes E2E/UI. |
| **next-upgrade** | vercel-labs/next-skills | Migrações entre versões do Next.js (upgrade seguro). |

---

## 4. Skills recomendadas adicionais (opcionais)

| Skill | Repositório | Motivo |
|-------|-------------|--------|
| **e2e-testing-patterns** | wshobson/agents | Padrões avançados de E2E (complementar webapp-testing). |
| **postgresql-table-design** / **sql-optimization-patterns** | wshobson/agents | Complementar supabase-postgres para desenho de tabelas e otimização SQL. |
| **copywriting** | coreyhaines31/marketingskills | Copy para UI, onboarding ou materiais do produto. |
| **docker-expert** | (skills.sh ou antigravity-awesome-skills) | Ops/local e containerização, se necessário. |

Instalação (exemplo):

```bash
npx skills add wshobson/agents --skill e2e-testing-patterns -a cursor -y
npx skills add wshobson/agents --skill postgresql-table-design -a cursor -y
```

---

## 5. Melhorias de arquitetura sugeridas

### 5.1 Organização

- **Feito:** Skills instaladas em `.agents/skills/` (padrão Cursor/skills.sh). Documentação em `.agents/README.md` e `.agents/SKILLS_ARCHITECTURE.md` com categorias lógicas **core / dev / ai / product / ops**.
- **Estrutura física:** Mantida plana em `.agents/skills/` (sem subpastas core/dev/ai) para compatibilidade com `npx skills list` e Cursor; o mapeamento lógico está na documentação.
- **Recomendação:** Manter uma única fonte de verdade em `.agents/skills/`; não duplicar skills noutras pastas.

### 5.2 Redundâncias

- Nenhuma redundância entre as 14 skills (cada uma cobre um domínio distinto).
- **web-design-guidelines** e **vercel-react-best-practices** podem sobrepor-se em temas de UI; ambos mantidos (um foca design/a11y, outro em padrões React).

### 5.3 Upgrades e manutenção

- Executar periodicamente `npx skills check` e `npx skills update` para manter versões alinhadas aos repositórios upstream.
- **next-upgrade** deve ser usado quando for planeada uma subida de versão do Next.js.

---

## 6. Próximas otimizações possíveis

### 6.1 Automações

- **CI:** O workflow `.github/workflows/skills-check.yml` executa `pnpm run skills:check` em cada push em `main` e semanalmente (segunda 09:00 UTC). Por defeito não falha o job quando há atualizações (`continue-on-error: true`); para falhar em atualizações disponíveis, remover `continue-on-error` desse step.
- **Onboarding:** Manter no README ou em docs a secção “Skills do projeto” com link para `.agents/README.md` e comando `npx skills list`.

### 6.2 Agentes especializados

- O projeto tem um “agente de domínio” (Revisor de Defesas) via system prompt. As skills do skills.sh melhoram o **agente de código** (Cursor); não substituem as instruções em `lib/ai/agent-revisor-defesas.ts`.
- **revisor-defesas-context** é a skill interna que dá contexto a quem altera o revisor; **prompt-engineering-patterns** e **rag-implementation** apoiam evoluções de prompt e RAG.

### 6.3 Performance e RAG

- A base de conhecimento atual injeta documentos completos no prompt; `lib/ai/knowledge-base.md` descreve a evolução para RAG com embeddings e inclui a secção **“Skills para implementação RAG”**, referenciando **ai-sdk** e **rag-implementation**.
- Ao implementar RAG (Fase 2 do roadmap), usar as skills **rag-implementation** e **ai-sdk**; ver também [PLANO-PROXIMOS-PASSOS.md § Curto prazo](PLANO-PROXIMOS-PASSOS.md).
- **supabase-postgres-best-practices** cobre índices e padrões de queries; opcionalmente **postgresql-table-design** para desenho de tabelas (ex.: `knowledge_chunk` para RAG).

### 6.4 Upgrade Next.js

- Ao planear ou executar upgrade do Next.js, usar a skill **next-upgrade** (ver [docs/next-upgrade.md](next-upgrade.md)).

### 6.5 Referências externas

- [skills.sh](https://skills.sh) — diretório de skills (instalação: `npx skills add <owner/repo> --skill <nome> -a cursor -y`).
- [antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills) — coleção ampla de skills (formato compatível; instalação pode ser por path ou clone em `.cursor/skills` conforme ferramenta).

---

## 7. Resumo executivo

| Item | Estado |
|------|--------|
| **Skills instaladas** | 14 (core: 2, dev: 8, ai: 4). |
| **Skills instaladas nesta revisão** | prompt-engineering-patterns, rag-implementation, webapp-testing, next-upgrade. |
| **Skills recomendadas adicionais (opcionais)** | e2e-testing-patterns, postgresql-table-design, copywriting, docker-expert. |
| **Arquitetura** | Documentada em `.agents/README.md` e `.agents/SKILLS_ARCHITECTURE.md` com categorias e mapa de uso por tarefa. |
| **Duplicações** | Nenhuma. |
| **Próximos passos** | `npx skills update` periódico; usar next-upgrade em upgrades Next.js; considerar skills opcionais conforme prioridade de produto e ops. |

---

*Relatório gerado no âmbito da análise de arquitetura de agentes e skills para o projeto Chatbot (AI Drive Jurídico).*
