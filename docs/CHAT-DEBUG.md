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

## 2. O que aparece no terminal (servidor)

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

### Como usar para diagnosticar

| Sintoma | Onde olhar | Possível causa |
|--------|------------|----------------|
| Resposta nunca aparece | `execute started` não chega a aparecer | Travagem em alguma fase antes do stream (auth, BD, RAG, saveMessages, context). Ver qual fase tem o último `timing` e o valor de `preStreamPhases`. |
| Demora muito até aparecer texto | `preStream (total antes do stream)` ou `validationRag` / `dbBatch` muito altos | BD lenta, RAG (embedding + vector search) lento, ou muitos documentos. |
| Aparece "execute started" mas nada no cliente | Rede, proxy ou cliente a não consumir o stream | Verificar erros no browser (Network, Console) e se a resposta é stream (chunked). |
| Resposta cortada ou erro no fim | Logs de `onFinish` ou erros 57014 | Timeout na BD (ver docs/API-CHAT-LATENCY.md) ou falha ao guardar mensagens/créditos. |

---

## 3. Dados no stream (cliente)

Com debug ativo, o servidor envia um chunk de dados no início do stream:

- **Tipo:** `data-chat-debug`
- **Dados:** `{ preStreamMs, executeStartedMs }`

O cliente pode usar estes valores para mostrar na UI, por exemplo: *"Preparação: 1.9s; a aguardar resposta do modelo..."*. A implementação do consumo deste chunk fica no componente que usa o hook do chat (ex.: procurar por `useChat` e por eventos do stream).

---

## 4. Desativar

Remover `DEBUG_CHAT` de .env.local ou definir `DEBUG_CHAT=false` e reiniciar. Em produção não deve estar ativo (logs extras e chunk no stream).

---

## 5. "A pensar" e modelos de raciocínio (reasoning)

Se a resposta **fica em "A pensar"** e não aparece texto:

- **Modelos com extended thinking** (ex.: Claude 3.7 Sonnet Thinking) passam primeiro por uma fase de "pensamento" (até 4 000 tokens por pedido). Durante essa fase a UI mostra "A pensar" e, em seguida, "O modelo está a raciocinar; a resposta em texto surgirá em seguida." É normal demorar **30s–1 min** antes do primeiro texto.
- **O que o projeto faz:**
  - O *budget* de thinking foi definido em **4 000 tokens** (em vez de 10 000) para que a resposta em texto tenda a aparecer mais cedo.
  - Se o stream terminar **sem nenhum texto** (só raciocínio), a UI mostra: "O modelo concluiu o raciocínio mas não devolveu texto. Tenta novamente ou escolhe outro modelo."
- **Se continuar preso:** ativa `DEBUG_CHAT=true` e confirma no terminal se aparecem `execute started` e depois `onFinish`. Se não aparecer `onFinish`, o pedido pode estar a falhar no modelo ou na rede.

---

## 6. Validar conexão ao modelo (healthcheck)

Para confirmar que a API key e o AI Gateway respondem:

- **Rota (com servidor a correr):** `GET http://localhost:3300/api/health/ai`  
  - 200: `{ "ok": true, "model": "google/gemini-2.5-flash-lite", "latencyMs": ... }`  
  - 503: `{ "ok": false, "error": "..." }` — falha de rede, quota ou API key

- **Script (sem levantar o servidor):** `pnpm run health:ai`  
  - Usa o mesmo modelo (título) e uma chamada mínima; imprime ✅ ou ❌ e o tempo.

Requer `AI_GATEWAY_API_KEY` em local (ou config do Vercel em produção). A rota não exige autenticação para poder ser usada em monitores.

---

## 7. Referências

- Rota: `app/(chat)/api/chat/route.ts`
- Módulo debug: `lib/ai/chat-debug.ts`
- Latência e timeout: `docs/API-CHAT-LATENCY.md`
- Modelos (reasoning vs não-reasoning): `lib/ai/models.ts`
- Healthcheck AI: `app/api/health/ai/route.ts`, `scripts/check-ai-connection.ts`, `pnpm run health:ai`
