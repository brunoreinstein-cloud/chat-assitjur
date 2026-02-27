# Arquitetura de skills — Mapa lógico

As skills físicas vivem em `.agents/skills/`. Este documento agrupa-as por **categoria lógica** e indica dependências e uso recomendado por tipo de tarefa.

## Estrutura lógica (core / dev / ai / product / ops)

```
skills (físico: .agents/skills/)
├── core/          → find-skills, skill-creator
├── dev/           → next-*, vercel-react-*, web-design-*, supabase-*, systematic-debugging
├── ai/             → ai-sdk, revisor-defesas-context
├── product/       → (nenhuma instalada; opcional: copywriting, marketing-psychology)
└── ops/            → (nenhuma instalada; opcional: docker-expert, security)
```

## Mapa por categoria

### Core (análise e capacitação do próprio agente)

| Skill | Quando usar |
|-------|-------------|
| **find-skills** | Utilizador pergunta "como fazer X", "existe skill para...", "encontrar skill". |
| **skill-creator** | Criar ou atualizar uma skill (SKILL.md, YAML, instruções). |

### Dev (desenvolvimento fullstack)

| Skill | Quando usar |
|-------|-------------|
| **next-best-practices** | Código Next.js: App Router, RSC, route handlers, async, erro, metadata. |
| **next-cache-components** | Cache Components (Next 16), PPR, `use cache`, cacheLife, cacheTag. |
| **vercel-react-best-practices** | Componentes React, hooks, re-renders, SWR, serialização. |
| **web-design-guidelines** | UI/UX, acessibilidade, design de interfaces. |
| **supabase-postgres-best-practices** | Queries Postgres, schema, índices, RLS, Supabase. |
| **systematic-debugging** | Investigar bugs de forma estruturada (hipóteses, reprodução, isolamento). |

### IA (agentes e LLM)

| Skill | Quando usar |
|-------|-------------|
| **ai-sdk** | AI SDK (generateText, streamText, useChat), tools, embeddings, providers, chatbots, RAG. |
| **revisor-defesas-context** | Alterar prompts, fluxo ou documentação do Agente Revisor de Defesas Trabalhistas; checklist e jurisprudência. |

### Product (opcional, não instaladas)

- **copywriting** (coreyhaines31/marketingskills)
- **marketing-psychology** (coreyhaines31/marketingskills)

### Ops (opcional, não instaladas)

- **docker-expert** (sickn33/antigravity-awesome-skills)
- **security-requirement-extraction** (wshobson/agents)

## Dependências entre skills

- **next-best-practices** e **vercel-react-best-practices** complementam-se (Next + React).
- **ai-sdk** é independente; usar sempre que o código tocar em `lib/ai/`, chat ou tools.
- **supabase-postgres-best-practices** aplica-se a `lib/db/`, migrations e queries.
- **skill-creator** e **find-skills** não dependem de outras skills do projeto.

## Recomendação por agente / tarefa

| Tarefa | Skills mais relevantes |
|--------|-------------------------|
| Alterar rotas, layout ou API Next.js | next-best-practices |
| Alterar componentes React ou hooks | vercel-react-best-practices |
| Alterar chat, prompts ou tools de IA | ai-sdk |
| Alterar schema ou queries Postgres | supabase-postgres-best-practices |
| Debugar erros ou comportamento estranho | systematic-debugging |
| Criar nova skill ou documentar processo | skill-creator, find-skills |
| Melhorar UI/UX ou acessibilidade | web-design-guidelines |

## Atualização

Manter skills atualizadas:

```bash
npx skills check
npx skills update
```

Evitar duplicar skills: instalar uma vez por projeto e usar `npx skills list` para confirmar.
