---
name: deploy-check
description: Checklist completo antes de deploy na Vercel. Roda lint, build, verifica env vars e faz deploy de produção.
disable-model-invocation: true
allowed-tools: Bash(pnpm *), Bash(git *), Bash(npx vercel *), Read
---

Execute o checklist de deploy do AssistJur para Vercel.

## Argumento opcional
$ARGUMENTS (ex: `preview` para deploy de preview, `prod` ou vazio = produção)

## Checklist de Deploy

### 1. Estado do repositório
```bash
git status
git log --oneline -3
```
- Verificar se há mudanças não commitadas — alertar o usuário se houver
- Confirmar que está na branch `main` para deploy de produção

### 2. Variáveis de ambiente obrigatórias
Verificar se existem no `.env.local`:
```bash
grep -E "^(AUTH_SECRET|POSTGRES_URL)=" .env.local | wc -l
```
Deve retornar `2`. Se faltar alguma, **abortar e listar o que falta**.

Variáveis recomendadas (avisar se ausentes, não bloquear):
- `AI_GATEWAY_API_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `REDIS_URL`

### 3. Lint + TypeScript
```bash
pnpm run check
```
Se falhar, **abortar**. Não fazer deploy com erros de lint ou tipo.

Para auto-corrigir problemas de formatação:
```bash
pnpm run format
```

### 4. Build completo (inclui migrações + lint + testes unitários)
```bash
pnpm run prepush
```
Este comando roda: lint → testes unitários → migrações → next build.

Se falhar, reportar a etapa que falhou e sugerir correção.

### 5. Revisão das variáveis de ambiente no Vercel
```bash
pnpm run vercel:review
```
Confirmar que as variáveis de produção estão sincronizadas.

### 6. Deploy
**Preview** (`$ARGUMENTS` = `preview`):
```bash
pnpm run vercel:deploy
```

**Produção** (padrão):
```bash
pnpm run vercel:deploy:prod
```

### 7. Verificar deploy
```bash
npx vercel logs --limit 20
```
Confirmar que não há erros nos logs do deploy.

## Resumo final
Reportar:
- URL do deploy (preview ou produção)
- Status de cada etapa do checklist
- Erros encontrados (se houver)

## Referência rápida de comandos
| Comando | Função |
|---------|--------|
| `pnpm run vercel:env` | Puxar env de desenvolvimento |
| `pnpm run vercel:env:prod` | Puxar env de produção |
| `pnpm run vercel:env:push` | Enviar env local para Vercel |
| `pnpm run vercel:review` | Revisar configuração de env |
