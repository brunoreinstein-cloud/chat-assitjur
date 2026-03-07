# Validação do processo Vercel e da API do chat

Este guia descreve como validar **todo o fluxo**: deploy na Vercel, APIs (incluindo a BD no mesmo processo do chat) e o chat em si.

---

## 1. Resumo dos endpoints de diagnóstico

| Endpoint | O que valida | Auth |
|----------|--------------|------|
| `GET /api/ping` | App Router a servir rotas API | Não |
| `GET /api/health/ai` | Conexão ao modelo (AI Gateway / API key) | Não |
| `GET /api/health/db` | Base de dados no **mesmo processo** que o chat (POSTGRES_URL, conexão) | Não |
| `GET /api/files/blob-status` | `BLOB_READ_WRITE_TOKEN` definido em produção | Não |
| `POST /api/chat` | Fluxo completo: auth, BD, modelo, streaming | Sim (sessão) |

O **`/api/health/db`** é o que mais se aproxima do que o chat usa: corre na mesma função serverless e usa a mesma `getDb()` e conexão. Se este responder 200, a BD está acessível ao processo que serve o chat.

---

## 2. Validação em local (antes do deploy)

```bash
# 1) Variáveis e BD
pnpm run predeploy
# Verifica AUTH_SECRET, POSTGRES_URL, porta 6543 (Supabase), db:ping e lint.

# 2) Healthchecks no servidor local (com pnpm dev a correr noutro terminal)
curl -s http://localhost:3300/api/ping
curl -s http://localhost:3300/api/health/ai
curl -s http://localhost:3300/api/health/db

# 3) Opcional: health do modelo (script que chama o mesmo modelo)
pnpm run health:ai
```

---

## 3. Validação na Vercel (Preview ou Produção)

Substitui `https://TEU-PROJETO.vercel.app` pela URL do deploy (Preview ou Production).

### Bash / Git Bash / WSL

```bash
BASE="https://TEU-PROJETO.vercel.app"

# API está no ar
curl -s "$BASE/api/ping"

# Modelo (AI Gateway) acessível
curl -s "$BASE/api/health/ai"

# BD acessível pelo mesmo processo que o chat
curl -s "$BASE/api/health/db"

# Blob configurado (produção)
curl -s "$BASE/api/files/blob-status"
```

### PowerShell (Windows)

```powershell
$BASE = "https://TEU-PROJETO.vercel.app"

Invoke-RestMethod -Uri "$BASE/api/ping"
Invoke-RestMethod -Uri "$BASE/api/health/ai"
Invoke-RestMethod -Uri "$BASE/api/health/db"
Invoke-RestMethod -Uri "$BASE/api/files/blob-status"
```

Ou um comando de cada vez (exemplo para chat-assitjur):

```powershell
Invoke-RestMethod -Uri "https://chat-assitjur.vercel.app/api/ping"
Invoke-RestMethod -Uri "https://chat-assitjur.vercel.app/api/health/db"
Invoke-RestMethod -Uri "https://chat-assitjur.vercel.app/api/health/ai"
Invoke-RestMethod -Uri "https://chat-assitjur.vercel.app/api/files/blob-status"
```

- **200** em `/api/ping` → Vercel a servir a app.
- **200** em `/api/health/ai` → API key e gateway OK.
- **200** em `/api/health/db` → POSTGRES_URL e BD OK no runtime do chat; se der 503, ver [docs/DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md).
- **blobConfigured: true** → upload de ficheiros configurado.

---

## 4. Validar o fluxo completo do chat

### 4.1 Pelo browser (manual)

1. Abre `https://TEU-PROJETO.vercel.app` (ou o teu domínio).
2. Inicia sessão (ou modo visitante, se aplicável).
3. Abre um chat e envia uma mensagem.
4. Confirma que a resposta do assistente aparece (streaming) e que não há erro de BD/timeout.

Se der timeout ou erro de BD, os logs em **Vercel → Deployments → [deploy] → Functions → /api/chat** e [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md) ajudam.

### 4.2 E2E (Playwright) contra a Vercel

Para correr os testes E2E contra um deploy (Preview ou Produção) em vez de local:

```bash
# Bash
PLAYWRIGHT_TEST_BASE_URL=https://TEU-PROJETO.vercel.app pnpm test
```

```powershell
# PowerShell
$env:PLAYWRIGHT_TEST_BASE_URL = "https://TEU-PROJETO.vercel.app"; pnpm test
```

Isto **não** inicia o servidor local; os testes usam o deploy indicado. Requer que o deploy tenha auth/credits/BD configurados (ex.: variáveis de produção ou de preview).

---

## 5. Checklist rápido pós-deploy

| Passo | Comando / Ação |
|-------|-----------------|
| 1 | `curl -s https://TEU-DOMINIO/api/ping` → 200 (ou em PowerShell: `Invoke-RestMethod -Uri "https://TEU-DOMINIO/api/ping"`) |
| 2 | `curl -s https://TEU-DOMINIO/api/health/db` → 200 (BD no processo do chat) |
| 3 | `curl -s https://TEU-DOMINIO/api/health/ai` → 200 (modelo) |
| 4 | Abrir o chat no browser, enviar mensagem, confirmar resposta |
| 5 | (Opcional) E2E contra o deploy (comando acima) |

---

## 6. Referências

- **Timeout da BD no chat:** [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md)
- **Setup Vercel e env:** [vercel-setup.md](vercel-setup.md)
- **Debug do chat (fases, logs):** [CHAT-DEBUG.md](CHAT-DEBUG.md)
- **Blob / upload em produção:** [processo-revisor-upload-validacao.md](processo-revisor-upload-validacao.md)
