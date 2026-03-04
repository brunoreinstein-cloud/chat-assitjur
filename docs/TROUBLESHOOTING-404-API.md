# Resolução: 404 em rotas da API (session, credits, history)

Quando o cliente recebe **404** em `GET /api/auth/session`, `GET /api/credits` ou `GET /api/history`, a resposta é HTML (página 404) em vez de JSON, o que provoca erros como:

- `ClientFetchError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`
- `GET http://localhost:3300/api/auth/session 404 (Not Found)`

---

## 1. Confirmar se as rotas estão a ser servidas

1. **Testar rota de diagnóstico** (em `app/api/`, fora de route groups):
   - **PowerShell:** `Invoke-WebRequest -Uri http://localhost:3300/api/ping -UseBasicParsing | Select-Object -ExpandProperty Content`
   - **Cmd / Git Bash:** `curl -s http://localhost:3300/api/ping`
   - Se devolver `{"ok":true,"pong":...}` → o App Router está a servir `app/api/`. O problema pode ser só com rotas em `app/(chat)/api/` ou `app/api/auth/`.
   - Se devolver 404 ou HTML → as rotas da API não estão a ser resolvidas (ver pontos 2 e 3).

2. **Testar sem Turbopack** (para descartar bug do Turbopack):
   ```bash
   pnpm exec next dev -p 3300
   ```
   (sem `--turbo`). Reiniciar o servidor, abrir de novo a app e ver se os 404 desaparecem. Se sim, pode ser um problema do Turbopack com route groups ou com a ordem de resolução de rotas.

3. **Limpar cache e reiniciar**:
   ```bash
   rm -rf .next
   pnpm dev
   ```
   Depois abrir de novo no browser (e, se possível, fazer um hard refresh ou abrir em janela anónima).

---

## 2. Estrutura esperada das rotas

- `app/api/auth/session/route.ts` → **GET /api/auth/session**
- `app/api/auth/[...nextauth]/route.ts` → **/api/auth/*** (signin, callback, etc.)
- `app/(chat)/api/credits/route.ts` → **GET /api/credits** (o grupo `(chat)` não entra no path)
- `app/(chat)/api/history/route.ts` → **GET /api/history**
- `app/api/ping/route.ts` → **GET /api/ping** (diagnóstico)

Nenhuma destas rotas depende de middleware no projeto. Se houver um middleware global a redirecionar ou a bloquear `/api/*`, pode causar 404.

---

## 3. SessionProvider e Auth

O `SessionProvider` (next-auth/react) está configurado com `basePath="/api/auth"`, por isso o cliente pede **/api/auth/session**. Se essa URL devolver 404, a sessão não é obtida e o resto da app pode falhar ou pedir outras APIs que também devolvem 404.

---

## 4. Se o 404 persistir

- Verificar se não há **proxy** ou **rewrites** (no browser, Vercel, ou na rede) a alterar o host/port/path.
- Em desenvolvimento, confirmar que o URL da app é **http://localhost:3300** (ou a porta usada em `pnpm dev`).
- Consultar issues do Next.js 16 / Turbopack sobre "API routes 404" ou "route groups API 404" e aplicar workarounds indicados (ex.: mover rotas para fora do route group para testar).
