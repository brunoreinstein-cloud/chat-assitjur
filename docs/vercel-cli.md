# Vercel CLI – configuração completa

Comandos para vincular o repositório ao projeto na Vercel, sincronizar variáveis de ambiente e fazer deploy.

---

## Configurar tudo usando o CLI

Segue estes passos por ordem.

### 1. Login

Autentica com a conta Vercel (abre o navegador):

```bash
pnpm exec vercel login
```

### 2. Vincular ao projeto

Associa este diretório a um projeto Vercel (existente ou novo). Cria a pasta `.vercel/` (já no `.gitignore`):

```bash
pnpm run vercel:link
```

Escolhe o **scope** (team ou conta) e o **projeto** (usa um existente ou cria um novo a partir deste repo).

### 3. Puxar configuração e variáveis

Baixa as definições do projeto (build, env, etc.) e, em seguida, as variáveis de ambiente para desenvolvimento:

```bash
pnpm run vercel:pull
pnpm run vercel:env
```

`vercel:env` grava as variáveis do ambiente **Development** em `.env.local` (sobrescreve o ficheiro). Para production: `pnpm run vercel:env:prod`.

### 4. (Opcional) Abrir o projeto no dashboard

```bash
pnpm run vercel:open
```

### 5. Deploy

- **Preview** (branch atual, URL temporária):  
  `pnpm run vercel:deploy`
- **Produção**:  
  `pnpm run vercel:deploy:prod`

O deploy contínuo via **Git** (push na branch ligada) continua a funcionar; o CLI serve para deploys manuais e para puxar env.

---

## Resumo: um fluxo completo

```bash
pnpm exec vercel login
pnpm run vercel:link
pnpm run vercel:pull
pnpm run vercel:env
```

Depois de alterar variáveis no [Vercel Dashboard](https://vercel.com) (Settings → Environment Variables), atualiza o `.env.local`:

```bash
pnpm run vercel:env
```

---

## Scripts disponíveis

| Comando | Descrição |
|--------|-----------|
| `pnpm run vercel:link` | Vincula o diretório ao projeto Vercel |
| `pnpm run vercel:pull` | Baixa configuração e env do projeto (para `vercel build` / `vercel dev`) |
| `pnpm run vercel:env` | Grava variáveis de **Development** em `.env.local` |
| `pnpm run vercel:env:prod` | Grava variáveis de **Production** em `.env.local` |
| `pnpm run vercel:deploy` | Deploy de **preview** (branch atual) |
| `pnpm run vercel:deploy:prod` | Deploy em **production** |
| `pnpm run vercel:open` | Abre o projeto no dashboard no browser |
| `pnpm run vercel:logs` | Mostra logs do deployment (último ou por URL) |

---

## Variáveis de ambiente no dashboard

Configura no projeto Vercel (Settings → Environment Variables) as mesmas variáveis que estão em `.env.example`, por exemplo:

- `AUTH_SECRET`
- `POSTGRES_URL`
- `AI_GATEWAY_API_KEY` (ou usa OIDC na Vercel)
- `BLOB_READ_WRITE_TOKEN` (Vercel Blob)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (se usares Supabase)

Depois corre `pnpm run vercel:env` para atualizar o `.env.local` em desenvolvimento.

---

## Ficheiros relevantes

- **`vercel.json`** – Configuração do projeto (ex.: `framework: "nextjs"`).
- **`.vercel/`** – Dados do link (project id, org); não commitar (está no `.gitignore`).
