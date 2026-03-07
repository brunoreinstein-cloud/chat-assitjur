# Modo debug do chat

Ativa logs e dados estruturados no servidor (e opcionalmente no stream) para diagnosticar **resposta que não carrega** ou **demora excessiva** no POST /api/chat.

---

## 1. Ativar

Em **.env.local** (não commitar em produção):

```env
DEBUG_CHAT=true
```

Ou `DEBUG_CHAT=1`. Reiniciar o servidor (`pnpm dev`) após alterar.

---

## 2. Onde ver o output

Os logs do servidor aparecem no **terminal onde corre `pnpm dev`** (não no browser nem na consola do browser). Em desenvolvimento, cada POST /api/chat regista pelo menos:

- `[chat-timing] POST /api/chat request started (agentId: ...)` — confirma que o pedido entrou na rota
- `[chat-timing] auth: Xms` — tempo da sessão
- (outras linhas `[chat-timing]` conforme o fluxo avança)

Se não vires nenhuma destas linhas, confirma que estás a olhar para o terminal do servidor e que o cliente está a enviar o pedido para `POST /api/chat`. O output estruturado `[chat-debug]` só aparece com `DEBUG_CHAT=true` (ver abaixo).

---

## 3. O que aparece com DEBUG_CHAT=true

Com `DEBUG_CHAT=true`, cada pedido ao chat regista:

### Resumo do pedido (início)

```
[chat-debug] request {"chatId":"...","agentId":"revisor-defesas","model":"anthropic/...","knowledgeIds":2,"archivoIds":0,"hasMessage":true,"messageParts":3}
```

Permite confirmar agente, modelo, documentos da base de conhecimento e anexos.

### Tempos por fase (após preStream)

```
[chat-debug] timing: auth 25
[chat-debug] timing: getMessageCount + getChat + ... 412
[chat-debug] timing: validação + RAG + getUserFiles (paralelo) 1203
[chat-debug] timing: saveMessages(user) 89
[chat-debug] timing: contextEditing + ... 156
[chat-debug] preStreamPhases {"auth":25,"dbBatch":412,"validationRag":1203,"saveMessages":89,"contextConvert":156,"total":1885}
[chat-debug] timing: preStream (total antes do stream) 1890
[chat-debug] timing: execute started (modelo + tools a correr) 1892
```

- **auth** – sessão
- **dbBatch** – BD em paralelo (chat, mensagens, knowledge, créditos, agente)
- **validationRag** – validação de mensagens + RAG (embedding + busca) + ficheiros do arquivo
- **saveMessages** – gravar mensagem do utilizador (só quando há nova mensagem)
- **contextConvert** – edição de contexto, estimativa de tokens, conversão para o modelo
- **total** – soma das fases (≈ preStream)
- **execute started** – momento em que o stream do modelo arranca

**Identificar qual query do batch é o gargalo:** no terminal, a linha `[chat-timing] dbBatch: X done in Yms` com **Y mais alto** (ou `X timeout após 45000ms`) indica a query mais lenta. Ver **docs/DB-TIMEOUT-TROUBLESHOOTING.md** sec. 7 (Como identificar o gargalo).

### Causas de «A demorar mais do que o habitual» (50s sem resposta)

A UI mostra este aviso quando o pedido está em `submitted` há ≥50s. As causas podem ser **antes** do modelo (preStream) ou **no modelo/rede**:

| Fase | Onde ver (DEBUG_CHAT) | Causa provável | O que fazer |
|------|------------------------|----------------|-------------|
| **dbBatch** | `preStreamPhases.dbBatch` alto (ex.: 45000) | Cold start da BD ou queries lentas; várias `timeout após 45000ms` | Aquecer a ligação (`pnpm db:ping` ou 2.º pedido); ver **docs/DB-TIMEOUT-TROUBLESHOOTING.md**. Com fallbacks o batch termina em ~45s e segue. |
| **validationRag** | `preStreamPhases.validationRag` alto | RAG (embeddings + busca vetorial), muitos documentos ou ficheiros do arquivo | Reduzir documentos na base de conhecimento ou anexos; verificar latência do serviço de embeddings. |
| **saveMessages** | `preStreamPhases.saveMessages` alto | Gravar mensagem do utilizador na BD lenta | Mesma BD que dbBatch; cold start ou rede. |
| **contextConvert** | `preStreamPhases.contextConvert` alto | Edição de contexto, estimativa de tokens, conversão para o modelo | Mensagens ou contexto muito grandes; considerar limitar tamanho. |
| **execute (modelo)** | `execute started` aparece mas demora até sair texto | Latência do modelo (first token), rede para o AI Gateway, ou modelo de raciocínio («A pensar») | Modelos reasoning: 30s–1 min em "A pensar" é normal. Outros: ver **GET /api/health/ai** (latência do Gateway). |
| **Stream no cliente** | `execute started` e `onFinish` no servidor, mas UI não atualiza | Rede, proxy ou cliente a não consumir o stream | DevTools → Network: pedido a `/api/chat` deve ser chunked; Console para erros. |

Se **todas** as queries do batch fizerem `timeout após 45000ms` e `dbBatch` ≈ 45s, o gargalo é a **primeira ligação à BD** (cold start); o 2.º pedido costuma ser bem mais rápido.

### Como usar para diagnosticar

| Sintoma | Onde olhar | Possível causa |
|--------|------------|----------------|
| Resposta nunca aparece | `execute started` não chega a aparecer | Travagem em alguma fase antes do stream (auth, BD, RAG, saveMessages, context). Ver qual fase tem o último `timing` e o valor de `preStreamPhases`. |
| 400 «base de dados não respondeu a tempo» | Log `[chat] dbBatch timeout or error: DB_BATCH_TIMEOUT` | O batch excedeu 120s (raro com timeouts por query). Ver **docs/DB-TIMEOUT-TROUBLESHOOTING.md**: identificar o gargalo (sec. 7), POSTGRES_URL, `pnpm db:ping`, cold start, pooler (porta 6543). |
| Demora muito até aparecer texto | `preStream (total antes do stream)` ou `validationRag` / `dbBatch` muito altos | BD lenta, RAG (embedding + vector search) lento, ou muitos documentos. |
| Mensagem «A demorar mais do que o habitual» (após 50s) | Ver secção abaixo | Várias causas possíveis; usar DEBUG_CHAT e `preStreamPhases` para ver onde está o tempo. |
| Aparece "execute started" mas nada no cliente | Rede, proxy ou cliente a não consumir o stream | Verificar erros no browser (Network, Console) e se a resposta é stream (chunked). |
| Resposta cortada ou erro no fim | Logs de `onFinish` ou erros 57014 | Timeout na BD (ver docs/API-CHAT-LATENCY.md) ou falha ao guardar mensagens/créditos. |

---

## 4. Dados no stream (cliente)

Com debug ativo, o servidor envia um chunk de dados no início do stream:

- **Tipo:** `data-chat-debug`
- **Dados:** `{ preStreamMs, executeStartedMs }`

O cliente pode usar estes valores para mostrar na UI, por exemplo: *"Preparação: 1.9s; a aguardar resposta do modelo..."*. A implementação do consumo deste chunk fica no componente que usa o hook do chat (ex.: procurar por `useChat` e por eventos do stream).

---

## 5. Desativar

Remover `DEBUG_CHAT` de .env.local ou definir `DEBUG_CHAT=false` e reiniciar. Em produção não deve estar ativo (logs extras e chunk no stream).

---

## 6. "A pensar" e modelos de raciocínio (reasoning)

Se a resposta **fica em "A pensar"** e não aparece texto:

- **Modelos com extended thinking** (ex.: Claude 3.7 Sonnet Thinking) passam primeiro por uma fase de "pensamento" (até 4 000 tokens por pedido). Durante essa fase a UI mostra "A pensar" e, em seguida, "O modelo está a raciocinar; a resposta em texto surgirá em seguida." É normal demorar **30s–1 min** antes do primeiro texto.
- **O que o projeto faz:**
  - O *budget* de thinking foi definido em **4 000 tokens** (em vez de 10 000) para que a resposta em texto tenda a aparecer mais cedo.
  - Se o stream terminar **sem nenhum texto** (só raciocínio), a UI mostra: "O modelo concluiu o raciocínio mas não devolveu texto. Tenta novamente ou escolhe outro modelo."
  - Após **cerca de 50 segundos** em "A pensar", a UI mostra o aviso "A demorar mais do que o habitual" e um link **Cancelar pedido** para interromper o pedido.
- **Se continuar preso:** ativa `DEBUG_CHAT=true` e confirma no terminal se aparecem `execute started` e depois `onFinish`. Se não aparecer `onFinish`, o pedido pode estar a falhar no modelo ou na rede.

---

## 7. Nenhum assistente está a funcionar — checklist

Quando **nenhum** agente (Revisor, Redator, Assistente, etc.) devolve resposta:

1. **Confirmar que o pedido chega ao modelo**  
   Ativa `DEBUG_CHAT=true` e envia uma mensagem. No terminal:
   - Se aparecer **`[chat-debug] timing: execute started`** → o servidor chegou a chamar o AI Gateway; o problema pode ser rede, resposta do modelo ou consumo do stream no cliente.
   - Se **não** aparecer `execute started` → a travagem está **antes** do modelo. Ordem típica: `dbBatch` (~45s com fallbacks) → **saveChat** (quando é novo chat; em dev tem timeout 15s) → validationRag → saveMessages → `execute started`. Ver qual fase é a última a aparecer nos logs.

2. **AI Gateway e autenticação**  
   - **Local:** `AI_GATEWAY_API_KEY` em `.env.local` (obrigatório). Criar em [AI Gateway API Keys](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys).
   - **Testar ligação:** `GET http://localhost:3300/api/health/ai` (com servidor a correr). 200 com `"ok": true` → Gateway e key OK; 503 → ver mensagem de erro (key, quota, rede).
   - **Na Vercel:** key nas variáveis do projeto ou OIDC; sem key válida o SDK devolve erro de autenticação e o stream não arranca.

3. **BD lenta a bloquear depois do batch**  
   Com fallbacks, o batch termina em ~45s. Se o **chat for novo** (getChatById devolveu null), em seguida o servidor chama **saveChat**. Em **dev** esse saveChat tem timeout de 15s; se a BD continuar lenta, após 15s o fluxo segue na mesma e o modelo é chamado. Em produção saveChat não tem timeout — BD muito lenta pode atrasar tudo até ao limite da rota (ex.: 120s).

4. **Resumo rápido**  
   - Ver no terminal: `execute started` sim/não.  
   - Testar: `GET /api/health/ai`.  
   - Em dev: garantir `AI_GATEWAY_API_KEY`; se o problema for BD, o segundo pedido costuma ser mais rápido.

---

## 8. «O request não está a ocorrer na API» / pedido não chega ao modelo

### Onde o pedido aparece

O **browser** só faz um pedido: **POST para a tua API** (`/api/chat` em `localhost:3300` ou no teu domínio). O pedido **do servidor para o AI Gateway** (`https://ai-gateway.vercel.sh`) é feito no servidor (Node.js), por isso **não aparece no separador Network do browser** — é normal só veres `POST .../api/chat`.

Fluxo: **Cliente → POST /api/chat → servidor Next.js → AI Gateway (servidor) → resposta em stream → cliente.**

### Como confirmar que o modelo é chamado

1. **Terminal com DEBUG_CHAT=true**  
   Se aparecer `[chat-debug] timing: execute started`, o servidor já chegou a chamar `streamText` e o AI SDK/Gateway. Se não aparecer, a travagem está antes (auth, BD, RAG, etc.).

2. **Healthcheck do Gateway (recomendado)**  
   Com o servidor a correr:
   ```bash
   curl http://localhost:3300/api/health/ai
   ```
   - **200** com `"ok": true` → a API key e o AI Gateway estão a funcionar.
   - **503** com `"error": "..."` → problema de autenticação, rede ou quota (ver mensagem).

3. **Script sem servidor**  
   `pnpm run health:ai` — testa a mesma configuração (modelo + `AI_GATEWAY_API_KEY`).

### Autenticação (Vercel AI Gateway)

Conforme a [documentação do AI Gateway](https://vercel.com/docs/ai-gateway):

- **Em local:** é obrigatória a variável **`AI_GATEWAY_API_KEY`** em `.env.local`. Criar chave em: [AI Gateway API Keys](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys&title=AI+Gateway+API+Keys).
- **Na Vercel:** pode usar a mesma API key nas variáveis de ambiente do projeto, ou [OIDC](https://vercel.com/docs/ai-gateway/authentication-and-byok/authentication) (sem key; `vercel env pull` para dev local com OIDC).

Se a key estiver em falta ou inválida, o SDK pode lançar algo como *"Unauthenticated. Configure AI_GATEWAY_API_KEY"* e o pedido não chega ao Gateway. Se aparecer *"AI Gateway requires a valid credit card on file"*, é necessário associar um cartão ao projeto na Vercel.

---

## 9. Créditos: podem bloquear? Como verificar

### Os créditos podem impedir o chat?

- **Produção:** Sim. Se o saldo for &lt; 1 crédito, a API devolve 400 «Sem créditos suficientes para enviar mensagens».
- **Desenvolvimento:** Não. Em dev o chat **nunca bloqueia** por créditos: se o saldo for insuficiente, a app tenta carregar `initialCredits` (ex.: 1000) na BD; se falhar (ex.: BD em timeout), usa esse valor na mesma e o pedido segue. Assim podes testar o chat mesmo com a tabela de créditos em falha ou vazia.

### Como verificar se os créditos estão a funcionar

1. **Ver saldo na UI**  
   O cliente chama `GET /api/credits` para mostrar o saldo. Se a página do chat mostrar um número de créditos (ex.: 1000), o endpoint e a BD estão a responder.

2. **Testar o endpoint em dev**  
   Com sessão ativa (cookies do browser ou token), no terminal:
   ```bash
   curl -b "cookies.txt" http://localhost:3300/api/credits
   ```
   Ou abre as DevTools → Network, envia uma mensagem ou recarrega o chat, e verifica o pedido a `/api/credits`: resposta 200 com `{ "balance": number, ... }`.

3. **Se aparecer «Sem créditos suficientes» em produção**  
   O utilizador tem saldo 0. Recarregar créditos pelo painel admin (`/admin/agents` ou a API de créditos com `ADMIN_CREDITS_SECRET`) ou garantir que `initialCredits` é atribuído ao criar conta / primeiro uso.

Em resumo: em **dev** os créditos não são impeditivo; em **produção** sim, e a verificação é o saldo na UI ou `GET /api/credits`.

---

## 10. Validar conexão ao modelo (healthcheck)

Para confirmar que a API key e o AI Gateway respondem:

- **Rota (com servidor a correr):** `GET http://localhost:3300/api/health/ai`  
  - 200: `{ "ok": true, "model": "google/gemini-2.5-flash-lite", "latencyMs": ... }`  
  - 503: `{ "ok": false, "error": "..." }` — falha de rede, quota ou API key

- **Script (sem levantar o servidor):** `pnpm run health:ai`  
  - Usa o mesmo modelo (título) e uma chamada mínima; imprime ✅ ou ❌ e o tempo.

Requer `AI_GATEWAY_API_KEY` em local (ou config do Vercel em produção). A rota não exige autenticação para poder ser usada em monitores.

---

## 11. Carregamento inicial da página /chat (ordem e chamadas)

Ao abrir `/chat` (ou `/chat?agent=...`), o cliente faz várias chamadas em paralelo. Ordem sugerida e como reduzir duplicados:

### Chamadas na carga inicial

| Recurso | Quem | Prioridade / nota |
|--------|------|-------------------|
| **GET /api/auth/session** | SessionProvider (next-auth) no root layout | Uma vez por carga. Evitar 2.ª chamada: `refetchOnWindowFocus={false}` no SessionProvider; na sidebar usar `user`/`isGuest` do servidor em vez de `useSession()`. |
| **GET /api/health/db** | DbWarmup (layout do chat) | Baixa; fire-and-forget para aquecer a BD. Não bloqueia a UI. |
| **GET /api/credits** | Sidebar + MultimodalInput (SWR com a mesma key) | Uma única request partilhada pelo SWR. Só quando há sessão. |
| **GET /api/agents/custom** | Header/input (SWR) | Uma request partilhada; só quando o utilizador pode editar agentes. |

### Por que pode haver 2× GET /api/auth/session

- **React Strict Mode (dev):** o SessionProvider monta duas vezes → dois pedidos.
- **Refetch ao focar o separador:** por defeito o next-auth refaz a sessão ao regressar ao tab; desativar com `refetchOnWindowFocus={false}`.

### Por que alguns pedidos são lentos

- **Primeira chamada a /api/credits ou /api/health/db:** cold start da ligação à BD (até ~10s com `connect_timeout: 10`). O DbWarmup chama `/api/health/db` ao montar para aquecer; o primeiro `/api/credits` ou POST /api/chat tende a ser mais rápido depois.
- **GET /api/credits 15–20s:** ver **docs/DB-TIMEOUT-TROUBLESHOOTING.md** sec. 7.4 (logs `[credits-timing]` em dev).
- **GET /api/auth/session:** normalmente rápido (lê cookies e valida sessão no servidor).

---

## 12. Referências

- Rota: `app/(chat)/api/chat/route.ts`
- Módulo debug: `lib/ai/chat-debug.ts`
- **AI Gateway (Vercel):** [AI Gateway](https://vercel.com/docs/ai-gateway), [Getting started](https://vercel.com/docs/ai-gateway/getting-started), [Authentication](https://vercel.com/docs/ai-gateway/authentication-and-byok/authentication) — `AI_GATEWAY_API_KEY`, OIDC, criação de API keys
- **Timeout da BD no chat:** `docs/DB-TIMEOUT-TROUBLESHOOTING.md` — POSTGRES_URL, `pnpm db:ping`, cold start, connection pooling
- Latência e timeout: `docs/API-CHAT-LATENCY.md`
- Modelos (reasoning vs não-reasoning): `lib/ai/models.ts`
- Healthcheck AI: `app/api/health/ai/route.ts`, `scripts/check-ai-connection.ts`, `pnpm run health:ai`
- Carregamento inicial: SessionProvider em `app/layout.tsx`, DbWarmup em `app/(chat)/layout.tsx`, SWR para credits/agents em `components/agent-sidebar.tsx` e `components/multimodal-input.tsx`
