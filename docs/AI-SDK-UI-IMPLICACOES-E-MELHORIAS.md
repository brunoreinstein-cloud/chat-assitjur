# AI SDK UI — Implicações no projeto e melhorias

Documento que relaciona a [documentação oficial do AI SDK UI](https://ai-sdk.dev/docs/ai-sdk-ui/overview) com o estado atual do chatbot e propõe melhorias concretas.

---

## 1. O que já está alinhado

| Doc / padrão | Estado no projeto |
|--------------|-------------------|
| **useChat + DefaultChatTransport** | `components/chat.tsx` usa `useChat` com `DefaultChatTransport({ api: '/api/chat', fetch: fetchWithErrorHandlers })`. |
| **Enviar só a última mensagem** | `prepareSendMessagesRequest` envia `message` (última) em fluxo normal e `messages` (completo) em tool-approval. Servidor carrega histórico com `getMessagesByChatId` e monta `uiMessages`. |
| **Persistência em onFinish** | `createUIMessageStream` usa `onFinish` para `saveMessages` (assistant) ou `updateMessage`/`saveMessages` (tool flow). |
| **IDs de mensagem** | `generateId: generateUUID` no stream; mensagens com `id` consistente. |
| **Tool approval** | `addToolApprovalResponse`, tools com `needsApproval`, `sendAutomaticallyWhen` para continuar após aprovação. |
| **Render por `parts`** | `MessagePartRenderer` e `message.parts` usados; suporte a `tool-*`, text, file, document. |
| **Reasoning** | `sendReasoning: true` em `result.toUIMessageStream()`. |
| **Tratamento de erros** | `onError` no stream devolve mensagem amigável; cliente usa `fetchWithErrorHandlers`. |
| **Metadata em mensagens** | `convertToUIMessages` já preenche `metadata: { createdAt: formatISO(...) }` ao carregar da BD. |

---

## 2. Implicações e lacunas

### 2.1 Validação de mensagens da BD (Message Persistence)

**Doc:** [Chatbot Message Persistence](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence) — quando as mensagens guardadas têm tool calls, metadata ou data parts, o servidor deve validá-las com `validateUIMessages` antes de passar a `convertToModelMessages`.

**Estado atual:** Não se usa `validateUIMessages`. As mensagens vêm de `getMessagesByChatId` e são convertidas com `convertToUIMessages` (custom) e `normalizeMessageParts`. Se o schema das tools ou dos parts mudar, mensagens antigas podem causar erros ou comportamento inesperado.

**Implicação:** Em upgrades de tools ou de formato de parts, conversas antigas podem quebrar. A doc recomenda tratar `TypeValidationError` e, em falha de validação, fallback (ex.: histórico vazio ou migração).

---

### 2.2 Resume streams (Chatbot Resume Streams)

**Doc:** [Chatbot Resume Streams](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams) — GET em `/api/chat/[id]/stream` deve devolver o stream ativo (a partir do Redis) quando existir; caso contrário 204. O cliente usa `resume: true` e opcionalmente `prepareReconnectToStreamRequest`.

**Estado atual:**

- **POST:** Com `REDIS_URL`, chama-se `createResumableStreamContext`, `createStreamId({ streamId, chatId })` e `streamContext.createNewResumableStream(streamId, () => sseStream)` em `consumeSseStream`. Ou seja, o stream é guardado em Redis e o `streamId` é associado ao `chatId` na tabela `stream`.
- **GET** `app/(chat)/api/chat/[id]/stream/route.ts`: devolve sempre `204 No Content`. Não lê nenhum stream ativo nem chama `resumeExistingStream`.
- **Cliente:** `useAutoResume` chama `resumeStream()` quando a última mensagem é do user (para tentar retomar). O `useChat` não recebe `resume: true`; o endpoint de resume não está implementado de acordo com a doc.

**Implicação:** Em disconnect ou refresh durante uma resposta, o utilizador não retoma o mesmo stream a partir do servidor. O que existe é a infraestrutura (Redis + tabela `stream`) sem o GET que realmente retoma.

**Nota:** A doc indica que resume não é compatível com abort (fechar aba/refresh envia abort). Ou se suportas resume, ou abort; não os dois em simultâneo.

---

### 2.3 Consumir stream em disconnect (Message Persistence)

**Doc:** [Chatbot Message Persistence — Handling client disconnects](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence#handling-client-disconnects) — usar `result.consumeStream()` (sem await) para que o backend continue a consumir o stream e execute `onFinish` mesmo que o cliente aborte.

**Estado atual:** Não se chama `consumeStream()`. O stream é criado com `createUIMessageStream` e `createUIMessageStreamResponse`; não há uso direto de `streamText().consumeStream()`.

**Implicação:** Se o cliente fechar o separador ou perder a ligação durante a resposta, o stream no servidor pode ser cancelado e `onFinish` pode não correr, logo as mensagens do assistant podem não ser guardadas.

---

### 2.4 Message metadata no stream (Message Metadata)

**Doc:** [Message Metadata](https://ai-sdk.dev/docs/ai-sdk-ui/message-metadata) — enviar metadata (ex.: `createdAt`, modelo, uso de tokens) via `messageMetadata` em `toUIMessageStreamResponse` para aparecer em `message.metadata` no cliente.

**Estado atual:** Na carga a partir da BD, `convertToUIMessages` já define `metadata: { createdAt: formatISO(...) }`. No fluxo de streaming não se usa `messageMetadata` no servidor (usa-se `createUIMessageStream` em vez de `result.toUIMessageStreamResponse` diretamente), por isso mensagens recém-streamed podem não ter `metadata` preenchido pelo mesmo critério que a doc (ex.: tokens no fim).

**Implicação:** Para mostrar tokens ou modelo por mensagem no UI, seria necessário passar a enviar metadata nas parts (start/finish) no `createUIMessageStream`.

---

### 2.5 `toUIMessageStreamResponse` vs `createUIMessageStream`

**Doc:** Os exemplos usam `streamText(...).toUIMessageStreamResponse({ originalMessages, onFinish, ... })`.

**Estado atual:** Usa-se `createUIMessageStream` + `createUIMessageStreamResponse` para ter controlo fino (title em background, `generateId`, `onError`, `consumeSseStream` para Redis). É um padrão válido e mais flexível; a doc também descreve `createUIMessageStream` para casos avançados.

**Implicação:** Nenhuma crítica; apenas que funcionalidades como `messageMetadata` ou `generateMessageId` têm de ser aplicadas manualmente no fluxo atual.

---

## 3. Melhorias recomendadas

### 3.1 (Alta) Validar mensagens carregadas da BD

- Importar `validateUIMessages` (e eventualmente `TypeValidationError`) do `ai`.
- Após montar `uiMessages` (histórico + nova mensagem), chamar `validateUIMessages` com as tools atuais e schemas de metadata/data parts (se existirem).
- Em `TypeValidationError`, decidir política: log + fallback para histórico vazio ou para mensagens “sanitizadas” (ex.: remover parts inválidos).
- Manter `convertToUIMessages` para o formato DB → UI; usar validação antes de `convertToModelMessages`.

### 3.2 (Média) Completar resume de streams

- **Servidor:** No GET `/api/chat/[id]/stream`, obter o `streamId` ativo para o `id` do chat (ex.: campo `activeStreamId` no chat ou último registo em `stream` com política clara). Se existir e Redis estiver disponível, usar `createResumableStreamContext({ waitUntil: after }).resumeExistingStream(streamId)` e devolver o stream com `UI_MESSAGE_STREAM_HEADERS`; senão 204.
- **Persistência:** Garantir que, ao iniciar um novo stream no POST, se regista o `streamId` como “ativo” para esse chat e que, no `onFinish` (e em caso de erro?), se limpa esse estado para não retomar um stream já terminado.
- **Cliente:** Se quiseres ativar resume oficial: em `useChat` passar `resume: true` e, se necessário, `prepareReconnectToStreamRequest` para o mesmo padrão de URL. Avaliar o conflito com abort (doc: não usar os dois juntos).

### 3.3 (Média) Garantir persistência em disconnect — não implementado

- Com `createUIMessageStream` + `dataStream.merge(result.toUIMessageStream())`, o stream do `result` é já consumido pela resposta. Chamar `result.consumeStream()` exigiria fazer tee do stream (duas leituras) antes de merge; a API actual do `streamText` pode não expor isso de forma directa.
- Fica como melhoria futura: refatorar para usar `result.toUIMessageStreamResponse({ onFinish, ... })` e depois compor com dados extras (título, etc.) se necessário, ou implementar tee manual do stream antes do merge.

### 3.4 (Baixa) Metadata rica no stream

- No `createUIMessageStream`, ao escrever parts do tipo start/finish, enviar metadata (ex.: `createdAt`, `model`, `totalTokens`) de acordo com a doc de Message Metadata.
- No cliente, usar `message.metadata` para mostrar tempo, modelo ou uso de tokens por mensagem, se for relevante para o produto.

### 3.5 (Opcional) Documentar opção “resume vs abort”

- Se implementares resume completo: documentar em `docs/` ou AGENTS.md que o modo resume está ativo e que abort (fechar aba/refresh) pode quebrar a retoma, conforme a doc do AI SDK.
- Se optares por não suportar resume: podes manter o GET em 204 e não passar `resume: true`; o comportamento actual mantém-se.

---

## 4. Resumo

| Tópico | Prioridade | Esforço | Impacto |
|--------|------------|--------|--------|
| `validateUIMessages` ao carregar histórico | Alta | Baixo | Evita quebras em upgrades de tools/parts |
| GET `/api/chat/[id]/stream` a retomar do Redis | Média | Médio | Retoma de resposta após refresh/disconnect |
| `consumeStream()` para onFinish em disconnect | Média | Baixo | Mensagens guardadas mesmo se o cliente sair |
| Metadata (tokens, etc.) no stream | Baixa | Baixo | UX e visibilidade de custos |

O projeto já segue bem os padrões de **chatbot**, **message persistence** (envio da última mensagem, persistência em onFinish, IDs), **tool usage** e **generative UI** (parts, tool approval). As melhorias acima alinham o comportamento com o que a documentação do AI SDK UI descreve para validação, resume e resiliência a disconnects.
