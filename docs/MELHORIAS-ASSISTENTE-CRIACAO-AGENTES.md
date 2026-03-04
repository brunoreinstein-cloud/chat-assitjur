# Melhorias no assistente de criação de agentes

Documento de análise com base na [documentação de Agents do LibreChat](https://www.librechat.ai/docs/features/agents) e no estado atual do projeto. Objetivo: identificar melhorias concretas para o painel de agentes built-in (`/admin/agents`) e para a criação/edição de agentes personalizados (Meus agentes no chat).

---

## Estado atual do projeto

### Painel administrativo (`/admin/agents`)

- **Campos:** Nome exibido (label), Instruções (textarea).
- **Funcionalidades:** Listar agentes built-in, editar label/instruções, indicador "Editado" quando há override, botão **"Melhorar prompt"** (chama `/api/prompt/improve`).
- **Acesso:** Chave de administrador (`ADMIN_CREDITS_SECRET`).

### Agentes personalizados (Meus agentes)

- **Campos:** Nome, Instruções, Agente base (ferramentas), Base de conhecimento (até N documentos).
- **Funcionalidades:** Criar/editar/apagar; botão "Melhorar prompt" no formulário; documentos da base de conhecimento associados por defeito ao agente.
- **Onde:** Sheet lateral no chat (engrenagem → Meus agentes).
- **Modelo de dados:** `CustomAgent` (name, instructions, baseAgentId, knowledgeDocumentIds).

### Melhorar prompt

- **API:** `POST /api/prompt/improve` (campo `prompt`).
- **Comportamento:** Análise + diagnóstico + prompt melhorado (estrutura, XML, few-shot, guardrails); usado no admin e no formulário de agente personalizado.

---

## O que o LibreChat oferece (referência)

Resumo das capacidades descritas na documentação do LibreChat, para inspirar melhorias:

| Área | LibreChat | Projeto atual |
|------|-----------|----------------|
| **Formulário de criação** | Avatar, Nome, Descrição, Instruções, Modelo | Nome, Instruções, Agente base, Base de conhecimento |
| **Modelo** | Escolha de provider/modelo por agente | Modelo definido no chat; agente base só define tools |
| **Parâmetros do modelo** | Temperature, max context/output tokens, opções por provider | Não configurável por agente |
| **Capabilities** | Code Interpreter, File Search (RAG), File Context, MCP, Artifacts, Actions (OpenAPI) | Base de conhecimento (injeção no prompt); tools por baseAgentId |
| **Ficheiros no agente** | Upload por categoria (imagem, file search, code interpreter, file context) | Apenas knowledgeDocumentIds (documentos já na base) |
| **Seleção no chat** | Dropdown + **menção @agente** no input | Dropdown; @ usado para documentos da base |
| **Partilha e permissões** | Admin controls, partilha entre utilizadores, OWNER/EDITOR/VIEWER | Agentes personalizados são privados (por userId) |
| **Advanced** | Max agent steps (limite de passos por "run") | Não aplicado |
| **Boas práticas na UI** | Instruções claras, organizar ficheiros por categoria, testar antes de partilhar | Textos de ajuda presentes; sem descrição nem avatar |

---

## Melhorias recomendadas (priorizadas)

### 1. Descrição opcional do agente (curto prazo)

- **Onde:** Agentes personalizados e, opcionalmente, overrides de built-in.
- **Motivo:** Ajuda utilizadores e admins a saber "para que serve" o agente sem abrir as instruções; alinhado ao campo *Description* do LibreChat.
- **Implementação:**
  - **CustomAgent:** adicionar coluna `description` (varchar, opcional) no schema e migração; incluir no GET/POST/PATCH da API e no formulário (label "Descrição", placeholder "Ex.: Auditoria de contratos de prestação de serviços").
  - **Built-in (admin):** opcionalmente campo "Descrição" no override (nova coluna em `BuiltInAgentOverride` ou uso do mesmo campo no painel). Mostrar na lista e no diálogo de edição.
- **UI:** Campo de texto curto (1–2 linhas) abaixo do nome; exibir na lista de agentes e no selector.

### 2. Melhorar a descoberta: menção @agente no input (médio prazo)

- **Ideia:** Para além do dropdown, permitir escrever `@` e escolher um agente (como no LibreChat: "by mention with @ in the chat input").
- **Implementação:** Reutilizar padrão já usado para `@` documentos da base: ao detetar `@` antes do cursor, abrir popover com lista de agentes (built-in + "Meus agentes"); ao selecionar, inserir nome ou slug e definir `agentId` na submissão. Requer definir convenção (ex.: `@Revisor de Defesas` ou `@revisor-defesas`) e evitar conflito com @documentos.
- **Benefício:** Descoberta mais rápida e consistente com padrões de chat modernos.

### 3. Parâmetros opcionais do modelo por agente (médio prazo)

- **Ideia:** Permitir, no formulário do agente (custom e/ou admin override), definir opcionalmente temperature e/ou max output tokens para esse agente, em vez de usar apenas os defaults da sessão.
- **Implementação:** Campos opcionais no `CustomAgent` (e eventualmente em override): `temperature` (0–1), `maxOutputTokens` (número). Na rota do chat, ao resolver a config do agente, usar estes valores se definidos. Na UI, inputs numéricos com limites e tooltips (ex.: "Deixe em branco para usar o padrão da conversa").
- **Nota:** O LibreChat expõe Temperature, Max context/output tokens e opções por provider; podemos começar por temperature e max output tokens.

### 4. Avatar / imagem do agente (baixa prioridade)

- **Ideia:** Campo opcional de imagem (avatar) para agentes personalizados e, se fizer sentido, para built-in no admin.
- **Implementação:** Upload para Vercel Blob ou Supabase Storage; coluna `avatarUrl` (ou `imageUrl`) em `CustomAgent`; exibir no selector e na lista "Meus agentes". Reutilizar padrão de upload já usado no projeto.
- **Benefício:** Reconhecimento visual no selector; alinhado ao LibreChat.

### 5. Textos de ajuda e boas práticas na UI (curto prazo)

- **Painel admin:** No diálogo "Editar agente", adicionar 1–2 frases de boas práticas (ex.: "Instruções claras e específicas melhoram o comportamento. Use o botão «Melhorar prompt» para sugestões."). Manter link ou referência à doc do projeto.
- **Meus agentes:** No Sheet "Meus agentes", reforçar o texto do `SheetDescription` com dicas: "Escolha um agente base para herdar ferramentas (ex.: Revisor de Defesas). Associe documentos da base de conhecimento para contexto fixo."
- **LibreChat:** "Provide clear, specific instructions"; "Test your agent thoroughly before deploying".

### 6. Partilha de agentes personalizados (médio/longo prazo)

- **Ideia:** Permitir partilhar um agente personalizado com outros utilizadores (por link ou por lista), com roles simples (ex.: ver vs. editar).
- **Implementação:** Novo modelo de permissões (ex.: `CustomAgentShare`: agentId, userId, role); API para partilhar/revogar; UI para "Partilhar" e lista de partilhados. Exige definição de política (apenas mesmo tenant? domínio público?).
- **Referência:** LibreChat tem OWNER/EDITOR/VIEWER e controlos de admin.

### 7. Limite de passos por agente (opcional)

- **Ideia:** Equivalente ao "Max Agent Steps" do LibreChat: limite de passos (ex.: chamadas ao LLM + tool calls) por "run" para evitar loops.
- **Implementação:** Se o fluxo do chat já contar passos, adicionar um máximo configurável por agente (ex.: `maxSteps` em config ou em CustomAgent) e interromper quando atingido. Menor prioridade se o uso atual for estável.

### 8. Melhorar prompt: contexto "tipo de agente" (curto prazo)

- **Ideia:** Na chamada a "Melhorar prompt", enviar opcionalmente o tipo de agente (ex.: revisor-defesas, redator-contestacao, custom) para o prompt de melhoria poder dar sugestões mais adequadas (ex.: estrutura de defesas, formato DOCX, guardrails jurídicos).
- **Implementação:** Parâmetro opcional `agentContext?: string` no body de `/api/prompt/improve`; incluir no system prompt do `improve-prompt` (ex.: "O utilizador está a editar instruções para um agente de tipo: {{agentContext}}. Adapte sugestões a esse domínio."). Chamar a API a partir do admin e do formulário de custom agent com esse contexto.

---

## Resumo de prioridades

| Prioridade | Melhoria | Impacto | Esforço |
|------------|----------|---------|---------|
| Alta | Descrição opcional do agente | Clareza e descoberta | Baixo |
| Alta | Textos de ajuda e boas práticas na UI | UX e adoção | Baixo |
| Alta | Melhorar prompt com contexto de agente | Qualidade das instruções | Baixo |
| Média | Menção @agente no input | Descoberta e consistência | Médio |
| Média | Parâmetros do modelo por agente (temperature, max tokens) | Flexibilidade | Médio |
| Média | Partilha de agentes personalizados | Colaboração | Alto |
| Baixa | Avatar do agente | Reconhecimento visual | Médio |
| Baixa | Max steps por agente | Estabilidade em fluxos longos | Baixo (se já houver contagem) |

---

## Referências

- [LibreChat – Agents](https://www.librechat.ai/docs/features/agents)
- [AGENTES-IA-PERSONALIZADOS.md](./AGENTES-IA-PERSONALIZADOS.md) – estado atual e referência técnica
- [AGENTS.md](../AGENTS.md) – painel admin e chave de administrador
- `lib/ai/improve-prompt.ts` – lógica de melhoria de prompt
- `app/(chat)/admin/agents/page.tsx` – painel de agentes built-in
- `components/multimodal-input.tsx` – formulário "Meus agentes"
