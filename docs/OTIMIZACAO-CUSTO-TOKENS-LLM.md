# Revisão e otimização de custo de tokens e uso de LLM

Guia para auditar onde o projeto consome tokens e como reduzir custo mantendo qualidade.

---

## 1. Onde o projeto usa o LLM

| Uso | Ficheiro / rota | Modelo | O que conta para tokens |
|-----|------------------|--------|--------------------------|
| **Chat principal** | `app/(chat)/api/chat/route.ts` | `getLanguageModel(selectedChatModel)` | system prompt + mensagens + documentos + base de conhecimento + tool calls + resposta |
| **Título do chat** | `app/(chat)/actions.ts` → `generateTitleFromUserMessage` | `getTitleModel()` (Gemini 2.5 Flash Lite) | system (titlePrompt) + primeira mensagem do utilizador |
| **Artefactos (text/code/sheet)** | `artifacts/text/server.ts`, `artifacts/code/server.ts`, `artifacts/sheet/server.ts` | `getArtifactModel()` (Claude Haiku 4.5) | prompt + conteúdo existente + stream de saída |
| **Sugestões no documento** | `lib/ai/tools/request-suggestions.ts` | `getArtifactModel()` | prompt + documento + sugestões |
| **Revisor (3 DOCX)** | Via chat + tools `createDocument` / `updateDocument` | Mesmo modelo do chat | Incluído no fluxo do chat (várias chamadas tool) |

Os **modelos** vêm de `lib/ai/providers.ts`: em produção usa **Vercel AI Gateway** (configuração no dashboard); em teste usa mocks.

---

## 2. Limites já implementados (reduzem custo)

Estes valores limitam input/output e reduzem custo; ajustar só se precisares de mais contexto ou respostas mais longas.

| Constante | Valor atual | Onde | Efeito |
|-----------|-------------|------|--------|
| **MAX_CHARS_PER_DOCUMENT** | 35 000 | `app/(chat)/api/chat/route.ts` | Por documento (PI, Contestação, etc.) só entram até 35k caracteres no prompt. |
| **MAX_TOTAL_DOC_CHARS** | 100 000 | Idem | Total de caracteres de documentos numa mensagem; evita prompt gigante. |
| **CHAT_MESSAGES_LIMIT** | 80 | Idem | Só as últimas 80 mensagens são carregadas do histórico. |
| **maxOutputTokens** | 8192 | Idem | Resposta do modelo limitada a 8192 tokens por turno. |
| **stopWhen: stepCountIs(5)** | 5 | Idem | Máximo 5 “steps” (tool loops) por pedido; evita loops longos. |
| **knowledgeDocumentIds** | max 20 IDs | `app/(chat)/api/chat/schema.ts` | Máximo 20 documentos da base de conhecimento no contexto. |
| **Entitlements** | 20 (guest) / 50 (regular) msgs/dia | `lib/ai/entitlements.ts` | Limite de mensagens por dia por tipo de utilizador. |

Estimativa grosseira de tamanho de prompt por pedido de chat (sem knowledge): system (~2–4k tokens) + instruções Revisor (~1.5k) + últimas N mensagens + documentos truncados. Com 100k chars de docs ≈ ~25k tokens só de docs; total típico 30k–80k input tokens por request em conversas com PI+Contestação.

---

## 3. Checklist de revisão de custo

### 3.1 System prompt e instruções

- **Base:** `lib/ai/prompts.ts` — `regularPrompt`, `artifactsPrompt`, `getRequestPromptFromHints`, `systemPrompt`.
- **Revisor:** `lib/ai/agent-revisor-defesas.ts` — `AGENTE_REVISOR_DEFESAS_INSTRUCTIONS` (~2k tokens).
- **O que rever:** Remover frases redundantes; encurtar exemplos; não duplicar regras já no agente. O bloco de geolocalização (`requestHints`) é pequeno; manter ou tornar opcional se não for usado.

### 3.2 Base de conhecimento

- **Onde:** `knowledgeContext` em `systemPrompt` = concatenação de todos os documentos selecionados (`getKnowledgeDocumentsByIds`).
- **Problema:** Até 20 documentos sem limite de tamanho por documento → o system prompt pode ficar muito grande.
- **Otimização:**
  - Limitar caracteres totais de `knowledgeContext` (ex.: primeiros 50k chars ou N chars por documento).
  - Evoluir para **RAG** (embeddings + retrieval) e injetar só trechos relevantes — ver `lib/ai/knowledge-base.md`.

### 3.3 Documentos na mensagem (PI, Contestação, anexos)

- **Onde:** `normalizeMessageParts` em `route.ts`; truncagem por `MAX_CHARS_PER_DOCUMENT` e `MAX_TOTAL_DOC_CHARS`.
- **Revisão:** Se 35k/doc e 100k total forem demais para o teu uso, **reduzir** (ex.: 25k + 70k) reduz custo; se o modelo “cortar” informação importante, **aumentar** com cuidado (custos e limites de contexto do modelo).

### 3.4 Histórico de mensagens

- **CHAT_MESSAGES_LIMIT = 80:** Menos mensagens = menos tokens. Para chats muito longos, 40–60 podem bastar; para revisões com muito contexto, 80 é razoável.
- **Ideia:** Manter 80; se quiseres poupar, testar 50 e ver impacto na qualidade.

### 3.5 Tool calls e steps

- **stopWhen: stepCountIs(5):** Limita iterações do agente (chat + tools). Aumentar só se o fluxo do Revisor precisar de mais passos; cada step = nova chamada ao modelo.
- **Ferramentas:** `createDocument`, `updateDocument`, `requestSuggestions`, `getWeather`. Cada invocação gera input+output extra; evitar tools desnecessárias no prompt se não forem usadas.

### 3.6 Título do chat

- **Modelo:** `getTitleModel()` (Gemini 2.5 Flash Lite) — normalmente barato.
- **Input:** `titlePrompt` (curto) + texto da primeira mensagem. Se a mensagem for enorme (ex.: PI colada), considerar truncar para ex.: primeiros 500 caracteres antes de enviar ao título.

### 3.7 Artefactos e sugestões

- **Modelo:** `getArtifactModel()` (Claude Haiku 4.5).
- **Problema:** Em `artifacts/*/server.ts` e `request-suggestions.ts` **não há** `maxOutputTokens`; o modelo pode gerar respostas muito longas.
- **Otimização:** Definir `maxOutputTokens` (ex.: 4096 ou 8192) nas chamadas `streamText` / `generateText` dos artefactos e de `requestSuggestions` para limitar custo por operação.

### 3.8 Escolha de modelo no chat

- **Onde:** O utilizador escolhe `selectedChatModel`; o gateway resolve para o modelo real (ex.: Claude, GPT, Gemini).
- **Custo:** Modelos “reasoning/thinking” e modelos maiores são mais caros; modelos “flash” ou “lite” são mais baratos.
- **Revisão:** Oferecer um modelo económico por defeito e modelos mais capazes como opção; documentar no UI o impacto (custo/qualidade).

---

## 4. Ações práticas recomendadas

| Prioridade | Ação | Onde / como |
|------------|------|-------------|
| **Alta** | Limitar tamanho total da base de conhecimento no system | ✅ **Feito.** Em `route.ts`: `MAX_KNOWLEDGE_CONTEXT_CHARS = 50_000`; contexto truncado com aviso `[... base de conhecimento truncada ...]`. |
| **Alta** | Definir `maxOutputTokens` nos artefactos e em `requestSuggestions` | ✅ **Feito.** `artifacts/text/server.ts` (8192 em create/update), `artifacts/code/server.ts` e `artifacts/sheet/server.ts` (8192), `lib/ai/tools/request-suggestions.ts` (4096). |
| **Média** | Truncar texto da primeira mensagem para geração de título | ✅ **Feito.** Em `app/(chat)/actions.ts`: `MAX_TITLE_PROMPT_CHARS = 500`; prompt truncado com `...` se exceder. |
| **Média** | Revisar tamanho das instruções do Revisor | Encurtar `AGENTE_REVISOR_DEFESAS_INSTRUCTIONS` onde possível sem perder regras críticas. |
| **Baixa** | Considerar reduzir `CHAT_MESSAGES_LIMIT` ou `MAX_TOTAL_DOC_CHARS` | Ajustar constantes em `route.ts` e testar qualidade. |
| **Roadmap** | Implementar RAG para a base de conhecimento | Ver `lib/ai/knowledge-base.md`; reduz muito tokens ao injetar só trechos relevantes. |

---

## 5. Como medir custo (Vercel / providers)

- **Vercel AI Gateway:** No dashboard da Vercel (AI / Usage) podes ver uso por modelo e por projeto.
- **Provider direto (OpenAI, Anthropic, etc.):** Nas respostas do modelo costuma vir `usage` (input_tokens, output_tokens); podes logar em dev e somar por pedido.
- **Estimativa por request de chat:**  
  `(input_tokens * preço_input + output_tokens * preço_output)` conforme tabela de preços do modelo.  
  Exemplo: 50k input + 2k output num modelo a $0.01/1k in e $0.03/1k out ≈ $0.56 por mensagem; reduzir input/output reduz proporcionalmente.

---

## 6. Referências no código

| Tema | Ficheiros |
|------|-----------|
| Limites de documentos e mensagens | `app/(chat)/api/chat/route.ts` (constantes e `normalizeMessageParts`) |
| System prompt e knowledge | `lib/ai/prompts.ts`, `app/(chat)/api/chat/route.ts` (knowledgeContext) |
| Modelos e gateway | `lib/ai/providers.ts` |
| Instruções do Revisor | `lib/ai/agent-revisor-defesas.ts` |
| Título | `app/(chat)/actions.ts`, `lib/ai/prompts.ts` (titlePrompt) |
| Artefactos | `artifacts/text/server.ts`, `artifacts/code/server.ts`, `artifacts/sheet/server.ts` |
| Sugestões | `lib/ai/tools/request-suggestions.ts` |
| Base de conhecimento (RAG) | `lib/ai/knowledge-base.md` |

---

*Este documento serve como guia de revisão e otimização; ajustar números e prioridades consoante uso real e orçamento.*
