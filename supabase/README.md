# Supabase CLI – configuração completa

Este projeto usa **Drizzle** para migrações do banco (em `lib/db/migrations/`). O Supabase CLI serve para:

- **Vincular** o repositório ao projeto Supabase (remoto)
- **Enviar** a configuração local (`config.toml`) para o remoto (Auth, Storage, etc.)
- **Obter** as API keys para o `.env.local`
- **Subir** um Postgres local com Supabase (opcional)
- **Gerar** tipos TypeScript a partir do schema remoto

---

## Configurar tudo usando o CLI

Segue estes passos por ordem. O projeto já deve estar ligado (`supabase/.temp/project-ref` existe).

### 1. Login (se ainda não estiver autenticado)

```bash
pnpm exec supabase login
```

### 2. Vincular ao projeto (só na primeira vez)

Se ainda não vinculaste, usa o **Project ref** do painel (Settings → General):

```bash
pnpm run supabase:link
```

Ou diretamente: `pnpm exec supabase link --project-ref <TEU_PROJECT_REF>`.

### 3. Enviar configuração para o remoto

Envia o `supabase/config.toml` para o projeto ligado (Auth, Storage buckets, etc.):

```bash
pnpm run supabase:config-push
```

Confirma com `Y` se perguntar. Isto aplica, entre outras coisas, o bucket **chat-files** (Storage) e as opções de Auth definidas no `config.toml`.

### 4. Obter API keys e preencher `.env.local`

**Opção A – script que já gera os nomes certos** (recomendado):

```bash
pnpm run supabase:env
```

O output tem `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Copia essas linhas para o `.env.local` (não commitar). Adiciona também **POSTGRES_URL** e **AUTH_SECRET** (ver `.env.example` e **supabase/ENV-MAPPING.md**).

**Opção B – keys em formato env do CLI:**

```bash
pnpm run supabase:api-keys
```

O output usa `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. No `.env.local` usa:

- **NEXT_PUBLIC_SUPABASE_URL** = `https://<TEU_PROJECT_REF>.supabase.co` (ref em `supabase/.temp/project-ref`)
- **NEXT_PUBLIC_SUPABASE_ANON_KEY** = valor de `SUPABASE_ANON_KEY`
- **SUPABASE_SERVICE_ROLE_KEY** = valor de `SUPABASE_SERVICE_ROLE_KEY`

### 5. (Opcional) Gerar tipos TypeScript

```bash
pnpm run supabase:types
```

Gera `lib/db/supabase-types.ts` a partir do schema do projeto remoto.

### 6. (Opcional) Migrações do banco

O schema da app é gerido pelo **Drizzle**. Para aplicar migrações no banco (incluindo o do Supabase se for esse o `POSTGRES_URL`):

```bash
pnpm run db:migrate
```

---

## Resumo: um comando para “configurar tudo”

Depois de `supabase:link` e de preencheres o `.env.local` (com URL + keys do `supabase:api-keys`):

```bash
pnpm run supabase:config-push   # envia config (Storage, Auth, etc.)
pnpm run supabase:api-keys     # mostra keys → copiar para .env.local
pnpm run supabase:types        # (opcional) atualiza tipos
pnpm run db:migrate            # (opcional) aplica migrações Drizzle
```

Ou apenas:

```bash
pnpm run supabase:setup
```

que corre `supabase:config-push`. De seguida usa `supabase:api-keys` para obter as keys e preencher o `.env.local`.

---

## Scripts disponíveis

| Comando | Descrição |
|--------|-----------|
| `pnpm run supabase:link` | Vincula ao projeto Supabase remoto |
| `pnpm run supabase:config-push` | Envia `config.toml` para o projeto remoto (Auth, Storage, etc.) |
| `pnpm run supabase:api-keys` | Lista API keys em formato env (copiar para .env.local) |
| `pnpm run supabase:env` | Gera NEXT_PUBLIC_SUPABASE_* e SUPABASE_SERVICE_ROLE_KEY (copiar para .env.local) |
| `pnpm run supabase:setup` | Atalho para `supabase:config-push` |
| `pnpm run supabase:start` | Sobe Postgres + Studio local (Docker) |
| `pnpm run supabase:stop` | Para os serviços locais |
| `pnpm run supabase:status` | Mostra status e URLs locais |
| `pnpm run supabase:types` | Gera `lib/db/supabase-types.ts` a partir do schema remoto |

## Migrações

As migrações da app são feitas com **Drizzle** (`pnpm run db:migrate`). O schema está em `lib/db/schema.ts`. A pasta `supabase/migrations/` do CLI pode ficar vazia ou ser usada só para extensões (ex.: pgvector).

## Variáveis e mapeamento

Ver **supabase/ENV-MAPPING.md** para o mapeamento entre variáveis do Supabase e o que o app espera no `.env.local`.
