# Migração para Supabase Pro

Guia para apontar o projeto ao projeto Supabase Pro (BD + Storage/Auth no mesmo projeto).

---

## 1. Obter a connection string com pooler (obrigatório)

Para a app e a Vercel **tens de usar o pooler** (porta **6543**), não a conexão direta (5432).

1. Abre o [Dashboard Supabase](https://supabase.com/dashboard) → teu projeto.
2. **Settings** → **Database**.
3. Em **Connection string** escolhe **"Transaction"** (modo pooler).
4. Copia a URI. O formato é do tipo:
   ```text
   postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```
5. Substitui `[YOUR-PASSWORD]` pela palavra-passe da base de dados (a mesma que usas na conexão direta, ou a que definiste no projeto).
6. Se o Dashboard mostrar **Session** (porta 5432), não uses essa URI para a app — usa apenas a **Transaction** (6543).

---

## 2. Variáveis de ambiente

Configura em **`.env.local`** (local) e na **Vercel** (Production/Preview). **Nunca commites `.env.local` nem chaves reais.**

### Obrigatórias para o chat (BD)

| Variável | Onde obter | Exemplo (placeholder) |
|----------|------------|------------------------|
| `POSTGRES_URL` | Dashboard → Database → Connection string → **Transaction** (6543). Substituir `[YOUR-PASSWORD]` pela password da BD. | `postgresql://postgres.XXXXX:[PASSWORD]@aws-0-XX.pooler.supabase.com:6543/postgres` |

### Supabase (Auth do Supabase opcional; Storage para ficheiros)

| Variável | Onde obter | Exemplo (placeholder) |
|----------|------------|------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard → Settings → **API** → Project URL | `https://[TEU-PROJECT-REF].supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard → Settings → **API** → Project API keys → **anon** **public** | (JWT longo) |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → Settings → **API** → Project API keys → **service_role** **secret** | (JWT longo) |

- O projeto usa **Auth.js (NextAuth)** com a BD Postgres; os utilizadores ficam na tabela da BD. As chaves Supabase são usadas para **Storage** (upload de ficheiros) e, se quiseres, para Realtime.
- Se usares Storage, cria o bucket **chat-files** em **Storage** no dashboard (ou usa o default referido no código). Opcional: `SUPABASE_STORAGE_BUCKET=chat-files`.

### Manter como até agora

- `AUTH_SECRET` — Auth.js (gerar se ainda não tiveres).
- `AUTH_URL` — em local: `http://localhost:3300`; na Vercel normalmente não é necessário.
- `AI_GATEWAY_API_KEY` (ou OIDC na Vercel) para o chat com modelos.

---

## 3. Passos da migração

### Local

1. Copiar `.env.example` para `.env.local` (se ainda não existir).
2. Preencher `POSTGRES_URL` com a URI **Transaction (6543)** do passo 1.
3. Preencher `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` com os valores do Dashboard → API.
4. Correr migrações contra a BD do Supabase Pro:
   ```bash
   pnpm db:migrate
   ```
5. Testar a ligação:
   ```bash
   pnpm db:ping
   ```
6. Iniciar a app e testar o chat:
   ```bash
   pnpm dev
   ```

### Vercel (produção)

**Opção A — Via CLI (recomendado se já tens .env.local atualizado):**

1. Garante que o projeto está ligado à Vercel: `pnpm run vercel:link` (se ainda não fizeste).
2. Envia as variáveis de `.env.local` para a Vercel (**Production**):
   ```bash
   pnpm run vercel:env:push
   ```
   O script envia para Production: `POSTGRES_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Para **Preview**, no dashboard Vercel → Settings → Environment Variables podes copiar de Production para Preview. Ver `scripts/vercel-env-push.ts`.
3. Fazer **redeploy** para aplicar: `pnpm run vercel:deploy:prod` (ou push para a branch ligada).

**Opção B — Manualmente no dashboard:**

1. **Settings** → **Environment Variables**.
2. Adicionar/atualizar as mesmas variáveis com os valores do novo projeto Supabase Pro.
3. Fazer **redeploy**.

Se a BD de produção for nova (sem migrações aplicadas), correr as migrações uma vez contra a `POSTGRES_URL` de produção (por exemplo a partir de local com `POSTGRES_URL` apontando ao projeto Pro, ou via job/script que uses a mesma variável).

---

## 4. Segurança

- **Nunca** commitar `.env.local` nem colar chaves em ficheiros versionados.
- A **service_role** tem acesso total ao projeto; não a exponhas no cliente (só em variáveis de ambiente no servidor).
- Se alguma chave ou password tiver sido exposta (por exemplo em chat ou screenshot), no Dashboard Supabase: **Settings → API** pode ser possível rodar as chaves ou alterar a password da BD; faz isso e atualiza as variáveis.

---

## 5. Referências no projeto

- Connection string e pooler: `docs/DB-TIMEOUT-TROUBLESHOOTING.md`, `docs/vercel-setup.md`.
- Variáveis: `.env.example`.
- Comparativo Pro vs Neon: `docs/COMPARATIVO-SUPABASE-PRO-VS-NEON-SCALE.md`.
