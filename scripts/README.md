# Scripts Utilitários

Documentação de scripts one-off e utilitários que não precisam estar em `package.json`.

---

## Quickstart

```bash
# Rodar um script
tsx scripts/[script-name].ts

# Listar todos
ls scripts/*.ts
```

---

## Scripts por Categoria

### 🗄️ Database Setup & Maintenance

#### `db-seed-redator-banco.ts`
**O que faz:** Seed inicial de documentos (teses, precedentes, cláusulas) na base de conhecimento.

**Quando usar:** Após criar novo projeto ou ao resetar base.

```bash
tsx scripts/db-seed-redator-banco.ts
```

**Saída:** Insere ~50 documentos de teste.

---

#### `db-add-agent-id.ts`
**O que faz:** Migração one-off que adiciona `agent_id` a chats antigos (para rastrear qual agente foi usado).

**Quando usar:** Apenas uma vez, após upgrade de schema.

```bash
tsx scripts/db-add-agent-id.ts
```

**Nota:** Idempotent (seguro rodar múltiplas vezes).

---

### 🔍 Health Checks & Debug

#### `check-ai-connection.ts`
**O que faz:** Verifica se conexão com AI Gateway (ou provider) está OK.

**Quando usar:** Antes de deploy, ou ao debugar problemas de chat.

```bash
tsx scripts/check-ai-connection.ts
```

**Saída esperada:**
```
✓ AI Gateway: Connected
✓ Model: grok-2-latest
✓ Response time: 245ms
```

**Erros comuns:**
- `AI_GATEWAY_API_KEY not set` → Configurar variável
- `Connection refused` → Gateway offline ou firewall bloqueando
- `401 Unauthorized` → API key inválida

---

#### `db-ping.ts`
**O que faz:** Testa conexão com database (latência, disponibilidade).

**Quando usar:** Debugar timeouts de BD.

```bash
tsx scripts/db-ping.ts
```

**Saída esperada:**
```
✓ Database reachable
✓ Latency: 45ms
✓ Tables: 12
```

---

#### `db-tables.ts`
**O que faz:** Lista todas as tabelas e coluna da BD.

**Quando usar:** Inspecionar schema sem UI.

```bash
tsx scripts/db-tables.ts
```

**Saída:**
```
Table: Chat
  - id (UUID, PK)
  - user_id (TEXT, FK)
  - agent_id (TEXT)
  - created_at (TIMESTAMP)
  ...

Table: Message
  ...
```

---

### 📊 Performance & Benchmarking

#### `benchmark-llm.ts`
**O que faz:** Testa latência end-to-end do LLM (incluindo streaming, tools, etc.).

**Quando usar:** Antes de otimizações, ou ao mudar provider.

```bash
tsx scripts/benchmark-llm.ts
```

**Parâmetros:**
```bash
# Testar com modelo diferente
NODE_ENV=production tsx scripts/benchmark-llm.ts --model=grok-2-latest

# Rodar N iterações
tsx scripts/benchmark-llm.ts --iterations=5
```

**Saída esperada:**
```
Modelo: grok-2-latest
Iteração 1: 1245ms
Iteração 2: 1180ms
Iteração 3: 1320ms
Média: 1248ms
P95: 1320ms
```

---

### ✅ Pre-Deploy Checks

#### `pre-deploy.ts`
**O que faz:** Checklist automático antes de deploy (variáveis, BD, lint, testes).

**Quando usar:** Antes de fazer push ou deploy.

```bash
tsx scripts/pre-deploy.ts
```

**Checklist:**
- [ ] `AUTH_SECRET` definida
- [ ] `POSTGRES_URL` com porta 6543 (se Supabase)
- [ ] BD acessível
- [ ] Lint passar (sem erros)
- [ ] Testes unitários passar
- [ ] Migrações aplicadas

**Saída:**
```
✓ AUTH_SECRET configured
✓ POSTGRES_URL valid (port 6543)
✓ Database connected (45ms)
✗ Lint has 2 errors (fix with: pnpm format)
✗ Tests failed (run: pnpm test:unit)

Fix issues above before deploying.
```

---

#### `check-config.ts`
**O que faz:** Verifica configuração sem rodar tudo (mais rápido que `pre-deploy.ts`).

**Quando usar:** Debugar problemas de config.

```bash
tsx scripts/check-config.ts
```

**Verifica:**
- Variáveis obrigatórias presentes
- POSTGRES_URL válida
- Formatos de env vars corretos

---

### 📁 Supabase Management

#### `supabase-env.ts`
**O que faz:** Sincroniza variáveis Supabase com Vercel.

**Quando usar:** Ao configurar novo projeto Supabase.

```bash
tsx scripts/supabase-env.ts
```

---

### 🚀 Vercel Management

#### `vercel-env-push.ts`
**O que faz:** Envia variáveis de `.env.local` para Vercel Environment Variables.

**Quando usar:** Ao atualizar variáveis em produção (ex.: nova REDIS_URL).

```bash
tsx scripts/vercel-env-push.ts
```

**Cuidado:** Sobrescreve variáveis no Vercel. Fazer backup antes:
```bash
pnpm run vercel:env:prod > .env.backup
tsx scripts/vercel-env-push.ts
```

---

#### `vercel-review-env.ts`
**O que faz:** Revisa variáveis de `.env.local` antes de enviar para Vercel.

**Quando usar:** Antes de usar `vercel-env-push.ts`.

```bash
tsx scripts/vercel-review-env.ts
```

**Checklist:**
- Variáveis obrigatórias presentes
- Sem typos em nomes
- Sem valores em plaintext que deviam ser secretos
- POSTGRES_URL porta correta (6543)

---

## Como Adicionar Novo Script

### 1. Criar arquivo

```bash
touch scripts/my-script.ts
```

### 2. Template básico

```typescript
/**
 * my-script.ts
 *
 * O que faz: Descrição curta.
 * Quando usar: Quando preciso de X.
 *
 * Uso: tsx scripts/my-script.ts [args]
 */

import { db } from "@/lib/db/connection";
import { users } from "@/lib/db/schema";

async function main() {
  console.log("[my-script] Starting...");

  try {
    // Lógica aqui
    const count = await db.select().from(users);
    console.log(`[my-script] Found ${count.length} users`);
  } catch (error) {
    console.error("[my-script] Error:", error);
    process.exit(1);
  }

  console.log("[my-script] Done!");
  process.exit(0);
}

main();
```

### 3. Testar

```bash
tsx scripts/my-script.ts
```

### 4. Documentar em `scripts/README.md`

(Adicionar seção acima)

### 5. Não adicionar em `package.json`

Scripts one-off ficam em `scripts/` folder. Só adicionar ao `package.json` se for recorrente (tipo `pnpm dev`, `pnpm build`, etc.).

---

## Environment Variables para Scripts

Todos os scripts usam `.env.local`:

```bash
# .env.local (local dev)
POSTGRES_URL=postgresql://...
AI_GATEWAY_API_KEY=...
REDIS_URL=redis://...

# Rodar script
tsx scripts/benchmark-llm.ts
```

Para production:

```bash
# Puxar env de produção
pnpm run vercel:env:prod

# Rodar script com env de prod
tsx scripts/check-ai-connection.ts
```

---

## Troubleshooting

### Erro: "Cannot find module 'drizzle-orm'"

```bash
# Instalar dependências
pnpm install

# Ou se não funcionar, limpar cache
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Erro: "POSTGRES_URL not set"

```bash
# Configurar em .env.local
echo "POSTGRES_URL=postgresql://..." >> .env.local

# Ou puxar do Vercel
pnpm run vercel:env
```

### Erro: "Cannot read property 'id' of null"

Alguma coisa não existe na BD. Verificar:
1. BD está vazia?
2. Rodou migrações? (`pnpm run db:migrate`)
3. Seed dados? (`tsx scripts/db-seed-redator-banco.ts`)

---

## Performance Tips

### Rodar várias verificações

```bash
# Em paralelo (rápido)
pnpm run check & pnpm run db:ping & tsx scripts/check-ai-connection.ts

# Em sequência (seguro)
pnpm run check && pnpm run db:ping && tsx scripts/check-ai-connection.ts
```

### Background jobs

Se script é longo, rodar em background:

```bash
# Rodar e desligar do terminal
tsx scripts/benchmark-llm.ts > /tmp/benchmark.log 2>&1 &

# Ver output depois
cat /tmp/benchmark.log
```

---

## Referência Rápida

| Script | Tempo | Frequência | Descrição |
|--------|-------|-----------|-----------|
| `db-seed-redator-banco.ts` | 5-10s | Once (setup) | Seed documentos |
| `db-add-agent-id.ts` | 1-5s | Once (upgrade) | Migração histórica |
| `check-ai-connection.ts` | 2-3s | Before deploy | Test AI Gateway |
| `db-ping.ts` | <1s | Debug | Test BD latency |
| `db-tables.ts` | <1s | Inspect | List tables |
| `benchmark-llm.ts` | 30-60s | Before optimize | LLM latency test |
| `pre-deploy.ts` | 30-60s | Before push | Full checklist |
| `check-config.ts` | 1-2s | Debug | Quick config check |
| `vercel-env-push.ts` | 5-10s | Rare | Enviar vars para Vercel |
| `vercel-review-env.ts` | <1s | Before push | Revisar antes de enviar |

---

**Próximos passos:**
1. Rodar `pnpm run check` para verificar tudo
2. Usar `tsx scripts/benchmark-llm.ts` para baseline
3. Documentar qualquer novo script adicionado
