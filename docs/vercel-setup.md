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

**Nota:** A base de produção começa **vazia** (sem utilizadores). Os utilizadores criados em desenvolvimento ficam só na base local. Em produção, é preciso registar um novo utilizador (página Registo) ou usar "Continuar como visitante" para criar um guest nessa base.

---

## 2.1. Acesso em desenvolvimento local (/chat e guest)

Para aceder ao chat em local sem erros 500 ou redirects que falham:

1. **Servidor a correr:** `pnpm dev` (app em **http://localhost:3300**).
2. **URL no browser:** Usa **http://localhost:3300** (evita **http://127.0.0.1:3300** para o cookie de sessão coincidir com `AUTH_URL`).
3. **.env.local:** Define `AUTH_URL=http://localhost:3300` (ver `.env.example`). Sem isto, a rota `/api/auth/guest` pode devolver 500.
4. **Base de dados:** `POSTGRES_URL` definida e migrações aplicadas (`pnpm db:migrate`). O guest cria um utilizador na BD.

Ao abrir **http://localhost:3300/chat** sem sessão, a página redireciona automaticamente para guest e depois de volta ao chat. Se continuar a não conseguir aceder, verifica o terminal do `pnpm dev` por erros `[guest] sign-in failed:`.

### Erro "getaddrinfo ENOENT" ou "Failed to get user by email"

- **getaddrinfo ENOENT** ao correr `pnpm db:migrate` ou ao usar o chat/registo: o sistema não consegue resolver o host da `POSTGRES_URL` (ex.: `db.xxx.supabase.co`). Verifica:
  1. Ligação à Internet e DNS a funcionar.
  2. `POSTGRES_URL` em `.env.local` sem typos; no Supabase usar a connection string do pooler (porta **6543**).
  3. Se estiveres atrás de proxy/VPN, testar noutra rede ou desativar temporariamente.
- **Migrações a saltar:** Antes a variável `VERCEL` no `.env.local` (ex.: após `vercel env pull`) fazia `pnpm db:migrate` saltar. Isso foi corrigido: em local as migrações correm; só saltam no build na Vercel. Volta a correr `pnpm db:migrate` e confirma que não há erro de rede.

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

**Como diagnosticar o 500:**

1. Vercel → teu projeto → **Deployments** → clica no deployment em uso → **Logs** (aba **Runtime**).
2. Reproduz o 500 na app (abre a página ou ação que falha) e olha para os logs que aparecem nesse momento.
3. Procura a linha com o erro (stack trace ou mensagem). Exemplos: conexão recusada ao Postgres, `relation "X" does not exist`, `AUTH_SECRET is not set`, erro do provider de IA.

Se não aparecer nada nos Runtime Logs, abre **Functions** no mesmo deployment e inspeciona a função associada à URL que devolve 500; ou usa **Vercel → Logs** (stream em tempo real) enquanto reproduzes o erro.

### CredentialsSignin (login / guest)

**É um erro de autenticação, não de configuração.** O Auth.js lança `CredentialsSignin` quando o login é tentado mas as credenciais não batem com o que está na base de dados (ou o `authorize` falha por outro motivo).

Se nos logs aparecer **`[auth][error] CredentialsSignin`**:

- **Causas possíveis:**
  1. **Base de produção vazia** – A base local tem utilizadores criados em desenvolvimento; a base da Vercel (Supabase em produção) começa **vazia** e nunca recebeu esses utilizadores. Tentar fazer login com um email/palavra-passe criados só em local falha.
  2. **Email ou palavra-passe errados** – O utilizador existe na base mas a palavra-passe não coincide. A API responde com **401**.
  3. **Base de dados inacessível** – `POSTGRES_URL` com porta errada (usa **6543** no Supabase), migrações por aplicar ou rede; o `authorize` falha e o Auth.js lança CredentialsSignin.
- **O que fazer:**
  - **Produção nova:** Regista um utilizador em produção (página **Registo** da app) ou usa “Continuar como visitante” (cria um guest na base de produção). Não uses credenciais que só existem na base local.
  - Confirma `POSTGRES_URL` (porta 6543) e que as migrações foram aplicadas à base de produção.
  - Em desenvolvimento, o servidor regista no console o erro real do `authorize` para diagnóstico.

**Próximos passos quando vês CredentialsSignin em produção:**

1. Confirma se em produção já existe um utilizador na base (ou se usas guest). No **SQL Editor do Supabase** (Dashboard → SQL Editor), por exemplo: `SELECT id, email FROM "User" LIMIT 100;` — se a tabela estiver vazia, não há utilizadores.
2. Se não houver utilizadores: regista um novo na app em produção (página **Registo**) ou usa **"Continuar como visitante"** e volta a tentar.
3. Se já houver utilizadores: confirma que o email/palavra-passe que estás a usar são os dessa base (não os de desenvolvimento). Alternativa: usar Drizzle Studio com `POSTGRES_URL` de produção (`pnpm run vercel:env:prod` e depois `pnpm run db:studio`) para inspecionar a tabela `User`.

### Falha ao enviar o ficheiro (upload)

**Mensagem:** "Configure Supabase Storage (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) ou BLOB_READ_WRITE_TOKEN no .env.local."

O upload tenta primeiro **Supabase Storage** e, se falhar, **Vercel Blob**. O erro aparece quando ambos falham.

**O que fazer:**

1. **Configurar uma das opções (local: `.env.local`; Vercel: Environment Variables):**
   - **Supabase Storage:** define `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Cria o bucket **chat-files** no projeto: Supabase Dashboard → **Storage** → **New bucket** → nome `chat-files`, público. Ou envia a config do projeto: `pnpm run supabase:config-push` (aplica o bucket definido em `supabase/config.toml`).
   - **Vercel Blob (alternativa):** define `BLOB_READ_WRITE_TOKEN` (Vercel → Storage → Blob → criar e copiar o token).

2. **Se já tens as variáveis Supabase:** o bucket pode não existir. Cria o bucket `chat-files` em Storage (público) ou corre `pnpm run supabase:config-push`. Reinicia o servidor de desenvolvimento após alterar `.env.local`.

3. **Na Vercel:** garante que `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão definidas no ambiente (Production/Preview) e faz redeploy.

---

| Problema | Solução |
|----------|---------|
| Redirecionamento para `/config-required` | Falta `AUTH_SECRET` ou `POSTGRES_URL`. Configura em Settings → Environment Variables e faz redeploy. |
| Aviso "vercel" em dependencies | O pacote `vercel` foi removido das dependências; os scripts usam `npx vercel`. |
| Aviso "Failed to create bin... supabase" | O CLI Supabase não é dependência do projeto; os scripts (`supabase:link`, etc.) usam `npx supabase`. O build na Vercel não instala o CLI, pelo que este aviso não deve aparecer. |
| Aviso `baseline-browser-mapping` desatualizado | Opcional: `pnpm add -D baseline-browser-mapping@latest`. |
| **TimeoutNegativeWarning** (`-XXX is a negative number`, timeout set to 1) | O Auth.js (ou um middleware) agenda um refresh da sessão com um atraso `expires - now` em ms. Se a sessão já expirou ou o relógio do servidor está atrasado em relação à data de expiração (ex.: timezone da DB diferente da Vercel), o atraso fica negativo e o Node corrige para 1 ms. Pode aparecer junto de **CredentialsSignin**. Verifica timezone da base (secção abaixo) e garante que em produção o utilizador está a usar credenciais válidas na base de produção. |

### Timezone diferente entre base de dados (Supabase / Neon) e Vercel

Se datas/horas gravadas ou exibidas estiverem desfasadas (ex.: criação de chat, mensagens), pode ser diferença de timezone entre o Postgres (Supabase, Neon) e o servidor Vercel.

**Como verificar no SQL Editor (Supabase ou Neon):**

```sql
SELECT NOW(), CURRENT_TIMESTAMP, timezone('America/Sao_Paulo', NOW());
```

Se `NOW()` retornar horário diferente do que o servidor Vercel usa (ou do que esperas na UI), a causa é essa. O Postgres usa o timezone da instância; a Vercel corre em UTC. Para consistência, guarda sempre em UTC na base e converte para o fuso do utilizador na apresentação, ou alinha o timezone da base (conforme a oferta do Neon).

---

## 6. Documentação relacionada

- [pre-deploy-checklist.md](./pre-deploy-checklist.md) – Revisão pré-deploy para evitar erro 500.
- [vercel-cli.md](./vercel-cli.md) – Comandos do Vercel CLI e fluxo de link/env.
- [.env.example](../.env.example) – Lista comentada de variáveis.
