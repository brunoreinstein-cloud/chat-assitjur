# Skills do projeto (skills.sh)

Este projeto usa **Agent Skills** do ecossistema [skills.sh](https://skills.sh) para estender as capacidades dos agentes de IA (Cursor, Codex, etc.). As skills estão instaladas em `.agents/skills/` e são aplicadas automaticamente quando relevantes.

## Skills instaladas

| Skill | Categoria | Fonte | Descrição |
|-------|------------|-------|-----------|
| `find-skills` | Core | vercel-labs/skills | Descobrir e instalar skills quando o utilizador pedir "como fazer X" ou "encontrar skill para X". |
| `skill-creator` | Core | anthropics/skills | Guia para criar novas skills (SKILL.md, frontmatter, instruções). |
| `next-best-practices` | Dev | vercel-labs/next-skills | Next.js: convenções de ficheiros, RSC, dados, async, route handlers, erro, imagem/font. |
| `next-cache-components` | Dev | vercel-labs/next-skills | Next.js 16 Cache Components, PPR, `use cache`, cacheLife, cacheTag. |
| `next-upgrade` | Dev | vercel-labs/next-skills | Migrações entre versões do Next.js (upgrade seguro). |
| `vercel-react-best-practices` | Dev | vercel-labs/agent-skills | React: hooks, re-renders, SWR, serialização, bundle. |
| `web-design-guidelines` | Dev | vercel-labs/agent-skills | Diretrizes de design e acessibilidade para UI web. |
| `supabase-postgres-best-practices` | Dev | supabase/agent-skills | Postgres/Supabase: performance, índices, RLS, transações, schema. |
| `systematic-debugging` | Dev | obra/superpowers | Debug sistemático (hipóteses, reprodução, isolamento). |
| `webapp-testing` | Dev | anthropics/skills | Testes E2E/UI para web apps (Playwright, etc.). |
| `ai-sdk` | IA | vercel/ai | Vercel AI SDK: generateText, streamText, useChat, tools, embeddings, providers. |
| `prompt-engineering-patterns` | IA | wshobson/agents | Padrões para system prompt e instruções de agentes. |
| `rag-implementation` | IA | wshobson/agents | Implementação de RAG (chunking, embeddings, busca por similaridade). |
| `revisor-defesas-context` | IA / domínio | (interno) | Contexto e checklist do Revisor de Defesas Trabalhistas; uso ao alterar prompts ou fluxo do revisor. |

## Comandos úteis

```bash
# Listar skills instaladas
npx skills list

# Procurar skills no diretório skills.sh
npx skills find [query]

# Instalar uma skill (ex.: next-upgrade)
npx skills add vercel-labs/next-skills --skill next-upgrade -a cursor -y

# Atualizar todas as skills
npx skills update

# Verificar atualizações disponíveis
npx skills check

# Remover uma skill
npx skills remove <nome-skill>
```

**Nota sobre `npx skills check`:** A mensagem *"Could not check 1 skill(s) (may need reinstall)"* é esperada. A skill **revisor-defesas-context** é interna ao projeto (não vem de um repositório remoto), por isso o CLI não consegue verificar atualizações para ela. As restantes skills, instaladas via skills.sh, são verificadas normalmente. Pode ignorar esse aviso para essa skill.

## Onde as skills são usadas

- **Cursor:** as skills em `.agents/skills/` são carregadas pelo Cursor. Ver [documentação Cursor Skills](https://cursor.com/docs/context/skills).
- **Escopo:** instalação ao nível do **projeto** (não global), para partilhar com a equipa via git.

## Arquitetura lógica

A organização lógica (core / dev / ai / product / ops) e o mapa de dependências estão em [SKILLS_ARCHITECTURE.md](./SKILLS_ARCHITECTURE.md).

## Relatório completo

Análise do projeto, skills necessárias, instaladas e recomendadas adicionais: [docs/SKILLS_REPORT.md](../docs/SKILLS_REPORT.md).
