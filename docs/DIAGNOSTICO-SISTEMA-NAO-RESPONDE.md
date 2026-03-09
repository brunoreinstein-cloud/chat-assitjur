# Diagnóstico: sistema não retorna mensagem

Este documento cruza o diagnóstico "sistema não responde com mensagem" com o **código atual** do projeto e indica o que já está correto e o que pode ser melhorado.

---

## 1. Tool-only response (modelo só chama tool e não gera texto)

### Diagnóstico original
Sem `maxSteps` > 1, o stream termina após a tool e o modelo não tem uma segunda volta para gerar texto.

### Estado no código

- **Ficheiro:** `app/(chat)/api/chat/route.ts` (por volta da linha 1282).
- **Implementação:** No AI SDK 6.x o parâmetro é `stopWhen` (não `maxSteps`). Default é `stepCountIs(1)`. Com `stopWhen: stepCountIs(5)` — o stream permite **até 5 steps** (cada step = uma “volta” do modelo ou execução de tool). o stream permite até 5 steps (step 1 = tool call; step 2 = texto de entrega). Comentário no route.ts explica isto.
- **Conclusão:** Com `stopWhen: stepCountIs(5)` o comportamento está correto. Se persistir, confirmar ficheiro em execução e ausência de cache/build antigo.

---

## 2. Instruções do agente sem pedir texto após a tool

### Diagnóstico original
Se as instruções dizem só “use a ferramenta X” e não “após usar, apresente um resumo em texto”, o modelo pode entender que a tool é a resposta e não gerar mensagem.

### Estado no código

- **Revisor:** `lib/ai/agent-revisor-defesas.ts` — a instrução de entrega foi movida para dentro da tag `<fase_b>` e `<output_format>` já existe “Entrega: indicar os 3 documentos gerados pelo nome (Avaliação da defesa, Roteiro Advogado, Roteiro Preposto), links/refs e ressalvas”. Ou seja, já se pede texto após a tool.
- A instrução de entrega está agora dentro de `<fase_b>`. “Após executar a ferramenta, escreve sempre uma mensagem em texto ao utilizador indicando os documentos gerados.” Foi adicionado esse reforço nas instruções do Revisor.

---

## 3. onFinish não grava mensagem assistant quando não há texto

### Diagnóstico original
Se `onFinish` só gravar quando `text !== ''`, mensagens com apenas tool results não seriam guardadas.

### Estado no código

- **Ficheiro:** `app/(chat)/api/chat/route.ts` — `createStreamOnFinishHandler` (por volta das linhas 1382–1396).
- **Lógica:** Grava quando `finishedMessages.length > 0`, **sem** filtrar por existência de parte de texto. As mensagens vêm do stream com `parts` (text, tool-invocation, etc.) e são guardadas tal qual.
- **Conclusão:** Este ponto está **correto**. Mensagens só com tool results são guardadas; o UI usa `message.parts` e o `MessagePartRenderer` renderiza partes do tipo `tool-createRevisorDefesaDocuments`, `tool-createDocument`, etc.

---

## 4. agentInstructions vazio a sobrescrever instruções do agente

### Diagnóstico original
Se o cliente enviar `agentInstructions: ""` e a lógica for `agentInstructions !== undefined ? agentInstructions : agentConfig.instructions`, as instruções do agente seriam substituídas por string vazia.

### Estado no código

- **Ficheiro:** `app/(chat)/api/chat/route.ts` (linhas 1104–1105 e 1206–1207).
- **Lógica:**  
  `effectiveAgentInstructions = agentInstructions?.trim() || agentConfig.instructions`  
  Ou seja: só se usa o body se, após trim, houver conteúdo; caso contrário usa `agentConfig.instructions`.
- **Conclusão:** Este ponto está **correto**. String vazia não apaga as instruções do agente.

---

## 5. Modelos “reasoning” com tools desativadas

### Não fazia parte do diagnóstico original, mas é relevante

- **Ficheiro:** `app/(chat)/api/chat/route.ts` (linhas 1220–1229).
- **Lógica:** Se `isReasoningModel` (modelId contém "reasoning" ou "thinking"), `activeToolNames` fica `[]` e **nenhuma tool** é passada ao modelo.
- **Impacto:** No Revisor e no Redator, `allowedModelIds` já exclui esses modelos (`nonReasoningChatModelIds` e lista explícita Sonnet/Opus). Por isso, em uso normal dos agentes com tools, este caso não se aplica. Só seria problema se alguém forçasse um modelo reasoning para um agente que usa tools.

---

## Checklist de verificação rápida

| # | O que verificar | Estado no projeto |
|---|-----------------|-------------------|
| 1 | `maxSteps` / steps no `streamText` | ✅ `stopWhen: stepCountIs(5)` (até 5 steps). |
| 2 | Stream a terminar com `finishReason: 'tool-calls'` sem texto | Verificar em logs/DevTools se, quando não há resposta, o stream termina após tool call (e se o modelo recebe novo turn com o tool result). |
| 3 | Instruções a pedir texto após a tool | ✅ Revisor já tem “Entrega: indicar…”; reforço explícito adicionado. |
| 4 | `onFinish` a gravar mesmo com `text === ''` | ✅ Grava por `finishedMessages.length > 0`; não filtra por texto. |
| 5 | `agentInstructions` vazio no body | ✅ Uso de `?.trim() || agentConfig.instructions` evita sobrescrita. |

---

## Três suspeitos adicionais (se ainda não responde)

Se os 4 pontos originais estão endereçados e o sistema **ainda não responde**, estes três suspeitos devem ser verificados.

### Suspeito 1: `stopWhen` com AI SDK 6.x

- **Risco:** Em versões antigas do AI SDK o parâmetro era `maxSteps`; no 6.x passou a `stopWhen` + `stepCountIs(n)`. Se o build estiver a usar código em cache de uma versão anterior, `stopWhen` pode ser ignorado.
- **Verificação no código:**
  - `package.json`: o projeto usa `"ai": "6.0.111"` — a API `stopWhen`/`stepCountIs` está correta para esta versão.
  - `app/(chat)/api/chat/route.ts`: usa `stopWhen: stepCountIs(5)` e importa `stepCountIs` de `"ai"`.
- **Conclusão:** Versão e uso estão corretos. Se o problema persistir, confirmar que não há cache de build antigo (ex.: limpar `.next` e reconstruir).

### Suspeito 2: Tool result não repassado ao modelo

- **Risco:** Se o `execute` da tool não retornar um valor, o SDK não tem nada para enviar ao modelo no step 2; o stream pode terminar após o tool call sem abrir turno para texto.
- **Verificação no código:**
  - A tool usada no chat vem de `lib/ai/tools/create-revisor-defesa-documents.ts` (injetada em `route.ts`), **não** do stub em `lib/ai/tools/validation-tools.ts` (que tem `execute: noop` só para validação).
  - Em `create-revisor-defesa-documents.ts`, o `execute` **retorna** explicitamente (linhas 116–121): `{ ids, titles, content: "Os 3 documentos foram criados..." }`.
- **Conclusão:** A tool real retorna valor; o SDK deve repassar ao modelo. Se na prática não houver step 2, inspecionar o stream no DevTools (ver "Diagnóstico rápido" abaixo).

### Suspeito 3: `MessagePartRenderer` não renderizar texto após tool

- **Risco:** A mensagem pode ter partes `[tool-invocation, text]` e o UI renderizar só a tool, ignorando o texto.
- **Verificação no código:**
  - `components/message.tsx`: usa `processedParts.map((part, index) => <MessagePartRenderer ... part={part} />)` — **todas** as parts são mapeadas (após `flattenReasoningParts`, que não remove text nem tool).
  - `components/message-part-renderer.tsx`: `renderPartByType` trata `type === "text"` (renderTextPart) e cada `tool-*` (renderToolPart). Partes de texto após uma tool são renderizadas na ordem.
- **Conclusão:** O renderer está correto; não há filtro que pare na primeira tool. Se o stream enviar `text-delta` e o UI não mostrar, o problema está noutro ponto (ex.: formato das parts no stream).

---

## Diagnóstico rápido (2 minutos)

Antes de alterar mais código, executar este diagnóstico:

1. **Confirmar versão do SDK**
   ```bash
   grep '"ai":' package.json
   ```
   Esperado: `"ai": "6.0.111"` (ou outra 6.x). Se for `< 4.0`, usar `maxSteps: 5` em vez de `stopWhen: stepCountIs(5)`.

2. **Confirmar que a tool retorna valor**
   O `execute` em `lib/ai/tools/create-revisor-defesa-documents.ts` já faz `return { ids, titles, content: "..." }`. Para depuração temporária, pode adicionar no `execute` um log (remover depois): o resultado deve ser um objeto serializável que o SDK envia ao modelo no step 2.

3. **Inspecionar o stream no browser**
   - DevTools → Network → filtrar por `chat` ou pelo URL do `POST /api/chat`.
   - Abrir o evento EventStream da resposta.
   - Verificar sequência: após `tool_call` / `finish` com `finishReason: tool-calls`, deve aparecer um novo turno com eventos `text-delta`.
   - **Se não aparecer `text-delta` após o tool call:** o problema é no fluxo step 2 (modelo não está a receber o tool result ou não está a ser chamado).
   - **Se aparecer `text-delta` mas o UI não mostrar:** o problema é no cliente (parsing do stream ou render das parts).

---

## Próximos passos se o problema continuar

1. **Logs:** Em dev, verificar no terminal se há `[chat-timing]` e se o stream termina após tool (e se há segundo step com resposta do modelo).
2. **Rede:** No DevTools (Network), inspecionar o stream da resposta do `POST /api/chat`: ver se chegam eventos de texto (`text-delta`) após o resultado da tool.
3. **UI:** Confirmar se a mensagem do assistente aparece com partes do tipo `tool-createRevisorDefesaDocuments` (ou outra tool) mesmo sem parte de texto — o `MessagePartRenderer` e `message.tsx` já suportam essas partes.
4. **Instruções:** Se o modelo ignorar o “Entrega” em texto, considerar reforçar ainda mais no prompt (por exemplo no início da secção de entrega): “Obrigatório: após chamar a ferramenta, escreve uma mensagem em texto ao utilizador.”
