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

**Última atualização:** 2026-03-09

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
| **Loop** | `stopWhen: stepCountIs(5)` em `streamText`; até 5 steps (tool calls + resposta final). |
| **Tools** | Montagem dinâmica por agente: `createDocument`, `updateDocument`, `getWeather`, `requestSuggestions`, `improvePrompt`, `createRevisorDefesaDocuments`, `createRedatorContestacaoDocument`, validação. |
| **Contexto por pedido** | `systemPrompt()` recebe `knowledgeContext` (RAG ou injeção direta), instruções do agente, hints; não há `callOptionsSchema` nem `prepareCall`. |
| **RAG** | `retrieveKnowledgeContext()` antes do `streamText`; resultado injetado em `knowledgeContext` no system prompt. |
| **Memória persistente** | Não implementada (apenas histórico de mensagens no chat). |
| **Subagentes** | Não utilizados. |

Conclusão: temos um “agente” implícito (modelo + instruções + tools + loop) configurado manualmente na rota; a documentação AI SDK Agents sugere migrar para **ToolLoopAgent** e usar **call options** e **prepareCall** para contexto dinâmico (RAG, userId, etc.).

---

## 3. O que podemos implantar — próximos passos

### 3.1 Prioridade alta (reduzir complexidade da rota e alinhar com AI SDK)

| # | Tarefa | Descrição | Referência |
|---|--------|-----------|------------|
| 1 | **Avaliar migração para ToolLoopAgent** | Definir um (ou mais) agentes como instâncias de `ToolLoopAgent`: modelo base, instruções, tools, `stopWhen: stepCountIs(5)`. Na rota, usar `createAgentUIStreamResponse({ agent, messages })` em vez de montar `streamText` manualmente. Benefício: menos lógica na rota, reutilização, type safety com `InferAgentUIMessage`. | [Building Agents](https://ai-sdk.dev/docs/agents/building-agents) |
| 2 | **Call options + prepareCall para contexto** | Introduzir `callOptionsSchema` (ex.: `userId`, `agentId`, `knowledgeDocumentIds`, `query` ou texto da última mensagem) e `prepareCall` para: (1) injetar resultado de RAG nas instruções, (2) anexar base de conhecimento, (3) opcionalmente escolher modelo ou tools por tipo de utilizador/agente. O RAG continua a ser feito “fora” do agente (em `retrieveKnowledgeContext`); o `prepareCall` recebe esse contexto e coloca-o no system prompt. | [Configuring Call Options](https://ai-sdk.dev/docs/agents/configuring-call-options), exemplo RAG na doc |

### 3.2 Prioridade média (melhorar controlo e UX)

| # | Tarefa | Descrição | Referência |
|---|--------|-----------|------------|
| 3 | **Loop control com prepareStep** | Se o Revisor ou Redator tiverem fases bem definidas (ex.: primeiro só pesquisa/validação, depois geração de documentos), usar `prepareStep` para restringir `activeTools` ou `toolChoice` por step (ex.: steps 0–1 só tools de leitura/validação; a partir do step 2 permitir `createRevisorDefesaDocuments`). Exige definir “fases” por número de step ou por tool já chamada. | [Loop Control](https://ai-sdk.dev/docs/agents/loop-control) |
| 4 | **Structured output (opcional)** | Para entregas que devem seguir um schema (ex.: relatório com campos fixos), considerar `output: Output.object({ schema: z.object({...}) })` no agente, em cenários em que a resposta final seja estruturada em vez de texto livre. Pode coexistir com tools que geram DOCX. | [Building Agents — Structured Output](https://ai-sdk.dev/docs/agents/building-agents#structured-output) |
| 5 | **Lifecycle callbacks** | Usar `onStepFinish` / `onFinish` (e eventualmente `experimental_onToolCallFinish`) para: logging de uso (tokens, tools chamadas), telemetria e métricas. Útil para custo e debugging. | [Building Agents — Lifecycle](https://ai-sdk.dev/docs/agents/building-agents#lifecycle-callbacks) |

### 3.3 Prioridade mais baixa (evolução de produto)

| # | Tarefa | Descrição | Referência |
|---|--------|-----------|------------|
| 6 | **Memória persistente** | Avaliar necessidade de memória de longo prazo (preferências do utilizador, factos entre conversas). Opções: (a) Anthropic Memory Tool se o modelo for Claude e quisermos baixo esforço; (b) Mem0/Supermemory/Hindsight como provider; (c) tool custom (ler/escrever tabela nossa). Só avançar se o produto exigir. | [Memory](https://ai-sdk.dev/docs/agents/memory) |
| 7 | **Subagentes** | Se surgir um fluxo que consuma muito contexto (ex.: “pesquisar na base e resumir” como tarefa isolada), implementar um subagente com tools de pesquisa; a tool do agente principal chama o subagente e usa `toModelOutput` para devolver só um resumo ao modelo principal. Evitar se o fluxo atual for suficiente. | [Subagents](https://ai-sdk.dev/docs/agents/subagents) |
| 8 | **Workflow patterns (core)** | Para fluxos muito estruturados (ex.: avaliar qualidade da defesa e depois re-gerar com feedback), considerar padrões Evaluator–Optimizer ou Orchestrator–Worker com `generateText`/`streamText` em vez de um único loop do agente. Pode ser complementar ao ToolLoopAgent (ex.: passo 1 = agente; passo 2 = avaliador; passo 3 = agente de novo). Alinhar com [WORKFLOW-DEVKIT-PROXIMOS-PASSOS.md](WORKFLOW-DEVKIT-PROXIMOS-PASSOS.md) se adoptarmos workflows duráveis. | [Workflow Patterns](https://ai-sdk.dev/docs/agents/workflows) |

---

## 4. Relação com outros documentos do projeto

- **PLANO-PROXIMOS-PASSOS.md:** As tarefas acima devem ser registadas na secção “Curto prazo” ou “Imediato” consoante a prioridade escolhida; este doc serve de referência técnica para “AI SDK Agents”.
- **WORKFLOW-DEVKIT-PROXIMOS-PASSOS.md:** Workflow DevKit (useworkflow.dev) cobre workflows duráveis e human-in-the-loop; o AI SDK Agents cobre o loop do agente (tools, steps, call options). Podem coexistir: ToolLoopAgent para o ciclo de conversa; Workflow DevKit para orquestração durável (ex.: GATE-1 → FASE A → GATE 0.5 → FASE B) se for adoptado.
- **ESTRUTURA-INSTRUCOES-AGENTES.md:** As instruções (role, workflow, constraints, output format) continuam a definir o comportamento; ao migrar para ToolLoopAgent, essas instruções passam para a propriedade `instructions` do agente.
- **lib/ai/knowledge-base.md e RAG:** O fluxo RAG (retrieveKnowledgeContext) mantém-se; a integração com o agente faz-se via **prepareCall** (call options) injetando o contexto recuperado nas instruções ou no system prompt.

---

## 5. Checklist de decisão antes de implementar

- [ ] Confirmar compatibilidade da versão do pacote `ai` com `ToolLoopAgent` e `createAgentUIStreamResponse` (e com `useChat` no cliente).
- [ ] Decidir se mantemos um único agente “polimórfico” (configurado por call options) ou uma instância de ToolLoopAgent por agente (Revisor, Redator, etc.).
- [ ] Garantir que créditos, persistência de mensagens, tool approval e resumable stream continuam a funcionar após a refatoração (a rota continua a ser o sítio onde se valida sessão, créditos e se persiste o histórico).
- [ ] Documentar em AGENTS.md ou em PROJETO-REVISOR-DEFESAS.md qualquer mudança no fluxo do Revisor (ex.: uso de prepareStep por fases).

---

## 6. Referências rápidas

| Tópico | URL |
|--------|-----|
| Agents Overview | https://ai-sdk.dev/docs/agents/overview |
| Building Agents | https://ai-sdk.dev/docs/agents/building-agents |
| Workflow Patterns | https://ai-sdk.dev/docs/agents/workflows |
| Loop Control | https://ai-sdk.dev/docs/agents/loop-control |
| Configuring Call Options | https://ai-sdk.dev/docs/agents/configuring-call-options |
| Memory | https://ai-sdk.dev/docs/agents/memory |
| Subagents | https://ai-sdk.dev/docs/agents/subagents |
