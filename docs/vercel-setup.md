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

## 3. Build e deploy

- **Deploy contínuo:** push para a branch ligada (ex.: `main`) dispara o build na Vercel.
- **CLI:** `pnpm run vercel:deploy` (preview) ou `pnpm run vercel:deploy:prod` (produção).

O projeto usa **Next.js 16** com Turbopack e a convenção **proxy** (em vez de `middleware`). O `packageManager` está definido como `pnpm@10.0.0` para coincidir com o lockfile na Vercel.

---

## 4. Troubleshooting

| Problema | Solução |
|----------|---------|
| Redirecionamento para `/config-required` | Falta `AUTH_SECRET` ou `POSTGRES_URL`. Configura em Settings → Environment Variables e faz redeploy. |
| HTTP 500 na Vercel | Com Supabase, usa **POSTGRES_URL** com porta **6543** (pooler), não 5432. Confirma as variáveis e consulta **Deployments → Logs (Runtime)** para o erro exato. |
| Aviso "vercel" em dependencies | O pacote `vercel` está em `devDependencies`; a Vercel ignora-o no build. Pode ser ignorado. |
| Aviso `baseline-browser-mapping` desatualizado | Opcional: `pnpm add -D baseline-browser-mapping@latest`. |

---

## 5. Documentação relacionada

- [vercel-cli.md](./vercel-cli.md) – Comandos do Vercel CLI e fluxo de link/env.
- [.env.example](../.env.example) – Lista comentada de variáveis.
