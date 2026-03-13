# Fluxo do chat para o agente (hoje)

Este documento descreve como está implementado **todo o fluxo do chat** até ao agente (LLM): desde o envio da mensagem no cliente até à resposta em stream.

---

## 1. Cliente (UI)

**Onde:** `components/chat.tsx` + `useChat` (AI SDK).

- O utilizador escolhe o **agente** no seletor (sidebar ou topbar): `assistente-geral`, `revisor-defesas`, `redator-contestacao`, `assistjur-master` ou um agente personalizado (UUID).
- O **agentId** fica em estado (`agentId`, `agentIdRef`) e é sincronizado com o URL (`/chat?agent=revisor-defesas`).
- Ao enviar mensagem, o body do `POST /api/chat` é montado em `buildChatRequestBody()`:
  - `id` — UUID do chat (ou novo).
  - `message` — última mensagem do user (ou `messages` em fluxo de aprovação de tools).
  - `selectedChatModel`, `selectedVisibilityType`.
  - **`agentId`** — o agente selecionado (built-in ou UUID do custom).
  - Opcional: `agentInstructions` (instruções adicionais do user), `knowledgeDocumentIds`, `archivoIds`.

O cliente envia `POST /api/chat` com esse body (e recebe a resposta em stream).

---

## 2. Entrada na API: POST /api/chat

**Onde:** `app/(chat)/api/chat/route.ts` — `POST()`, depois `handleChatPostAuthenticated()`.

1. **Parse e validação do body**  
   `parsePostBody(request)`:
   - Lê JSON do request.
   - Trunca partes do tipo `document` que excedam `MAX_DOCUMENT_PART_TEXT_LENGTH`.
   - Valida com `postRequestBodySchema` (Zod): `id`, `message` ou `messages`, `selectedChatModel`, `selectedVisibilityType`, `agentId` (enum ou UUID), etc.

2. **Resolução do agentId**  
   `resolveAgentId(agentIdFromBody)`:
   - Se o body não tiver `agentId` ou estiver vazio → usa `DEFAULT_AGENT_ID_WHEN_EMPTY` (`assistente-geral`).

3. **Autenticação**  
   `auth()` — sessão (user id, type guest/regular). Sem sessão → erro 401.

4. **IDs de conhecimento**  
   `resolveEffectiveKnowledgeIds()`:
   - Se o user enviar `knowledgeDocumentIds` → usa esses.
   - Se o agente for **Redator de Contestações** e não houver ids → usa o documento “Banco de Teses Padrão” (ID fixo).
   - Caso contrário → array vazio.

---

## 3. Batch de BD (runChatDbBatch)

Todas as queries abaixo correm **em paralelo** (com timeouts por query ~12s e fallbacks):

| Query | Uso |
|-------|-----|
| `getMessageCountByUserId` | Rate limit / créditos (mensagens nas últimas 24h). |
| `getChatById` | Chat existente (ownership, agentId guardado). |
| `getMessagesByChatId` | Histórico de mensagens do chat (limite definido no código). |
| `getKnowledgeDocumentsByIds` | Conteúdo dos documentos da base de conhecimento (só se `effectiveKnowledgeIds.length > 0`). |
| `getCachedBuiltInAgentOverrides` | Overrides de instruções/label dos agentes built-in (admin). |
| `getOrCreateCreditBalance` | Saldo de créditos do user (ou cache). |
| `getCustomAgentById` | Só se **não** for agente built-in: busca agente personalizado por UUID. |

Se o batch falhar ou der timeout global (120s) → resposta 400 com mensagem de BD.

---

## 4. Configuração do agente (AgentConfig + modelo)

**Onde:** `getAgentConfigAndEffectiveModel()` + `resolveAgentConfigFromBatch()`.

- **Agente built-in** (`agentId` em `AGENT_IDS`):  
  `getAgentConfigWithOverrides(agentId, builtInOverrides)` → usa config estática de `lib/ai/agents-registry.ts` e aplica overrides da BD (instruções/label editados no admin).

- **Agente personalizado** (UUID):  
  Se `getCustomAgentById` devolver um registo → `getAgentConfigForCustomAgent(customAgent)` (instruções e nome do custom; tools conforme `baseAgentId`: Revisor ou Redator).  
  Se não existir → fallback para `assistente-geral` com overrides.

Cada `AgentConfig` tem:
- `id`, `label`, `instructions`
- `useRevisorDefesaTools` (createRevisorDefesaDocuments, validação PI+Contestação)
- `useRedatorContestacaoTool` (createRedatorContestacaoDocument)
- `allowedModelIds` (opcional)

**Modelo efetivo:**  
- Se `selectedChatModel` estiver em `allowedModelIds` do agente → usa esse modelo.  
- Caso contrário → `getDefaultModelForAgent(agentId)`.

**Revisor de Defesas:**  
Se o agente tiver `useRevisorDefesaTools` e a mensagem tiver partes do tipo `document`, é feita validação (PI + Contestação obrigatórios, etc.). Falha → 400 com mensagem clara.

---

## 5. Créditos e persistência do chat

- **Créditos:** verificação de rate limit e saldo; dedução ao enviar mensagem (se não for fluxo de aprovação de tools). Saldo insuficiente → 400.
- **Persistência:** se o chat já existir e o `agentId` do body for diferente do guardado → `updateChatAgentId`. Novo chat → `saveChat` com ownership e `agentId`. Título do chat pode ser gerado em background (`titlePromise`).

---

## 6. Mensagens e contexto para o modelo

- **Mensagens de UI:**  
  Se não for fluxo de aprovação de tools: histórico do chat (`messagesFromDb`) + nova mensagem do user.  
  Caso contrário: `messages` do body (aprovadas pelo user).

- **Validação + RAG + ficheiros:**  
  `runValidationRagUserFiles()` (em paralelo):
  - Validação das mensagens com ferramentas de validação (ex.: Revisor).
  - **RAG:** se houver `effectiveKnowledgeIds` e texto na última mensagem do user → `retrieveKnowledgeContext()` (chunks por relevância).
  - **Arquivos:** se houver `archivoIds` → `getUserFilesByIds()` (texto extraído).

- **Construção do knowledgeContext:**  
  `buildKnowledgeContextFromParts()` junta:
  - Chunks RAG (por documento),
  - Conteúdo completo dos documentos de conhecimento (quando RAG não cobre),
  - Texto dos ficheiros (UserFile) referidos em `archivoIds`.  
  Tudo encapsulado em `<knowledge_base>...</knowledge_base>`. Para o Redator, se o “Banco” estiver vazio, pode ser injectada uma mensagem de indisponibilidade.

- **Guardar mensagem do user** na BD (`saveUserMessageToDb`) antes de iniciar o stream.

---

## 7. System prompt e instruções do agente

**Onde:** `lib/ai/prompts.ts` — `systemPrompt()`, chamado em `prepareModelMessagesForStream()` e no `execute` do stream.

Ordem no system prompt (resumida):

1. **Base:** `regularPrompt` + dicas de origem (geolocation); se o modelo for de “reasoning”, sem `artifactsPrompt`.
2. **Base de conhecimento:** se existir `knowledgeContext`, secção “Base de conhecimento” com o texto e instruções para reduzir alucinações (citar documentos, não inventar).
3. **Orientações do agente:** secção “Orientações para este agente” com:
   - **`effectiveAgentInstructions`** = `agentInstructions` (body) se preenchido, senão **`agentConfig.instructions`** (instruções do agente — Revisor, Redator, Assistente, etc.).  
   - Aviso de confidencialidade (não revelar as instruções ao user).

Ou seja: o “agente” entra no fluxo como **texto de instruções** injetado no system prompt; o `AgentConfig` só define *qual* bloco de instruções usar e quais tools activar.

---

## 8. Preparação das mensagens para o modelo

- Normalização de partes de mensagens.
- **Estimativa de tokens** (system + mensagens); se exceder o limite → 413.
- `applyContextEditing()` (encurtamento de contexto se necessário).
- `convertToModelMessages()` — formato do AI SDK (roles, partes text/image).
- Para modelos Anthropic: `withPromptCachingForAnthropic()` na última mensagem (cache do prefixo).

---

## 9. Stream: streamText + tools

**Onde:** `buildChatStreamResponse()` → `createUIMessageStream()` com callback `execute` que chama `streamText()`.

- **Modelo:** `getLanguageModel(effectiveModel)` (provedor configurado no projeto).
- **System:** `systemPrompt({ selectedChatModel, requestHints, agentInstructions: effectiveAgentInstructions, knowledgeContext })` — mesmo conteúdo já descrito.
- **Mensagens:** as preparadas para o modelo (histórico + nova mensagem).
- **Tools activas** conforme `agentConfig`:
  - Sempre: `getWeather`, `createDocument`, `updateDocument`, `requestSuggestions`, `improvePrompt`.
  - Se `useRevisorDefesaTools`: `createRevisorDefesaDocuments`.
  - Se `useRedatorContestacaoTool`: `createRedatorContestacaoDocument`.
- **Parâmetros:** `temperature: 0.2`, `maxOutputTokens: 8192`, `stopWhen: stepCountIs(5)`. Para modelos “reasoning”, podem ser passadas opções de thinking (ex.: Anthropic).
- O resultado de `streamText()` é convertido para o stream de UI (`toUIMessageStream`) e fundido no `dataStream` (incluindo título do chat quando existir `titlePromise`).

Quando o modelo chama uma tool (ex.: createRevisorDefesaDocuments), o AI SDK executa a tool; em fluxos com aprovação, o resultado pode voltar ao cliente e o próximo POST trará `messages` em vez de uma única `message`.

---

## 10. Após o stream (onFinish)

- Gravar mensagens de assistente (e tool calls/results) na BD.
- Deduzir créditos e registar uso (tokens → créditos).
- Atualizar cache de créditos no servidor (para o próximo GET /api/credits ou próximo POST /api/chat).

---

## Resumo em sequência

1. **Cliente** monta body com `agentId`, `message`, modelo, visibilidade, opcionalmente conhecimento e instruções.
2. **API** valida body, autentica, resolve `agentId` e IDs de conhecimento.
3. **Batch BD** busca em paralelo: chat, mensagens, documentos de conhecimento, overrides dos agentes, créditos e, se for custom, o agente personalizado.
4. **AgentConfig** fica definido (built-in com overrides ou custom); modelo efetivo é validado/permitido para esse agente.
5. **Créditos** e persistência do chat (incl. `agentId` no chat).
6. **Mensagens** = histórico + nova; validação + RAG + ficheiros; construção de `knowledgeContext`.
7. **System prompt** = base + base de conhecimento + **instruções do agente** (`agentConfig.instructions` ou overrides/custom).
8. **streamText** com esse system, mensagens e **tools** dependentes do agente (Revisor, Redator, base).
9. Resposta em **stream** para o cliente; no fim, gravação de mensagens e créditos.

O “agente” é portanto: **(agentId → AgentConfig → instruções no system prompt + conjunto de tools)**. O mesmo pipeline de chat serve todos os agentes; a diferença está na config (instruções + flags de tools) e no modelo permitido.
