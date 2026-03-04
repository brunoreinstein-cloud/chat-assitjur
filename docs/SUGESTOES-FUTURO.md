# Sugestões para o futuro

Documento de sugestões técnicas para melhorar consistência de tratamento de erros, respostas HTTP e logging. Não são tarefas obrigatórias imediatas; servem de referência ao priorizar melhorias.

**Última atualização:** 2026-03-04

---

## 1. RAG: try/catch e toDatabaseError nas queries

### Situação atual

As funções de RAG em `lib/db/queries.ts` **não envolvem** as operações em `try/catch`; erros sobem crus (ex.: do driver Postgres ou do Drizzle):

- **`insertKnowledgeChunks`** — insert em `KnowledgeChunk`; falhas propagam sem normalização.
- **`deleteChunksByKnowledgeDocumentId`** — delete por `knowledgeDocumentId`; idem.
- **`getRelevantChunks`** — select com pgvector (`<=>`); idem.

Outras funções no mesmo ficheiro (ex.: `getCustomAgentsByUserId`, `getChatById`, `saveChat`) já usam `try/catch` e **`toDatabaseError(error, fallbackMessage)`** para converter qualquer erro de BD em `ChatbotError("bad_request:database", ...)`, com tratamento explícito de **statement timeout** (código `57014`) para mensagem clara.

### Sugestão

Envolver o corpo de cada uma das três funções RAG em `try/catch` e, no `catch`, chamar `toDatabaseError(err, "…")` com uma mensagem adequada (ex.: `"Failed to insert knowledge chunks"`, `"Failed to delete chunks by document id"`, `"Failed to get relevant chunks"`). Assim:

- Erros de BD ficam alinhados com o resto das queries (sempre `ChatbotError` com surface `database`).
- Statement timeout continua a ser reconhecido por `isStatementTimeoutError` no `toDatabaseError` e a receber mensagem específica.
- As rotas que chamam estas funções (ex.: POST /api/knowledge, POST /api/chat ao fazer RAG) podem tratar `ChatbotError` e, se aplicável, 503 via `isDatabaseConnectionError` / `isStatementTimeoutError` + `databaseUnavailableResponse()`.

**Ficheiros envolvidos:** `lib/db/queries.ts` (e, indiretamente, `lib/rag/indexing.ts` e `lib/rag/retrieval.ts`, que usam estas funções).

---

## 2. Rotas com BD: tratamento 503 (database unavailable)

### Padrão de referência

O **POST /api/chat** e outras rotas já alinhadas usam:

- Import de `isDatabaseConnectionError`, `isStatementTimeoutError` e `databaseUnavailableResponse` de `@/lib/errors`.
- No `catch` do handler: se `isDatabaseConnectionError(error)` ou `isStatementTimeoutError(error)`, devolver `return databaseUnavailableResponse()` (503 com mensagem de BD indisponível), em vez de 500 genérico.

Rotas que **já seguem** este padrão (ex.: têm try/catch e devolvem 503 em caso de erro de conexão/timeout):

- `app/(chat)/api/chat/route.ts` (POST)
- `app/(chat)/api/history/route.ts` (GET e DELETE)
- `app/(chat)/api/agents/custom/route.ts` (GET e POST)

### Rotas que usam BD mas ainda não tratam 503

| Rota | Observação |
|------|------------|
| **DELETE /api/chat** (`app/(chat)/api/chat/route.ts`) | Chama `getChatById` e `deleteChatById` sem try/catch; qualquer erro (incl. BD) sobe e resulta em 500. Sugestão: envolver em try/catch, tratar `ChatbotError` e, para erros restantes, verificar `isDatabaseConnectionError` / `isStatementTimeoutError` e devolver `databaseUnavailableResponse()`. |
| **GET /api/credits** (`app/(chat)/api/credits/route.ts`) | Tem try/catch mas em erro devolve 200 com payload de fallback (`_partial: true`) em vez de 503 quando a falha for claramente de BD. Sugestão: no catch, se for erro de conexão/timeout, devolver `databaseUnavailableResponse()`; caso contrário manter o fallback atual se fizer sentido para a UX. |
| **DELETE /api/knowledge** (`app/(chat)/api/knowledge/route.ts`) | Já usa `databaseErrorResponse()` (503) para `ChatbotError` com surface `database`. Não distingue erros “crus” do driver (ex.: conexão recusada). Sugestão: no catch, antes do 500 genérico, verificar `isDatabaseConnectionError(error)` e `isStatementTimeoutError(error)` e devolver `databaseUnavailableResponse()`. |
| **DELETE /api/agents/custom/[id]** (`app/(chat)/api/agents/custom/[id]/route.ts`) | Idem: trata `ChatbotError` com surface database com 503; erros que não sejam `ChatbotError` (ex.: erro raw do driver) caem no 500. Sugestão: adicionar os mesmos checks e `databaseUnavailableResponse()`. |
| **DELETE /api/arquivos/[id]** (`app/(chat)/api/arquivos/[id]/route.ts`) | Try/catch apenas com `ChatbotError`; outros erros → 500. Sugestão: adicionar `isDatabaseConnectionError` / `isStatementTimeoutError` e `databaseUnavailableResponse()`. |
| **DELETE /api/document** (`app/(chat)/api/document/route.ts`) | Sem try/catch; `getDocumentsById` e `deleteDocumentsByIdAfterTimestamp` podem falhar e propagar. Sugestão: envolver em try/catch e aplicar o mesmo padrão 503. |
| **DELETE /api/knowledge/folders/[id]** (`app/(chat)/api/knowledge/folders/[id]/route.ts`) | Sem try/catch; `deleteKnowledgeFolderById` pode falhar. Sugestão: try/catch e 503 para erros de BD. |

**Ficheiros de apoio:** `lib/errors.ts` (`isDatabaseConnectionError`, `isStatementTimeoutError`, `databaseUnavailableResponse`).

---

## 3. Logger centralizado (substituir console)

### Situação atual

O projeto ainda usa **`console.log` / `console.info` / `console.warn` / `console.error`** em vários pontos:

- **Rotas API:** ex.: `app/(chat)/api/chat/route.ts` (timing, erros, avisos), `app/(chat)/api/credits/route.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/api/auth/session/route.ts`, `app/(auth)/api/auth/guest/route.ts`, etc.
- **Lib:** ex.: `lib/errors.ts` (dentro de `toResponse()` quando visibility é `log`), `lib/auth.ts`, `lib/ai/chat-debug.ts`.
- **Scripts:** vários em `scripts/` (db-ping, db-tables, check-config, migrate, etc.) — aqui o uso de console é muitas vezes aceitável para output de CLI.

As regras do **Ultracite** desencorajam o uso de `console` em código de produção; para alinhar com isso e com boas práticas de produção (níveis de log, possível integração com sistemas externos), faz sentido um logger centralizado.

### Sugestão

- **Introduzir um logger centralizado** (ex.: módulo `lib/logger.ts` ou `lib/log.ts`) com API do tipo `logger.info()`, `logger.warn()`, `logger.error()`, `logger.debug()`, podendo:
  - Em desenvolvimento: encaminhar para stdout/stderr (ou manter comportamento semelhante ao console).
  - Em produção: reduzir ruído (ex.: só `warn` e `error`), e eventualmente estruturar mensagens (JSON) para serviços de log.
- **Substituir** usos de `console` em **rotas API** e em **módulos lib** (errors, auth, chat-debug) pelo logger, onde fizer sentido (evitar quebrar scripts que dependem de stdout para o utilizador).
- **Manter** ou usar logger com nível “console” em **scripts** de CLI se a intenção for output direto ao utilizador; caso contrário, usar o logger para erros internos.

**Ficheiros envolvidos:** novo `lib/logger.ts`; depois `app/(chat)/api/chat/route.ts`, `app/(chat)/api/credits/route.ts`, `lib/errors.ts`, `lib/auth.ts`, `lib/ai/chat-debug.ts`, e outras rotas/lib que usem console.

---

## Referências

- **Erros e 503:** `lib/errors.ts` — `ChatbotError`, `toDatabaseError` (em queries), `isDatabaseConnectionError`, `isStatementTimeoutError`, `databaseUnavailableResponse`.
- **Padrão em rotas:** `app/(chat)/api/chat/route.ts` (POST) e `app/(chat)/api/history/route.ts`.
- **Queries com toDatabaseError:** `lib/db/queries.ts` (ex.: `getCustomAgentsByUserId`, `getChatById`, `saveChat`, `getMessagesByChatId`).
- **Ultracite:** regra que desencoraja `console`; `.cursor/rules/ultracite.mdc` e AGENTS.md.

Este documento pode ser atualizado quando novas rotas forem criadas ou quando o padrão de erros/logging evoluir.
