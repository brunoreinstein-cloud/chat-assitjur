# Melhorias do projeto usando as features da stack

Este documento lista melhorias concretas que podemos aplicar no projeto aproveitando **Next.js App Router**, **AI SDK**, **shadcn/ui**, **persistência (Neon/Blob)** e **Auth.js**.

---

## 1. Next.js App Router

### 1.1 Cache Components (`use cache` + cacheLife / cacheTag)

O projeto já tem `cacheComponents: true` em `next.config.ts`. Ainda **não há uso de `use cache`** no código da aplicação.

**Melhorias sugeridas:**

| Onde | O quê | Benefício |
|------|--------|-----------|
| **Metadados de agentes** | Função server que devolve lista de agentes (ids, labels, allowedModelIds) com `'use cache'` e `cacheLife('hours')` ou `cacheTag('agents-metadata')` | Menos trabalho repetido por request; invalidação explícita se no futuro existir admin que altere metadados. |
| **Páginas estáticas** | Se existir conteúdo de marketing/landing (ex.: `/uso`) com dados que mudam raramente, usar `use cache` + `cacheLife('minutes')` no componente que faz fetch | Shell estático mais rápido, dados revalidados em background. |
| **Lista de pastas da base de conhecimento** | Opcional: componente server que carrega pastas com `cacheTag('knowledge-folders', userId)` e invalidação via `updateTag` nas Server Actions de criar/renomear/apagar pasta | Menos chamadas ao DB na mesma sessão. |

**Exemplo (função cacheada):**

```ts
// lib/ai/agents-registry-server.ts (exemplo)
import { cacheLife, cacheTag } from "next/cache";

export async function getAgentsMetadataCached() {
  "use cache";
  cacheTag("agents-metadata");
  cacheLife("hours");
  // Re-exportar ou buscar metadados que hoje estão em agents-registry-metadata.ts
  return { agentIds: AGENT_IDS, labels: LABELS, ... };
}
```

Usar em RSCs que precisam da lista de agentes (evitando enviar tudo pelo client).

---

### 1.2 Server Actions em vez de `fetch` para mutações

Várias mutações são feitas com `fetch` para API routes. **Server Actions** reduzem boilerplate, melhoram tipos e centralizam validação no servidor.

**Candidatos a converter em Server Actions:**

| Ação atual | Onde | Benefício |
|------------|------|-----------|
| Apagar conversa | `sidebar-history.tsx` → `fetch(\`/api/chat?id=...\`, { method: "DELETE" })` | Uma função `deleteChat({ id })` em `app/(chat)/actions.ts`; revalidação com `revalidatePath('/chat')` ou `router.refresh()`. |
| Apagar todo o histórico | `app-sidebar.tsx` / `sidebar-user-nav.tsx` → `fetch("/api/history", { method: "DELETE" })` | `deleteAllMyChats()` em `app/(chat)/actions.ts`. |
| Vote (up/down) | `message-actions.tsx` → `fetch("/api/vote", ...)` | `voteMessage({ chatId, messageId, value })`; mantém API se quiser uso externo, ou só Action. |
| CRUD base de conhecimento | `knowledge-sidebar.tsx`: criar/renomear/apagar documento, criar pasta, etc. | Actions como `createKnowledgeDocument`, `renameKnowledgeDocument`, `deleteKnowledgeDocument`, `createKnowledgeFolder`; invalidação com `updateTag('knowledge-folders')` se usar cache. |
| Atualizar visibilidade do chat | Já existe `updateChatVisibility` em `app/(chat)/actions.ts` | Já está bem; garantir que a UI chama apenas a Action. |

**Vantagens:** menos rotas API para manter, tipos partilhados, validação com Zod no servidor, e possibilidade de usar `revalidatePath` / `updateTag` na mesma função.

---

### 1.3 RSC para dados iniciais e Suspense

- **`app/(chat)/chat/[id]/page.tsx`** já usa RSC: busca `getChatById` e `getMessagesByChatId` no servidor e passa `initialMessages` ao cliente. Está correto.
- Manter **Suspense** à volta do componente async da página para streaming e fallback de loading.

**Sugestão:** Se no futuro existir uma lista de chats (ex.: dashboard), carregar a primeira página da lista no servidor e passar como props; paginação “load more” pode continuar com SWR/fetch no cliente ou com Server Action que devolve a próxima página.

---

## 2. AI SDK

### 2.1 Uso atual

- **`useChat`** em `components/chat.tsx` com `api: "/api/chat"`, streaming, tools e attachments.
- **Server Actions** para título (`generateText` em `generateTitleFromUserMessage`) e para sign-in guest.
- **Tools** definidas com `tool()` em `lib/ai/tools/` (get-weather, create-document, update-document, request-suggestions, improve-prompt, create-revisor-defesa-documents, create-redator-contestacao-document, validation-tools); várias já usam `inputSchema` com Zod.
- **Structured output** já usado numa tool: `lib/ai/tools/request-suggestions.ts` usa `Output.array({ element: z.object({ originalSentence, suggestedSentence, description }) })` no `streamText` interno para sugestões tipadas.

### 2.2 Melhorias sugeridas

| Melhoria | Onde aplicar | Descrição |
|----------|----------------|-----------|
| **Structured output** | Tools que devolvem objeto fixo (ex.: criar documento, clima). | `request-suggestions` já usa `Output.array` + `z.object`. Para outras tools: garantir que o `execute` devolve um objeto com schema conhecido (ex.: `{ id, title, kind, message }`) e, se o modelo gerar conteúdo estruturado, usar `generateObject` ou `output: Output.object({ ... })` no `streamText`/`generateText` dessa tool. |
| **streamUI** | Tools com UI rica (sugestões, artefactos, tabelas). | O projeto já envia eventos custom no stream (`data-suggestion`, `data-clear`, `data-finish`) via `dataStream.write()` em `request-suggestions` e `update-document`. A opção **streamUI** do AI SDK permite mapear tool calls a componentes React no cliente; avaliar se migrar para esse padrão simplifica o `DataStreamHandler` e a renderização de tool results em `components/` (ex.: sugestões, documentos). Ver [AI SDK – streamUI](https://ai-sdk.dev/docs/ai-sdk-ui/streaming-ui). |
| **Hooks e transporte** | `components/chat.tsx`, `app/(chat)/api/chat/route.ts`. | Manter `useChat` + `DefaultChatTransport`; no README ou em `lib/ai/README.md` referir que o endpoint (`/api/chat`) e o modelo são configuráveis (cookie `chat-model`, body) e que o gateway está em `lib/ai/providers.ts`. |
| **Multi-provider** | `lib/ai/models.ts`, `lib/ai/providers.ts`, `.env.example`. | Lista de modelos em `lib/ai/models.ts` (Anthropic, OpenAI, Google, xAI, reasoning). Documentar em comentário ou em `docs/` que novos providers (ex.: Fireworks) exigem: entrada em `chatModels`, suporte em `getLanguageModel()` em `lib/ai/providers.ts` e variável de ambiente (ex.: `AI_GATEWAY_API_KEY` ou provider-specific). |

---

## 3. shadcn/ui + Tailwind + Radix

### 3.1 Estado atual

- **Tailwind** e **Radix** (e componentes em `components/ui/`) já estão presentes: Button, Dialog, Sheet, Command, Select, etc.
- **Acessibilidade:** regras Ultracite obrigam a11y; os primitives Radix ajudam.

**Melhorias sugeridas:**

| Área | Ação |
|------|------|
| **Formulários** | Onde houver forms com validação (login, registo, conhecimento, agentes custom), usar **react-hook-form + zod** com componentes shadcn (Input, Label, Button) e `<Form>` do shadcn para feedback de erros e a11y. |
| **Componentes em falta** | Se surgirem needs de Tabs, Switch, Checkbox, RadioGroup, usar os do shadcn para manter consistência e a11y. |
| **Toasts** | Já existe `sonner`; manter um único sistema de toasts (evitar `alert()`). |
| **Auditoria** | Revisar páginas críticas (chat, admin, conhecimento) com as [Web Interface Guidelines](https://web.dev/) e regras do Ultracite (labels, roles, teclado). |

---

## 4. Persistência (Neon Postgres + Vercel Blob)

### 4.1 Base de dados

- **Drizzle ORM** + **PostgreSQL** (Neon/Supabase); migrações em `lib/db/`.

**Melhorias sugeridas:**

| Melhoria | Descrição |
|----------|-----------|
| **Connection pooling** | Em serverless (Vercel), usar driver serverless do Neon (`@neondatabase/serverless`) ou pooling (Neon Pooler) na `POSTGRES_URL` para evitar esgotar conexões. |
| **Índices** | Garantir índices em colunas usadas em `WHERE` e `ORDER BY` (ex.: `Chat.userId`, `Message.chatId`, `KnowledgeDocument.userId`, `createdAt`). Ver `lib/db/schema.ts` e migrações. |
| **Queries** | Evitar N+1: onde existir lista de chats com dados relacionados, usar `getChatsByUserId` (ou equivalente) já com joins/limits adequados. |

### 4.2 Ficheiros (Vercel Blob)

- Upload via `/api/files/upload-token`, `/api/files/upload`, `/api/files/process`; Blob ou Supabase Storage.

**Melhorias sugeridas:**

| Melhoria | Descrição |
|----------|-----------|
| **Unificar storage** | Documentar quando usar Blob vs Supabase Storage (ex.: por ambiente ou por tipo de ficheiro) e manter um único caminho por tipo para não duplicar lógica. |
| **Política de retenção** | Definir (e documentar) se e quando apagar blobs órfãos (ex.: anexos de mensagens de chats já apagados). |
| **Tamanho e tipo** | Validação de tipo e tamanho já existe em parte; garantir que está centralizada (ex.: constantes e schemas Zod) e que erros são consistentes na UI. |

---

## 5. Auth.js

### 5.1 Estado atual

- **Auth.js v5 (beta)** com credenciais e provider guest; Server Actions para `login`, `register` e `signInAsGuest`.

**Melhorias sugeridas:**

| Melhoria | Descrição |
|----------|-----------|
| **Proxy** | Proteger rotas em `proxy.ts`: redirecionar utilizadores não autenticados de `/chat`, `/admin`, etc., para `/login` (com exceção explícita para guest se aplicável). |
| **Callbacks** | Usar callbacks do Auth.js (session, jwt) para incluir no token/session apenas o necessário (ex.: `userId`, `role`) e evitar aceder à BD em toda a request. |
| **Guest** | Garantir que o fluxo guest está documentado (cookie, redirect, limites) e que rotas admin/credits não são acessíveis com sessão guest. |

---

## 6. Resumo de prioridades

| Prioridade | Melhoria | Feature |
|------------|----------|---------|
| Alta | Server Actions para apagar chat e apagar histórico | Next.js |
| Alta | Proxy de proteção de rotas | Auth.js |
| Média | `use cache` + cacheTag para metadados de agentes (se forem lidos em RSC) | Next.js |
| Média | Server Actions para CRUD da base de conhecimento (com revalidação) | Next.js |
| Média | Connection pooling / driver serverless Neon | Persistência |
| Baixa | Structured output / streamUI em tools específicas | AI SDK |
| Baixa | Formulários com react-hook-form + zod + shadcn Form | shadcn/ui |
| Baixa | Política de retenção e limpeza de blobs | Vercel Blob |

---

## Referências

- [Next.js Cache Components (PPR, use cache)](https://nextjs.org/docs/app/building-your-application/caching#cache-components)
- [AI SDK – Tools, structured output](https://ai-sdk.dev/docs)
- [shadcn/ui – Form](https://ui.shadcn.com/docs/components/form)
- [Auth.js – Middleware](https://authjs.dev/getting-started/middleware)
- [Neon – Serverless driver](https://neon.tech/docs/serverless/serverless-driver)
