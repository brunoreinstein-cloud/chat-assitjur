# Revisão: PostgreSQL e tratamento de erros (PostgresError)

Este documento resume a revisão do uso do PostgreSQL (Drizzle + postgres.js) e do tratamento de erros de base de dados no projeto.

---

## Stack de base de dados

| Componente   | Tecnologia |
|-------------|------------|
| Driver      | [postgres](https://github.com/porsager/postgres) (postgres.js) |
| ORM         | Drizzle ORM |
| Conexão     | Singleton por processo (`getDb()` em `lib/db/queries.ts`), `max: 1`, `connect_timeout: 10` |
| Statement timeout | `ensureStatementTimeout()` define `SET statement_timeout = '120s'` por sessão (Supabase session mode porta 5432) |

---

## Erros PostgreSQL (SQLSTATE) usados no código

| Código | Significado | Onde é tratado |
|--------|-------------|-----------------|
| `23503` | Foreign key violation | `saveChat`: FK `Chat_userId_User_id_fk` → reenvio para reautenticação |
| `23505` | Unique violation | `saveChat`: idempotência (devolve chat existente); `getOrCreateCreditBalance`: race de inserção |
| `57014` | Statement timeout | `lib/errors.ts` (`isStatementTimeoutError`), `toDatabaseError` em queries, rotas que devolvem 503 |

---

## Erros de conexão (driver postgres.js)

Em `lib/errors.ts`, `isDatabaseConnectionError()` considera os códigos:

- `CONNECT_TIMEOUT`, `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`

Quando detetados nas rotas (history, agents/custom, vote, chat), a API devolve **503** via `databaseUnavailableResponse()` em vez de 500, com mensagem genérica ao utilizador (detalhe só em log, surface `database`).

---

## Pontos de atenção

1. **Formato do erro do driver**  
   O postgres.js pode expor o nome da constraint em `constraint` (protocolo PostgreSQL) ou em propriedades específicas. Em `saveChat` a deteção da FK aceita tanto `constraint` como `constraint_name` e ainda a mensagem de erro com o nome da constraint.

2. **Rotas que aplicam 503**  
   As rotas que chamam `ensureStatementTimeout()` e tratam erros de BD devem usar `isDatabaseConnectionError()` e `isStatementTimeoutError()` e, nesses casos, devolver `databaseUnavailableResponse()`. Atualmente: `/api/history`, `/api/agents/custom`, `/api/vote`, `/api/chat` (POST).

3. **Visibility dos erros de BD**  
   Em `lib/errors.ts`, `visibilityBySurface.database` é `"log"`: a resposta ao cliente é genérica (“Something went wrong...”), e o detalhe fica apenas no log.

4. **Mensagem para `not_found:database`**  
   O código de erro `not_found:database` (ex.: em `getChatsByUserId`) tem mensagem específica em `getMessageByErrorCode()`.

---

## Ficheiros principais

- **`lib/errors.ts`** — `ChatbotError`, `isDatabaseConnectionError`, `isStatementTimeoutError`, `databaseUnavailableResponse`, `getMessageByErrorCode` (incl. `not_found:database`).
- **`lib/db/queries.ts`** — `getDb()`, `ensureStatementTimeout()`, `toDatabaseError()` (usa `isStatementTimeoutError`), todas as queries e tratamento de 23503/23505 onde aplicável.
- **`lib/db/schema.ts`** — Definição das tabelas e índices (incl. índices para history e usage).
- Rotas em **`app/(chat)/api/`** — Chamam `ensureStatementTimeout()` no início e tratam 503 nos `catch` com os helpers de `lib/errors.ts`.

---

## Boas práticas (Supabase / Postgres)

- **Connection management**: uma conexão por processo (serverless) com timeout de ligação; adequado para Vercel.
- **Statement timeout**: definido por sessão com `ensureStatementTimeout()` porque o Supabase pode ignorar `options` na connection string no modo pooler.
- **Índices**: existem índices em `Chat(userId, createdAt)`, `Message_v2(chatId, createdAt)`, `LlmUsageRecord(userId, createdAt)` e HNSW para embeddings em `KnowledgeChunk`, alinhados com as queries críticas.

Para mais regras de desempenho e segurança (RLS, locking, etc.), ver a skill `supabase-postgres-best-practices` e referências em `.agents/skills/supabase-postgres-best-practices/`.
