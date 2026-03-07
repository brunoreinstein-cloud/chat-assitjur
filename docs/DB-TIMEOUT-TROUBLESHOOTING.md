# Resolução de problemas: timeout da base de dados no chat

Quando o chat devolve **400** com a mensagem *"A base de dados não respondeu a tempo"*, a **resposta do chat não carrega** (stream nunca começa ou demora demasiado), ou no terminal aparece `[chat] dbBatch timeout or error: DB_BATCH_TIMEOUT`, o batch de queries à BD excedeu o limite (atualmente **120s**). Segue estes passos.

---

## Checklist rápido (resposta não carregou / muito lento)

1. **Ligação com pooler** — Em `POSTGRES_URL` usa a porta **6543** (Supabase: *Settings → Database* → Connection string → **Transaction**). Em produção (Vercel) é obrigatório; em dev reduz cold start.
2. **Aquecer a BD** — Antes de enviar mensagens: abre a página do chat (o `DbWarmup` chama `GET /api/health/db` em background) ou corre `pnpm db:ping` no terminal. O primeiro pedido fica “quente”.
3. **Reenviar a mensagem** — O segundo pedido costuma ser bem mais rápido. Se a primeira resposta não carregou, envia de novo.

Detalhes e valores de timeout nas secções abaixo.

---

**Timeouts atuais (referência):**
- **Ligação ao iniciar (ensureDbReady):** 10s por tentativa, com **1 retry** (máx. ~20s antes de devolver erro). Reduz contenção ao falhar cedo e pedir "tenta novamente".
- **Batch global:** 120s (`DB_BATCH_TIMEOUT_MS`). Rede de segurança; com timeouts por query o batch tende a completar em ≤25s.
- **Por query:** 25s (`PER_QUERY_TIMEOUT_MS`). Se uma query (chat, mensagens, conhecimento, etc.) não responder a tempo, usa-se um fallback (ex.: chat null, mensagens []) e o chat continua; reduz contenção ao completar o pedido mais cedo quando a BD está lenta.
- **Créditos no batch:** 25s (`CREDITS_IN_BATCH_TIMEOUT_MS`). Se a query de créditos não responder a tempo, a app usa o saldo inicial.
- **Em desenvolvimento:** o `saveChat` (novo chat) é fire-and-forget (não bloqueia o handler), para não segurar a conexão à BD; em produção continua a ser aguardado.

---

## 1. Confirmar POSTGRES_URL

- **Onde:** `.env.local` (não commitar; ver `.env.example` para variáveis esperadas).
- **Formato:** `postgresql://[user]:[password]@[host]:[port]/[database]`
- Confirma que a URL está correta (copiar do dashboard do Supabase/Neon e colar sem alterar). Não partilhes a URL com a palavra-passe em repositórios ou documentação.

**Exemplo de formato (Supabase pooler):**
```text
postgresql://postgres.[ref]:[PASSWORD]@[region].pooler.supabase.com:6543/postgres
```
- Host com **pooler** (ex.: `aws-0-eu-west-1.pooler.supabase.com`) e porta **6543** = Transaction mode (recomendado para produção e geralmente para dev). No Supabase: *Settings → Database → Connection string* → escolher **Transaction** (URI com `:6543`).
- Se em **desenvolvimento local** o pooler for muito lento (ex.: cold start > 30s), podes testar temporariamente com a connection string **Session** (porta **5432**) só em `.env.local`; em produção (Vercel) deves usar sempre **6543** (a porta 5432 não é suportada em funções serverless da Vercel).

---

## 2. Testar a ligação

**Script rápido (recomendado):**

```bash
pnpm db:ping
```

- **✅ Ligação OK (X ms)** — a BD responde. Se X for alto (> 3s), a ligação é lenta; em baixo verás sugestões.
- **❌ Erro** — POSTGRES_URL em falta, incorreta, rede inacessível ou BD em baixo. Corrige a URL ou a rede e volta a tentar.
- **❌ "canceling statement due to statement timeout" (código 57014)** — O pooler (Supabase porta 6543) tem um `statement_timeout` no servidor (ex.: 8s) que não é alterável pelo cliente. Em cold start a ligação demora mais e a query do ping pode ser cancelada. O script mostra sugestões: **1)** Correr `pnpm db:ping` de novo (2.ª vez = ligação quente). **2)** Para o ping só: usar a connection string em **Session mode** (porta **5432**) em vez do pooler (6543) — Supabase *Settings → Database* → Connection string → **Session**. A app do chat continua a usar o pooler (6543) em produção.

**Drizzle Studio (opcional):**

```bash
pnpm db:studio
```

Abre a interface no browser; se não conectar ou demorar muito a carregar, o problema é a ligação à BD.

---

## 3. Cold start (Supabase / Neon)

Em planos gratuitos ou com pausa automática, a **primeira** ligação após um período sem uso pode demorar 10–30s (cold start).

- **O que fazer:** Envia de novo a mensagem no chat. O segundo pedido costuma ser bem mais rápido.
- Se o **db:ping** for lento na primeira vez e rápido na segunda, é cold start; não é necessário alterar código.

---

## 4. Ligação sempre lenta ou timeout no chat

**4.1 Usar endpoint de connection pooling**

- **Supabase:** No dashboard, em *Settings → Database* há dois tipos de connection string:
  - **Session mode** (porta 5432) — uma conexão por sessão; com `max: 1` no código, as queries do chat correm em série e podem exceder 60s se cada uma for lenta.
  - **Transaction mode (pooler)** — normalmente na porta **6543** ou URL com `-pooler`. Usa esta URL como `POSTGRES_URL` para reduzir latência e melhor uso do pool.
- **Neon:** Usa o endpoint **pooled** (inclui `-pooler` no host ou indicado no dashboard). A documentação Neon descreve a connection string para o pooler.

**4.2 Aumentar o timeout do batch (último recurso)**

O limite está em `app/(chat)/api/chat/route.ts`:

- `DB_BATCH_TIMEOUT_MS` — atualmente **120_000** (120s). Se a BD for consistentemente lenta, podes subir para 180s. A mensagem de erro ao utilizador indica o valor em segundos.
- Não reduzas abaixo de 60s; o cold start do Supabase/Neon pode levar 10–30s e várias queries correm em paralelo.

---

## 5. Resumo rápido

| Situação | Ação |
|----------|------|
| POSTGRES_URL em falta ou errada | Corrigir em `.env.local`; ver `.env.example`. Formato: `postgresql://user:pass@host:port/db`. |
| Não sabes se a BD responde | `pnpm db:ping`. |
| Primeira mensagem após muito tempo sem usar | Tentar de novo (cold start). |
| Sempre lento / timeout no chat | Usar URL do **pooler** (Supabase porta **6543**); em local dev, se o pooler for lento, testar Session (porta **5432**) só em `.env.local`. Se ainda falhar, aumentar `DB_BATCH_TIMEOUT_MS` (ex.: 120_000). |
| Timeout só na query de créditos | A app usa saldo inicial após 25s; o resto do chat continua. Se quiseres, podes subir `CREDITS_IN_BATCH_TIMEOUT_MS` no `route.ts`. |

---

## 6. Afinar timeouts e conexão (resumo)

| O quê | Onde | Valor atual / sugestão |
|-------|------|-------------------------|
| Timeout do batch de queries do chat | `app/(chat)/api/chat/route.ts` → `DB_BATCH_TIMEOUT_MS` | 120_000 (120s). Rede de segurança. |
| Timeout por query (fallback) | `app/(chat)/api/chat/route.ts` → `PER_QUERY_TIMEOUT_MS` | 25_000 (25s). Por query (chat, mensagens, conhecimento, overrides, etc.); em timeout usa fallback e o chat continua (reduz contenção). |
| Timeout da ligação ao iniciar o chat | `app/(chat)/api/chat/route.ts` → `ensureDbReady()` | 10s por tentativa, 1 retry (máx. ~20s). |
| Timeout da query de créditos dentro do batch | `app/(chat)/api/chat/route.ts` → `CREDITS_IN_BATCH_TIMEOUT_MS` | 25_000 (25s). Após este tempo usa-se saldo inicial. |
| Statement timeout (por sessão SQL) | `lib/db/queries.ts` → `ensureStatementTimeout()` | 120s. A app define na sessão ao iniciar o chat. |
| Timeout de ligação ao Postgres | `lib/db/queries.ts` → `getDb()` (opções do driver) | `connect_timeout: 10` (10s). |

**Conexão:** O projeto usa uma única conexão por processo (`max: 1`). Em Vercel cada invocação pode ser um processo novo, daí a importância do **pooler** (porta 6543) para não esgotar conexões e para menor latência.

---

## 7. Como identificar o gargalo

Para saber **qual query ou fase** está a travar o chat:

### 7.1 Logs do terminal (dev)

Com `pnpm dev`, cada POST /api/chat regista no terminal:

- `[chat-timing] dbBatch: starting…` — início do batch.
- `[chat-timing] dbBatch: getMessageCount done in Xms` (e o mesmo para getChatById, getMessagesByChatId, etc.) — **a query que tiver o X mais alto é a mais lenta**. A última a aparecer antes de "dbBatch: all done" é o gargalo do batch.
- `[chat-timing] dbBatch: getXXX timeout após 25000ms, a usar fallback` — essa query excedeu 25s e usou fallback; é um candidato a gargalo (cold start ou query pesada).
- `[chat-timing] dbBatch: all done in Xms` — tempo total do batch.

**Como usar:** Reproduz o problema (envia uma mensagem após um tempo sem usar). No terminal, anota qual query tem o maior "done in Xms" ou qual fez "timeout após 25000ms". Se várias fizerem timeout, o gargalo é provavelmente a **primeira ligação à BD** (cold start), que atrasa todas.

### 7.2 Medir cold start vs ligação quente

Noutro terminal (com o servidor parado ou sem ter feito pedidos ao chat há uns minutos):

```bash
pnpm db:ping
```

- **Primeira execução:** anota o tempo (ex.: 24s). Esse valor aproxima o **cold start** (ligação + primeira query).
- **Segunda execução imediata:** `pnpm db:ping` de novo. Se for muito mais rápido (ex.: 200ms), o gargalo é o cold start do Supabase/Neon; não é uma query específica lenta.

### 7.3 DEBUG_CHAT (tempo total por fase)

Em `.env.local` define `DEBUG_CHAT=true`, reinicia e envia uma mensagem. No terminal aparecem linhas como:

```
[chat-debug] timing: dbBatch 412
[chat-debug] preStreamPhases {"auth":25,"dbBatch":412,...}
```

- **dbBatch** alto (ex.: 40000) → o batch de BD é o gargalo; usa os logs do ponto 7.1 para ver qual query dentro do batch.
- **validationRag** ou **saveMessages** altos → o gargalo está noutra fase (RAG, gravação), não na BD do batch.

### 7.4 GET /api/credits lento (ex.: 19s+)

Se **GET /api/credits** demorar 15–20s, o tempo está quase todo na **primeira ligação à BD** (cold start) ou nas queries de saldo/uso. Em **desenvolvimento** (`pnpm dev`) o endpoint regista no terminal:

- `[credits-timing] ensureStatementTimeout: Xms` — tempo até a ligação estar pronta e o SET aplicado. Se X for > 10s, o gargalo é a conexão/cold start.
- `[credits-timing] getCreditBalance + getRecentUsage: Xms (total desde início: Yms)` — tempo das duas queries em paralelo. Se Y ≈ 19s e "ensureStatementTimeout" foi ~18s, o problema é a ligação; se "ensureStatementTimeout" foi rápido e o total alto, é uma das duas queries (ex.: `getRecentUsageByUserId`).

**Solução:** igual ao chat — usar **pooler** (porta 6543 no Supabase), reenviar o pedido (2.ª vez = ligação quente) ou aquecer com `GET /api/health/db` ao carregar a app.

### 7.5 Resumo: o que é normalmente o gargalo

| Cenário | Gargalo provável | Confirmação |
|--------|-------------------|-------------|
| Primeira mensagem após muito tempo sem usar | Cold start da BD (Supabase/Neon) | db:ping lento na 1.ª vez, rápido na 2.ª; várias queries com "timeout após 25s" ou tempos ~10–25s |
| Sempre lento, mesmo em pedidos seguidos | Query específica pesada ou rede/URL | Uma query com "done in Xms" muito maior que as outras; ou db:ping sempre lento |
| GET /api/credits também demora 20s+ | Conexão à BD (ou cold start) | Ver 7.4: logs `[credits-timing]` em dev; primeira ligação do processo está lenta |

---

## 8. Os pontos corrigidos são suficientes?

**Sim, para o utilizador conseguir usar o chat.** As alterações feitas garantem que:

1. **Nenhuma query bloqueia o pedido todo.** Cada query tem timeout de 45s; em caso de atraso usa-se um fallback (ex.: sem histórico, chat novo) e o chat continua. O pedido deixa de ficar preso 2 minutos.
2. **A mensagem de erro é visível** (surface `database` em "response") e explica cold start e "tenta novamente".
3. **O batch tende a completar em ≤45s** (em vez de esperar indefinidamente pela query mais lenta).

**O que não fica resolvido pela correção:** a **causa raiz** (ex.: cold start 20–30s) continua a existir. No primeiro pedido após inatividade podes ter:
- Resposta em ~45s com alguns dados em fallback (ex.: sem histórico na primeira mensagem), ou
- Se a BD responder a tempo, dados completos.

**Aquecimento da ligação (recomendado):**

- **Automático:** Ao entrar na área do chat, o componente `DbWarmup` chama `GET /api/health/db` uma vez em background. Assim a primeira ligação à BD é feita ao carregar a página, e o primeiro `GET /api/credits` ou `POST /api/chat` tende a ser mais rápido. Ver `components/db-warmup.tsx` e layout em `app/(chat)/layout.tsx`.
- **Manual (opcional):** Chamar `GET /api/health/db` ou `GET /api/credits` ao abrir a app; ou correr `pnpm db:ping` antes de abrir a app.
- **Manter o projeto Supabase/Neon “acordado”:** em planos com pausa automática, um cron job que faça um pedido leve à BD de X em X minutos reduz cold starts (configuração no teu lado, fora do código do chat).

---

## 9. Referências

- **Debug do chat (logs, fases):** `docs/CHAT-DEBUG.md`
- **Script de ping:** `scripts/db-ping.ts` — `pnpm db:ping`
- **Schema e migrações:** `lib/db/queries.ts`, `lib/db/schema.ts`, `pnpm db:migrate`
- **Revisão Postgres e erros:** `docs/DB-POSTGRES-REVIEW.md`
- **Deploy e POSTGRES_URL:** `docs/vercel-setup.md` (porta 6543 em produção)
