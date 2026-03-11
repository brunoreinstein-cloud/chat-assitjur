# Como rastrear e corrigir problemas do chat

Guia prático: **sintoma** → **onde ver** → **o que fazer**. Para detalhes técnicos, ver os documentos referenciados em cada secção.

> **Contexto de ambiente:** Este guia aplica-se ao ambiente local (`pnpm dev`). Para problemas em produção (Vercel), os logs do terminal são substituídos pelos **Vercel Function Logs** — a lógica é a mesma, o acesso é diferente (Vercel → Deployments → função → Logs).

---

## 1. Ativar o rastreamento

1. Em **.env.local** (apenas local ou em Preview temporário):
   ```env
   DEBUG_CHAT=true
   ```
   **Aviso:** Nunca definir esta variável em **Production** no Vercel — pode expor timings nos logs públicos (se o Vercel Log Drain estiver configurado) ou afectar a resposta. Usar só em `.env.local` ou em Preview environments temporários.
2. Reiniciar o servidor: `pnpm dev`.
3. Os logs aparecem no **terminal onde corre `pnpm dev`** (não no browser).

Com isso, cada POST /api/chat regista tempos por fase e, em caso de lentidão, consegues ver onde o tempo está a ser gasto.

---

## 2. Fluxo do pedido (onde pode estar o tempo)

Ordem aproximada quando envias uma mensagem. Com DEBUG_CHAT, os tempos de cada fase aparecem no objecto **`preStreamPhases`** (o objecto que aparece no terminal com os tempos de cada fase antes do stream):

| Fase | O que faz | Onde ver no terminal |
|------|-----------|------------------------|
| **auth** | Obter sessão | `[chat-timing] auth: Xms` |
| **dbBatch** | Chat, mensagens, conhecimento, créditos, agente (em paralelo) | `[chat-timing] dbBatch: ... done in Xms` ou `timeout após 12000ms` |
| **persistChat** | Verificar ownership, criar chat novo (se id vazio), gerar título (`saveChat`). Se lento, atrasa o arranque do stream. | Entre dbBatch e validationRag. Para diagnóstico: ver ordem e tempos em `preStreamPhases` (secção 3). |
| **validationRag** | Validar mensagens, RAG (embeddings + busca), ficheiros | Com DEBUG_CHAT: `preStreamPhases.validationRag` |
| **saveMessages** | Gravar mensagem do utilizador na BD | `preStreamPhases.saveMessages` |
| **contextConvert** | Montar contexto para o modelo | `preStreamPhases.contextConvert` |
| **execute** | Chamar o modelo (stream) | `[chat-debug] timing: execute started` |

Se a UI fica em «A pensar» ou «A demorar mais do que o habitual», o atraso está numa destas fases (ou na rede até ao modelo). O DEBUG_CHAT indica qual.

---

## 3. Tabela: sintoma → onde ver → correção

| Sintoma | Onde ver | Correção |
|--------|----------|----------|
| **Resposta nunca aparece** (fica em «A pensar» sem texto) | Terminal: aparece `execute started`? | Se não: travou antes do modelo. Ver `preStreamPhases` (DEBUG_CHAT) e ver qual fase tem o valor mais alto. Se sim: pode ser modelo/rede ou reasoning; ver [CHAT-DEBUG.md](CHAT-DEBUG.md#6-a-pensar-e-modelos-de-raciocínio-reasoning). |
| **Agente não retorna mensagem após tool call** (ex.: createRevisorDefesaDocuments executa mas o chat fica sem resposta) | O agente chama a ferramenta e o stream termina sem texto do modelo. | O `streamText` encerra após o tool call (só 1 step). **Fix:** em `app/(chat)/api/chat/route.ts` usar `maxSteps: 5` no `streamText` para permitir vários turnos (tool → modelo gera resposta). Ver [CHECKLIST-REVISAO-BD-E-AUTH.md](CHECKLIST-REVISAO-BD-E-AUTH.md#4b-chat--agente-não-retorna-mensagem-após-tool-call). Ver bloco de código abaixo. |
| **Stream começa mas para a meio** (aparecem 1–2 palavras e o stream interrompe) | Terminal: pode não haver erro explícito; ou timeout/erro do provider. | Geralmente **timeout do modelo** (pedido muito longo) ou **context window estourada**. Ver [CHAT-DEBUG.md](CHAT-DEBUG.md); reduzir contexto (menos documentos na base de conhecimento, mensagens mais curtas) ou aumentar timeout do provider. |
| **Muitos «timeout após 12000ms» no dbBatch** | Terminal: `[chat-timing] dbBatch: X timeout após 12000ms` | BD lenta ou cold start. Ver [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md): POSTGRES_URL com pooler (porta 6543), `pnpm db:ping` para aquecer, reenviar a mensagem. |
| **GET /api/credits demora 10–23s** | Terminal: `[credits-timing] getCreditBalance + getRecentUsage: Xms` | Mesma causa: BD lenta. A API devolve 200 com `_partial: true` após o timeout do histórico (10s). Aquecer a BD (warmup ou db:ping) e usar pooler 6543. |
| **400 «base de dados não respondeu a tempo»** | Terminal: `[chat] dbBatch timeout or error: DB_BATCH_TIMEOUT` | O batch global (120s) foi excedido. Ver [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md) e [REFERENCIA-ERROS-400.md](REFERENCIA-ERROS-400.md#chat--post-apichat). |
| **503 em GET /api/health/db** | Resposta da API ou terminal | BD inacessível, cold start ou timeout do health check (12s). Ver [REFERENCIA-ERROS-400.md](REFERENCIA-ERROS-400.md#503--get-apihealthdb-base-de-dados-indisponível) e [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md). |
| **400 com cause (validação)** | Browser: Network → Response do POST /api/chat → campo `cause` | Erro de validação (ex.: falta PI ou Contestação no Revisor, campo vazio). Ver [REFERENCIA-ERROS-400.md](REFERENCIA-ERROS-400.md) tabela «Chat — POST /api/chat». |
| **«A demorar mais do que o habitual» aos 5s** | UI mostra aviso + «Cancelar pedido» | Normal se preStream (BD + validação + RAG) for lento. Ativar DEBUG_CHAT e ver `preStreamPhases`; corrigir a fase mais lenta (em geral dbBatch → aquecer BD). |
| **Resposta cortada ou erro no fim do stream** | Terminal: erros após `execute` ou código 57014 | Timeout na BD ao guardar ou falha ao deduzir créditos. Ver logs do servidor e [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md). |
| **DELETE chat devolve 403 em vez de 404** (utilizador interpreta como «sem permissão» ao apagar chat inexistente) | Network: DELETE /api/chat?id=... → 403 | O servidor deve devolver **404** quando o chat não existe (não 403). Ver [REFERENCIA-ERROS-400.md](REFERENCIA-ERROS-400.md#delete-apichat---comportamento-404-vs-403). |
| **«Algo correu mal»** (Error Boundary com mensagem sobre POSTGRES_URL, AUTH_SECRET) | Página de erro da app; em dev o `<pre>` mostra a mensagem; em produção pode aparecer um digest. | 1) **Vercel:** Settings → Environment Variables → confirmar **POSTGRES_URL** (pooler, porta 6543) e **AUTH_SECRET** para Production (e Preview). 2) **Logs:** Vercel → Deployments → função que falhou → Logs para ver o erro real (ex.: timeout BD, connection refused). 3) Se as env estão corretas, o erro pode ser de BD (cold start, timeout) ou de auth; ver [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md). |

**Exemplo (tool call — maxSteps):** em `app/(chat)/api/chat/route.ts`:

```ts
streamText({
  // ...
  maxSteps: 5, // permite tool → resposta do modelo
})
```

---

## 4. Passo a passo para um problema novo

1. **Reproduzir** o problema (ex.: enviar mensagem no chat ou abrir a página).
2. **Ativar** `DEBUG_CHAT=true` em .env.local e reiniciar.
3. **Reproduzir de novo** e olhar para o **terminal**:
   - `[chat-timing]` — confirma que o pedido entrou e tempos de auth/dbBatch.
   - `[chat-debug] preStreamPhases` — mostra onde o tempo foi gasto antes do stream.
   - `[chat-timing] dbBatch: X timeout` — indica qual query da BD está lenta.
4. **Para erros HTTP:** browser → DevTools → **Network** → filtrar por `/api/chat` (ou a rota em causa) → inspeccionar **Response** (body e campo `cause` para 400 de validação).
5. **Identificar a fase** com maior tempo (dbBatch, persistChat, validationRag, saveMessages, etc.).
6. **Aplicar a correção** da tabela acima ou do documento referenciado (DB-TIMEOUT-TROUBLESHOOTING, CHAT-DEBUG, REFERENCIA-ERROS-400).

---

## 5. Checklist rápido (BD lenta / cold start)

Ordem sugerida (resposta imediata primeiro; configuração por último):

- [ ] **Aquecer a BD** antes de testar: `pnpm db:ping` ou abrir a página do chat (DbWarmup chama GET /api/health/db).
- [ ] **Segundo pedido** costuma ser mais rápido; se o primeiro falhar ou demorar, tentar reenviar.
- [ ] Ver [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md) para valores de timeout e secção «Como identificar o gargalo».
- [ ] **POSTGRES_URL** usa pooler (Supabase: porta **6543**, connection string «Transaction») — configuração one-time, não diagnóstico recorrente.

---

## 6. Documentos relacionados

| Documento | Conteúdo |
|-----------|----------|
| [CHAT-DEBUG.md](CHAT-DEBUG.md) | Ativar DEBUG_CHAT, fases preStream (`preStreamPhases`), «A pensar» e reasoning, checklist «nenhum assistente funciona». |
| [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md) | POSTGRES_URL, cold start, timeouts (12s por query, 120s batch), como identificar o gargalo, testes E2E. |
| [REFERENCIA-ERROS-400.md](REFERENCIA-ERROS-400.md) | Códigos 400/503, cause de validação, 503 health/db, resposta lenta. |
| [FLUXO-CONSULTA-BD-E-CREDITOS.md](FLUXO-CONSULTA-BD-E-CREDITOS.md) | Sequência exata: carregamento da página, GET /api/credits, POST /api/chat (batch de queries). |
