# Supabase CLI – AssitJur

Este projeto usa **Drizzle** para migrações do banco (em `lib/db/migrations/`). O Supabase CLI serve para:

- **Vincular** o repositório ao projeto Supabase (remoto)
- **Subir** um Postgres local com Supabase (opcional)
- **Gerar tipos** TypeScript a partir do schema remoto (opcional)

## Primeira vez: vincular ao projeto Supabase

1. Faça login (abre o navegador):
   ```bash
   pnpm exec supabase login
   ```

2. Vincule ao projeto (use o **Project ref** do painel Supabase → Settings → General):
   ```bash
   pnpm run supabase:link
   ```
   Quando pedir, informe o **project ref** (ex.: `mcornqrgatpjzdmxzebv`) e a **senha do banco** (Database password do painel).

3. As variáveis de ambiente do projeto remoto podem ser puxadas com:
   ```bash
   pnpm exec supabase secrets list
   ```
   Para desenvolvimento, configure o `.env` com `POSTGRES_URL` (e outras) conforme o `.env.example`.

## Scripts disponíveis

| Comando | Descrição |
|--------|-----------|
| `pnpm run supabase:link` | Vincula ao projeto Supabase remoto |
| `pnpm run supabase:start` | Sobe Postgres + Studio local (Docker) |
| `pnpm run supabase:stop` | Para os serviços locais |
| `pnpm run supabase:status` | Mostra status e URLs locais |
| `pnpm run supabase:types` | Gera `lib/db/supabase-types.ts` a partir do schema remoto (requer `supabase link`) |

## Migrações

As migrações do app são feitas com **Drizzle** (`pnpm run db:migrate`). O schema é definido em `lib/db/schema.ts`. As pastas `supabase/migrations/` do CLI podem ficar vazias ou ser usadas só para extensões (ex.: pgvector) se necessário.
