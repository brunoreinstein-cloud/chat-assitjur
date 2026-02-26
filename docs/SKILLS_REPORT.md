# Relatório: Arquitetura de Skills e Lacunas

**Data:** 2026-02-26  
**Projeto:** Chatbot (Agente Revisor de Defesas Trabalhistas)  
**Fonte de skills:** [skills.sh](https://skills.sh)

---

## 1. Mapeamento do projeto

### 1.1 Estrutura e finalidade

- **Stack:** Next.js 16 (App Router), React 19, Vercel AI SDK, AI Gateway, PostgreSQL (Supabase/Neon), Drizzle ORM, Auth.js, Vercel Blob / Supabase Storage.
- **Finalidade:** Chatbot com agente especializado (Revisor de Defesas Trabalhistas), base de conhecimento injetada no prompt, ferramentas (clima, documento, sugestões), histórico e upload de ficheiros.
- **Pastas relevantes:** `app/(chat)/`, `app/(auth)/`, `lib/ai/`, `lib/db/`, `components/`, `scripts/`.

### 1.2 Agentes e fluxos

- **Agente principal:** instruções em `lib/ai/agent-revisor-defesas.ts`, injetadas no system prompt em `app/(chat)/api/chat/route.ts`.
- **Fluxos principais:** (1) chat em streaming com LLM e tools, (2) seleção de documentos da base de conhecimento, (3) autenticação e gestão de sessão, (4) persistência de mensagens e chats (Drizzle/Postgres).
- **Uso de LLM:** `streamText`, tools (createDocument, updateDocument, getWeather, requestSuggestions), system prompt com knowledge context e agent instructions.
- **Integrações:** Vercel AI Gateway, Supabase (Auth, Storage, Postgres), Vercel Blob (opcional), Redis (opcional, rate limit).

### 1.3 Lacunas identificadas (antes das skills)

- Pouco suporte estruturado para **Next.js 16** e **App Router** nas respostas do agente.
- Falta de referência explícita a **AI SDK** (streamText, useChat, tools) na documentação do agente.
- Sem skills de **Postgres/Supabase** para revisão de queries e schema.
- Sem skill para **descoberta e instalação de novas skills** (find-skills).
- Sem skill para **criação de skills** (skill-creator) para documentar processos internos.

---

## 2. Skills instaladas

Todas instaladas com `npx skills add <repo> --skill <nome> -a cursor -y`. Localização física: `.agents/skills/`.

| # | Skill | Repositório | Categoria lógica |
|---|-------|-------------|-------------------|
| 1 | find-skills | vercel-labs/skills | Core |
| 2 | skill-creator | anthropics/skills | Core |
| 3 | next-best-practices | vercel-labs/next-skills | Dev |
| 4 | next-cache-components | vercel-labs/next-skills | Dev |
| 5 | vercel-react-best-practices | vercel-labs/agent-skills | Dev |
| 6 | web-design-guidelines | vercel-labs/agent-skills | Dev |
| 7 | supabase-postgres-best-practices | supabase/agent-skills | Dev |
| 8 | ai-sdk | vercel/ai | IA |
| 9 | systematic-debugging | obra/superpowers | Dev |

**Estado:** ✅ Todas instaladas e disponíveis para Cursor (e outros agentes configurados pelo CLI).

---

## 3. Skills recomendadas adicionais

Com base no stack e nos fluxos, estas skills são **opcionais** mas úteis:

| Skill | Repositório | Motivo |
|-------|-------------|--------|
| **next-upgrade** | vercel-labs/next-skills | Migrações entre versões do Next.js (slash command `/next-upgrade`). |
| **prompt-engineering-patterns** | wshobson/agents | Melhorar system prompt e instruções do agente revisor. |
| **postgresql-table-design** / **sql-optimization-patterns** | wshobson/agents | Complementar supabase-postgres para desenho de tabelas e otimização SQL. |
| **webapp-testing** | anthropics/skills | Testes E2E/UI (o projeto já usa Playwright). |
| **documentation-writer** | (se existir em skills.sh) | Documentação consistente (AGENTS.md, README, docs). |

**Instalação sugerida (exemplo):**

```bash
npx skills add vercel-labs/next-skills --skill next-upgrade -a cursor -y
npx skills add wshobson/agents --skill prompt-engineering-patterns -a cursor -y
```

---

## 4. Melhorias de arquitetura sugeridas

### 4.1 Organização

- **Feito:** Skills instaladas em `.agents/skills/` (padrão Cursor). Documentação em `.agents/README.md` e `.agents/SKILLS_ARCHITECTURE.md` com categorias core/dev/ai/product/ops.
- **Sugestão:** Manter uma única fonte de verdade em `.agents/skills/`; não duplicar skills noutras pastas para evitar inconsistências.

### 4.2 Redundâncias

- Nenhuma redundância entre as skills instaladas (cada uma cobre um domínio distinto).
- **web-design-guidelines** e **vercel-react-best-practices** podem sobrepor-se em temas de UI; ambos foram mantidos porque um foca design/a11y e o outro em padrões React.

### 4.3 Upgrades

- Executar periodicamente `npx skills check` e `npx skills update` para manter versões alinhadas com os repositórios upstream.
- Considerar adicionar **next-upgrade** quando for planeada uma subida de versão do Next.js.

---

## 5. Próximas otimizações possíveis

### 5.1 Automações

- **CI:** Script ou job que rode `npx skills check` e falhe se houver atualizações críticas (opcional).
- **Onboarding:** Incluir no README ou em docs a secção “Skills do projeto” com link para `.agents/README.md` e comando `npx skills list`.

### 5.2 Agentes especializados

- O projeto já tem um “agente de domínio” (Revisor de Defesas) via system prompt. As skills do skills.sh melhoram o **agente de código** (Cursor); não substituem as instruções em `lib/ai/agent-revisor-defesas.ts`.
- Possível evolução: skills customizadas no repositório (ex.: `skills/revisor-defesas-context.md`) referenciando jurisprudência ou checklist do revisor; instaláveis com `npx skills add ./skills` se seguirem o formato SKILL.md.

### 5.3 Performance e RAG

- A base de conhecimento atual injeta documentos completos no prompt; `lib/ai/knowledge-base.md` descreve a evolução para RAG com embeddings. A skill **ai-sdk** cobre `embed` e uso do AI SDK para esse tipo de fluxo.
- Nenhuma skill adicional obrigatória para “performance” foi instalada; **supabase-postgres-best-practices** já cobre índices e padrões de queries.

---

## 6. Resumo executivo

| Item | Estado |
|------|--------|
| **Skills instaladas** | 9 (core: 2, dev: 6, ai: 1). |
| **Skills recomendadas adicionais** | next-upgrade, prompt-engineering-patterns, opcionalmente sql/postgres e webapp-testing. |
| **Arquitetura** | Documentada em `.agents/README.md` e `.agents/SKILLS_ARCHITECTURE.md` com categorias e mapa de uso. |
| **Duplicações** | Nenhuma. |
| **Próximos passos** | `npx skills update` periódico; considerar next-upgrade e prompt-engineering-patterns; opcionalmente skill customizada para o revisor de defesas. |

---

*Relatório gerado no âmbito da análise de arquitetura de agentes e skills para o projeto Chatbot.*
