# Revisão completa: Supabase no projeto

## 1. O que está integrado (✅)

### 1.1 Banco de dados (Postgres)
- **Conexão:** O app usa `POSTGRES_URL` em `.env.local` para falar com o Postgres (Supabase ou outro). Toda a persistência passa por **Drizzle** + **postgres.js** em `lib/db/queries.ts` e `lib/db/schema.ts`.
- **Migrações:** `pnpm run db:migrate` aplica as migrações Drizzle no banco apontado por `POSTGRES_URL`. Se `POSTGRES_URL` for a connection string do Supabase, o banco remoto fica atualizado com o schema do app.
- **Drizzle config:** `drizzle.config.ts` usa `POSTGRES_URL` (carrega de `.env.local`). Schema em `lib/db/schema.ts`, migrations em `lib/db/migrations/`.

### 1.2 Supabase CLI
- **Link:** Projeto vinculado ao Supabase remoto (ref em `supabase/.temp/project-ref`).
- **Scripts no `package.json`:**
  - `supabase:link` – vincular ao projeto remoto
  - `supabase:start` / `supabase:stop` / `supabase:status` – Supabase local (Docker)
  - `supabase:types` – gera `lib/db/supabase-types.ts` a partir do schema remoto
- **Dependência:** `supabase` (CLI) em `devDependencies`.

### 1.3 Documentação e env
- **supabase/README.md** – uso do CLI, link, migrações, scripts.
- **supabase/ENV-MAPPING.md** – mapeamento das variáveis Supabase → `.env.local` (sem segredos).
- **.env.example** – inclui `POSTGRES_URL` e variáveis opcionais Supabase (`NEXT_PUBLIC_SUPABASE_URL`, etc.) com referência a `supabase/ENV-MAPPING.md`.

---

## 2. O que NÃO está integrado (escolha do projeto)

### 2.1 Cliente Supabase no código
- **Nenhum ficheiro** importa `@supabase/supabase-js` nem usa `createClient()`.
- O projeto **não usa**:
  - Supabase Auth (usa **NextAuth** com Credentials + tabela User no Postgres)
  - Supabase Realtime
  - Supabase Storage
  - Supabase REST/PostgREST a partir do frontend

Ou seja: Supabase entra **só como fornecedor de Postgres**; a app não usa a SDK do Supabase.

### 2.2 Variáveis opcionais Supabase
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` estão documentadas no `.env.example` como **opcionais**.
- São úteis **só se** no futuro integrares Auth/Storage/Realtime do Supabase; hoje o código não as usa.

### 2.3 Uso de `lib/db/supabase-types.ts`
- O ficheiro é gerado por `pnpm run supabase:types` e contém o tipo `Database` e helpers (`Tables`, `TablesInsert`, etc.).
- **Nenhum ficheiro do app importa** `supabase-types.ts`. Ou seja, os tipos estão disponíveis mas não são usados enquanto a app usar apenas Drizzle (que tem os seus próprios tipos em `lib/db/schema.ts`).
- Os tipos gerados ficam úteis se mais tarde usares o cliente `@supabase/supabase-js` com tipagem forte.

---

## 3. Observação: tipos gerados com `public` vazio

- Em `lib/db/supabase-types.ts`, o schema `public` aparece com `Tables: { [_ in never]: never }` (nenhuma tabela listada).
- As tabelas do Drizzle (`User`, `Chat`, `Message_v2`, etc.) estão no schema `public` e são criadas pelas migrações.
- Possíveis causas:
  - O Supabase CLI gera tipos a partir da exposição da API (PostgREST); tabelas podem não estar expostas ou o ref usado pode ser outro.
  - Ou as tabelas existem com nomes que o gerador não mapeia para o tipo.
- **Impacto atual:** Nenhum, porque o app não usa este ficheiro. Se no futuro usares o cliente Supabase com estes tipos, convém garantir que o schema remoto está exposto e voltar a correr `pnpm run supabase:types`.

---

## 4. Checklist resumido

| Item | Estado |
|------|--------|
| Postgres (Supabase) como backend da app | ✅ Via `POSTGRES_URL` + Drizzle |
| Migrações Drizzle a atualizar o banco | ✅ `pnpm run db:migrate` |
| Supabase CLI instalado e link feito | ✅ `supabase/.temp/project-ref` |
| Scripts `supabase:*` no package.json | ✅ link, start, stop, status, types |
| Documentação (README, ENV-MAPPING, .env.example) | ✅ |
| Cliente @supabase/supabase-js no código | ❌ Não usado (NextAuth + Drizzle) |
| Variáveis NEXT_PUBLIC_SUPABASE_* / SERVICE_ROLE | Opcionais; não usadas no código |
| Uso de supabase-types.ts no código | ❌ Não importado |

---

## 5. Conclusão

- **Supabase está integrado como fornecedor de Postgres:** a app usa o banco do projeto Supabase (ou outro) através de `POSTGRES_URL`, com schema e migrações geridos pelo Drizzle. O link do CLI e a geração de tipos estão configurados.
- **Não está integrado:** cliente Supabase (Auth/Realtime/Storage/REST) no código; a autenticação e a persistência são feitas com NextAuth + Drizzle.

Para o modelo atual do projeto (NextAuth + Drizzle + Postgres), a integração Supabase está **completa para o que o projeto usa**. Para usar Auth/Storage/Realtime do Supabase seria preciso adicionar `@supabase/supabase-js`, configurar as variáveis opcionais e passar a usar esses serviços no código.
