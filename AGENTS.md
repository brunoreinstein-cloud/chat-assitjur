# AGENTS.md — Guia para agentes de IA

Este documento orienta agentes de IA (Cursor, Codex, etc.) a trabalhar neste repositório de forma consistente com a stack, convenções e regras do projeto.

---

## Visão geral do projeto

- **Nome:** Chatbot (template Next.js + AI SDK).
- **Domínio:** Agente Revisor de Defesas Trabalhistas (auditor jurídico sênior — contencioso trabalhista). As instruções padrão do agente estão em `lib/ai/agent-revisor-defesas.ts` e são injetadas no system prompt quando o usuário não envia "Instruções do agente".
- **Funcionalidades principais:** chat com LLM (streaming), histórico de conversas, base de conhecimento (documentos injetados no contexto), ferramentas (clima, criar/atualizar documento, sugestões), autenticação, **modo visitante (guest)** para usar o chat sem conta, upload de ficheiros (Vercel Blob ou Supabase Storage). A página **/ajuda** descreve o projeto e as funcionalidades para o utilizador final.

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
- `lib/ai/agent-redator-contestacao.ts` — instruções do Agente Redator de Contestações v4.0 (modo Modelo e modo @bancodetese).
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
- `POSTGRES_URL` — connection string PostgreSQL (Supabase/Neon). Em Vercel e em E2E usar **pooler (porta 6543)** para maior estabilidade; a app aquece a BD ao carregar o chat (`DbWarmup` → GET /api/health/db). Para testes E2E estáveis: `pnpm run test:with-warmup` (aquecer BD antes) e ver `docs/DB-TIMEOUT-TROUBLESHOOTING.md`.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase (Auth, Storage).
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob (alternativa ao Storage).
- `REDIS_URL` — opcional, para rate limiting.
- `ADMIN_CREDITS_SECRET` — chave para aceder ao painel administrativo (agentes built-in, créditos). Ver secção abaixo.
- `PROMPT_CACHING_ENABLED` — opcional (default: true). Desativar prompt caching Anthropic: `false`.
- `PROMPT_CACHING_TTL` — opcional (`5m` ou `1h`). TTL do cache; `1h` custa mais na escrita, útil para pausas longas.

Não hardcodar segredos; usar sempre variáveis de ambiente.

---

## Painel administrativo

- **Rota:** `/admin/agents` (link na sidebar: "Administração — Agentes built-in").
- **Função:** listar e editar instruções e etiquetas dos agentes built-in (Revisor de Defesas, Redator de Contestações, AssistJur Master). As alterações aplicam-se a todos os utilizadores.
- **Acesso:** a página exige uma **chave de administrador**. Quem tiver essa chave pode ver a lista e editar; as APIs admin rejeitam pedidos sem o header `x-admin-key` correto.

**Como criar/configurar a senha de acesso:**

1. **Definir o valor da chave** na variável de ambiente `ADMIN_CREDITS_SECRET`:
   - **Local:** em `.env.local` (não commitar): `ADMIN_CREDITS_SECRET=uma-string-secreta-forte`
   - **Produção (Vercel):** em Settings → Environment Variables: criar `ADMIN_CREDITS_SECRET` com o mesmo valor.
2. **Gerar uma chave segura** (recomendado): `openssl rand -base64 32` ou [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32).
3. Na página `/admin/agents`, no campo "Chave de administrador", introduzir **exatamente** o valor definido em `ADMIN_CREDITS_SECRET` e clicar em "Aceder".

**APIs protegidas pela mesma chave:** `GET/POST /api/admin/credits` (listar utilizadores com saldo, adicionar créditos). Ver [docs/SPEC-CREDITOS-LLM.md](docs/SPEC-CREDITOS-LLM.md).

Se `ADMIN_CREDITS_SECRET` não estiver definido no servidor, todas as requisições às rotas admin devolvem 401 Unauthorized.

---

## Base de conhecimento

- **Comum a todos os agentes:** Revisor de Defesas, Redator de Contestações, etc. Usar para @bancodetese (teses, precedentes) ou outros contextos (cláusulas, jurisprudência, etc.). O agente **Redator de Contestações** opera em modo Modelo (template) ou modo **@bancodetese** (montagem por teses do banco).
- **Tabela:** `KnowledgeDocument` (id, userId, title, content, createdAt).
- **APIs:** `GET/POST/DELETE /api/knowledge`; `GET /api/knowledge?ids=...` para buscar por ids.
- **Chat:** o cliente pode enviar `knowledgeDocumentIds` no body do `POST /api/chat`. O servidor busca os documentos, concatena título e conteúdo e injeta no system prompt em "Base de conhecimento".
- **UI:** botão "Base de conhecimento" no header do chat (máx. 50 documentos). Limitação atual: todo o conteúdo vai no prompt; para RAG/embeddings ver `lib/ai/knowledge-base.md`.

---

## Comandos úteis

```bash
pnpm install
pnpm dev              # dev em http://localhost:3300 (--turbo)
pnpm run prebuild     # lint + test:unit (corre antes do build)
pnpm build            # prebuild → migrate → next build
pnpm run prepush      # alias de build; usar antes de push para evitar falha no deploy
pnpm db:migrate       # aplicar migrações
pnpm db:studio        # Drizzle Studio
pnpm db:push          # drizzle-kit push
pnpm run format       # Ultracite fix
pnpm run lint         # Ultracite check
pnpm run vercel:env   # puxar env da Vercel
pnpm test             # Playwright E2E (inicia dev:test na porta 3301)
pnpm run test:with-warmup # E2E com BD aquecida (db:ping + test); recomendado para maior estabilidade local
pnpm run test:with-dev # E2E usando servidor já a correr (pnpm dev em 3300); evita "Unable to acquire lock"
pnpm run test:unit    # Vitest (unitários)
```

Deploy na Vercel: [docs/vercel-setup.md](docs/vercel-setup.md) (checklist, env, migrações) e [docs/vercel-cli.md](docs/vercel-cli.md).

---

## O que agentes devem fazer

- **Antes de editar:** analisar padrões existentes no módulo e respeitar Ultracite e a11y.
- **Ao alterar APIs:** manter compatibilidade com o cliente (ex.: schema do body em `app/(chat)/api/chat/schema.ts`).
- **Ao alterar o agente ou prompts:** verificar `lib/ai/agent-revisor-defesas.ts` e `lib/ai/prompts.ts` e o uso em `route.ts`.
- **Ao tocar em DB:** usar Drizzle e migrations; não alterar `lib/db/schema.ts` sem gerar/migrar.
- **Idioma:** o produto e a documentação interna estão em português; comentários e commits podem seguir o mesmo critério.

---

## Skills (skills.sh)

O projeto tem **Agent Skills** instaladas em `.agents/skills/` (ecossistema [skills.sh](https://skills.sh)): Next.js (best-practices, cache-components, upgrade), React, AI SDK, Supabase/Postgres, debugging, webapp-testing, find-skills, skill-creator, web-design, prompt-engineering-patterns, rag-implementation, revisor-defesas-context. Lista e categorias em [.agents/README.md](.agents/README.md); arquitetura lógica em [.agents/SKILLS_ARCHITECTURE.md](.agents/SKILLS_ARCHITECTURE.md). Relatório completo: [docs/SKILLS_REPORT.md](docs/SKILLS_REPORT.md).

Comandos: `npx skills list` | `npx skills find [query]` | `npx skills update`.

---

## Documentação do produto (Revisor de Defesas)

- **[docs/PROJETO-REVISOR-DEFESAS.md](docs/PROJETO-REVISOR-DEFESAS.md)** — Documentação completa do Agente Revisor: o que é, stack, arquitetura do agente, fluxo (GATE-1 → FASE A → GATE 0.5 → FASE B), API, base de conhecimento, formato dos 3 DOCX, UX/UI, env e comandos.
- **[docs/SPEC-AI-DRIVE-JURIDICO.md](docs/SPEC-AI-DRIVE-JURIDICO.md)** — Spec completa do produto "AI Drive Jurídico": visão, personas, domínios jurídicos, capacidades, arquitetura, segurança, UX, roadmap e métricas.
- **[docs/AGENTES-IA-PERSONALIZADOS.md](docs/AGENTES-IA-PERSONALIZADOS.md)** — Agentes de IA personalizados: agentes pré-definidos (Revisor, Redator de Contestações), instruções customizadas e base de conhecimento; referência técnica e evolução futura.
- **[docs/PLANO-PROXIMOS-PASSOS.md](docs/PLANO-PROXIMOS-PASSOS.md)** — Plano de próximos passos: tarefas imediatas (ex.: prebuild), curto prazo, índice do roadmap e onde a documentação descreve "próximos passos". Atualizar este ficheiro quando mudarem prioridades.
- **[docs/OTIMIZACAO-CUSTO-TOKENS-LLM.md](docs/OTIMIZACAO-CUSTO-TOKENS-LLM.md)** — Revisão e otimização de custo de tokens e uso de LLM: onde se consome, limites atuais, checklist e ações recomendadas.
- **[docs/PROMPT-LEAK-REDUCTION.md](docs/PROMPT-LEAK-REDUCTION.md)** — Estratégias para reduzir prompt leak (instruções sensíveis, base de conhecimento); o que o projeto já faz e melhorias opcionais (pós-processamento, auditorias).
- **[docs/PDF-INPUTS-ESTADO-E-MELHORIAS.md](docs/PDF-INPUTS-ESTADO-E-MELHORIAS.md)** — Estado atual do tratamento de PDFs no chat (extração no servidor, partes `document` → texto) e melhorias possíveis com OpenRouter PDF (URL/base64, plugins, anotações).
- **[docs/RASTREAR-E-CORRIGIR-PROBLEMAS.md](docs/RASTREAR-E-CORRIGIR-PROBLEMAS.md)** — Guia prático para rastrear e corrigir problemas: ativar DEBUG_CHAT, tabela sintoma → onde ver → correção, checklist BD lenta. Complementado por [docs/CHAT-DEBUG.md](docs/CHAT-DEBUG.md), [docs/DB-TIMEOUT-TROUBLESHOOTING.md](docs/DB-TIMEOUT-TROUBLESHOOTING.md) e [docs/REFERENCIA-ERROS-400.md](docs/REFERENCIA-ERROS-400.md).
- **[docs/ESCALA-SAAS-BD.md](docs/ESCALA-SAAS-BD.md)** — Escala e performance da BD para SaaS: soluções para muitos chamados (cache Redis para créditos/overrides no chat, BD sempre ligada, read replicas, stream-first).
- **[docs/COMPARATIVO-SUPABASE-PRO-VS-NEON-SCALE.md](docs/COMPARATIVO-SUPABASE-PRO-VS-NEON-SCALE.md)** — Comparativo Supabase Pro vs Neon Scale para escolher a BD (preço, pausa/cold start, pooler, integração com o projeto).
- **[docs/MIGRACAO-SUPABASE-PRO.md](docs/MIGRACAO-SUPABASE-PRO.md)** — Passos para migrar para Supabase Pro (connection string com pooler 6543, variáveis de ambiente, migrações).

---

## Referências rápidas

- [AI SDK](https://sdk.vercel.ai/docs/introduction)
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Supabase](https://supabase.com/docs)
- [Auth.js](https://authjs.dev)
- Ultracite: `npx ultracite init | fix | check`
