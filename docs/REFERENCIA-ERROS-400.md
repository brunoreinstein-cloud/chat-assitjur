# Referência: erros 400 (Bad Request)

Quando aparece **"Failed to load resource: the server responded with a status of 400"**, abre o pedido na aba **Network** do DevTools, clica no pedido a vermelho e na secção **Response** vê o JSON. O campo **`code`** (e opcionalmente **`message`** / **`cause`**) indica a origem. O **`cause`** passa a vir sempre preenchido em erros de validação do chat, para facilitar o diagnóstico.

## Correções já aplicadas no projeto

- **API chat** (`app/(chat)/api/chat/route.ts`): a resposta 400 de validação inclui sempre o campo **`cause`** com o detalhe do Zod (ex.: `"selectedChatModel: String must contain at least 1 character(s)"`), mesmo em produção.
- **Cliente chat** (`components/chat.tsx`): o body do POST garante **`selectedChatModel`** (fallback para `initialChatModel` se vazio) e **`selectedVisibilityType`** (fallback para `"private"` se indefinido), evitando 400 por campos em falta ou vazios.

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
| `code: "bad_request:database"` (ligação/BD a demorar) | `app/(chat)/api/chat/route.ts` | ~461–466 | Timeout ao preparar a sessão da BD | Verificar `POSTGRES_URL`, rede, cold start do Supabase/Neon. Tentar reenviar. |
| `code: "bad_request:database"` (não respondeu a tempo / erro ao aceder) | `app/(chat)/api/chat/route.ts` | ~654–662 | Timeout ou erro no batch de queries da BD | Cold start ou BD lenta; ver `POSTGRES_URL`. Reenviar a mensagem. |
| `code: "bad_request:database"` (Não foi possível guardar a mensagem) | `app/(chat)/api/chat/route.ts` | ~963–968 | Erro ao guardar mensagem na BD | Ver logs do servidor; verificar BD e migrações. |
| `code: "bad_request:api"` e `id` em falta (GET/PATCH/DELETE chat) | `app/(chat)/api/chat/route.ts` | ~1894–1896 | Parâmetro `id` em falta na URL/query | Garantir que o cliente envia o `id` do chat (ex.: query `?id=...`). |

**Nota:** `rate_limit:chat` e `forbidden:chat` devolvem 429 e 403, não 400. Para 400 no chat, os códigos acima são os relevantes.

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

Se o response não tiver `code` (só `error`), é uma das rotas que devolve `{ "error": "..." }` diretamente (upload, upload-token, admin); a mensagem em `error` descreve o problema.
