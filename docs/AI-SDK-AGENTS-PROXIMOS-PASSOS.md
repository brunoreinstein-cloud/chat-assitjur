# AI SDK Agents — Análise e próximos passos

Revisão da documentação oficial do AI SDK sobre **Agents** e mapeamento do que podemos implantar nos próximos passos do projeto (chat, Revisor de Defesas, Redator de Contestações, base de conhecimento).

**Referências oficiais:**

- [Agents Overview](https://ai-sdk.dev/docs/agents/overview)
- [Building Agents](https://ai-sdk.dev/docs/agents/building-agents)
- [Workflow Patterns](https://ai-sdk.dev/docs/agents/workflows)
- [Loop Control](https://ai-sdk.dev/docs/agents/loop-control)
- [Configuring Call Options](https://ai-sdk.dev/docs/agents/configuring-call-options)
- [Memory](https://ai-sdk.dev/docs/agents/memory)
- [Subagents](https://ai-sdk.dev/docs/agents/subagents)

**Última atualização:** 2026-03-23 (Opção A implementada — `ToolLoopAgent` per-request em produção)

---

## 1. Resumo da documentação AI SDK Agents

### 1.1 Visão geral

- **Agentes** = LLM + **tools** + **loop** (contexto + condições de paragem).
- **ToolLoopAgent** — classe recomendada: encapsula modelo, instruções, tools e controlo do loop; reduz boilerplate e centraliza a configuração.
- Uso: `generate()`, `stream()` ou `createAgentUIStreamResponse()` para rotas de chat.

### 1.2 Building Agents

- **Configuração:** `model`, `instructions`, `tools`, `stopWhen` (ex.: `stepCountIs(20)`), `toolChoice`, `output` (structured output).
- **Comportamento:** instruções de sistema (role, restrições, uso de tools, formato de saída).
- **Lifecycle callbacks:** `experimental_onStart`, `onStepFinish`, `onFinish`, etc. (logging, telemetria).

### 1.3 Workflow Patterns

Padrões com funções core (`generateText` / `streamText`), não com ToolLoopAgent:

- **Sequential (chains):** passos em ordem; saída de um é entrada do seguinte.
- **Routing:** modelo classifica e escolhe caminho (ex.: tipo de pedido → modelo/prompt diferente).
- **Parallel:** várias análises em paralelo (ex.: code review segurança + performance + manutenção).
- **Orchestrator–Worker:** orquestrador planifica; workers especializados executam.
- **Evaluator–Optimizer:** avaliar resultado → se abaixo do limiar, re-gerar com feedback.

### 1.4 Loop Control

- **stopWhen:** quando parar (ex.: `stepCountIs(20)`, `hasToolCall('done')`, condições custom).
- **prepareStep:** antes de cada step pode alterar modelo, mensagens, tools ativos, `toolChoice` (ex.: fase 0–2 só search, depois analyze, depois summarize).
- **Forced tool calling:** `toolChoice: 'required'` + tool `done` sem `execute` para o agente sempre responder via tools e terminar com uma tool específica.

### 1.5 Configuring Call Options

- **callOptionsSchema** (Zod): parâmetros tipados por pedido (ex.: `userId`, `accountType`, `query`).
- **prepareCall:** usa essas opções para alterar `instructions`, `model`, `tools`, etc., antes do loop (ex.: injetar contexto RAG, escolher modelo por complexidade).
- Útil para **RAG**: em `prepareCall` fazer `vectorSearch(options.query)` e injetar documentos nas instruções.

### 1.6 Memory

- **Provider-defined:** ex. Anthropic Memory Tool (comandos tipo ficheiro em `/memories`); implementar `execute` e persistência.
- **Memory providers:** Letta, Mem0, Supermemory, Hindsight — memória persistente com pouco código; dependência de serviço.
- **Custom tool:** ferramenta própria (ex.: ler/escrever BD); máxima flexibilidade, mais trabalho.

### 1.7 Subagents

- **Subagente** = agente invocado pelo principal via uma **tool**; corre com contexto próprio e devolve resultado (ou stream).
- **Quando usar:** tarefas que consomem muito contexto, pesquisa pesada, ou isolamento de ferramentas.
- **toModelOutput:** o que o utilizador vê (stream completo do subagente) pode ser resumido para o modelo principal (ex.: só o texto final), poupando tokens.
- **Preliminary tool results:** `async function*` + `yield` para mostrar progresso do subagente na UI.

---

## 2. Estado atual do projeto

| Aspecto | Implementação atual |
|--------|----------------------|
| **API do chat** | `streamText` direto em `app/(chat)/api/chat/route.ts`; não usa a classe `ToolLoopAgent`. |
| **Agentes** | Registry em `lib/ai/agents-registry.ts`: instruções + flags de tools por `agentId` (Revisor, Redator, Assistente, Master). |
| **Loop** | `stopWhen: stepCountIs(5)` ou `stepCountIs(7)` em `streamText`; já migrado de `maxSteps`. ✅ |
| **onStepFinish** | Implementado — loga step, tools chamadas e tokens em dev/debug mode. ✅ |
| **Tools** | Montagem dinâmica por agente; factories com `session` + `dataStream` em closure. |
| **abortSignal** | Propagado em `analyze-processo-pipeline`, `improve-prompt` e `request-suggestions`. ✅ |
| **DevTools** | `@ai-sdk/devtools` instalado; middleware ativo em dev via `providers.ts`. ✅ |
| **Contexto por pedido** | `systemPrompt()` recebe `knowledgeContext` (RAG ou injeção direta), instruções do agente, hints; não há `callOptionsSchema` nem `prepareCall`. |
| **RAG** | `retrieveKnowledgeContext()` antes do `streamText`; resultado injetado em `knowledgeContext` no system prompt. |
| **Memória persistente** | Implementada via `memory.ts` (saveMemory, recallMemories, forgetMemory → BD). ✅ |
| **Subagentes** | Não utilizados. |

---

## 3. Análise de viabilidade — migração para ToolLoopAgent

### 3.1 O bloqueador fundamental: `dataStream`

A maioria das tools do projeto são **factory functions** que recebem `session` e `dataStream` como argumentos:

```typescript
// Padrão actual — tools dependem de dataStream por request
createDocument({ session, dataStream })
createRevisorDefesaDocuments({ session, dataStream })
createRedatorContestacaoDocument({ session, dataStream })
createMasterDocuments({ session, dataStream })
analyzeProcessoPipeline({ session, dataStream })
requestSuggestions({ session, dataStream })
```

O `dataStream` é um `UIMessageStreamWriter<ChatMessage>` — um objeto criado **dentro** do `execute` callback de `createUIMessageStream`. Não existe antes do stream começar, logo não pode ser passado como `callOption` nem ser injetado no momento de construção do agente.

Com `createAgentUIStreamResponse` (o padrão recomendado pelo guia), não há acesso ao `dataStream` interno — a rota recebe um `Response` directamente, sem oportunidade de injetar dependências per-request nas tools.

**Consequência directa:** não é possível criar `ToolLoopAgent` como singleton de módulo com as tools actuais. A migração "simples" descrita no guia pressupõe tools sem dependências per-request.

### 3.2 O que mapeia directamente (sem bloqueio)

| Actual (`streamText`) | Equivalente `ToolLoopAgent` |
|-----------------------|------------------------------|
| `system: systemPrompt(...)` | `prepareCall` → return `{ system: ... }` |
| `stopWhen: stepCountIs(N)` | `stopWhen: stepCountIs(N)` nas settings |
| `experimental_telemetry` | `experimental_telemetry` nas settings |
| `experimental_activeTools` | `activeTools` nas settings ou em `prepareCall` |
| `temperature: 0.2` | na settings ou `prepareCall` |
| `maxOutputTokens` | na settings ou `prepareCall` |
| `providerOptions` (thinking) | em `prepareCall` |
| `abortSignal` | parâmetro de `createAgentUIStreamResponse` |
| `consumeSseStream` | parâmetro de `createAgentUIStreamResponse` |
| `originalMessages` (HITL) | `UIMessageStreamOptions.originalMessages` |
| `onStepFinish` | parâmetro de `createAgentUIStreamResponse` |
| Message persistence (`onFinish`) | `UIMessageStreamOptions.onFinish` |

### 3.3 O que requer solução específica

| Desafio | Solução possível |
|---------|-----------------|
| **Tools com `dataStream`** | Opção A: agent factory per-request (ver §3.4). Opção B: refatorar tools para remover dependência de `dataStream` |
| **Créditos** (`totalUsage`) | `ToolLoopAgentSettings.onFinish` recebe `OnFinishEvent` com `totalUsage` — funciona com agent factory per-request |
| **MCP tools async** | Carregar no `prepareCall` (async) em vez de antes do stream |
| **Reasoning model** (`providerOptions`) | Em `prepareCall` baseado no modelId das `callOptions` |
| **Admin overrides** de instruções | Passado via `callOptions` → `prepareCall` injeta nas instructions |

### 3.4 Opção A — Agent factory per-request (pragmática, recomendada)

Criar a instância de `ToolLoopAgent` dentro do request handler, após `dataStream` estar disponível. Mantém o padrão factory das tools, mas ganha `prepareCall` e `callOptionsSchema`.

```typescript
// Estrutura proposta — dentro do execute callback de createUIMessageStream
const agent = new ToolLoopAgent({
  model: getLanguageModel(effectiveModel),
  instructions: agentInstructions, // base
  tools: buildToolsForRequest({ session, dataStream, agentConfig, documentTexts }),
  stopWhen: stepCountIs(agentConfig.usePipelineTool ? 7 : 5),
  activeTools: activeToolNames,
  experimental_telemetry: buildAiSdkTelemetry({ ... }),
  onFinish: async ({ totalUsage }) => {
    await deductCredits({ session, totalUsage, ... });
  },
});

// Usa createUIMessageStream (mantém o padrão actual de persistência/streaming)
const stream = createUIMessageStream({
  execute: async ({ writer: dataStream }) => {
    // agent criado aqui tem acesso ao dataStream via closure
    dataStream.merge(
      await agent.stream({
        messages: uiMessages,
        abortSignal: AbortSignal.timeout(270_000),
      })
    );
  },
  onFinish: handleMessagePersistence,
});
```

**Ganhos:**
- `prepareCall` para injeção dinâmica de system prompt (RAG, conhecimento, hints)
- `callOptionsSchema` para tipagem end-to-end de `userId`, `agentId`, `knowledgeIds`, etc.
- `ToolLoopAgent` como abstração declarativa em vez de `streamText` inline
- Preparação para singleton real no futuro (quando tools forem refatoradas)

**Sem ganhos:**
- Não é singleton — instância por request (igual ao actual)
- `createAgentUIStreamResponse` não é usado (precisa de `createUIMessageStream` wrapper)

### 3.5 Opção B — Refatorar tools (ambiciosa, futura)

Remover a dependência de `dataStream` das tools, substituindo por um mecanismo de callback via `callOptions`:

```typescript
// callOptionsSchema tipado
const agentCallOptions = z.object({
  userId: z.string(),
  agentId: z.string(),
  onToolStream: z.function(), // callback para emitir dados para o cliente
});

// Tools sem dataStream — usam callback injectado via callOptions
execute: async (input, { abortSignal }) => {
  // via prepareCall: callOptions.onToolStream é injectado
  // ... mas dataStream é UIMessageStreamWriter, difícil serializar
};
```

**Problema:** `UIMessageStreamWriter` tem métodos como `write()` e `merge()` que são objetos vivos; não é serializável como `callOption`. Seria necessário um registo global por requestId, o que é complexo e frágil.

**Conclusão:** Não recomendada a curto prazo.

### 3.6 Opção C — Manter `streamText` (status quo melhorado)

Manter a abordagem actual mas continuar a adoptar padrões do SDK 6:
- `onStepFinish` ✅ (já feito)
- `prepareStep` para filtrar tools por fase (futura)
- `stopWhen` ✅ (já feito)
- DevTools ✅ (já feito)

**Esta opção é viável** porque o guia da Vercel reconhece que `streamText` + controlo manual é adequado para "workflow determinístico com branching explícito" — que é exactamente o que o route.ts implementa.

---

## 4. Recomendação final

### Curto prazo (imediato)
✅ **Já implementado:** `onStepFinish`, `abortSignal` em todas as tools, `@ai-sdk/devtools`.

### Médio prazo (próximas sprints)
**Opção A** — Agent factory per-request com `prepareCall` e `callOptionsSchema`.

Prioridade e ordem:
1. Definir `callOptionsSchema` com Zod para o chat route (`userId`, `agentId`, `knowledgeIds`, `processoId`, `effectiveModel`, `requestHints`)
2. Extrair `buildToolsForRequest()` como função isolada (já quase existe no execute handler)
3. Criar `ToolLoopAgent` factory por agente (Revisor, Redator, Assistente, Master) com `prepareCall` que injeta system prompt + RAG context
4. Substituir `streamText(...)` pelo padrão `agent.stream()` dentro do `createUIMessageStream.execute`
5. Mover créditos para `agent.onFinish` (recebe `totalUsage` directamente)

**Estimativa de risco:** Médio. O padrão de streaming e persistência mantém-se; a mudança é no "motor" do loop.

### Longo prazo (futura evolução)
**Opção B** (opcional) — Refatorar tools para eliminar `dataStream`:
- Substituir `dataStream.write(...)` nas tools por `onProgress` callbacks via `callOptions`
- Permitir `ToolLoopAgent` como singleton real
- Habilitar `createAgentUIStreamResponse` (padrão canónico do guia)

---

## 5. Checklist de decisão — Opção A (concluída em 2026-03-23)

- [x] Confirmar que `agent.stream()` retorna resultado compatível com `createUIMessageStream.execute` — ✅ `result.toUIMessageStream({ sendReasoning: true })` funciona com `dataStream.merge()`
- [x] Verificar que `agent.onFinish` recebe `totalUsage` correctamente (soma de todos os steps) — ✅ `totalUsage.inputTokens` / `outputTokens` recebidos directamente (não PromiseLike)
- [x] Garantir que `originalMessages` (HITL flow) continua a funcionar via `createUIMessageStream` — ✅ `createUIMessageStream({ originalMessages })` mantido, não afecta o agent
- [x] Testar resumable streams (Redis/SSE) com o novo padrão — ✅ `createConsumeSseStreamHandler` e `createUIMessageStreamResponse` mantidos inalterados
- [x] Decidir: um `ToolLoopAgent` por agente ou um factory genérico configurado por `callOptions` — ✅ factory genérico `createChatAgent()` em `lib/ai/chat-agent.ts`; configuração por `callOptions` (`ChatCallOptions`)
- [ ] Documentar em AGENTS.md a mudança de `streamText` para `ToolLoopAgent` — (opcional; `lib/ai/chat-agent.ts` serve de referência)

---

## 6. Relação com outros documentos do projeto

- **PLANO-PROXIMOS-PASSOS.md:** As tarefas acima devem ser registadas na secção "Curto prazo" ou "Imediato" consoante a prioridade escolhida; este doc serve de referência técnica para "AI SDK Agents".
- **WORKFLOW-DEVKIT-PROXIMOS-PASSOS.md:** Workflow DevKit (useworkflow.dev) cobre workflows duráveis e human-in-the-loop; o AI SDK Agents cobre o loop do agente (tools, steps, call options). Podem coexistir: ToolLoopAgent para o ciclo de conversa; Workflow DevKit para orquestração durável (ex.: GATE-1 → FASE A → GATE 0.5 → FASE B) se for adoptado.
- **ESTRUTURA-INSTRUCOES-AGENTES.md:** As instruções (role, workflow, constraints, output format) continuam a definir o comportamento; ao migrar para ToolLoopAgent, essas instruções passam para a propriedade `instructions` do agente.
- **lib/ai/knowledge-base.md e RAG:** O fluxo RAG (retrieveKnowledgeContext) mantém-se; a integração com o agente faz-se via **prepareCall** (call options) injectando o contexto recuperado nas instruções ou no system prompt.

---

## 7. Referências rápidas

| Tópico | URL |
|--------|-----|
| Agents Overview | https://ai-sdk.dev/docs/agents/overview |
| Building Agents | https://ai-sdk.dev/docs/agents/building-agents |
| Workflow Patterns | https://ai-sdk.dev/docs/agents/workflows |
| Loop Control | https://ai-sdk.dev/docs/agents/loop-control |
| Configuring Call Options | https://ai-sdk.dev/docs/agents/configuring-call-options |
| Memory | https://ai-sdk.dev/docs/agents/memory |
| Subagents | https://ai-sdk.dev/docs/agents/subagents |
