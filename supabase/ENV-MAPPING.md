# Mapeamento: variáveis Supabase → .env.local

Este projeto usa **POSTGRES_URL** e **AUTH_SECRET**; opcionalmente as chaves Supabase se fores usar Auth/Storage/Realtime do Supabase.

Coloca **apenas** no `.env.local` (nunca commitar). Valores obtidos no [Dashboard Supabase](https://supabase.com/dashboard) → teu projeto → Settings → API / Database.

## Obrigatório para o chatbot

| No .env.local   | Origem / valor |
|-----------------|----------------|
| `POSTGRES_URL`  | Connection string do Postgres. No Supabase: **Database** → **Connection string** (URI, ex. "Transaction" ou "Session" pooler). Preferir a que termina em `?pgbouncer=true` para a app e a **Direct** (non-pooling) para migrações se necessário. |
| `AUTH_SECRET`   | Segredo do NextAuth. Pode ser o **JWT Secret** do Supabase (Settings → API → JWT Secret) ou gerar um: `openssl rand -base64 32` ou [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32). |

## Cliente Supabase (Auth, Storage, Realtime)

Com estas variáveis o app usa **Supabase Storage** para upload de ficheiros (bucket `chat-files`). Senão usa Vercel Blob.

| No .env.local                  | Descrição |
|--------------------------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL`     | URL do projeto (ex. `https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Chave anon/public (exposta no cliente) |
| `SUPABASE_SERVICE_ROLE_KEY`   | Chave service_role (só no servidor; nunca em `NEXT_PUBLIC_*`) |
| `SUPABASE_STORAGE_BUCKET`     | (Opcional) Nome do bucket. Default: `chat-files`. Criar no Dashboard → Storage. |

## Exemplo de variáveis com outro prefixo

Se tiveres variáveis com prefixo (ex. `assistjur_POSTGRES_URL`), no `.env.local` usa **os nomes que o app espera**:

- `POSTGRES_URL` = valor da tua connection string Postgres
- `AUTH_SECRET` = valor do JWT Secret ou um segredo gerado
- Opcional: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

O `.env.local` está no `.gitignore`; não adiciones segredos a ficheiros versionados.
