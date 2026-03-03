# Latência do POST /api/chat

Guia para analisar e otimizar o tempo de resposta do chat (incl. agente Revisor de Defesas).

---

## 1. Fases do pedido (antes do stream)

A rota executa as seguintes fases antes de começar a enviar tokens ao cliente:

| Fase | Descrição | Otimizações atuais |
|------|-----------|--------------------|
| **auth** | Sessão Auth.js | — |
| **Batch BD (paralelo)** | getMessageCountByUserId, getChatById, getMessagesByChatId(80), getKnowledgeDocumentsByIds, overrides de agentes, saldo de créditos, **agente custom** (se aplicável) | Tudo em `Promise.all`; overrides em cache 60s (`getCachedBuiltInAgentOverrides`); agente custom incluído no batch quando não é built-in. |
| **Validação + RAG + ficheiros (paralelo)** | safeValidateUIMessages, retrieveKnowledgeContext (embed + vector search), getUserFilesByIds | Em `Promise.all`. RAG inclui chamada a API de embeddings (`embedQuery`) — pode ser o gargalo quando há base de conhecimento. |
| **saveMessages(user)** | Persistir mensagem do utilizador | Sequencial; necessário antes do stream para consistência. |
| **Context + convert** | applyContextEditing, estimateInputTokens, normalizeMessageParts, convertToModelMessages | Cálculo em memória. |
| **preStream** | Total desde o início do request até ao arranque do stream | — |
| **Stream (LLM)** | streamText até fim da resposta | Dominado pela latência do modelo e pelo tamanho da resposta. |

O tempo total que o cliente vê (ex.: 24s no terminal) é **preStream + duração do stream**. A maior parte costuma ser o stream do LLM; preStream deve ficar na ordem dos segundos.

---

## 2. Logs de timing (desenvolvimento) e modo debug

Com `NODE_ENV=development`, a rota regista no stdout:

Para **diagnosticar "resposta não carrega" ou "demora muito"**, ativa o **modo debug** com `DEBUG_CHAT=true` em .env.local. O servidor passa a registar um resumo do pedido e tempos por fase (auth, dbBatch, validationRag, saveMessages, contextConvert) em formato estruturado. Ver **docs/CHAT-DEBUG.md**.

Em dev, sem debug, a rota regista:

- `[chat-timing] auth: Xms`
- `[chat-timing] getMessageCount + getChat + getMessages + knowledge + overrides + credits (paralelo): Xms`
- `[chat-timing] validação + RAG + getUserFiles (paralelo): Xms`
- `[chat-timing] saveMessages(user): Xms`
- `[chat-timing] contextEditing + estimateTokens + normalizeMessageParts + convertToModelMessages: Xms`
- `[chat-timing] preStream (total antes do stream): Xms`
- `[chat-timing] execute started (modelo + tools a correr): Xms` (quando o stream começa)
- `[chat-timing] onFinish (stream terminou) total request: Xms`
- `[chat-timing] onFinish completo: Xms`

Se **validação + RAG + getUserFiles** for muito alto, é provável que seja o RAG (embedding + busca vetorial). Se o **batch BD** for alto, verificar índices e carga da BD.

---

## 3. Otimizações já feitas

- **Agente custom em paralelo:** quando o `agentId` não é built-in, `getCustomAgentById` corre no mesmo `Promise.all` que o resto da BD, em vez de uma ida à BD extra em série.
- **Cache de overrides:** `getCachedBuiltInAgentOverrides()` (TTL 60s) reduz consultas à tabela de overrides; invalidação ao atualizar no painel admin (`invalidateAgentOverridesCache()`).

---

## 4. Possíveis melhorias futuras

- **RAG:** Se não precisares de retrieval vetorial (ex.: poucos documentos ou uso só de docs completos), evitar chamar `retrieveKnowledgeContext` nesses casos reduz a chamada a `embedQuery` e à busca por similaridade.
- **Índices BD:** Garantir índice em `Message_v2(chatId, createdAt)` para `getMessagesByChatId` com `ORDER BY createdAt DESC LIMIT N` (já existe `Message_v2_chatId_createdAt_idx` no schema). Para `getMessageCountByUserId` + join com `Chat`, índice em `Chat(userId, createdAt)` (já existe).
- **Saldo de créditos:** Em cenários de muito tráfego, um cache de saldo por utilizador (TTL curto, invalidação ao deduzir) reduziria `getOrCreateCreditBalance`; hoje o crédito é lido em cada request para garantir consistência.

---

## 5. Statement timeout (erro 57014)

Se aparecer no terminal **`PostgresError: canceling statement due to statement timeout`** (código 57014) ou **unhandledRejection** com o mesmo erro:

- **Causa:** O servidor Postgres (ex.: Supabase) pode ter um `statement_timeout` baixo (ex.: 8s). O **Supabase ignora** o parâmetro `statement_timeout` na connection string.
- **O que o projeto faz:**
  - **`ensureStatementTimeout()`** (`lib/db/queries.ts`): na primeira utilização da BD por processo, executa **`SET statement_timeout = '120s'`** na sessão. Assim, todas as queries dessa sessão passam a ter 2 min. Chamam esta função no início: página **`/chat/[id]`**, rotas **`/api/chat`**, **`/api/history`**, **`/api/credits`**, **`/api/agents/custom`**, **`/api/chat/[id]/stream`**, **`/api/vote`** e a server action **`deleteChat`**.
  - As funções de BD convertem o erro 57014 em `ChatbotError` com a mensagem "Query exceeded time limit (statement timeout)."
  - No **onFinish** do chat, todas as promessas (saveMessages, créditos, updateChatActiveStreamId) têm `.catch()` para evitar unhandledRejection; em caso de timeout, o erro é registado em log (em dev sempre, em produção só para 57014).

Se o erro continuar a aparecer após deploy:

1. Confirmar que a **POSTGRES_URL** não inclui já um `statement_timeout` mais baixo (nesse caso a app não sobrescreve).
2. No Supabase: Project Settings → Database → pode haver um timeout global; a opção na connection string aplica-se à sessão.
3. Ver quais queries demoram mais (logs, ou Supabase Dashboard → Logs) e otimizar (índices, menos dados por request).

---

## 6. Referências

- Rota: `app/(chat)/api/chat/route.ts`
- Conexão e timeout: `lib/db/queries.ts` (getDb, CONNECTION_OPTS)
- Custos e tokens: `docs/OTIMIZACAO-CUSTO-TOKENS-LLM.md`
- Base de conhecimento e RAG: `lib/ai/knowledge-base.md`, `lib/rag/`
