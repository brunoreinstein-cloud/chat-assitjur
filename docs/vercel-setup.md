# Rodar o projeto na Vercel

Checklist e passos para o deploy e execução do chatbot na Vercel.

---

## 1. Variáveis de ambiente

Configura em **Vercel → Settings → Environment Variables** (Production e/ou Preview). Referência completa em `.env.example`.

### Obrigatórias

| Variável        | Descrição |
|-----------------|-----------|
| `AUTH_SECRET`   | Segredo para sessões NextAuth. Gerar em [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32) ou `openssl rand -base64 32`. |
| `POSTGRES_URL`  | Connection string PostgreSQL. **Com Supabase:** usar sempre o **pooler** (porta **6543**), não a porta 5432. Dashboard → Settings → Database → Connection string → "Transaction" (URI com `:6543`). |

Se `AUTH_SECRET` ou `POSTGRES_URL` faltarem, a app redireciona para `/config-required`.

### Opcionais (recomendadas)

| Variável | Descrição |
|----------|-----------|
| `AI_GATEWAY_API_KEY` | Na Vercel pode usar OIDC; fora da Vercel é necessária para o chat. [Vercel AI Gateway](https://vercel.com/ai-gateway). |
| `BLOB_READ_WRITE_TOKEN` | Upload de ficheiros (Vercel Blob). [Vercel Blob](https://vercel.com/docs/vercel-blob). |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase: Auth e Storage. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | |
| `SUPABASE_SERVICE_ROLE_KEY` | |
| `SUPABASE_STORAGE_BUCKET` | Bucket para ficheiros do chat (default: `chat-files`). |
| `REDIS_URL` | Rate limiting do chat (opcional). [Vercel Redis](https://vercel.com/docs/redis). |

---

## 2. Migrações da base de dados

O script `pnpm run build` **não** corre migrações na Vercel (são ignoradas quando `VERCEL=1`). Tens de aplicar o schema uma vez.

### Opção A: Depois do primeiro deploy

Com a `POSTGRES_URL` já configurada no projeto Vercel:

```bash
pnpm run vercel:env:prod   # puxa env de production para .env.local
pnpm run db:migrate        # corre migrações contra a DB de produção
```

### Opção B: Vercel Postgres

Se usares **Vercel Postgres**, no dashboard pode existir a opção "Run migrations on deploy" ou um job de setup; segue a documentação do produto.

### Opção C: CI/CD

Num workflow (GitHub Actions, etc.), após o deploy ou num job separado, corre `pnpm run db:migrate` com `POSTGRES_URL` definida (por exemplo com secret).

---

## 3. Revisão pré-deploy

Antes de fazer deploy, corre a revisão automática (com `.env.local` preenchido ou após `pnpm run vercel:env:prod`):

```bash
pnpm run predeploy
```

Valida variáveis obrigatórias, porta da `POSTGRES_URL` (6543 no Supabase), ligação à DB e lint. Ver [pre-deploy-checklist.md](./pre-deploy-checklist.md) para o checklist completo.

---

## 4. Build e deploy

- **Deploy contínuo:** push para a branch ligada (ex.: `main`) dispara o build na Vercel.
- **CLI:** `pnpm run vercel:deploy` (preview) ou `pnpm run vercel:deploy:prod` (produção).

O projeto usa **Next.js 16** com Turbopack e a convenção **proxy** (em vez de `middleware`). O `packageManager` está definido como `pnpm@10.0.0` para coincidir com o lockfile na Vercel.

---

## 5. Troubleshooting

### HTTP 500 na Vercel

**Impacto no projeto:** O utilizador vê "Internal Server Error" ou a página/API falha sem mensagem útil. O chat, login, histórico e outras rotas que dependem de base de dados ou de APIs externas podem devolver 500.

**Causas comuns e como corrigir:**

| Causa | Correção |
|-------|----------|
| **POSTGRES_URL com porta errada (Supabase)** | Na Vercel, funções serverless não podem usar a conexão direta (porta 5432). Usa o **pooler** com porta **6543**. Em Supabase: Dashboard → Settings → Database → Connection string → "Transaction" (URI com `:6543`). Em `POSTGRES_URL` troca `:5432` por `:6543`. |
| **Variáveis de ambiente em falta ou mal copiadas** | `AUTH_SECRET` e `POSTGRES_URL` são obrigatórias. Se faltarem, o proxy pode redirecionar para `/config-required`; se estiverem mal (ex.: espaço em branco, valor de outro ambiente), a app pode dar 500. Confirma em Vercel → Settings → Environment Variables e faz redeploy. |
| **Migrações não aplicadas** | Se as tabelas não existirem na base de produção, as queries falham com 500. Corre as migrações uma vez: `pnpm run vercel:env:prod` e depois `pnpm run db:migrate`. |
| **Exceções não tratadas nas APIs** | Qualquer `throw` ou rejeição de Promise não capturada numa route (ex.: `/api/chat`, `/api/auth`, `/api/knowledge`) resulta em 500. Ver os logs para ver o stack trace. |
| **AI Gateway / provider** | Se o chat usar um modelo e a API key (ou OIDC na Vercel) falhar ou expirar, a rota `/api/chat` pode devolver 500. Confirma AI Gateway e variáveis na Vercel. |
| **Timeout ou memória** | A rota do chat tem `maxDuration = 60`. Pedidos muito longos ou uso excessivo de memória podem ser terminados pela Vercel com 500. |

**Como diagnosticar:** Vercel → projeto → **Deployments** → escolhe o deployment → **Logs** (aba Runtime). Aí vês o erro exato (ex.: conexão recusada ao Postgres, "relation does not exist", mensagem do provider de IA).

### CredentialsSignin (login / guest)

Se nos logs aparecer **`[auth][error] CredentialsSignin`**:

- **O que é:** O Auth.js lança este erro quando o provider Credentials devolve `null` no `authorize` (credenciais inválidas ou exceção dentro do `authorize`).
- **Causas possíveis:**
  1. **Email ou palavra-passe errados** – comportamento esperado; a API passa a responder com **401** em vez de 500.
  2. **Base de dados inacessível** – `POSTGRES_URL` com porta errada (usa **6543** no Supabase), migrações por aplicar ou rede. O `authorize` chama `getUser()` / `createGuestUser()`; se a DB falhar, o erro é capturado e o Auth.js lança CredentialsSignin.
- **O que fazer:** Confirma `POSTGRES_URL` (porta 6543), corre as migrações e testa com credenciais válidas. Em desenvolvimento, o servidor regista no console o erro real do `authorize` para facilitar o diagnóstico.

---

| Problema | Solução |
|----------|---------|
| Redirecionamento para `/config-required` | Falta `AUTH_SECRET` ou `POSTGRES_URL`. Configura em Settings → Environment Variables e faz redeploy. |
| Aviso "vercel" em dependencies | O pacote `vercel` foi removido das dependências; os scripts usam `npx vercel`. |
| Aviso `baseline-browser-mapping` desatualizado | Opcional: `pnpm add -D baseline-browser-mapping@latest`. |

---

## 6. Documentação relacionada

- [pre-deploy-checklist.md](./pre-deploy-checklist.md) – Revisão pré-deploy para evitar erro 500.
- [vercel-cli.md](./vercel-cli.md) – Comandos do Vercel CLI e fluxo de link/env.
- [.env.example](../.env.example) – Lista comentada de variáveis.
