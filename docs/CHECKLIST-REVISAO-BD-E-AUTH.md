# Checklist: revisão BD e Auth (lentidão e erros)

Use este documento para rever o que já foi alterado e o que falta validar para resolver lentidão da BD, timeouts e erros de auth (ClientFetchError).

---

## O que já foi feito (nesta sessão)

| Item | Onde | Estado |
|------|------|--------|
| **Aquecimento na página guest** | `app/(auth)/api/auth/guest/route.ts` | GET chama `/api/health/db` (até 3s) antes do form. **POST** faz warmup com retry (até 3 tentativas, 8s cada) antes do sign-in, estabilizando o pool no mesmo processo. |
| **Tratamento do pedido de sessão** | `app/api/auth/[...nextauth]/route.ts` | Pedidos ao endpoint de sessão tratados também com `pathname.includes("/session")` para evitar ClientFetchError quando o cliente recebe HTML. |
| **Doc. aquecimento** | `docs/DB-TIMEOUT-TROUBLESHOOTING.md` | Checklist rápido atualizado: guest page faz warmup; como aquecer manualmente (abrir `/api/health/db` ou `pnpm db:ping`). |
| **Doc. ClientFetchError** | `docs/REFERENCIA-ERROS-400.md` | Nova secção "Auth.js — ClientFetchError...": causas (AUTH_URL) e referência a errors.authjs.dev. |

---

## O que tens de rever / configurar

### 1. Variáveis de ambiente

| Variável | Onde verificar | Objetivo |
|----------|----------------|----------|
| **AUTH_URL** | `.env.local` | Deve ser a mesma origem do `pnpm dev` (ex.: `http://localhost:3300`). Evita ClientFetchError "Unexpected token '<', \"<!DOCTYPE \"...". |
| **POSTGRES_URL** | `.env.local` (e Vercel em prod) | Usar **porta 6543** (pooler). Supabase: Settings → Database → Connection string → **Transaction**. Reduz cold start e timeouts. Em produção (Vercel) é comum precisar de `?pgbouncer=true&connection_limit=1` para evitar "too many connections": `...@...6543/postgres?pgbouncer=true&connection_limit=1`. |

Referência: `.env.example` (comentários em cada variável).

### 2. Base de dados

- [ ] **Ligação:** `pnpm db:ping` — abre uma conexão ao pool e executa `SELECT 1`. Esperado: mensagem de sucesso (ex. "Ligação à base de dados OK") em &lt;3s. Se &gt;5s ou erro → rever POSTGRES_URL.
- [ ] **Pooler:** Confirmar que a URL tem `:6543` (não 5432) para ambiente serverless / produção.
- [ ] **Aquecimento antes de testar:** Abrir `http://localhost:3300/api/health/db` no browser ou correr `pnpm db:ping` antes de "Entrar como visitante" ou de enviar mensagens no chat.

### 3. Fluxo visitante (guest)

- [ ] **GET /api/auth/guest** → devolve HTML com form; o script chama `/api/health/db` e depois submete o form (até 3s).
- [ ] **POST /api/auth/guest** → 303 para `/chat`; se demorar muito (ex.: >30s), a BD está fria — aquecer primeiro (ver acima).
- [ ] Se aparecer **503** no POST guest: ver `docs/chat-guest-review.md` (AUTH_SECRET, POSTGRES_URL, etc.).
- [ ] **Loop de redirect após deploy:** se o `AUTH_SECRET` foi rotacionado em produção, sessões antigas ficam invalidadas. Limpar cookies de sessão do browser (ou usar janela anónima) e confirmar que `AUTH_SECRET` não mudou entre deploys sem avisar os utilizadores.

### 4. Chat e créditos lentos

- [ ] Se no terminal aparecer `[credits-timing] getCreditBalance + getRecentUsage: 10001ms` ou `[chat-timing] dbBatch: ... timeout após 12000ms`: a BD está lenta.
- [ ] **Ações:** POSTGRES_URL com 6543 (+ `connection_limit=1` em prod); aquecer a BD antes de usar; segundo pedido costuma ser mais rápido.
- [ ] **Timeout do dbBatch:** por query 12s (`PER_QUERY_TIMEOUT_MS` / `CREDITS_IN_BATCH_TIMEOUT_MS` em `app/(chat)/api/chat/route.ts`) para falhar mais cedo e deixar margem ao stream em serverless.
- [ ] Doc. completa: `docs/DB-TIMEOUT-TROUBLESHOOTING.md`.

### 4b. Chat — agente não retorna mensagem após tool call

- [ ] **Sintoma:** O agente executa a ferramenta (ex.: createRevisorDefesaDocuments) mas nenhuma mensagem aparece no chat.
- [ ] **Causa:** Falta de múltiplos steps no `streamText` — o stream encerra após o tool call sem dar turno ao modelo para gerar o texto de resposta.
- [ ] **Fix:** Em `app/(chat)/api/chat/route.ts` o `streamText` deve usar `stopWhen: stepCountIs(5)` (ou equivalente `maxSteps: 5`) para permitir vários turnos (tool → resposta). Ver `docs/RASTREAR-E-CORRIGIR-PROBLEMAS.md` → tabela sintoma/correção.

### 5. Erro "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"

- [ ] Se aparecer na consola (Auth.js): ver secção em `docs/REFERENCIA-ERROS-400.md` — confirmar **AUTH_URL** e que nenhum proxy reescreve `/api/auth/session` para HTML.

---

## Ordem sugerida de revisão

1. Confirmar **AUTH_URL** e **POSTGRES_URL** (porta 6543) em `.env.local`.
2. Correr `pnpm db:ping`; se OK, reiniciar `pnpm dev`.
3. Testar fluxo visitante: abrir `/api/auth/guest?redirectUrl=%2Fchat` (ou link "Entrar como visitante"); verificar que o POST devolve 303 e que o chat carrega.
4. Se o chat ou os créditos continuarem lentos: abrir antes `GET /api/health/db` (ou `pnpm db:ping`) e repetir; confirmar no terminal que os timings baixam.
5. Se aparecer ClientFetchError: ver `docs/REFERENCIA-ERROS-400.md` e validar AUTH_URL / rotas de sessão.

---

## Documentos de referência

- **Lentidão e timeouts BD:** `docs/DB-TIMEOUT-TROUBLESHOOTING.md`
- **Erros 400/503 e Auth:** `docs/REFERENCIA-ERROS-400.md`
- **Rastrear problemas (incl. agente sem resposta após tool):** `docs/RASTREAR-E-CORRIGIR-PROBLEMAS.md`
- **Variáveis de ambiente:** `.env.example`
