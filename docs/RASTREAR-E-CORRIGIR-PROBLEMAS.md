# Como rastrear e corrigir problemas do chat

Guia prático: **sintoma** → **onde ver** → **o que fazer**. Para detalhes técnicos, ver os documentos referenciados em cada secção.

---

## 1. Ativar o rastreamento

1. Em **.env.local** (não commitar em produção):
   ```env
   DEBUG_CHAT=true
   ```
2. Reiniciar o servidor: `pnpm dev`.
3. Os logs aparecem no **terminal onde corre `pnpm dev`** (não no browser).

Com isso, cada POST /api/chat regista tempos por fase e, em caso de lentidão, consegues ver onde o tempo está a ser gasto.

---

## 2. Fluxo do pedido (onde pode estar o tempo)

Ordem aproximada quando envias uma mensagem:

| Fase | O que faz | Onde ver no terminal |
|------|-----------|------------------------|
| **auth** | Obter sessão | `[chat-timing] auth: Xms` |
| **dbBatch** | Chat, mensagens, conhecimento, créditos, agente (em paralelo) | `[chat-timing] dbBatch: ... done in Xms` ou `timeout após 12000ms` |
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
| **Agente não retorna mensagem após tool call** (ex.: createRevisorDefesaDocuments executa mas o chat fica sem resposta) | O agente chama a ferramenta e o stream termina sem texto do modelo. | O `streamText` encerra após o tool call (só 1 step). **Fix:** em `app/(chat)/api/chat/route.ts` usar `stopWhen: stepCountIs(5)` (ou equivalente `maxSteps: 5`) no `streamText` para permitir vários turnos (tool → modelo gera resposta). Ver [CHECKLIST-REVISAO-BD-E-AUTH.md](CHECKLIST-REVISAO-BD-E-AUTH.md#4b-chat--agente-não-retorna-mensagem-após-tool-call). |
| **Muitos «timeout após 12000ms» no dbBatch** | Terminal: `[chat-timing] dbBatch: X timeout após 12000ms` | BD lenta ou cold start. Ver [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md): POSTGRES_URL com pooler (porta 6543), `pnpm db:ping` para aquecer, reenviar a mensagem. |
| **GET /api/credits demora 10–23s** | Terminal: `[credits-timing] getCreditBalance + getRecentUsage: Xms` | Mesma causa: BD lenta. A API devolve 200 com `_partial: true` após o timeout do histórico (10s). Aquecer a BD (warmup ou db:ping) e usar pooler 6543. |
| **400 «base de dados não respondeu a tempo»** | Terminal: `[chat] dbBatch timeout or error: DB_BATCH_TIMEOUT` | O batch global (120s) foi excedido. Ver [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md) e [REFERENCIA-ERROS-400.md](REFERENCIA-ERROS-400.md#chat--post-apichat). |
| **503 em GET /api/health/db** | Resposta da API ou terminal | BD inacessível, cold start ou timeout do health check (12s). Ver [REFERENCIA-ERROS-400.md](REFERENCIA-ERROS-400.md#503--get-apihealthdb-base-de-dados-indisponível) e [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md). |
| **400 com cause (validação)** | Browser: Network → Response do POST /api/chat → campo `cause` | Erro de validação (ex.: falta PI ou Contestação no Revisor, campo vazio). Ver [REFERENCIA-ERROS-400.md](REFERENCIA-ERROS-400.md) tabela «Chat — POST /api/chat». |
| **«A demorar mais do que o habitual» aos 50s** | UI mostra aviso + «Cancelar pedido» | Normal se preStream (BD + validação + RAG) for lento. Ativar DEBUG_CHAT e ver `preStreamPhases`; corrigir a fase mais lenta (em geral dbBatch → aquecer BD). |
| **Resposta cortada ou erro no fim do stream** | Terminal: erros após `execute` ou código 57014 | Timeout na BD ao guardar ou falha ao deduzir créditos. Ver logs do servidor e [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md). |

---

## 4. Passo a passo para um problema novo

1. **Reproduzir** o problema (ex.: enviar mensagem no chat ou abrir a página).
2. **Ativar** `DEBUG_CHAT=true` em .env.local e reiniciar.
3. **Reproduzir de novo** e olhar para o **terminal**:
   - `[chat-timing]` — confirma que o pedido entrou e tempos de auth/dbBatch.
   - `[chat-debug] preStreamPhases` — mostra onde o tempo foi gasto antes do stream.
   - `[chat-timing] dbBatch: X timeout` — indica qual query da BD está lenta.
4. **Identificar a fase** com maior tempo (dbBatch, validationRag, saveMessages, etc.).
5. **Aplicar a correção** da tabela acima ou do documento referenciado (DB-TIMEOUT-TROUBLESHOOTING, CHAT-DEBUG, REFERENCIA-ERROS-400).

---

## 5. Chat — agente não retorna mensagem após tool call

**Sintoma:** O agente executa a ferramenta (ex.: createRevisorDefesaDocuments) mas nenhuma mensagem aparece no chat.

**Causa:** `maxSteps` / múltiplos steps ausentes no `streamText` — o stream encerra após o tool call sem abrir turno para o modelo gerar o texto de resposta.

**Fix:** Adicionar `stopWhen: stepCountIs(5)` no `streamText` em `app/(chat)/api/chat/route.ts` (ou o equivalente `maxSteps: 5` conforme a versão do AI SDK). Assim o modelo pode: step 1 = chamar a tool; step 2 = gerar a mensagem após o resultado da tool.

---

## 6. Checklist rápido (BD lenta / cold start)

- [ ] **POSTGRES_URL** usa pooler (Supabase: porta **6543**, connection string «Transaction»).
- [ ] **Aquecer a BD** antes de testar: `pnpm db:ping` ou abrir a página do chat (DbWarmup chama GET /api/health/db).
- [ ] **Segundo pedido** costuma ser mais rápido; se o primeiro falhar ou demorar, tentar reenviar.
- [ ] Ver [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md) para valores de timeout e secção «Como identificar o gargalo».

---

## 7. Documentos relacionados

| Documento | Conteúdo |
|-----------|----------|
| [CHAT-DEBUG.md](CHAT-DEBUG.md) | Ativar DEBUG_CHAT, fases preStream, «A pensar» e reasoning, checklist «nenhum assistente funciona». |
| [DB-TIMEOUT-TROUBLESHOOTING.md](DB-TIMEOUT-TROUBLESHOOTING.md) | POSTGRES_URL, cold start, timeouts (12s por query, 120s batch), como identificar o gargalo, testes E2E. |
| [REFERENCIA-ERROS-400.md](REFERENCIA-ERROS-400.md) | Códigos 400/503, cause de validação, 503 health/db, resposta lenta. |
| [FLUXO-CONSULTA-BD-E-CREDITOS.md](FLUXO-CONSULTA-BD-E-CREDITOS.md) | Sequência exata: carregamento da página, GET /api/credits, POST /api/chat (batch de queries). |
