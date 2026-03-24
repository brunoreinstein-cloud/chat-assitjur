# Deployment & Infraestrutura

Guia completo para deploy em produção na Vercel com configuração de dependências (Redis, database, storage).

---

## Quick Start — Deploy em 5 Passos

```bash
# 1. Verificar variáveis obrigatórias
pnpm run config:check

# 2. Puxar variáveis do Vercel (se já vinculado)
pnpm run vercel:env:prod

# 3. Revisar configuração
pnpm run vercel:review

# 4. Build local
pnpm run prepush

# 5. Deploy
pnpm run vercel:deploy:prod
```

---

## 1. Variáveis de Ambiente

### Obrigatórias

| Variável | Descrição | Gerador |
|----------|-----------|---------|
| `AUTH_SECRET` | Segredo para sessões NextAuth | `openssl rand -base64 32` ou [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32) |
| `POSTGRES_URL` | Connection string PostgreSQL com **pooler** (porta 6543 no Supabase) | Supabase Dashboard → Settings → Database → Connection string → "Transaction" |

**Sem estas variáveis, a app redireciona para `/config-required`.**

### Altamente Recomendadas

| Variável | Descrição | Setup |
|----------|-----------|-------|
| `AI_GATEWAY_API_KEY` | Para usar Vercel AI Gateway fora da Vercel | [Vercel AI Gateway Console](https://console.vercel.ai/) |
| `BLOB_READ_WRITE_TOKEN` | Upload de ficheiros (Vercel Blob) | Vercel Dashboard → Storage → Blob → criar token |
| `REDIS_URL` | Cache de respostas LLM (opcional, reduz latência) | Ver secção [Redis Setup](#redis-setup-optional) |

### Opcionais (Supabase Storage)

Se usar Supabase em vez de Vercel Blob para upload:

| Variável | Descrição |
|----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL público do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anônima (cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave admin (servidor) |
| `SUPABASE_STORAGE_BUCKET` | Bucket para ficheiros (default: `chat-files`) |

---

## 2. Vercel CLI — Configuração Completa

Referência completa: [docs/vercel-cli.md](./vercel-cli.md)

### One-time Setup

```bash
# 1. Login
pnpm exec vercel login

# 2. Vincular repositório
pnpm run vercel:link

# 3. Puxar configuração
pnpm run vercel:pull

# 4. Puxar variáveis de desenvolvimento
pnpm run vercel:env
```

### Configurar Variáveis no Dashboard

1. Abrir Vercel Dashboard → Teu projeto
2. Settings → **Environment Variables**
3. Adicionar variáveis para **Production** (e opcionalmente **Preview**)
4. Fazer redeploy se já estiver deployado

### Sincronizar Variáveis Localmente

```bash
# Puxar env de desenvolvimento
pnpm run vercel:env

# Puxar env de produção (cuidado: sobrescreve .env.local)
pnpm run vercel:env:prod

# Enviar variáveis locais para Vercel
pnpm run vercel:env:push
```

---

## 3. Redis Setup (Opcional em Dev, Recomendado em Prod)

### Por que Redis?

- **Serverless:** Vercel roda em instâncias efémeras; cache em memória não persiste entre requests
- **Performance:** Evita chamar o LLM repetidamente para respostas iguais
- **Reduz custos:** Menos chamadas ao AI Gateway = menos gasto

### Em Desenvolvimento

**Opcional.** Se não configurar Redis:
- Cache de LLM é desabilitado (visível no log: `[cache] Redis not available`)
- Cada chat chama o LLM (mais lento, sem problema)
- Tudo funciona normalmente

Para testar Redis localmente:

```bash
# Instalar Redis local (macOS)
brew install redis
redis-server

# Ou Docker
docker run -p 6379:redis redis:latest

# Depois em .env.local
export REDIS_URL="redis://localhost:6379"
pnpm dev
```

### Em Produção (Recomendado)

#### Opção 1: Upstash Redis (Recomendado para Vercel)

Upstash é serverless e funciona bem com Vercel Edge Functions.

**Setup:**

1. Criar conta em [upstash.com](https://upstash.com)
2. Criar database Redis
3. Copiar **REDIS_URL** (formato: `redis://default:[password]@[host]:[port]`)
4. Adicionar em Vercel Dashboard:
   - Settings → Environment Variables
   - Nome: `REDIS_URL`
   - Valor: URL copiada de Upstash
   - Ambientes: **Production** (e **Preview** se desejado)
5. Fazer redeploy: `pnpm run vercel:deploy:prod`

**Pricing:** Plano free: 10.000 comandos/dia, suficiente para a maioria dos casos. Plano paid: $0.2 por 100k comandos.

#### Opção 2: Vercel Redis (Beta)

Se tiver acesso a Vercel KV (Redis):

1. Vercel Dashboard → Storage → KV
2. Criar novo database
3. Copiar connection string
4. Adicionar como `REDIS_URL` no Environment Variables

#### Opção 3: AWS ElastiCache ou similares

Para infraestrutura mais robusta:

```bash
# Configurar em Vercel
REDIS_URL="redis://default:[password]@[host].ng.0001.use1.cache.amazonaws.com:6379"
```

### Verificar Conexão

```bash
# Com Redis configurado em .env.local ou Vercel
pnpm run health:ai
# Verá linhas como: [cache] Redis connected ou [cache] Redis not available
```

---

## 4. Database — PostgreSQL (Supabase ou Neon)

### Supabase (Recomendado)

**1. Criar projeto**
- [supabase.com](https://supabase.com) → New project
- Escolher região mais próxima
- Copiar password da BD

**2. Obter connection string**
- Dashboard → Settings → Database
- Connection string → **Transaction** (usa pooler, porta 6543)
  ```
  postgresql://postgres.[project]:[password]@db.[project].supabase.co:6543/postgres
  ```
- Substituir `[password]` e copiar

**3. Adicionar em Vercel**
- Settings → Environment Variables
- `POSTGRES_URL`: URL copiada acima
- Ambientes: **Production**

**4. Aplicar migrações**
```bash
# Local, com POSTGRES_URL de produção
pnpm run vercel:env:prod
pnpm run db:migrate
```

**⚠️ IMPORTANTE: Usar porta 6543 (pooler), não 5432**

Em serverless, a conexão direta (porta 5432) dá timeout. Supabase tem pooler em 6543 para Vercel.

### Neon (Alternativa)

Neon é similar a Supabase mas focado só em Postgres. Setup:

1. [neon.tech](https://neon.tech) → New project
2. Copiar connection string (já usa pooler por padrão)
3. Configurar em Vercel
4. Rodar migrações

---

## 5. Storage — Upload de Ficheiros

### Opção 1: Vercel Blob (Mais Simples)

**Setup:**
1. Vercel Dashboard → Storage → Blob
2. Criar novo store (ou usar existente)
3. Copiar token: `vercel_blob_rw_...`
4. Adicionar em Vercel Environment Variables:
   - `BLOB_READ_WRITE_TOKEN`: Token copiado
5. Redeploy

**Pricing:** Free: 1 GB, $0.50/GB após

### Opção 2: Supabase Storage

**Setup:**
1. Supabase Dashboard → Storage → New bucket
   - Nome: `chat-files`
   - Public (para permitir download)
2. Copiar URL e chaves (já tem em `.env.local` se usas Supabase)
3. Adicionar em Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Redeploy

**Ou usar config do projeto:**
```bash
pnpm run supabase:config-push
# Cria buckets definidos em supabase/config.toml
```

### Ficheiros Grandes (>4.5 MB)

Requer `BLOB_READ_WRITE_TOKEN` em Vercel para upload direto cliente → Blob. Se não configurado, ficheiros maiores usam a rota `POST /api/files/upload` (mais lento, passa pelo servidor).

---

## 6. Migrações da Base de Dados

### Primeira Execução (Novo Deploy)

```bash
# 1. Puxar env de produção
pnpm run vercel:env:prod

# 2. Aplicar schema e migrações
pnpm run db:migrate

# 3. Voltar a puxar env de desenvolvimento
pnpm run vercel:env
```

A app **não** corre migrações durante o build na Vercel (por segurança). Tens de correr manualmente uma vez.

### Atualizações Futuras

Quando criar uma migração nova:

```bash
# 1. Gerar migração
pnpm run db:generate

# 2. Fazer commit
git add lib/db/migrations/
git commit -m "feat(db): nova coluna xyz"

# 3. Fazer push
git push

# 4. No prod, após deploy, rodar migrações
pnpm run vercel:env:prod
pnpm run db:migrate
```

Ou automatizar com CI/CD (GitHub Actions, etc.) que chama `pnpm db:migrate` após deploy.

---

## 7. Checklist Pré-Deploy

**Sempre antes de fazer push:**

```bash
# Build local + lint + testes
pnpm run prepush

# Verificar variáveis
pnpm run config:check

# Se mudou POSTGRES_URL ou Redis
pnpm run health:ai
```

**Checklist visual:**
- [ ] `AUTH_SECRET` definido (Vercel ou `.env.local`)
- [ ] `POSTGRES_URL` com porta **6543** (se Supabase)
- [ ] Upload configurado (`BLOB_READ_WRITE_TOKEN` ou Supabase)
- [ ] `AI_GATEWAY_API_KEY` ou OIDC na Vercel
- [ ] Migrações aplicadas (primeira vez)
- [ ] `pnpm run prepush` passou (sem erros)

---

## 8. Troubleshooting

### Timeout na Ligação à Base de Dados

**Mensagem:** "A ligação à base de dados está a demorar demasiado"

**Causas possíveis:**

| Causa | Solução |
|-------|---------|
| POSTGRES_URL com porta 5432 | Usar port **6543** (pooler Supabase). Ver `docs/vercel-setup.md` secção 1. |
| Migrações não aplicadas | Correr `pnpm run db:migrate` uma vez |
| Base de dados parada | Em Supabase/Neon, verificar se projeto está ativo |
| Rede/DNS indisponível | Confirmar que `POSTGRES_URL` host é acessível |

**Diagnóstico:**
```bash
# Com POSTGRES_URL em .env.local
pnpm run db:ping
```

Se responder rápido (<2s), config está OK.

### "Insufficient funds" (AI Gateway)

A conta Vercel sem créditos para AI Gateway.

**Solução:** Vercel Dashboard → AI → Top up / adicionar créditos.

### Upload de Ficheiros Falha

**Mensagem:** "Configure Supabase Storage ou BLOB_READ_WRITE_TOKEN"

**Solução:**
1. Verificar `BLOB_READ_WRITE_TOKEN` em Vercel (Production)
2. Ou configurar Supabase Storage (bucket `chat-files`)
3. Redeploy após configurar

### Erro HTTP 500

Ver [vercel-setup.md — Troubleshooting](./vercel-setup.md) para diagnóstico completo (secção "Troubleshooting").

---

## 9. Monitoramento em Produção

### Logs

**Acessar logs em tempo real:**
```bash
pnpm run vercel:logs
```

**Ou no dashboard:** Vercel → Deployments → [deployment] → Logs (Runtime ou Functions)

### Health Check

```bash
# Verificar status do chat, DB, AI, Redis
pnpm run health:ai

# Também acessível via: GET /api/health
curl https://seu-app.vercel.app/api/health
```

### Performance

Em desenvolvimento, `POST /api/chat` regista timings:

```
[chat-timing] preStream: 2.3s (auth + queries + RAG)
[chat-timing] execute started
[chat-timing] onFinish: 15.2s (modelo + tools)
```

Em produção, estes logs não aparecem (apenas em modo dev com `NODE_ENV=development`).

---

## 10. CI/CD — Automatizar Migrações

### GitHub Actions (Exemplo)

```yaml
name: Deploy & Migrate

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 10

      - name: Install dependencies
        run: pnpm install

      - name: Build
        run: pnpm run build

      - name: Deploy to Vercel
        run: |
          pnpm exec vercel deploy --prod \
            --token=${{ secrets.VERCEL_TOKEN }}

      - name: Run migrations
        env:
          POSTGRES_URL: ${{ secrets.POSTGRES_URL }}
        run: pnpm run db:migrate
```

---

## 11. Referência Completa

- [vercel-setup.md](./vercel-setup.md) — Setup Vercel, variáveis, migrações, troubleshooting detalhado
- [vercel-cli.md](./vercel-cli.md) — Comandos da CLI Vercel
- [.env.example](../.env.example) — Todas as variáveis com comentários
- [DESENVOLVIMENTO.md](./DESENVOLVIMENTO.md) — Setup local

---

**Próximos passos?**
- Configurar primeiro em dev: `pnpm run vercel:env` + `pnpm dev`
- Depois verificar: `pnpm run config:check`
- Finalmente deploy: `pnpm run vercel:deploy:prod`
