# Agentes de IA Personalizados

Crie agentes especializados com prompts personalizados e bases de conhecimento adaptadas às suas necessidades específicas.

---

## O que está disponível hoje

A plataforma já suporta **agentes de IA personalizados** através de três mecanismos combinados:

### 1. Agentes pré-definidos (selector no chat)

No header do chat pode escolher um dos agentes especializados:

| Agente | Uso principal |
|--------|----------------|
| **Revisor de Defesas** | Auditoria de contestação trabalhista: fluxo GATE-1 → FASE A → GATE 0.5 → FASE B; geração dos 3 DOCX (Avaliação, Roteiro Advogado, Roteiro Preposto); validação PI + Contestação. |
| **Análise de contratos** | Análise de contratos (PDF/DOCX): tipo de contrato, partes, obrigações, riscos, prazos; extração de cláusulas e resumos; sem juízo de valor económico. |
| **Redator de Contestações** | Redação de contestação trabalhista em modo Modelo (template) ou modo **@bancodetese** (montagem por teses do banco). |

- **Onde:** selector no header do chat (dropdown).
- **Backend:** `lib/ai/agents-registry.ts` mapeia `agentId` → instruções e conjunto de tools.
- **API:** o body do `POST /api/chat` aceita `agentId` (`revisor-defesas` | `analise-contratos` | `redator-contestacao`). Em falta, usa `revisor-defesas`.

### 2. Instruções personalizadas (override por conversa)

Em qualquer conversa pode enviar **instruções adicionais** que orientam o agente (persona, tom, formato, restrições). Essas instruções são concatenadas às do agente selecionado e injetadas no system prompt.

- **Onde:** campo opcional “Instruções do agente” na UI do chat (ex.: em `multimodal-input.tsx`).
- **Limite:** 4000 caracteres por pedido.
- **API:** `agentInstructions` (string opcional) no body do `POST /api/chat`.

Use para: focar o agente num tipo de contrato, pedir tom mais formal, pedir respostas em tópicos, etc.

### 3. Base de conhecimento (documentos no contexto)

Pode associar **até 50 documentos** da base de conhecimento a cada pedido. O conteúdo relevante (por injeção direta ou, quando existir, RAG) é incluído no system prompt na secção “Base de conhecimento”.

- **Onde:** botão “Base de conhecimento” no header; escolha dos documentos a usar na conversa.
- **Conteúdo:** teses, precedentes, cláusulas-modelo, jurisprudência, normas internas — conforme o agente e o caso.
- **API:** `knowledgeDocumentIds` (array de UUIDs, máx. 50) no body do `POST /api/chat`.

Assim, o mesmo agente pode ser “personalizado” por escritório ou por matéria através dos documentos que o utilizador escolhe.

---

## Resumo do fluxo

1. **Selecionar o agente** no dropdown (Revisor de Defesas, Análise de contratos, Redator de Contestações).
2. **Opcional:** preencher “Instruções do agente” para esta conversa.
3. **Opcional:** escolher documentos da base de conhecimento para o contexto.
4. Enviar mensagens normalmente; o system prompt inclui instruções do agente + base de conhecimento.

---

## Referência técnica

| Tema | Ficheiro / doc |
|------|----------------|
| Registry de agentes | `lib/ai/agents-registry.ts` |
| Instruções por agente | `lib/ai/agent-revisor-defesas.ts`, `lib/ai/agent-analise-contratos.ts`, `lib/ai/agent-redator-contestacao.ts` |
| System prompt e base de conhecimento | `lib/ai/prompts.ts` |
| Schema do chat (agentId, agentInstructions, knowledgeDocumentIds) | `app/(chat)/api/chat/schema.ts` |
| Handler do chat | `app/(chat)/api/chat/route.ts` |
| Base de conhecimento e RAG | `lib/ai/knowledge-base.md` |
| Visão de produto e roadmap | [SPEC-AI-DRIVE-JURIDICO.md](SPEC-AI-DRIVE-JURIDICO.md) |
| Guia para agentes de IA (repositório) | [AGENTS.md](../AGENTS.md) |

### 4. Agentes criados pelo utilizador (implementado)

Pode **criar agentes personalizados** com nome e instruções próprias. Cada agente pode opcionalmente herdar as ferramentas de um agente base (ex.: Revisor de Defesas).

- **Onde:** no chat, botão engrenagem ao lado do selector de agente → "Meus agentes" → Criar / Editar / Apagar.
- **API:** `GET/POST /api/agents/custom` (listar, criar); `GET/PATCH/DELETE /api/agents/custom/[id]`.
- **BD:** tabela `CustomAgent` (id, userId, name, instructions, baseAgentId, createdAt).

O selector mostra os 3 agentes pré-definidos e a secção **"Meus agentes"**. Ao escolher um agente personalizado, o chat usa as suas instruções e (se definido) as tools do agente base.

---

## Evolução futura (possível)

- **Agentes criados pelo utilizador:** entidade “CustomAgent” (nome, instruções, conjunto de tools ou preset) guardada por utilizador/escritório; selector incluir “Meus agentes” além dos pré-definidos.
- **Pastas de conhecimento por agente:** associar uma pasta ou conjunto fixo de documentos a um agente (incl. custom), para não ter de escolher manualmente em cada conversa.

Enquanto isso não existir, a combinação **agente pré-definido + instruções personalizadas + base de conhecimento** já permite “agentes de IA personalizados” por necessidade específica.
