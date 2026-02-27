# Tarefa 2 — Resumo das alterações (route.ts e hook/banner)

## Estado do projeto

- **Não existe** `buildSystemPrompt(ctx)` nem pasta `lib/prompts/agente-trabalhista/` com módulos 01–10. O system prompt é montado em `lib/ai/prompts.ts` (`systemPrompt()`) usando `agentInstructions` (que pode ser `AGENTE_REVISOR_DEFESAS_INSTRUCTIONS`) e `knowledgeContext`.
- **Não existe** parâmetro `bancoTesesAtivo` no body da API. O “banco de teses” é referido nas instruções do agente (@bancodetese); a Seção 6 do Doc 1 está condicionada a @bancodetese no próprio texto do prompt. Para ativar/desativar dinamicamente seria necessário: (1) campo opcional no schema (ex.: `bancoTesesAtivo?: boolean`) e (2) injetar no system prompt uma linha ou seção condicional.
- **Não existe** `hooks/use-agente-trabalhista.ts`. A lógica do Gate 0.5 está em `components/revisor-phase-banner.tsx` e o chat usa `useChat` em `components/chat.tsx`. A detecção do checkpoint é feita pelos delimitadores `GATE_05_RESUMO_START` / `GATE_05_RESUMO_END` no texto da última mensagem do assistente.
- **saveMessages** já está implementado em `lib/db/queries.ts` e é chamado no `route.ts` (ao salvar mensagem do utilizador e no `onFinish`). Não é placeholder.

---

## Alterações feitas

### route.ts

1. **maxDuration:** `60` → `120` (declarado fora do handler, adequado para Vercel).
2. **streamText:** adicionados `maxTokens: 8192` e `temperature: 0.2` para alinhar com uso de documentos jurídicos longos e menor aleatoriedade.
3. **Erro 529 (overload):** no `catch` do POST, verificação de `status === 529` (quando o erro expõe `.status`) e resposta com `ChatbotError("offline:chat", "Serviço de IA temporariamente sobrecarregado...")`.

*Nota:* O 529 pode vir em erros do fetch/API de formas diferentes (ex.: `response.status` no objeto de erro). Se o SDK não expuser `status` no erro, pode ser necessário inspecionar `error.response?.status` ou a mensagem de erro.

### RevisorPhaseBanner (substituto do “hook”)

4. **Estado de erro:** quando `status === "error"` e o utilizador já respondeu ao Gate 0.5 (CONFIRMAR ou CORRIGIR), o banner passa a mostrar: “Ocorreu um erro ao gerar os documentos. Pode tentar novamente ou usar CORRIGIR para ajustar o resumo.” Assim o estado não fica preso em “FASE B — Gerando documentos.” quando a API falha.

### prompt-input (conversão blob → data URL)

5. **Cleanup / submit obsoleto:** criado `submitIdRef` incrementado em cada submit. O resultado do `Promise.all` (conversão de blob URLs para data URLs) só é usado para chamar `onSubmit` se `submitIdRef.current === currentSubmitId`. Se o utilizador enviar outra mensagem ou alterar anexos antes de as conversões terminarem, o submit antigo é ignorado e evita-se usar dados desatualizados ou múltiplos submits sobrepostos.

---

## Sugestões não implementadas (para arquitetura futura)

- **Gate 0.5 mais robusto:** em vez de depender apenas da string "CONFIRMAR" e dos delimitadores no texto, usar **structured output** ou um **custom data type** no stream (ex.: `data-gate-05-resumo` com payload JSON) para o cliente detectar o checkpoint de forma estável. Exige alteração no backend (tool call ou `data` no stream) e no cliente.
- **Hook use-agente-trabalhista:** extrair a lógica de estados (gate05_pendente, confirmado, erro, docs_recebidos) do banner + useChat para um hook `useAgenteTrabalhista()` que encapsule `useChat` e derive esses estados, facilitando testes e reutilização.
- **bancoTesesAtivo no backend:** adicionar ao schema do POST um campo opcional `bancoTesesAtivo?: boolean` e, em `systemPrompt` ou no bloco de instruções do revisor, injetar/ocultar a referência à “Seção 6 — Quadro de Teses” consoante esse flag (ou inferi-lo a partir de `knowledgeDocumentIds`/tipo de documentos).
