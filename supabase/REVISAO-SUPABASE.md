# Revisão completa: Supabase no projeto (CLI + Storage)

## 1. O que está integrado (✅)

### 1.1 Banco de dados (Postgres)
- **Conexão:** O app usa `POSTGRES_URL` em `.env.local` para falar com o Postgres (Supabase ou outro). Toda a persistência passa por **Drizzle** + **postgres.js** em `lib/db/queries.ts` e `lib/db/schema.ts`.
- **Migrações:** `pnpm run db:migrate` aplica as migrações Drizzle no banco apontado por `POSTGRES_URL`. Se `POSTGRES_URL` for a connection string do Supabase, o banco remoto fica atualizado com o schema do app.
- **Drizzle config:** `drizzle.config.ts` usa `POSTGRES_URL` (carrega de `.env.local`). Schema em `lib/db/schema.ts`, migrations em `lib/db/migrations/`.

### 1.2 Supabase CLI
- **Link:** Projeto vinculado ao Supabase remoto (ref em `supabase/.temp/project-ref`).
- **Scripts no `package.json`:**
  - `supabase:link` – vincular ao projeto remoto
  - `supabase:config-push` – envia `config.toml` para o remoto (Auth, **Storage buckets**, etc.)
  - `supabase:api-keys` – lista API keys em formato env
  - `supabase:env` – gera NEXT_PUBLIC_SUPABASE_* e SUPABASE_SERVICE_ROLE_KEY (e indica SUPABASE_STORAGE_BUCKET)
  - `supabase:start` / `supabase:stop` / `supabase:status` – Supabase local (Docker)
  - `supabase:types` – gera `lib/db/supabase-types.ts` a partir do schema remoto
- **Dependência:** `supabase` (CLI) em `devDependencies`.

### 1.3 Storage (Supabase)
- **Uso:** A rota de upload `app/(chat)/api/files/upload/route.ts` usa **Supabase Storage** quando `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão definidas (`getSupabaseServerClient()` em `lib/supabase/server.ts`). Se não houver cliente Supabase, a app faz fallback para **Vercel Blob** (ou data URL em dev).
- **Bucket:** Nome do bucket = `process.env.SUPABASE_STORAGE_BUCKET ?? "chat-files"`. O bucket **chat-files** está definido em `supabase/config.toml` em `[storage.buckets.chat-files]` (public, 5MiB, image/jpeg, image/png, application/pdf). Ao correr `pnpm run supabase:config-push`, esse bucket é criado/atualizado no projeto remoto.
- **Variável opcional:** `SUPABASE_STORAGE_BUCKET` no `.env.local`. Se não estiver definida, a app usa **chat-files**. Deve coincidir com o nome do bucket no `config.toml` (ou com um bucket que tenhas criado manualmente no Dashboard).

### 1.4 Documentação e env
- **supabase/README.md** – uso do CLI, link, config-push, Storage, scripts.
- **supabase/ENV-MAPPING.md** – mapeamento das variáveis Supabase → `.env.local` (inclui SUPABASE_STORAGE_BUCKET).
- **.env.example** – inclui `POSTGRES_URL` e variáveis opcionais Supabase (`NEXT_PUBLIC_SUPABASE_URL`, etc.) com referência a `supabase/ENV-MAPPING.md`.

---

## 2. Revisão completa via CLI e SUPABASE_STORAGE_BUCKET

### Passo 1: Login e projeto vinculado
```bash
pnpm exec supabase login
pnpm run supabase:link
```
O project ref fica em `supabase/.temp/project-ref`.

### Passo 2: Enviar configuração (Auth, Storage bucket)
```bash
pnpm run supabase:config-push
```
Confirma com `Y` se perguntar. Isto aplica o bucket **chat-files** (e restantes opções do `config.toml`) no projeto remoto.

### Passo 3: Variáveis para `.env.local`
```bash
pnpm run supabase:env
```
Copia o output para `.env.local`. O script gera:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET=chat-files` (recomendado; opcional – a app usa "chat-files" por defeito)

Adiciona manualmente:
- **POSTGRES_URL** – Dashboard → Settings → Database → Connection string → **Transaction** (porta **6543**).
- **AUTH_SECRET** – JWT Secret do Supabase ou `openssl rand -base64 32`.

### Passo 4: Verificar ligação à BD
```bash
pnpm db:ping
```
Se responder com latência aceitável (< 3s após warmup), a `POSTGRES_URL` está correta.

### Passo 5: (Opcional) Verificar bucket no Dashboard
No [Dashboard Supabase](https://supabase.com/dashboard) → teu projeto → **Storage**: confirma que existe o bucket **chat-files** (ou o nome que definiste em `SUPABASE_STORAGE_BUCKET`). Se usaste `supabase:config-push`, o bucket deve ter sido criado com as opções de `config.toml` (public, 5MiB, tipos JPEG/PNG/PDF).

### Passo 6: (Opcional) Gerar tipos
```bash
pnpm run supabase:types
```
Gera `lib/db/supabase-types.ts` a partir do schema remoto (usado pelo cliente Supabase em `lib/supabase/server.ts`).

---

## 3. O que NÃO está integrado (escolha do projeto)

### 3.1 Supabase Auth no frontend
- O projeto usa **NextAuth** (Credentials + tabela User no Postgres), não Supabase Auth.
- As variáveis Supabase (URL, anon key, service role) servem para **Storage** e para o cliente em `lib/supabase/server.ts`; não há login via Supabase no browser.

### 3.2 Supabase Realtime
- Não usado no código.

### 3.3 Uso de `lib/db/supabase-types.ts`
- O ficheiro é gerado por `pnpm run supabase:types` e contém o tipo `Database` e helpers.
- É importado por `lib/supabase/server.ts` para tipar o cliente. Se o schema remoto tiver tabelas vazias no tipo gerado, pode ser que o PostgREST não as exponha ou o ref seja outro; para Storage não é obrigatório.

---

## 4. Checklist resumido

| Item | Estado |
|------|--------|
| Postgres (Supabase) como backend da app | ✅ Via `POSTGRES_URL` + Drizzle |
| Migrações Drizzle a atualizar o banco | ✅ `pnpm run db:migrate` |
| Supabase CLI instalado e link feito | ✅ `supabase/.temp/project-ref` |
| Scripts `supabase:*` no package.json | ✅ link, config-push, api-keys, env, types |
| Config remota (Auth, Storage) | ✅ `pnpm run supabase:config-push` |
| Bucket **chat-files** no config.toml | ✅ `[storage.buckets.chat-files]` |
| Cliente @supabase/supabase-js (Storage no servidor) | ✅ `lib/supabase/server.ts` + upload route |
| Variáveis NEXT_PUBLIC_SUPABASE_* / SERVICE_ROLE | ✅ Necessárias para Storage |
| SUPABASE_STORAGE_BUCKET no .env.local | Opcional; default "chat-files" |
| Documentação (README, ENV-MAPPING, REVISAO) | ✅ |

---

## 5. Conclusão

- **Supabase está integrado como:** (1) fornecedor de Postgres via `POSTGRES_URL` + Drizzle; (2) **Storage** para upload de ficheiros do chat (bucket `chat-files`), com fallback para Vercel Blob quando o cliente Supabase não está configurado.
- **Revisão completa:** usar o CLI para `link`, `config-push` e `supabase:env`; preencher `.env.local` com URL, keys e opcionalmente `SUPABASE_STORAGE_BUCKET=chat-files`; confirmar o bucket no Dashboard e a ligação à BD com `pnpm db:ping`.
