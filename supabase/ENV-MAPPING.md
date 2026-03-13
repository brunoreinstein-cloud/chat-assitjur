# Mapeamento: variáveis Supabase → .env.local

Este projeto usa **POSTGRES_URL** e **AUTH_SECRET**; opcionalmente as chaves Supabase se fores usar Auth/Storage/Realtime do Supabase.

Coloca **apenas** no `.env.local` (nunca commitar). Valores obtidos no [Dashboard Supabase](https://supabase.com/dashboard) → teu projeto → Settings → API / Database.

## Obrigatório para o chatbot

| No .env.local   | Origem / valor |
|-----------------|----------------|
| `POSTGRES_URL`  | Connection string do Postgres. No Supabase: **Settings** → **Database** → **Connection string** → escolher **Transaction** (porta **6543**, pooler). Formato: `postgresql://postgres.[ref]:[PASSWORD]@[region].pooler.supabase.com:6543/postgres`. A porta 6543 reduz cold start e timeouts (chat e testes E2E). Ver **supabase/README.md** (secção «Revisão rápida com Supabase CLI») e **docs/DB-TIMEOUT-TROUBLESHOOTING.md**. |
| `AUTH_SECRET`   | Segredo do NextAuth. Pode ser o **JWT Secret** do Supabase (Settings → API → JWT Secret) ou gerar um: `openssl rand -base64 32` ou [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32). |

## Cliente Supabase (Auth, Storage, Realtime)

Com estas variáveis o app usa **Supabase Storage** para upload de ficheiros (bucket `chat-files`). Senão usa Vercel Blob.

| No .env.local                  | Descrição |
|--------------------------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL`     | URL do projeto (ex. `https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Chave anon/public (exposta no cliente) |
| `SUPABASE_SERVICE_ROLE_KEY`   | Chave service_role (só no servidor; nunca em `NEXT_PUBLIC_*`) |
| `SUPABASE_STORAGE_BUCKET`     | (Opcional) Nome do bucket. Default: `chat-files`. O bucket é criado/atualizado no remoto com `pnpm run supabase:config-push` (definido em `supabase/config.toml` em `[storage.buckets.chat-files]`). Se usares outro nome, cria o bucket no Dashboard → Storage ou em `config.toml` e define aqui o mesmo nome. |

## Exemplo de variáveis com outro prefixo

Se tiveres variáveis com prefixo (ex. `assistjur_POSTGRES_URL`), no `.env.local` usa **os nomes que o app espera**:

- `POSTGRES_URL` = valor da tua connection string Postgres
- `AUTH_SECRET` = valor do JWT Secret ou um segredo gerado
- Opcional: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

O `.env.local` está no `.gitignore`; não adiciones segredos a ficheiros versionados.
