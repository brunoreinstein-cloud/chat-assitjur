# Revisão: Chat e Créditos

Visão geral do fluxo do chat com o sistema de créditos e pontos de atenção.

---

## 1. Fluxo do Chat (resumo)

1. **Cliente** envia `POST /api/chat` com mensagens, chatId, agentId, etc.
2. **Rota** (antes do stream):
   - Autenticação (session / guest).
   - **Batch BD** em paralelo: `getMessageCountByUserId`, `getChatById`, `getMessagesByChatId`, conhecimento, overrides, **getOrCreateCreditBalance**.
   - Limite de mensagens/dia (entitlements): se exceder → 429 `rate_limit:chat`.
   - **Créditos**: se `balance < MIN_CREDITS_TO_START_CHAT` (1):
     - Em **dev**: tenta adicionar `initialCredits` ao utilizador; invalida cache; volta a verificar.
     - Se continuar insuficiente → 429 com causa "Sem créditos suficientes... Contacte o administrador para recarregar."
   - Criação do chat (se novo), atualização de agente, etc.
3. **Stream** com `streamText()`; em **onFinish**:
   - Guarda mensagens (user + assistant).
   - Obtém `totalUsage` → `tokensToCredits()` → `deductCreditsAndRecordUsage()` (insere `LlmUsageRecord`, atualiza `UserCreditBalance`); invalida cache de créditos.
4. **Cliente** em `onFinish` faz `mutate("/api/credits")` para atualizar o saldo no header.

---

## 2. Créditos (especificação e implementação)

| Especificação (SPEC-CREDITOS-LLM) | Implementação |
|-----------------------------------|----------------|
| 1 crédito = 1000 tokens (input+output) | `lib/ai/credits.ts`: `tokensToCredits()`, `CREDITS_PER_1000_TOKENS` |
| Bloquear quando saldo insuficiente | Verificação antes do stream; 429 com mensagem clara |
| Saldo inicial por tipo (guest/regular) | `lib/ai/entitlements.ts`: `initialCredits` (dev 1000, prod 100) |
| Registo e dedução em onFinish | `deductCreditsAndRecordUsage()`; saldo nunca negativo (`Math.max(0, balance - consumed)`) |
| GET /api/credits (saldo + uso recente) | Implementado; cache 30s; invalidação após dedução e admin |
| Aviso saldo baixo (< 20% ou < 10) | `lowBalanceThreshold = max(10, ceil(initialCredits * 0.2))`; UI em header e /uso |
| Página /uso | Histórico, saldo, aviso de saldo baixo |
| Admin: listar e adicionar créditos | GET/POST /api/admin/credits com `x-admin-key` |

---

## 3. Pontos de atenção

### 3.1 Código de erro "sem créditos"

- Hoje usa **`rate_limit:chat`** (429) com `cause` personalizada ("Sem créditos suficientes...").
- A mensagem genérica de `getMessageByErrorCode("rate_limit:chat")` é "You have exceeded your maximum number of messages for the day."
- O cliente (chat.tsx) mostra **`unwrapped.cause ?? unwrapped.message`** no toast, portanto o utilizador vê a causa correta. Opcional: criar um código dedicado (ex. `insufficient_credits:chat`) para distinguir no cliente ou em analytics.

### 3.2 Saldo nunca negativo

- Em `deductCreditsAndRecordUsage` faz-se `balance = Math.max(0, row.balance - creditsConsumed)`.
- Se o utilizador tinha 2 créditos e a resposta consumiu 5, o saldo fica 0 (não negativo). Ou seja, não há “débito” explícito; em troca evita-se inconsistência e a lógica fica simples. A spec prevê bloquear à entrada, o que já é feito.

### 3.3 Concorrência (race)

- Dois pedidos em paralelo podem ambos ver o mesmo saldo (ex. 5), passarem a verificação e completarem; as duas deduções aplicam-se em sequência. O saldo não fica negativo graças ao `Math.max(0, ...)`, mas pode haver “overdraft” de um pedido (ex. segundo pedido consumir mais do que o saldo restante após o primeiro). Para evitar isso seria necessário locking (ex. `SELECT ... FOR UPDATE`) na dedução; por agora aceita-se este comportamento.

### 3.4 Falha da tabela de créditos

- No batch, se `getOrCreateCreditBalance` falhar, o `.catch()` devolve `initialCredits` como valor numérico. Assim, **balanceFromDb** fica igual ao saldo inicial e o chat não fica bloqueado por falha temporária da BD de créditos (comportamento defensivo). Em dev há um `console.warn` a avisar.

### 3.5 GET /api/credits em erro

- Se for **erro de conexão ou statement timeout** à BD: a API devolve **503** (`databaseUnavailableResponse()`), consistente com as outras rotas (history, chat, vote).
- Para qualquer outra exceção: devolve **200** com `balance: initialCredits`, `recentUsage: []`, `lowBalanceThreshold`, `_partial: true`, para a UI continuar a funcionar com fallback.

### 3.6 Botão Enviar e saldo zero

- O botão Enviar é desativado quando o saldo conhecido é inferior a `MIN_CREDITS_TO_START_CHAT` (1): o `MultimodalInput` usa `useSWR("/api/credits")` e inclui `creditsData.balance < MIN_CREDITS_TO_START_CHAT` em `sendButtonDisabled`. Enquanto os créditos não tiverem carregado (`creditsData === undefined`), o botão não fica desativado por este motivo (evita flash de desativado).

---

## 4. Ficheiros principais

| Área | Ficheiros |
|------|-----------|
| Conversão e constantes | `lib/ai/credits.ts` |
| Saldo inicial / limites por tipo | `lib/ai/entitlements.ts` |
| Queries de créditos | `lib/db/queries.ts`: `getCreditBalance`, `getOrCreateCreditBalance`, `deductCreditsAndRecordUsage`, `addCreditsToUser`, `getRecentUsageByUserId`, `getUsersWithCreditBalances` |
| Cache | `lib/cache/credits-cache.ts` |
| API utilizador | `app/(chat)/api/credits/route.ts` |
| API admin | `app/(chat)/api/admin/credits/route.ts` |
| Chat (verificação e onFinish) | `app/(chat)/api/chat/route.ts` (batch, balance check, creditsPromise em onFinish) |
| UI saldo | `components/credits-balance.tsx`, `components/chat-header.tsx`, `components/chat-topbar.tsx` |
| UI uso | `app/(chat)/uso/uso-page-client.tsx` |
| Admin UI | `app/(chat)/admin/credits/page.tsx` |

---

## 5. API de créditos (GET /api/credits)

- **Autenticação:** requer sessão; 401 se não autenticado.
- **Query:** `?limit=10` a `50` (opcional); default 10 para `recentUsage`.
- **Cache:** em memória por instância (`credits-cache.ts`), TTL 30s; chave `credits:{userId}:{limit}`. Invalidação em `creditsCache.delete(userId)` após dedução (onFinish) e após admin adicionar créditos.
- **Timeouts:** `getCreditBalance` com 5s, `getRecentUsageByUserId` com 18s; em timeout devolve-se saldo com `initialCredits` e uso vazio (`_partial: true`).
- **Resposta:** `{ balance, recentUsage, lowBalanceThreshold, _partial? }`. Tipo partilhado em `lib/types.ts`: `CreditsResponse`, `CreditsUsageItem`.
- **Erros:** 503 em falha de BD (conexão/timeout); 200 com `_partial: true` noutras exceções.

---

## 6. UI do chat (créditos)

- **Header/Topbar:** `CreditsBalance` (link para `/uso`). Mostra saldo, estilo “saldo baixo” (âmbar) quando `balance < lowBalanceThreshold`, tooltip com último uso e aviso. Em **erro de fetch** mostra “—” com tooltip “Não foi possível carregar o saldo…” (layout estável, sem colapsar).
- **Input:** `MultimodalInput` desativa o botão Enviar quando `creditsData.balance < MIN_CREDITS_TO_START_CHAT`; enquanto os dados não carregaram não desativa por créditos.
- **Mensagens:** `LastMessageUsage` (em `message.tsx`) mostra “Esta resposta: X créditos (Y tokens)” com base no primeiro item de `recentUsage` (último uso).
- **Página /uso:** saldo em destaque, aviso de saldo baixo, histórico com link para o chat; em erro de carregamento mostra `Alert` “Erro ao carregar”.
- **Página /uso (detalhe):** em erro de carregamento inclui botão "Tente novamente"; `revalidateOnReconnect: true`; estado `_partial` com retry no histórico; saldo renderizado via `renderBalanceContent`.
- **Tipos:** todos os componentes que consomem a API usam `CreditsResponse` e `CreditsUsageItem` de `lib/types.ts`.

---

## 7. Resumo

- O fluxo de chat e créditos está alinhado com a spec: verificação à entrada, dedução em onFinish, saldo nunca negativo, transparência (GET /api/credits, /uso, admin).
- API de créditos: cache, timeouts, 503 para BD; tipo partilhado na UI.
- UI: CreditsBalance com fallback em erro; botão Enviar desativado sem créditos; mensagem de último uso; página /uso com estado de erro.
- Melhorias opcionais: código de erro dedicado para “sem créditos”; locking na dedução na BD para evitar overdraft em concorrência.
