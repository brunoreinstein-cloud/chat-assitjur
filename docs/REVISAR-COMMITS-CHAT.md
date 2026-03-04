# Revisar e testar commits do chat (f5768dd vs 58ddb85)

Guia para comparar e testar o comportamento do chat entre dois pontos do histórico.

---

## 1. Revisar ficheiros (sem alterar o working tree)

### Ver um ficheiro num commit

No PowerShell, usar **aspas** no caminho quando há parênteses:

```powershell
# Rota do chat no commit antigo (f5768dd)
git show "f5768dd:app/(chat)/api/chat/route.ts"

# Rota do chat no commit atual (58ddb85)
git show "58ddb85:app/(chat)/api/chat/route.ts"
```

Para guardar num ficheiro e abrir no editor:

```powershell
git show "f5768dd:app/(chat)/api/chat/route.ts" > route-f5768dd.ts
git show "58ddb85:app/(chat)/api/chat/route.ts" > route-58ddb85.ts
```

### Comparar dois commits (diff)

```powershell
# Tudo o que mudou no diretório do chat entre os dois commits
git diff f5768dd..58ddb85 -- "app/(chat)/api/chat/"

# Apenas a rota principal
git diff f5768dd..58ddb85 -- "app/(chat)/api/chat/route.ts"

# Listar ficheiros alterados entre os dois
git diff --name-only f5768dd..58ddb85 -- "app/(chat)/"
```

### Ver outros ficheiros relevantes para o chat

```powershell
# lib/errors (novos helpers de BD no 58ddb85)
git diff f5768dd..58ddb85 -- "lib/errors.ts"

# Schema do body do POST
git diff f5768dd..58ddb85 -- "app/(chat)/api/chat/schema.ts"
```

---

## 2. Testar um commit (checkout temporário)

Para **correr a aplicação** como estava num commit e testar no browser.

### Passos (PowerShell)

```powershell
# 1. Guardar alterações atuais (se houver)
git stash push -m "WIP antes de testar commit"

# 2. Ir para o commit que queres testar
git checkout f5768dd
# ou
git checkout 58ddb85

# 3. Instalar dependências (podem ser diferentes)
pnpm install

# 4. Correr o servidor
pnpm dev
```

Abrir http://localhost:3300 e testar o chat. No terminal verás os logs do servidor (e, no 58ddb85, os `[chat-timing]` em dev).

### Voltar ao estado atual (main)

```powershell
# 5. Sair do commit (voltar ao branch)
git checkout main

# 6. Reinstalar e recuperar alterações
pnpm install
git stash pop
```

---

## 3. Comparar comportamento

| Aspecto | f5768dd | 58ddb85 |
|--------|---------|---------|
| **BD lenta** | Request pode travar à espera de queries | Timeouts (15s init, 45s por query, 120s batch); fallbacks; mensagem de erro ao utilizador |
| **Créditos em dev** | Se a tabela falhar, usa `initialCredits` | Idem + em dev nunca bloqueia por saldo (força mínimo para testar) |
| **saveChat (novo chat)** | `await` bloqueante | Em dev: timeout 15s e continua; em prod: `await` |
| **Erros 57014 / ligação BD** | Tratamento genérico | `databaseUnavailableResponse()` com mensagem específica |
| **Logs em dev** | `[chat-timing]` básicos | Mais logs: dbBatch por query, ensureStatementTimeout, etc. |

Para revisar: no f5768dd não há `withFallbackTimeout`, `withTimingLog`, nem timeout em `ensureStatementTimeout`; no 58ddb85 sim.

---

## 4. Comandos úteis de histórico

```powershell
# Últimos commits que tocaram na rota do chat
git log --oneline -15 -- "app/(chat)/api/chat/route.ts"

# Ver mensagem e ficheiros de um commit
git show 58ddb85 --stat
```

---

## Referência rápida

- **f5768dd** — feat: APIs chat/credits/history/vote, agent overrides, docs debug e troubleshooting  
- **58ddb85** — fix(chat): timeouts BD, créditos em dev, erros 57014 e doc AI Gateway  

Documentação relacionada: [CHAT-DEBUG.md](./CHAT-DEBUG.md), [DB-TIMEOUT-TROUBLESHOOTING.md](./DB-TIMEOUT-TROUBLESHOOTING.md).
