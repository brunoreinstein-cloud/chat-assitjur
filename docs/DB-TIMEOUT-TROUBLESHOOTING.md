# Resolução de problemas: timeout da base de dados no chat

Quando o chat devolve **400** com a mensagem *"A base de dados não respondeu a tempo"*, a **resposta do chat não carrega** (stream nunca começa ou demora demasiado), ou no terminal aparece `[chat] dbBatch timeout or error: DB_BATCH_TIMEOUT`, o batch de queries à BD excedeu o limite (atualmente **120s**). Segue estes passos.

---

## O que configurar ou mudar no projeto

| O quê | Onde | Obrigatório? |
|-------|------|----------------|
| **POSTGRES_URL** com pooler (porta **6543**) | `.env.local` (local) e Vercel → Environment Variables (produção) | Sim. Supabase: Dashboard → Settings → Database → Connection string → **Transaction** (URI com `:6543`). |
| **Cron de aquecimento** | Já definido em `vercel.json` (chama `GET /api/health/db` de 10 em 10 min). Só corre em Production. | Nada a configurar. |
| **DbWarmup** | Já no layout do chat (`app/(chat)/layout.tsx`); aquece a BD ao abrir `/chat`. | Nada a configurar. |
| **Cache de créditos no batch** | Já no `POST /api/chat`: usa cache em memória quando o saldo foi carregado antes (ex.: sidebar). | Nada a configurar. |
| **REDIS_URL** (cache distribuído) | Opcional. `.env.local` / Vercel. Para cache de créditos e overrides entre instâncias — ver `docs/ESCALA-SAAS-BD.md`. | Não. Só se quiseres menos carga na BD com muitas instâncias. |

Resumo: **só precisas de garantir que `POSTGRES_URL` usa o pooler (porta 6543)**. O resto (cron, DbWarmup, cache de créditos no chat) já está no código.

---

## Checklist rápido (resposta não carregou / muito lento)

1. **Ligação com pooler** — Em `POSTGRES_URL` usa a porta **6543** (Supabase: *Settings → Database* → Connection string → **Transaction**). Em produção (Vercel) é obrigatório; em dev reduz cold start.
2. **Aquecer a BD** — Antes de enviar mensagens: abre a página do chat (o `DbWarmup` chama `GET /api/health/db` em background) ou corre `pnpm db:ping` no terminal. Para **entrar como visitante**, a página GET `/api/auth/guest` já chama `GET /api/health/db` até 3s antes de submeter o form, aquecendo a BD antes do POST; para aquecer manualmente antes do primeiro clique em "visitante", abre no browser `/api/health/db` ou corre `pnpm db:ping`. O primeiro pedido fica “quente”.
3. **Reenviar a mensagem** — O segundo pedido costuma ser bem mais rápido. Se a primeira resposta não carregou, envia de novo.

Detalhes e valores de timeout nas secções abaixo.

---

**Timeouts atuais (referência):**
- **Ligação ao iniciar (ensureDbReady):** 10s por tentativa, com **1 retry** (máx. ~20s antes de devolver erro). Reduz contenção ao falhar cedo e pedir "tenta novamente".
- **Batch global:** 120s (`DB_BATCH_TIMEOUT_MS`). Rede de segurança; com timeouts por query o batch tende a completar em ≤12s.
- **Por query:** 12s (`PER_QUERY_TIMEOUT_MS`). Se uma query (chat, mensagens, conhecimento, etc.) não responder a tempo, usa-se um fallback (ex.: chat null, mensagens []) e o chat continua; 12s deixa margem ao stream em serverless (Vercel 60s).
- **Créditos no batch:** 12s (`CREDITS_IN_BATCH_TIMEOUT_MS`). Se a query de créditos não responder a tempo, a app usa o saldo inicial.
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
- **❌ Erro** — POSTGRES_URL em falta, incorreta, rede inacessível ou BD em baixo. Corrige a URL ou a rede e volta a tentar. Se testares via `GET /api/health/db`, a resposta 503 tem o formato `{ "ok": false, "error": "...", "latencyMs": <ms> }` — ver [REFERENCIA-ERROS-400.md](REFERENCIA-ERROS-400.md#503--get-apihealthdb-base-de-dados-indisponível).
- **❌ "canceling statement due to statement timeout" (código 57014)** — O pooler (Supabase porta 6543) tem um `statement_timeout` no servidor (ex.: 8s) que não é alterável pelo cliente. Em cold start a ligação demora mais e a query do ping pode ser cancelada. O script mostra sugestões: **1)** Correr `pnpm db:ping` de novo (2.ª vez = ligação quente). **2)** Para o ping só: usar a connection string em **Session mode** (porta **5432**) em vez do pooler (6543) — Supabase *Settings → Database* → Connection string → **Session**. A app do chat continua a usar o pooler (6543) em produção.
- **❌ "unsupported startup parameter: options"** — O pooler Supabase (porta 6543 / Supavisor) não aceita o parâmetro `options` na connection string. O código já evita enviar esse parâmetro quando usa o pooler (URL com `:6543/` ou `pooler.supabase.com`). Se o erro persistir, confirma que `POSTGRES_URL` usa a porta **6543** e reinicia o servidor (`pnpm dev`).

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

**4.2 Produção (Vercel): reduzir timeouts e cold start**

Para que o mesmo problema não se repita em produção:

1. **Pooler obrigatório** — Em produção (Vercel) a `POSTGRES_URL` **tem de** usar o pooler (Supabase: porta **6543**; Neon: endpoint pooled). Sem isto, cold start e timeouts são muito mais frequentes. Ver `docs/vercel-setup.md` e variáveis em Vercel → Settings → Environment Variables.
2. **Cron de aquecimento** — O projeto inclui um **Vercel Cron** em `vercel.json` que chama `GET /api/health/db` de **10 em 10 minutos**. Assim a BD (Supabase/Neon) mantém-se “acordada” e o primeiro pedido de um utilizador tem menos probabilidade de apanhar cold start. O cron só corre em **Production**; após o deploy, não é preciso configurar nada extra.
3. **DbWarmup no cliente** — Ao abrir `/chat`, o componente `DbWarmup` chama `GET /api/health/db` em background. Isso aquece uma ligação assim que o utilizador entra na área do chat; quando ele envia a primeira mensagem, a BD pode já estar quente (sobretudo se o cron tiver corrido recentemente).

Resumo: em **desenvolvimento** usa pooler (6543) e, se quiseres, `pnpm db:ping` ou abrir `/chat` antes de enviar mensagens; em **produção** usa sempre pooler e o cron + DbWarmup reduzem cold start.

**Quando virar SaaS (muitos chamados):** para reduzir timeouts e carga com muitos utilizadores concorrentes, ver **`docs/ESCALA-SAAS-BD.md`** — cache distribuído (Redis) para créditos e overrides no chat, BD sempre ligada (plano sem auto-pause), e outras medidas de escala.

**4.3 Aumentar o timeout do batch (último recurso)**

O limite está em `app/(chat)/api/chat/route.ts`:

- `DB_BATCH_TIMEOUT_MS` — atualmente **120_000** (120s). Se a BD for consistentemente lenta, podes subir para 180s. A mensagem de erro ao utilizador indica o valor em segundos.
- Não reduzas abaixo de 60s; o cold start do Supabase/Neon pode levar 10–30s e várias queries correm em paralelo.

**Nota:** O aumento do timeout não resolve o cold start; apenas permite esperar mais. O que realmente melhora é pooler (6543) + cron + DbWarmup (secção 4.2).

---

## 5. Testes E2E (Playwright) e BD lenta

Se os testes `pnpm test` falham com **503 GuestSignInTimeout** ou timeouts ao carregar `/login`/`/register`:

1. **Usar pooler (porta 6543)** — Em `POSTGRES_URL` (em `.env.local`) usa a connection string com **porta 6543** (Supabase: *Settings → Database* → Connection string → **Transaction**). O pooler reduz cold start e contenção; com porta 5432 (Session) o sign-in guest e o GET /api/credits podem exceder os timeouts em E2E.
2. **Aquecer antes dos testes** — O projeto faz warmup em `beforeAll` (GET /api/health/db) nos testes de **auth** e **e2e-guest**; mesmo assim, a primeira ligação do processo Next (webServer) pode ser lenta. Para maior estabilidade, usa **`pnpm test:with-warmup`** (corre `pnpm db:ping` e depois `pnpm test`). Em CI, o workflow Playwright executa `pnpm db:ping` antes dos testes para aquecer a BD.
3. **Retries e timeouts** — Os testes de auth usam `gotoAuthPageWithRetry` (até 5 tentativas) e a rota guest tem timeout de 30s em E2E. Os projetos **e2e-guest** e **e2e-auth** têm **1 retry em CI** (`playwright.config.ts`) para atenuar falhas por BD fria ou re-renders. Se continuarem a falhar, confirma o ponto 1 (pooler 6543) e a rede até à BD.

Ver também: **supabase/README.md** (secção «Revisão rápida com Supabase CLI») para obter `POSTGRES_URL` com pooler 6543 via Dashboard; `app/(auth)/api/auth/guest/route.ts` (GUEST_SIGNIN_TIMEOUT_MS); `tests/e2e/auth.test.ts` (gotoAuthPageWithRetry); e `.env.example` (POSTGRES_URL com 6543).

**5.1 Produção vs. testes E2E — vai funcionar em produção?**

Sim. Em produção (ex.: Vercel) o comportamento é diferente do ambiente de testes:

- **Produção:** Usas **POSTGRES_URL com pooler (porta 6543)**. Cada invocação serverless pode ter um cold start ocasional; o utilizador pode reenviar o pedido. A app tem timeouts e fallbacks (ex.: guest 30s só em E2E; créditos/chat com fallback após 12s).
- **Testes E2E:** Um único processo Next.js serve vários testes em paralelo; as primeiras requisições (guest, `/chat`, agents, history) competem pela mesma BD. Se a BD estiver fria ou lenta, alguns testes falham por timeout mesmo que a lógica esteja correta. Por isso falhas nos testes **não significam** que produção está errada — desde que em produção uses pooler 6543 e a BD esteja acessível.

**5.2 Próximos passos se os testes continuarem a falhar**

1. **Confirmar pooler em CI** — No repositório (GitHub Actions), o secret `POSTGRES_URL` deve usar a connection string com **porta 6543** (Supabase → Settings → Database → Transaction).
2. **Usar `pnpm run test:with-warmup`** em local antes de fazer push.
3. **Aceitar retries em CI** — Os projetos e2e-guest e e2e-auth já têm 1 retry em CI; a segunda execução costuma passar com a BD mais quente.
4. **Opcional:** Ativar 1 retry também em local (`playwright.config.ts`: `retries: 1` para e2e-guest e e2e-auth) para reduzir falhas intermitentes.
5. Se um teste falhar de forma consistente (ex.: sempre que corre em último), pode ser contenção; considerar reduzir workers ou ordenar testes sensíveis.

---

## 6. Aviso no console: "preloaded but not used within a few seconds"

Se no **DevTools (Console)** aparecer *"The resource &lt;URL&gt; was preloaded using link preload but not used within a few seconds from the window's load event"*:

- **Causa:** O Next.js (ou o browser) faz preload de recursos (ex.: fontes via `next/font`). Quando a página demora a renderizar — por exemplo porque a BD está lenta e o primeiro conteúdo só aparece após 15–25s — o recurso preloaded não é "usado" nos primeiros segundos após o `load`, e o browser avisa.
- **O que fizemos:** As fontes no `app/layout.tsx` usam `display: "optional"` para que o preload seja considerado opcional e este aviso não seja disparado quando a primeira pintura atrasa.
- **Se o aviso continuar:** Pode ser outro recurso (ex.: chunk de uma rota). Resolver a lentidão da BD (pooler 6543, aquecimento, ver secções acima) reduz o atraso do primeiro render e tende a eliminar o aviso.

---

## 7. Resumo rápido

| Situação | Ação |
|----------|------|
| POSTGRES_URL em falta ou errada | Corrigir em `.env.local`; ver `.env.example`. Formato: `postgresql://user:pass@host:port/db`. |
| Não sabes se a BD responde | `pnpm db:ping`. |
| Primeira mensagem após muito tempo sem usar | Tentar de novo (cold start). |
| Sempre lento / timeout no chat | Usar URL do **pooler** (Supabase porta **6543**); em local dev, se o pooler for lento, testar Session (porta **5432**) só em `.env.local`. Se ainda falhar, aumentar `DB_BATCH_TIMEOUT_MS` (ex.: 120_000). |
| Timeout só na query de créditos | A app usa saldo inicial após 12s; o resto do chat continua. Se quiseres, podes subir `CREDITS_IN_BATCH_TIMEOUT_MS` no `route.ts`. |

**Como reduzir o tempo de resposta:** (1) Pooler (6543) + aquecimento (DbWarmup ao abrir `/chat`, cron em produção). (2) O batch do chat usa o cache de créditos em memória quando existir (ex.: após o utilizador ter carregado a sidebar/credits); assim evita uma query à BD por mensagem quando o saldo está em cache. (3) Plano de BD sem auto-pause (Supabase Pro / Neon Scale) elimina cold start. (4) Cache distribuído (Redis) para créditos e overrides — ver `docs/ESCALA-SAAS-BD.md`.

---

## 8. Afinar timeouts e conexão (resumo)

| O quê | Onde | Valor atual / sugestão |
|-------|------|-------------------------|
| Timeout do batch de queries do chat | `app/(chat)/api/chat/route.ts` → `DB_BATCH_TIMEOUT_MS` | 120_000 (120s). Rede de segurança. |
| Timeout por query (fallback) | `app/(chat)/api/chat/route.ts` → `PER_QUERY_TIMEOUT_MS` | 12_000 (12s). Por query (chat, mensagens, conhecimento, overrides, etc.); em timeout usa fallback e o chat continua. |
| Timeout da ligação ao iniciar o chat | `app/(chat)/api/chat/route.ts` → `ensureDbReady()` | 10s por tentativa, 1 retry (máx. ~20s). |
| Timeout da query de créditos dentro do batch | `app/(chat)/api/chat/route.ts` → `CREDITS_IN_BATCH_TIMEOUT_MS` | 12_000 (12s). Após este tempo usa-se saldo inicial. |
| Statement timeout (por sessão SQL) | `lib/db/queries.ts` → `ensureStatementTimeout()` | 120s. A app define na sessão ao iniciar o chat. |
| Timeout de ligação ao Postgres | `lib/db/queries.ts` → `getDb()` (opções do driver) | `connect_timeout: 10` (10s). |

**Conexão:** O projeto usa uma única conexão por processo (`max: 1`). Em Vercel cada invocação pode ser um processo novo, daí a importância do **pooler** (porta 6543) para não esgotar conexões e para menor latência.

---

## 9. Como identificar o gargalo

Para saber **qual query ou fase** está a travar o chat:

### 9.1 Logs do terminal (dev)

Com `pnpm dev`, cada POST /api/chat regista no terminal:

- `[chat-timing] dbBatch: starting…` — início do batch.
- `[chat-timing] dbBatch: getMessageCount done in Xms` (e o mesmo para getChatById, getMessagesByChatId, etc.) — **a query que tiver o X mais alto é a mais lenta**. A última a aparecer antes de "dbBatch: all done" é o gargalo do batch.
- `[chat-timing] dbBatch: getXXX timeout após 12000ms, a usar fallback` — essa query excedeu 12s e usou fallback; é um candidato a gargalo (cold start ou query pesada).
- `[chat-timing] dbBatch: all done in Xms` — tempo total do batch.

**Como usar:** Reproduz o problema (envia uma mensagem após um tempo sem usar). No terminal, anota qual query tem o maior "done in Xms" ou qual fez "timeout após 12000ms". Se várias fizerem timeout, o gargalo é provavelmente a **primeira ligação à BD** (cold start), que atrasa todas.

### 9.2 Medir cold start vs ligação quente

Noutro terminal (com o servidor parado ou sem ter feito pedidos ao chat há uns minutos):

```bash
pnpm db:ping
```

- **Primeira execução:** anota o tempo (ex.: 24s). Esse valor aproxima o **cold start** (ligação + primeira query).
- **Segunda execução imediata:** `pnpm db:ping` de novo. Se for muito mais rápido (ex.: 200ms), o gargalo é o cold start do Supabase/Neon; não é uma query específica lenta.

### 9.3 DEBUG_CHAT (tempo total por fase)

Em `.env.local` define `DEBUG_CHAT=true`, reinicia e envia uma mensagem. No terminal aparecem linhas como:

```
[chat-debug] timing: dbBatch 412
[chat-debug] preStreamPhases {"auth":25,"dbBatch":412,...}
```

- **dbBatch** alto (ex.: 40000) → o batch de BD é o gargalo; usa os logs do ponto 9.1 para ver qual query dentro do batch.
- **validationRag** ou **saveMessages** altos → o gargalo está noutra fase (RAG, gravação), não na BD do batch.

### 9.4 GET /api/credits lento (ex.: 19s+)

Se **GET /api/credits** demorar 15–20s, o tempo está quase todo na **primeira ligação à BD** (cold start) ou nas queries de saldo/uso. Em **desenvolvimento** (`pnpm dev`) o endpoint regista no terminal:

- `[credits-timing] ensureStatementTimeout: Xms` — tempo até a ligação estar pronta e o SET aplicado. Se X for > 10s, o gargalo é a conexão/cold start.
- `[credits-timing] getCreditBalance + getRecentUsage: Xms (total desde início: Yms)` — tempo das duas queries em paralelo. Se Y ≈ 19s e "ensureStatementTimeout" foi ~18s, o problema é a ligação; se "ensureStatementTimeout" foi rápido e o total alto, é uma das duas queries (ex.: `getRecentUsageByUserId`).

**Solução:** igual ao chat — usar **pooler** (porta 6543 no Supabase), reenviar o pedido (2.ª vez = ligação quente) ou aquecer com `GET /api/health/db` ao carregar a app.

### 9.5 Resumo: o que é normalmente o gargalo

| Cenário | Gargalo provável | Confirmação |
|--------|-------------------|-------------|
| Primeira mensagem após muito tempo sem usar | Cold start da BD (Supabase/Neon) | db:ping lento na 1.ª vez, rápido na 2.ª; várias queries com "timeout após 12s" ou tempos ~10–12s |
| Sempre lento, mesmo em pedidos seguidos | Query específica pesada ou rede/URL | Uma query com "done in Xms" muito maior que as outras; ou db:ping sempre lento |
| GET /api/credits também demora 20s+ | Conexão à BD (ou cold start) | Ver 9.4: logs `[credits-timing]` em dev; primeira ligação do processo está lenta |

---

## 10. Os pontos corrigidos são suficientes?

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

## 11. Referências

- **Debug do chat (logs, fases):** `docs/CHAT-DEBUG.md`
- **Script de ping:** `scripts/db-ping.ts` — `pnpm db:ping`
- **Schema e migrações:** `lib/db/queries.ts`, `lib/db/schema.ts`, `pnpm db:migrate`
- **Revisão Postgres e erros:** `docs/DB-POSTGRES-REVIEW.md`
- **Deploy e POSTGRES_URL:** `docs/vercel-setup.md` (porta 6543 em produção)
