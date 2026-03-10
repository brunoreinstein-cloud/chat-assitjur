# Fluxo completo: timeouts da BD e lentidão de créditos

Este documento descreve o processo e os componentes envolvidos quando aparecem **timeouts no batch do chat** e **GET /api/credits muito lento**, para facilitar a identificação e correção.

---

## 1. O que se vê no terminal (sintomas)

- `[chat-timing] dbBatch: getMessageCount timeout após 12000ms, a usar fallback`
- O mesmo para `getChatById`, `getMessagesByChatId`, `getCachedBuiltInAgentOverrides`
- `[chat-timing] dbBatch: all done in 12019ms`
- `[credits-timing] ensureStatementTimeout: 5016ms` e `getCreditBalance + getRecentUsage: 10008ms`
- `GET /api/credits 200 in 12.7s` ou `15.1s`

Ou seja: **todas** as queries do batch do chat excedem 12s e usam fallback; o endpoint de créditos demora 10–15s.

---

## 2. Componentes e fluxo

### 2.1 Conexão à BD (gargalo partilhado)

| Componente | Ficheiro | Descrição |
|------------|----------|-----------|
| **getDb()** | `lib/db/queries.ts` | Singleton por processo. Cria **uma única** conexão (`max: 1`) ao Postgres. |
| **ensureStatementTimeout()** | `lib/db/queries.ts` | Executa `SET statement_timeout = '120s'` na sessão. Corrida no início do chat e do credits. |
| **Connection opts** | `lib/db/queries.ts` | `connect_timeout: 10`, URL com pooler (porta 6543) recomendada. |

Com `max: 1`, **todas** as rotas do mesmo processo (chat, credits, health/db, history, etc.) partilham a mesma conexão. As queries são efectivamente **em série** nessa conexão.

### 2.2 POST /api/chat — fluxo até ao batch

1. **POST /api/chat** → `handleChatPostAuthenticated` (em `app/(chat)/api/chat/route.ts`).
2. **auth()** — sessão (ex.: 12ms).
3. **getEarlyValidationResponse(session, message)**:
   - **ensureDbReady()** → chama `ensureStatementTimeout()` (até 10s por tentativa, 1 retry). Se falhar, devolve 400.
   - **validateUserMessageContent(message)**.
4. **runChatDbBatch(...)** — ver secção 2.3.

Se outro pedido (ex.: GET /api/credits) estiver a usar a única conexão, `ensureStatementTimeout()` e depois as queries do batch ficam à espera até essa utilização terminar.

### 2.3 runChatDbBatch — batch de queries

| Constante | Valor | Ficheiro |
|-----------|--------|----------|
| **PER_QUERY_TIMEOUT_MS** | 12_000 (12s) | `app/(chat)/api/chat/route.ts` |
| **CREDITS_IN_BATCH_TIMEOUT_MS** | 12_000 | idem |
| **DB_BATCH_TIMEOUT_MS** | 120_000 (120s) | idem |

O batch corre em **Promise.all** com **withFallbackTimeout(..., 12_000, fallback)** em cada query:

1. **getMessageCount** (getMessageCountByUserId) — contagem de mensagens (24h)
2. **getChatById** — chat por id
3. **getMessagesByChatId** — últimas N mensagens do chat
4. **getKnowledgeDocumentsByIds** — se há knowledge ids
5. **getCachedBuiltInAgentOverrides** — cache em memória; em cache miss chama **getBuiltInAgentOverrides()** na BD
6. **getOrCreateCreditBalance** (ou cache de créditos) — saldo
7. **getCustomAgentById** — se agente custom

Cada query está em **Promise.race** com um timeout de 12s: se não resolver em 12s, devolve-se o fallback (0, null, [], {}, etc.) e o chat continua. O cliente pode receber `data-db-fallback: true` e mostrar aviso de “dados parciais”.

Como há **uma só conexão** (`max: 1`), o driver serializa: na prática só uma query corre de cada vez. Se a primeira (ou a que “agarra” a conexão) demorar 12s (cold start ou contenção), as outras esperam e também atingem o timeout de 12s a partir do início, daí “todas” aparecerem com timeout no log.

### 2.4 GET /api/credits

| Constante | Valor | Ficheiro |
|-----------|--------|----------|
| **BALANCE_TIMEOUT_MS** | 5000 | `app/(chat)/api/credits/route.ts` |
| **USAGE_TIMEOUT_MS** | 10_000 | idem (E2E: 3000 / 6000) |

Fluxo:

1. **auth()**
2. Se **creditsCache.get(userId, limit)** tiver valor, devolve de imediato (sem BD).
3. **ensureStatementTimeout()** — mesma função que no chat (usa a mesma conexão).
4. **Promise.all([ getCreditBalance, getRecentUsageByUserId ])** com withTimeout (5s e 10s).

Se a conexão estiver ocupada pelo chat (batch) ou por outro credits, este pedido espera. Por isso vês `ensureStatementTimeout: 5016ms` e `getCreditBalance + getRecentUsage: 10008ms` — a maior parte do tempo é espera pela conexão ou por cold start.

### 2.5 Outros consumidores da mesma conexão

- **GET /api/health/db** — `pingDatabase()` (SELECT 1)
- **GET /api/history** — ensureStatementTimeout + listagem de chats
- **GET /api/agents/custom**, **POST /api/vote**, **actions** (ex.: warmup), etc.

Em dev, um único processo Next.js serve tudo; todos competem pela mesma conexão `max: 1`.

---

## 3. Causa raiz provável

1. **Cold start do Supabase/Neon** — primeira ligação (ou após pausa) pode levar 10–30s; a primeira query que corre paga esse custo.
2. **Contenção da conexão** — com `max: 1`, vários pedidos em paralelo (sidebar a chamar GET /api/credits, página a chamar GET /api/health/db, utilizador a enviar mensagem → POST /api/chat) fazem fila; cada um espera o anterior, daí 10–15s em créditos e 12s em cada query do batch.

---

## 4. Onde está cada peça (referência rápida)

| O quê | Onde |
|-------|------|
| Timeout por query (12s) e fallback | `app/(chat)/api/chat/route.ts` → `withFallbackTimeout`, `PER_QUERY_TIMEOUT_MS` |
| Batch completo (120s) | `runChatDbBatch`, `DB_BATCH_TIMEOUT_MS` |
| ensureDbReady (10s + retry) | `ensureDbReady()`, `ENSURE_DB_READY_TIMEOUT_MS` |
| ensureStatementTimeout (SET na sessão) | `lib/db/queries.ts` → `ensureStatementTimeout()` |
| Conexão única (max: 1) | `lib/db/queries.ts` → `getDb()`, opções do `postgres(...)` |
| Timeouts de créditos | `app/(chat)/api/credits/route.ts` → `BALANCE_TIMEOUT_MS`, `USAGE_TIMEOUT_MS` |
| Cache de créditos (evita BD no chat) | `lib/cache/credits-cache.ts` + uso em `runChatDbBatch` |
| Cache de overrides (evita BD no chat) | `lib/cache/agent-overrides-cache.ts` → `getCachedBuiltInAgentOverrides` |

---

## 5. Correções recomendadas

### 5.1 Já documentadas (manter)

- **POSTGRES_URL com pooler (porta 6543)** — reduz cold start e contenção no servidor.
- **DbWarmup** ao abrir `/chat` — GET /api/health/db aquece a ligação.
- **Cron em produção** (GET /api/health/db de 10 em 10 min) — evita pausa longa da BD.
- **Cache de créditos** — sidebar/credits preenche o cache; o batch do chat reutiliza e evita query extra quando possível.

Ver **docs/DB-TIMEOUT-TROUBLESHOOTING.md** para checklist e valores.

### 5.2 Aumentar conexões em desenvolvimento (recomendado)

Em **dev** um único processo serve tudo; `max: 1` faz toda a carga serializar numa conexão. Aumentar para 2–3 conexões reduz contenção entre chat, credits e health ao mesmo tempo.

- **Ficheiro:** `lib/db/queries.ts`, função `getDb()`.
- **Alteração:** usar `max: 3` (ou 2) quando `NODE_ENV === 'development'`; em produção manter `max: 1` (cada invocação serverless é um processo; pooler no Supabase/Neon já faz o pooling).

Exemplo:

```ts
const isDev = process.env.NODE_ENV === "development";
clientInstance = postgres(url, {
  max: isDev ? 3 : 1,
  connect_timeout: 10,
});
```

Assim, em dev, GET /api/credits e POST /api/chat podem usar conexões diferentes e deixam de se bloquear mutuamente.

### 5.3 Aquecer antes do primeiro uso

- Abrir `/chat` (DbWarmup chama GET /api/health/db) antes de enviar mensagem.
- Ou chamar **GET /api/health/db** ou **pnpm db:ping** antes de testar.
- Em E2E: **pnpm run test:with-warmup** (db:ping antes dos testes).

### 5.4 Produção (Vercel)

- Manter **max: 1** por invocação; o pooler (6543) já gere muitas conexões no servidor.
- Garantir **POSTGRES_URL** com porta **6543** e cron de aquecimento ativo.

---

## 6. Resumo do processo (para identificar o problema)

```
Cliente                    Servidor (1 processo em dev)
   |                              |
   | GET /api/credits             | auth → cache? → ensureStatementTimeout() → getCreditBalance + getRecentUsage
   | (sidebar / página)           |   → usa 1 conexão (max:1)
   |                              |
   | POST /api/chat               | auth → getEarlyValidationResponse
   | (enviar mensagem)            |   → ensureDbReady() = ensureStatementTimeout()  [espera conexão se credits a usar]
   |                              |   → runChatDbBatch() = Promise.all([
   |                              |        getMessageCount, getChatById, getMessagesByChatId,
   |                              |        getKnowledgeDocumentsByIds?, getCachedBuiltInAgentOverrides,
   |                              |        getOrCreateCreditBalance, getCustomAgentById?
   |                              |      ])  cada um com race(12s, fallback)
   |                              |   → com max:1, só 1 query corre por vez → todas podem atingir 12s
   |                              |
   | GET /api/credits (outro tab) | mesmo processo → mesma conexão → espera o batch do chat
   |                              |
```

Para **identificar**: ver em **docs/DB-TIMEOUT-TROUBLESHOOTING.md** (secção 9) como usar logs, DEBUG_CHAT e db:ping para ver se o gargalo é cold start ou contenção (vários pedidos ao mesmo tempo).

Para **corrigir**: pooler (6543) + aquecimento + em dev aumentar `max` para 2–3 em `lib/db/queries.ts` (getDb).
