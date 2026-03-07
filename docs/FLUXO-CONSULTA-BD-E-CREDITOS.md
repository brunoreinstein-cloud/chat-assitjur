# Passo a passo: como ocorre a consulta à BD e aos créditos

Este documento descreve a sequência exata de operações quando o utilizador abre o chat ou envia uma mensagem, e quando a UI pede o saldo de créditos.

---

## 1. Quando abres a página do chat

### 1.1 Carregamento inicial (cliente)

1. O **layout** `app/(chat)/layout.tsx` renderiza:
   - `DbWarmup` (client component)
   - `DataStreamProvider` → `SidebarWrapper` (server) → `ChatSidebar` + conteúdo da página

2. No cliente, ao montar:
   - **DbWarmup** corre `useEffect` e faz **GET /api/health/db** em background (sem bloquear a UI).
   - A **sidebar** e a **página de chat** podem, em paralelo, pedir sessão, créditos ou dados do chat (consoante o que cada componente pede).

3. Ordem real dos pedidos depende do que monta primeiro:
   - Se a sidebar pedir **GET /api/credits** antes (ou ao mesmo tempo) que o warmup conclua, o **credits** pode ser o primeiro pedido a usar a BD neste processo → paga o cold start.
   - O mesmo se o **POST /api/chat** (ou outro endpoint que use a BD) for disparado antes do health/db terminar.

### 1.2 GET /api/health/db (warmup)

1. **GET** em `app/api/health/db/route.ts`.
2. Chama `pingDatabase()` em `lib/db/queries.ts`.
3. **pingDatabase()**:
   - Chama `getDb()` → cria a conexão Postgres (singleton por processo) se ainda não existir.
   - Executa `SELECT 1`.
   - Devolve `{ ok: true, latencyMs }` ou `{ ok: false, error, latencyMs }`.
4. Resposta **200** ou **503** com o resultado.

Não há `ensureStatementTimeout()` neste endpoint; é só o primeiro uso da conexão (e portanto o ponto onde o cold start pode acontecer).

---

## 2. GET /api/credits (saldo e uso recente)

Quando um componente chama a API de créditos (ex.: sidebar ou header):

### Passo 1 — Autenticação e cache

1. **GET** em `app/(chat)/api/credits/route.ts`.
2. `await auth()` — obtém a sessão.
3. Se não houver sessão → **401**.
4. Lê `limit` da query string (?limit=10–50).
5. `creditsCache.get(userId, limit)`:
   - Se existir cache válido → responde de imediato com **200** e corpo em cache (não toca na BD).

### Passo 2 — ensureStatementTimeout (primeiro uso da BD neste handler)

6. `t0 = Date.now()` (início do request).
7. **`await ensureStatementTimeout()`** (em `lib/db/queries.ts`):
   - `getDb()` — obtém ou cria a conexão Postgres (singleton).
   - **Executa na sessão:** `SET statement_timeout = '120s'`.
   - Há um **guard de 5 s** (`STATEMENT_TIMEOUT_MS = 5000`): corre `Promise.race([setPromise, timeoutPromise])`.
   - Se o `SET` não completar em 5 s (ex.: ligação muito lenta ou cold start), o guard “ganha” e a função termina sem erro (a sessão pode ficar sem o timeout aplicado).
8. Em dev, regista `[credits-timing] ensureStatementTimeout: Xms` (X ≈ 5000 quando há timeout do guard).

### Passo 3 — Queries de saldo e uso em paralelo

9. `t1 = Date.now()`.
10. **`Promise.all([...])`** com duas queries em paralelo:
    - **getCreditBalance(userId)** com timeout de **5 s** (`BALANCE_TIMEOUT_MS`): devolve saldo ou timeout/erro.
    - **getRecentUsageByUserId(userId, limit)** com timeout de **18 s** (`USAGE_TIMEOUT_MS`): devolve uso recente ou timeout/erro.
11. Em dev, regista `[credits-timing] getCreditBalance + getRecentUsage: Xms (total desde início: Yms)`.

### Passo 4 — Resolver saldo e montar resposta

12. Se o saldo deu timeout/erro → usa `initialCredits` e marca resposta parcial.
13. Se o saldo for `null` → tenta `getOrCreateCreditBalance(userId, initialCredits)` (com timeout 5 s).
14. Monta o corpo: `balance`, `recentUsage`, `lowBalanceThreshold`, e `_partial: true` se houve timeout/erro.
15. Se não for parcial → guarda em `creditsCache.set(...)`.
16. Responde **200** com JSON.

Se a BD estiver em cold start:

- O **ensureStatementTimeout** tende a levar ~5 s (guard).
- As duas queries podem levar até 5 s + 18 s (a que demorar mais), daí totais de ~23 s e os logs que viste.

---

## 3. POST /api/chat (enviar mensagem)

Quando o utilizador envia uma mensagem no chat:

### Passo 1 — Auth e validação inicial

1. **POST** em `app/(chat)/api/chat/route.ts`.
2. `auth()` — obtém a sessão.
3. **getEarlyValidationResponse(session, message)**:
   - Se não houver sessão → devolve Response 401.
   - **`await ensureDbReady()`**:
     - Chama **ensureStatementTimeout()** com um **race de 10 s** por tentativa; há **1 retry** (máx. ~20 s).
     - Se após o retry o `SET` não completar → devolve **400** “A ligação à base de dados está a demorar demasiado...”.
     - Se concluir a tempo → segue.
   - Valida conteúdo da mensagem (não vazia, etc.); se inválido → devolve 400.
4. Se houver algum erro nestes passos → resposta de erro e termina.

### Passo 2 — Batch de queries à BD (runChatDbBatch)

5. Prepara parâmetros: `effectiveKnowledgeIds`, `redatorBancoAllowedUserIds`, `isBuiltInAgent`, etc.
6. **`runChatDbBatch(...)`**:
   - Cria uma promise de créditos: **getOrCreateCreditBalance** com timeout de **25 s**; em timeout/erro usa `initialCredits`.
   - **Promise.all** de várias operações em paralelo, cada uma com **withFallbackTimeout(..., PER_QUERY_TIMEOUT_MS = 45_000, fallback)** e **withTimingLog**:
     - **getMessageCountByUserId** (fallback: 0)
     - **getChatById** (fallback: null)
     - **getMessagesByChatId** (fallback: [])
     - **getKnowledgeDocumentsByIds** (se houver ids; fallback: [])
     - **getCachedBuiltInAgentOverrides** (fallback: {})
     - a promise de créditos acima
     - **getCustomAgentById** (se não for agente built-in; fallback: null)
   - Cada query: se não responder em **25 s**, usa o fallback e regista em dev `[chat-timing] dbBatch: <label> timeout após 25000ms, a usar fallback`; quando a promise original termina (mesmo tarde), regista `done in Xms`.
   - **Promise.race** de todo este batch com um timeout global de **120 s** (`DB_BATCH_TIMEOUT_MS`): se o batch não acabar em 120 s → rejeita com `DB_BATCH_TIMEOUT` e o handler devolve **400** “A base de dados não respondeu a tempo...”.
7. Se o batch devolver `Response` (erro) → retorna essa resposta.
8. Caso contrário, usa o resultado (messageCount, chat, messagesFromDb, knowledgeDocsResult, builtInOverrides, balanceFromDb, customAgentFromBatch) para seguir.

### Passo 3 — Config do agente e créditos

9. **getAgentConfigAndEffectiveModel(...)** — define agente e modelo; valida partes de documento do Revisor; se inválido → 400.
10. **runCreditsAndPersist(...)** — persiste créditos e chat (saveChat, etc.); pode devolver Response em caso de erro.

### Passo 4 — Mensagens, validação e stream

11. Monta `uiMessages` (mensagens da BD + mensagem atual).
12. Validação RAG / partes de documento e **getUserFiles** (em paralelo).
13. **prepareModelMessagesForStream** → **buildStreamAndResponse**: monta mensagens para o modelo e inicia o stream de resposta.

Em cold start, o **ensureDbReady** pode levar até ~20 s (10 s + retry) e o **batch** pode levar até 25 s por query (com fallbacks), daí os logs de timeouts aos 25 s e “dbBatch: all done” em ~25 s quando a BD está lenta.

---

## 4. Resumo da ordem (por endpoint)

### GET /api/credits

```
auth() → cache? → ensureStatementTimeout (máx. 5 s) → getCreditBalance (5 s) + getRecentUsage (18 s) em paralelo → resolveBalance se necessário → resposta JSON
```

### POST /api/chat

```
auth() → ensureDbReady (ensureStatementTimeout 10 s + 1 retry) → validação da mensagem → runChatDbBatch (várias queries em paralelo, cada uma com fallback aos 25 s; batch global 120 s) → getAgentConfigAndEffectiveModel → runCreditsAndPersist → preparar mensagens → stream
```

### GET /api/health/db

```
getDb() → SELECT 1 → resposta 200/503
```

---

## 5. Porque é que db, credits e custom aparecem “pendentes”

No browser, **db**, **credits** e **custom** podem aparecer como “(pendente)” quando:

- O primeiro pedido que usa a BD neste processo (ou que partilha a mesma conexão lenta) está à espera da **primeira ligação** (cold start) ou de queries muito lentas.
- **ensureStatementTimeout** ou as queries excedem os tempos que o cliente está disposto a esperar, ou o servidor ainda não respondeu.

Ou seja: a “consulta” que vês é esta sequência (auth → ensureStatementTimeout → queries em paralelo com timeouts), e o passo que demora é a ligação à BD ou as próprias queries quando a BD está fria ou sobrecarregada.

Para reduzir atrasos: usar **pooler** (Supabase porta 6543), garantir que **GET /api/health/db** corre ao carregar a app (DbWarmup) e, se necessário, dar uns segundos antes de interagir para o warmup concluir. Ver `docs/DB-TIMEOUT-TROUBLESHOOTING.md`.
