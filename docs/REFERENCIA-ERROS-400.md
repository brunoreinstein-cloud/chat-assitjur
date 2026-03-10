# Referência: erros 400 (Bad Request) e 503 (health/db)

Quando aparece **"Failed to load resource: the server responded with a status of 400"**, abre o pedido na aba **Network** do DevTools, clica no pedido a vermelho e na secção **Response** vê o JSON. O campo **`code`** (e opcionalmente **`message`** / **`cause`**) indica a origem. O **`cause`** passa a vir sempre preenchido em erros de validação do chat, para facilitar o diagnóstico. Para **503** no health check da BD (`GET /api/health/db`), ver a secção no final do documento.

---

## 503 e 400 em produção (Vercel)

Quando na consola do browser aparecem **503** e **400** (por exemplo em `/api/chat`):

| Erro | Origem provável | O que fazer |
|------|------------------|-------------|
| **503** | `GET /api/health/db` (chamado pelo `DbWarmup` ao abrir o chat). BD em cold start, timeout (30s) ou `POSTGRES_URL` incorreta. | 1) Em **Vercel → Settings → Environment Variables** confirma que `POSTGRES_URL` usa o **pooler** (porta **6543**; Supabase: Connection string → **Transaction**). 2) Se a resposta 503 tiver o campo `hint`, segue a indicação (trocar para porta 6543). 3) Faz redeploy. Ver [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md). |
| **400** em `/api/chat` | Validação do body (campos em falta/inválidos) ou timeout/erro da BD (`bad_request:database`). | 1) Abre **DevTools → Network**, clica no pedido **POST /api/chat** a vermelho e na aba **Response** lê o JSON. 2) Se tiver **`code: "bad_request:database"`** e mensagem sobre "ligação à base de dados" ou "não respondeu a tempo": é o mesmo problema que o 503 — corrige `POSTGRES_URL` (6543) e reenvia a mensagem. 3) Se tiver **`code: "bad_request:api"`** e **`cause`**: é validação (ex.: mensagem vazia, campo em falta); o toast na UI deve mostrar o `cause`. |

O **503** é muitas vezes do health check em background (DbWarmup); o utilizador pode ignorá-lo se o chat funcionar. O **400** no POST do chat é o que bloqueia: verifica sempre o corpo da resposta (Network → Response) para ver `code` e `cause`.

---

## Correções já aplicadas no projeto

- **API chat** (`app/(chat)/api/chat/route.ts`): a resposta 400 de validação inclui sempre o campo **`cause`** com o detalhe do Zod (ex.: `"selectedChatModel: String must contain at least 1 character(s)"`), mesmo em produção.
- **Cliente chat** (`components/chat.tsx`): o body do POST garante **`selectedChatModel`** (fallback para `initialChatModel` se vazio) e **`selectedVisibilityType`** (fallback para `"private"` se indefinido), evitando 400 por campos em falta ou vazios.
- **Testes** (`tests/api/chat-schema.test.ts`): o bloco *"resposta 400 e cause (erro de validação)"* garante que, quando a validação falha, o erro Zod permite construir um **`cause`** não vazio que identifica o campo (selectedChatModel, selectedVisibilityType, id, message/messages).
- **Testes E2E** (`tests/e2e/api.test.ts`): *"handles 400 Bad Request with cause and shows validation error"* — mock da API a devolver 400 com `code`, `message` e `cause`; verifica que a UI mostra o erro (toast) ao utilizador.

### Mais testes que podes adicionar

| Tipo | Onde | Descrição |
|------|------|-----------|
| Unit | `tests/api/chat-schema.test.ts` | Rejeitar `agentInstructions` > 4000 chars; rejeitar `knowledgeDocumentIds` com > 50 itens ou id não-UUID. |
| Unit | `tests/lib/errors.test.ts` | Garantir que `toResponse()` com `cause` inclui `cause` no JSON para outros códigos (ex.: `bad_request:api`). |
| E2E | `tests/e2e/api.test.ts` | Mock 429 (rate limit) e verificar que a UI mostra mensagem de limite; mock 503 (BD indisponível, ex. `GET /api/health/db`) e verificar mensagem. Ver secção «503 — GET /api/health/db» abaixo. |
| E2E | `tests/e2e/api.test.ts` | Enviar mensagem vazia (se a UI o permitir) e verificar toast de "mensagem não pode estar vazia". |
| E2E | Fluxo Revisor | Anexar só PI (sem Contestação), enviar, e verificar que aparece o 400 "anexe a Petição Inicial e a Contestação". |
| Unit | Nova rota | Para cada rota que devolve 400 (upload, upload-token, admin, prompt/improve), testes unitários do schema ou do handler com body inválido. |

Esta tabela mapeia cada resposta 400 ao ficheiro, linha e forma de corrigir.

---

## Como ver o Response no Chrome/Edge

1. **F12** → aba **Network**.
2. Reproduz o erro (ex.: envia mensagem no chat).
3. Clica no pedido que ficou a vermelho (status 400).
4. Aba **Response** (ou **Preview**) → vê o JSON, por exemplo:  
   `{ "code": "bad_request:api", "message": "...", "cause": "..." }`.

O **Request URL** indica a API (ex.: `/api/chat`, `/api/files/upload`).

---

## Chat — `POST /api/chat`

| Response (code / cause) | Ficheiro | Linha aprox. | Motivo | Correção |
|-------------------------|----------|--------------|--------|----------|
| `code: "bad_request:api"` e `message` sobre "Corpo do pedido inválido" | `app/(chat)/api/chat/route.ts` | ~415–422 | Validação Zod do body falhou | Garantir que o body tem: `id` (UUID), `message` ou `messages` (não vazio), `selectedChatModel`, `selectedVisibilityType`. Ver `app/(chat)/api/chat/schema.ts`. |
| `cause`: "A mensagem não pode estar vazia..." | `app/(chat)/api/chat/route.ts` | ~488–497 | Mensagem do user sem texto e sem ficheiro | Enviar pelo menos texto ou um anexo na mensagem. |
| `cause`: "Para auditar a contestação, anexe a Petição Inicial e a Contestação..." | `app/(chat)/api/chat/route.ts` | ~682–695 | Revisor de Defesas: falta PI ou Contestação nos documentos | Anexar os dois documentos (PI e Contestação) e marcar o tipo em cada um. |
| `cause`: "message.parts.0.text: String must contain at most … character(s)" | `app/(chat)/api/chat/schema.ts` | documentPartSchema | Texto de uma parte do tipo "document" excedia o limite (2M caracteres) | **Correção aplicada:** limite aumentado para 2M; o servidor trunca `message` e cada item de `messages` antes da validação; o cliente trunca defensivamente em 400k e mostra aviso. O utilizador vê "[Truncado: o documento excedeu o limite de caracteres.]" no final. |
| `code: "bad_request:database"` (ligação/BD a demorar) | `app/(chat)/api/chat/route.ts` | ~461–466 | Timeout ao preparar a sessão da BD | Verificar `POSTGRES_URL`, rede, cold start do Supabase/Neon. Tentar reenviar. |
| `code: "bad_request:database"` (não respondeu a tempo / erro ao aceder) | `app/(chat)/api/chat/route.ts` | ~654–662 | Timeout ou erro no batch de queries da BD | Cold start ou BD lenta; ver `POSTGRES_URL`. Reenviar a mensagem. |
| `code: "bad_request:database"` (Não foi possível guardar a mensagem) | `app/(chat)/api/chat/route.ts` | ~963–968 | Erro ao guardar mensagem na BD | Ver logs do servidor; verificar BD e migrações. |
| `code: "bad_request:api"` e `id` em falta (GET/PATCH/DELETE chat) | `app/(chat)/api/chat/route.ts` | ~1894–1896 | Parâmetro `id` em falta na URL/query | Garantir que o cliente envia o `id` do chat (ex.: query `?id=...`). |

**Nota:** `rate_limit:chat` e `forbidden:chat` devolvem 429 e 403, não 400. Para 400 no chat, os códigos acima são os relevantes.

### DELETE /api/chat — comportamento 404 vs 403

Ao apagar um chat (`DELETE /api/chat?id=...`), o servidor deve distinguir:

| Situação | Código esperado | Interpretação pelo cliente |
|----------|-----------------|----------------------------|
| Chat existe e o utilizador é dono | 200 | Chat apagado. |
| Chat não existe (id inválido ou já apagado) | **404** | Recurso não encontrado — o cliente pode tratar como "já removido" ou atualizar a lista. |
| Chat existe mas o utilizador não é dono | **403** | Sem permissão para apagar este chat. |

Se o servidor devolver **403** quando o chat não existe, o utilizador interpreta erroneamente como "não tenho permissão" em vez de "chat inexistente". A rota deve devolver **404** quando o chat não for encontrado (independentemente de ownership). Ver `app/(chat)/api/chat/route.ts` (handler DELETE).

---

## Upload de ficheiros

| Response | Ficheiro | Linha aprox. | Motivo | Correção |
|----------|----------|--------------|--------|----------|
| `{ "error": "Corpo da requisição vazio" }` | `app/(chat)/api/files/upload/route.ts` | ~765–767 | Body vazio | Enviar multipart com pelo menos um ficheiro. |
| `{ "error": "Nenhum arquivo enviado" }` | `app/(chat)/api/files/upload/route.ts` | ~776–778 | Nenhum ficheiro no multipart | Incluir ficheiro no FormData. |
| `{ "error": "<mensagem de validação>" }` | `app/(chat)/api/files/upload/route.ts` | ~783–785 | Validação do body (schema) falhou | Ver `message` no response; ajustar campos enviados (ex.: `visibility`, `chatId`). |
| `{ "error": "Corpo da requisição inválido" }` | `app/(chat)/api/files/upload-token/route.ts` | ~86–88 | Body JSON inválido ou em falta | Enviar JSON válido no body (ex.: `{ "filename", "contentType", ... }`). |
| `{ "error": "<mensagem>" }` (outro) | `app/(chat)/api/files/upload-token/route.ts` | ~127–129 | Erro ao gerar token (ex.: storage) | Ver mensagem; verificar config de Blob/Storage e env. |

---

## Processamento de ficheiros — `POST /api/files/process`

| Response | Ficheiro | Linha aprox. | Motivo | Correção |
|----------|----------|--------------|--------|----------|
| 400 com body de erro | `app/(chat)/api/files/process/route.ts` | ~63, ~81, ~90 | Parâmetros em falta ou inválidos (ex.: `fileId`, `chatId`) | Enviar os parâmetros obrigatórios no body conforme a API. |

---

## Melhorar prompt — `POST /api/prompt/improve`

| Response | Ficheiro | Linha aprox. | Motivo | Correção |
|----------|----------|--------------|--------|----------|
| 400 com `message` | `app/(chat)/api/prompt/improve/route.ts` | ~11, ~27 | Body em falta ou texto inválido (ex.: vazio, > 4000 chars) | Enviar JSON com o texto a melhorar dentro dos limites. |

---

## Admin

| Response | Ficheiro | Linha aprox. | Motivo | Correção |
|----------|----------|--------------|--------|----------|
| `{ "error": "Invalid JSON body" }` | `app/(chat)/api/admin/credits/route.ts` | 43 | Body não é JSON válido | Enviar JSON válido (ex.: `userId`, `delta`). |
| Body must contain userId and delta | `app/(chat)/api/admin/credits/route.ts` | 56–58 | Faltam `userId` ou `delta` (inteiro positivo) | Incluir `userId` (string) e `delta` (número > 0). |
| Invalid agent id / Invalid JSON body | `app/(chat)/api/admin/agents/[id]/route.ts` | 33–35, 43 | `id` não é um agente built-in ou body não é JSON | Usar um dos: `assistente-geral`, `revisor-defesas`, `redator-contestacao`, `assistjur-master`. Enviar JSON válido. |
| instructions / label too long ou body sem instructions/label | `app/(chat)/api/admin/agents/[id]/route.ts` | 57–59, 63–65, 70–72 | Limites de caracteres ou body vazio | Respeitar `MAX_INSTRUCTIONS_LENGTH` e `MAX_LABEL_LENGTH`; enviar pelo menos `instructions` ou `label`. |

---

## Outras APIs (também podem devolver 400)

| code / Response | Ficheiro | Motivo |
|-----------------|----------|--------|
| `bad_request:api` — "Parameter documentId is required" | `app/(chat)/api/suggestions/route.ts` | Falta `documentId` na query. |
| `bad_request:api` — "Corpo da requisição vazio" / "Dados inválidos" | `app/(chat)/api/arquivos/route.ts` | POST sem body ou body inválido. |
| `bad_request:api` — "Invalid body" / cause | `app/(chat)/api/agents/custom/route.ts`, `[id]/route.ts` | Body JSON inválido ou parse falhou. |
| `bad_request:api` — "limit must be..." / "Only one of starting_after or ending_before..." | `app/(chat)/api/history/route.ts` | Parâmetros de listagem inválidos. |
| `bad_request:api` — "Invalid body" | `app/(chat)/api/knowledge/folders/[id]/route.ts`, `knowledge/[id]/route.ts` | PATCH com body que não passa no schema. |
| `bad_request:api` — "Parameter id is missing/required" / "timestamp is required" | `app/(chat)/api/document/route.ts` | Falta `id` ou `timestamp` no pedido. |
| `bad_request:api` — "Parâmetro id/url é obrigatório", "URL não permitida", etc. | `app/(chat)/api/document/preview/route.ts`, `api/files/preview/route.ts` | Parâmetros de preview em falta ou URL não permitida. |
| `bad_request:api` — "Corpo da requisição vazio" / "JSON inválido" / "Envie pelo menos um fileId" | `app/(chat)/api/knowledge/from-archivos/route.ts` | POST sem body, JSON inválido ou `fileIds` vazio. |
| `bad_request:api` — "Parâmetro id é obrigatório" / "Apenas documentos de texto..." | `app/(chat)/api/document/export/route.ts` | Falta `id` ou documento não é de texto. |

---

## Resumo rápido

1. **Network** → pedido 400 → **Response** → lê **`code`** (e **`message`** / **`cause`**).
2. **Request URL** diz qual API (ex.: `/api/chat`).
3. Usa esta tabela para encontrar o **ficheiro** e o **motivo**.
4. Ajusta o **cliente** (body, query, headers) ou a **config** (env, BD) conforme a coluna **Correção**.
5. Para **503** em `GET /api/health/db`, ver secção **«503 — GET /api/health/db»** abaixo.

Se o response não tiver `code` (só `error`), é uma das rotas que devolve `{ "error": "..." }` diretamente (upload, upload-token, admin); a mensagem em `error` descreve o problema.

---

## 503 — GET /api/health/db (base de dados indisponível)

O health check da BD devolve **503** quando a base de dados não está acessível ou o pedido excede o tempo máximo.

| Response | Ficheiro | Motivo | Correção |
|----------|----------|--------|----------|
| `{ "ok": false, "error": "<mensagem>", "latencyMs": <ms> }` | `app/api/health/db/route.ts` | POSTGRES_URL em falta, BD inacessível (cold start, rede, timeout de conexão) ou timeout do health check (12s) | Verificar POSTGRES_URL em `.env.local`, usar pooler (Supabase porta 6543). Aquecer a BD (DbWarmup ou `pnpm db:ping`). Reenviar o pedido. Ver [docs/DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md). |

- **200:** `{ "ok": true, "latencyMs": <ms> }` — BD acessível.
- **503:** corpo com `ok: false`, `error` (mensagem do driver ou "Health check timed out") e `latencyMs`. O componente **DbWarmup** chama este endpoint em background ao carregar o chat; falhas são ignoradas (best-effort).

### Resposta lenta (GET /api/credits, POST /api/chat) e logs de timeout

Se no terminal aparecer `[credits-timing] getCreditBalance + getRecentUsage: 18000ms` ou `[chat-timing] dbBatch: ... timeout após 12000ms`, a **base de dados está a responder muito devagar** (cold start Supabase/Neon ou rede). O chat continua a funcionar: as queries usam fallbacks (ex.: saldo inicial, mensagens vazias) e o POST /api/chat pode devolver 200 após ~12–55s.

**O que fazer:** Ver [docs/DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md): usar **POSTGRES_URL com pooler (porta 6543)**, aquecer a BD (`pnpm db:ping` ou abrir a página do chat para o DbWarmup chamar GET /api/health/db) e reenviar a mensagem. GET /api/credits passa a devolver mais cedo (até 10s) com `_partial: true` quando a query de histórico estoura o timeout.

---

## Auth.js — ClientFetchError "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"

O cliente Auth.js (SessionProvider / `getSession`) faz fetch a `GET /api/auth/session` e espera JSON. Se receber HTML (ex.: página de login ou 404), aparece este erro na consola.

**Causas comuns:**

1. **`AUTH_URL` em falta ou errada** — Em desenvolvimento local, define em `.env.local`:
   ```bash
   AUTH_URL=http://localhost:3300
   ```
   Usa a mesma origem e porta do `pnpm dev` (ex.: 3300). Sem isto, o cliente pode pedir a sessão a um URL incorreto e receber uma página HTML.
2. **Rota de sessão a devolver HTML** — O projeto já tem rota explícita `app/api/auth/session/route.ts` e o catch-all `[...nextauth]` trata `/session` sempre com JSON. Se o erro persistir, confirma que não há proxy/rewrite a redirecionar `/api/auth/session` para uma página HTML.

**Ver também:** `.env.example` (comentário em `AUTH_URL`); [errors.authjs.dev](https://errors.authjs.dev).

---

## Padrões no log (auth guest)

Em testes E2E ou ao usar o modo visitante, o terminal pode mostrar muitas linhas de `GET`/`POST /api/auth/guest?redirectUrl=...`. O padrão esperado:

| Pedido | Status típico | Significado |
|--------|----------------|-------------|
| `GET /api/auth/guest?redirectUrl=%2Fchat` (ou `/login`, `/register`) | 200 | Render da página de login/registo com opção “Entrar como visitante”; ainda não há sessão. |
| `POST /api/auth/guest?redirectUrl=%2Fchat` | 303 | Criação da sessão guest (user na BD, cookie) e redirect para `redirectUrl`. O tempo pode variar (ex.: 400–1500 ms) conforme a BD. |
| `GET /api/auth/guest?redirectUrl=%2Fchat` (após POST) | 200 | Página de destino (ex.: /chat) já com sessão. |

Várias sequências GET → POST → GET indicam vários fluxos (ex.: vários testes E2E ou abas). Se aparecer **503** no `POST /api/auth/guest`, ver [docs/chat-guest-review.md](chat-guest-review.md) (ex.: `AUTH_SECRET` ou `POSTGRES_URL` em falta).
