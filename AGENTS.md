# AGENTS.md — Guia para agentes de IA

Este documento orienta agentes de IA (Cursor, Codex, etc.) a trabalhar neste repositório de forma consistente com a stack, convenções e regras do projeto.

---

## Visão geral do projeto

- **Nome:** Chatbot (template Next.js + AI SDK).
- **Domínio:** Agente Revisor de Defesas Trabalhistas (auditor jurídico sênior — contencioso trabalhista). As instruções padrão do agente estão em `lib/ai/agent-revisor-defesas.ts` e são injetadas no system prompt quando o usuário não envia "Instruções do agente".
- **Funcionalidades principais:** chat com LLM (streaming), histórico de conversas, base de conhecimento (documentos injetados no contexto), ferramentas (clima, criar/atualizar documento, sugestões), autenticação, upload de ficheiros (Vercel Blob ou Supabase Storage).

---

## Stack e ferramentas

| Área        | Tecnologia |
|------------|------------|
| Framework  | Next.js 16 (App Router), React 19 |
| IA         | Vercel AI SDK, AI Gateway (xAI/OpenAI/etc.) |
| Base de dados | PostgreSQL (Supabase/Neon), Drizzle ORM |
| Auth       | Auth.js (NextAuth) v5 beta |
| Storage    | Vercel Blob ou Supabase Storage |
| Lint/Format | Ultracite (Biome) |
| Package manager | pnpm |
| Deploy     | Vercel (recomendado) |

---

## Estrutura relevante

```
app/
  (auth)/          # rotas e layout de autenticação
  (chat)/          # chat UI, API /api/chat
  api/             # outras APIs (ex.: knowledge)
lib/
  ai/              # prompts, providers, tools, agent-revisor-defesas, knowledge-base.md
  db/              # schema Drizzle, queries, migrate, supabase-types
  artifacts/       # artefactos do editor (server)
  editor/          # config do editor
  supabase/        # cliente e server Supabase
  errors.ts, types.ts, utils.ts, constants.ts
components/        # UI (chat, sidebar, etc.)
scripts/           # db-ping, db-tables, supabase-env
```

**Ficheiros críticos para o chat e agente:**

- `app/(chat)/api/chat/route.ts` — handler do POST do chat (streaming, system prompt, tools, knowledge).
- `lib/ai/prompts.ts` — `systemPrompt()` e dicas de pedido.
- `lib/ai/agent-revisor-defesas.ts` — instruções do Agente Revisor (export `AGENTE_REVISOR_DEFESAS_INSTRUCTIONS`).
- `lib/ai/knowledge-base.md` — documentação da base de conhecimento e evolução RAG.
- `lib/db/queries.ts` — funções como `getKnowledgeDocumentsByIds`, `getMessagesByChatId`, `saveChat`, etc.

---

## Regras e convenções (obrigatórias)

O projeto usa **Ultracite** (regras em `.cursor/rules/ultracite.mdc`). Ao editar código:

1. **TypeScript:** sem `any`, sem `@ts-ignore`, usar `import type`/`export type` para tipos.
2. **Acessibilidade:** seguir as regras a11y do Ultracite (labels, roles, teclado, etc.).
3. **React/JSX:** hooks no top-level, keys em listas, sem `children` + `dangerouslySetInnerHTML`.
4. **Qualidade:** sem `console` em código de produção, tratar erros de forma explícita, usar `===`/`!==`.
5. **Next.js:** não usar `<img>` (usar componente do Next.js), não importar `next/document` fora de `_document`.

Comandos úteis:

- `pnpm run format` ou `npx ultracite fix` — formatar e corrigir.
- `pnpm run lint` ou `npx ultracite check` — verificar sem alterar.

---

## Variáveis de ambiente

Referência em `.env.example`. Principais:

- `AUTH_SECRET` — Auth.js.
- `AI_GATEWAY_API_KEY` — obrigatório em ambientes não-Vercel.
- `POSTGRES_URL` — connection string PostgreSQL (Supabase/Neon).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase (Auth, Storage).
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob (alternativa ao Storage).
- `REDIS_URL` — opcional, para rate limiting.

Não hardcodar segredos; usar sempre variáveis de ambiente.

---

## Base de conhecimento

- **Tabela:** `KnowledgeDocument` (id, userId, title, content, createdAt).
- **APIs:** `GET/POST/DELETE /api/knowledge`; `GET /api/knowledge?ids=...` para buscar por ids.
- **Chat:** o cliente pode enviar `knowledgeDocumentIds` no body do `POST /api/chat`. O servidor busca os documentos, concatena título e conteúdo e injeta no system prompt em "Base de conhecimento".
- **UI:** botão "Base de conhecimento" no header do chat (máx. 20 documentos). Limitação atual: todo o conteúdo vai no prompt; para RAG/embeddings ver `lib/ai/knowledge-base.md`.

---

## Comandos úteis

```bash
pnpm install
pnpm dev              # dev em http://localhost:3300 (--turbo)
pnpm build            # tsx lib/db/migrate && next build
pnpm db:migrate       # aplicar migrações
pnpm db:studio        # Drizzle Studio
pnpm db:push          # drizzle-kit push
pnpm run format       # Ultracite fix
pnpm run lint         # Ultracite check
pnpm run vercel:env   # puxar env da Vercel
pnpm test             # Playwright E2E (PLAYWRIGHT=True)
```

---

## O que agentes devem fazer

- **Antes de editar:** analisar padrões existentes no módulo e respeitar Ultracite e a11y.
- **Ao alterar APIs:** manter compatibilidade com o cliente (ex.: schema do body em `app/(chat)/api/chat/schema.ts`).
- **Ao alterar o agente ou prompts:** verificar `lib/ai/agent-revisor-defesas.ts` e `lib/ai/prompts.ts` e o uso em `route.ts`.
- **Ao tocar em DB:** usar Drizzle e migrations; não alterar `lib/db/schema.ts` sem gerar/migrar.
- **Idioma:** o produto e a documentação interna estão em português; comentários e commits podem seguir o mesmo critério.

---

## Skills (skills.sh)

O projeto tem **Agent Skills** instaladas em `.agents/skills/` (ecossistema [skills.sh](https://skills.sh)): Next.js, React, AI SDK, Supabase/Postgres, debugging, find-skills, skill-creator, web-design. Lista e categorias em [.agents/README.md](.agents/README.md); arquitetura lógica em [.agents/SKILLS_ARCHITECTURE.md](.agents/SKILLS_ARCHITECTURE.md). Relatório completo: [docs/SKILLS_REPORT.md](docs/SKILLS_REPORT.md).

Comandos: `npx skills list` | `npx skills find [query]` | `npx skills update`.

---

## Referências rápidas

- [AI SDK](https://sdk.vercel.ai/docs/introduction)
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Supabase](https://supabase.com/docs)
- [Auth.js](https://authjs.dev)
- Ultracite: `npx ultracite init | fix | check`
