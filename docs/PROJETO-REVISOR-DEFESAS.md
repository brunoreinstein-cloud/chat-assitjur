# Agente Revisor de Defesas Trabalhistas — Documentação do Projeto

Documentação completa do sistema de auditoria jurídica assistida por IA, especializado em contencioso trabalhista brasileiro.

---

## 1. O que é

O **Agente Revisor de Defesas Trabalhistas** é um sistema de **auditoria jurídica assistida por IA**, focado em contencioso trabalhista empresarial. Não é um chatbot genérico com prompt jurídico: é um **agente com fluxo de trabalho definido**, gates de validação obrigatórios e outputs estruturados — mais próximo de um **workflow** do que de uma conversa livre.

### Entradas

- **Obrigatórias:** Petição Inicial (PI) e Contestação.
- **Opcionais:** Documentos do reclamante (C), documentos do reclamado (D), base de teses (@bancodetese).

### Saídas

Três documentos operacionais para a equipe jurídica se preparar para audiência:

| Documento | Descrição |
|-----------|-----------|
| **Doc 1 — Avaliação da defesa** | Parecer executivo: contexto, prescrição, quadro de pedidos, análise temática, defesas processuais, quadro de teses (com @bancodetese). Inclui aviso "Relatório gerado por IA. Revisão humana necessária e obrigatória." |
| **Doc 2 — Roteiro Advogado** | Roteiro de audiência para o advogado: resumo, instrução probatória, pontos de instrução, perguntas por tema, roteiro cronológico, testemunha. |
| **Doc 3 — Roteiro Preposto** | Roteiro de audiência para o preposto: pedidos e posição, dados do contrato, perguntas esperadas, armadilhas, técnica. Confidencial. |

### Princípios

- **Não redige peças** — audita e orienta.
- **Não inventa** fatos, jurisprudência ou valores (R$/%).  
- **Linguagem consultiva** — não imperativa; o advogado decide.
- **Não instrui testemunha** (art. 342 CP); evita perguntas capciosas.

---

## 2. Stack técnica

| Área | Tecnologia |
|------|------------|
| **Framework** | Next.js 16 (App Router), React 19 |
| **IA** | Vercel AI SDK (`streamText`), AI Gateway (xAI, OpenAI, etc.) |
| **Base de dados** | PostgreSQL (Supabase/Neon), Drizzle ORM |
| **Autenticação** | Auth.js (NextAuth) v5 beta |
| **Storage** | Vercel Blob ou Supabase Storage (upload de ficheiros) |
| **Lint/Formatação** | Ultracite (Biome) |
| **Package manager** | pnpm |
| **Deploy** | Vercel (recomendado) |

### Dependências principais (IA e runtime)

- `ai` (Vercel AI SDK) — `streamText`, tools, streaming.
- `@ai-sdk/gateway` — roteamento para modelos (OpenAI, Anthropic, Google, xAI, etc.).
- `@ai-sdk/react` — hooks (`useChat`, etc.).
- Next.js 16, React 19, Drizzle ORM, Auth.js, Supabase/Blob conforme `.env`.

---

## 3. Arquitetura do agente

### 3.1 Visão geral

O agente é implementado como **instruções de sistema** longas injetadas no `streamText` do AI SDK. O fluxo é **orientado por prompt**: o modelo segue as fases e gates descritos nas instruções. Não há máquina de estados explícita no código; a orquestração é feita pelo LLM + instruções.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENTE (React)                                  │
│  useChat → POST /api/chat (message, agentInstructions?, knowledgeIds?)  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    app/(chat)/api/chat/route.ts                          │
│  • Valida body (schema)                                                  │
│  • Auth + rate limit (entitlements)                                      │
│  • knowledgeDocumentIds → getKnowledgeDocumentsByIds → knowledgeContext  │
│  • effectiveAgentInstructions = agentInstructions || AGENTE_REVISOR_...  │
│  • systemPrompt({ agentInstructions, knowledgeContext })                 │
│  • streamText(model, system, messages, tools)                            │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
┌──────────────────┐    ┌────────────────────────┐    ┌─────────────────────┐
│ lib/ai/          │    │ lib/ai/prompts.ts      │    │ lib/ai/tools/        │
│ agent-revisor-   │    │ systemPrompt()         │    │ createDocument,      │
│ defesas.ts       │    │ + artifactsPrompt      │    │ updateDocument,      │
│ (instruções)     │    │ + requestHints         │    │ requestSuggestions,  │
└──────────────────┘    └────────────────────────┘    │ getWeather          │
                                                       └─────────────────────┘
```

### 3.2 Fluxo de trabalho (definido nas instruções do agente)

| Etapa | Nome | Descrição |
|-------|------|-----------|
| **GATE-1** | Validação de entrada | Exigir (A) Petição Inicial e (B) Contestação. Se faltar, **PARAR** e solicitar ao usuário. |
| **FASE A** | Extração e mapeamento | Extrair dados do processo, mapear pedidos, impugnações, teses. **Proibido** gerar os 3 DOCX nesta fase. |
| **GATE 0.5** | Confirmação | Exibir no chat um **resumo** (ex.: partes, pedidos, conclusões da FASE A). Aguardar utilizador: **CONFIRMAR** ou **CORRIGIR** (com edição). |
| **FASE B** | Geração dos 3 DOCX | Após CONFIRMAR, gerar os três documentos (Avaliação, Roteiro Advogado, Roteiro Preposto) via ferramenta `createDocument`. |
| **ENTREGA** | Links e ressalvas | Entregar links/refs aos documentos e reforçar ressalvas (revisão humana obrigatória no Doc 1). |

### 3.3 Gates e regras operacionais (resumo)

- **GATE-1:** (A) PI + (B) Contestação obrigatórios; (C)(D)(E) opcionais.
- **GATE 0.5:** Sem confirmação do usuário, não passar à FASE B.
- **R1 Prescrição:** DAJ, DTC; bienal (DTC+2a), quinquenal (DAJ−5a); aviso-prévio indenizado → dois cenários.
- **R2 Mapeamento:** Cada pedido: impugnado SIM/NÃO/PARCIAL; tese, prova, ônus. Não impugnado → 🔴.
- **R3 Anti-alucinação:** Não inventar; criticar a peça, não a pessoa.
- **R4 Jornada:** Súm. 437 TST; total de jornada já inclui intervalo.
- **R5 Oportunidades:** 🔵Tese 🟣Probatória 🟠Fato 🟤Precedente, dentro da análise por tema.

### 3.4 Sinalização visual (todos os documentos)

- **Criticidade:** 🔴 alta | 🟡 média | 🟢 baixa.
- **Avaliação da defesa:** ✅ adequada | ❌ melhorar | ⚠️ atenção.

### 3.5 Onde está cada parte no código

| Componente | Ficheiro / local |
|------------|-------------------|
| Instruções completas do agente (v3.1) | `lib/ai/agent-revisor-defesas.ts` → `AGENTE_REVISOR_DEFESAS_INSTRUCTIONS` |
| Montagem do system prompt | `lib/ai/prompts.ts` → `systemPrompt()` |
| Handler do chat (streaming, tools, knowledge) | `app/(chat)/api/chat/route.ts` |
| Escolha do agente padrão | `route.ts`: `effectiveAgentInstructions = agentInstructions ?? AGENTE_REVISOR_DEFESAS_INSTRUCTIONS` |
| Base de conhecimento (incl. RAG) | `lib/ai/knowledge-base.md` (doc); uso em `route.ts` via `knowledgeDocumentIds` |
| Ferramenta de criar documento | `lib/ai/tools/create-document.ts` → artefactos (text/code/sheet) |
| Schema do body do POST /api/chat | `app/(chat)/api/chat/schema.ts` |

---

## 4. API do chat

### POST /api/chat

- **Body (JSON):**  
  `id` (UUID), `message` ou `messages`, `selectedChatModel`, `selectedVisibilityType`, opcionalmente `agentInstructions` (até 4000 chars), `knowledgeDocumentIds` (até 20 UUIDs).
- **Comportamento:**  
  Se `agentInstructions` não for enviado ou estiver vazio, o backend usa **por padrão** as instruções do Agente Revisor (`AGENTE_REVISOR_DEFESAS_INSTRUCTIONS`).
- **Mensagens:**  
  Partes suportadas: `text`, `file` (imagem JPEG/PNG), `document` (texto extraído de PDF, DOC ou DOCX). Documentos são normalizados para texto no servidor e injetados no contexto.
- **Tools ativas (modelos não-reasoning):** `getWeather`, `createDocument`, `updateDocument`, `requestSuggestions`. Modelos com “reasoning”/“thinking” não usam tools (evitar conflitos).
- **Rate limit:** Por tipo de utilizador (`entitlementsByUserType`), ex.: 20 msg/dia (guest), 50 (regular).

---

## 5. Base de conhecimento e @bancodetese

- **Tabela:** `KnowledgeDocument` (id, userId, title, content, createdAt).
- **APIs:** GET/POST/DELETE `/api/knowledge`; GET `/api/knowledge?ids=...` para buscar por ids.
- **No chat:** O cliente envia `knowledgeDocumentIds`. O servidor busca os documentos, concatena título e conteúdo e injeta no system prompt em **"Base de conhecimento"**.
- **@bancodetese:** Documento(s) de teses/precedentes que o agente usa **apenas** para o **Quadro de teses** do Doc 1 (Avaliação). Não inventar precedentes fora do bancodetese.
- **Limitação atual:** Todo o conteúdo dos documentos selecionados vai no prompt. Para RAG/embeddings, ver `lib/ai/knowledge-base.md`.

---

## 6. Formato dos 3 DOCX (regras nas instruções)

- **Logo:** logomarca do escritório no cabeçalho de todos.
- **Dados do processo:** quadro/tabela (2 colunas: campo | valor), nunca texto corrido. Onde não houver dado → omitir (sem “não localizada”).
- **OAB:** bloco de assinaturas ao final da Petição Inicial.
- **Audiência:** Notificação Judicial PJe.
- **Nomes dos ficheiros:**  
  `AVALIACAO_DEFESA_-_[RTE]_x_[EMPRESA]_-_[nº].docx`, `ROTEIRO_ADVOGADO_-_...`, `ROTEIRO_PREPOSTO_-_...` (sanitizados, máx. 120 caracteres).
- **Formato:** Arial 12pt, títulos 14pt negrito; tabelas com bordas limpas.
- **Siglas nos DOCX:** Sempre por extenso (Reclamante, Reclamado, Data Ajuizamento, Data Término Contrato). Uso de RTE, RDO, DAJ, DTC apenas interno (instruções).

Os documentos são gerados como artefactos **text** via `createDocument`. O utilizador pode **descarregar cada documento como ficheiro .docx** através do botão «Descarregar DOCX» (ou «DOCX») na barra de ações do artefacto; a rota `GET /api/document/export?id=<documentId>` devolve o conteúdo em formato Word (DOCX). O nome do ficheiro é derivado do título do documento (sanitizado, máx. 120 caracteres).

---

## 7. UX/UI e produto

- **Greeting:** Título "Revisor de Defesas Trabalhistas", descrição do papel, instrução para começar (PI + Contestação).
- **Seletor de prompts:** Menu "Sugestões" no input com prompts contextuais (explicar fluxo sempre; auditar e roteiros/@bancodetese consoante anexos e conversa).
- **Sidebar:** Nome "Revisor de Defesas".
- **Placeholder:** "Cole o texto da Petição Inicial e da Contestação, ou descreva o caso e anexe documentos...".
- **Diálogos:** "Instruções do agente" (sobrescrita opcional), "Base de conhecimento" (menção a @bancodetese).

Sugestões futuras (indicador de etapa FASE A/B, botões CONFIRMAR/CORRIGIR, rótulos PI/Contestação): ver `docs/ux-ui-revisor-defesas.md`. Upload já suporta JPEG, PNG, PDF, DOC e DOCX (com extração de texto).

---

## 8. Dados e persistência

- **Chats e mensagens:** `Chat` (id, userId, title, visibility), `Message_v2` (id, chatId, role, parts, attachments, createdAt). Histórico usado para continuar conversas e para tool approval flow.
- **Base de conhecimento:** `KnowledgeDocument` (ver acima).
- **Artefactos:** `Document` (id, title, content, kind, userId) para documentos criados/atualizados pelo agente (text/code/sheet).
- **Migrações:** Drizzle; aplicar com `pnpm db:migrate` (local ou após `vercel:env` para produção).

---

## 9. Variáveis de ambiente

Referência em `.env.example`. Principais:

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `AUTH_SECRET` | Sim | NextAuth. Gerar com `openssl rand -base64 32` ou [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32). |
| `POSTGRES_URL` | Sim | Connection string PostgreSQL. Com Supabase usar **pooler (porta 6543)**. |
| `AI_GATEWAY_API_KEY` | Fora da Vercel | Para AI Gateway quando não há OIDC. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Opcional | Supabase Auth e Storage. |
| `BLOB_READ_WRITE_TOKEN` | Opcional | Vercel Blob (alternativa ao Storage). |
| `REDIS_URL` | Opcional | Rate limiting. |

Se `AUTH_SECRET` ou `POSTGRES_URL` faltarem, a app pode redirecionar para `/config-required`.

---

## 10. Convenções de desenvolvimento

- **Ultracite (Biome):** regras em `.cursor/rules/ultracite.mdc`. Comandos: `pnpm run format`, `pnpm run lint`.
- **Idioma:** produto e documentação em português.
- **Alterações no agente:** seguir o checklist em `.agents/skills/revisor-defesas-context/SKILL.md` (GATE-1, Gate 0.5, 3 DOCX, siglas, sinalização, proibições).

---

## 11. Comandos úteis

```bash
pnpm install
pnpm dev              # http://localhost:3300 (--turbo)
pnpm build            # tsx lib/db/migrate && next build
pnpm db:migrate       # aplicar migrações
pnpm db:studio        # Drizzle Studio
pnpm run format       # Ultracite fix
pnpm run lint         # Ultracite check
pnpm run vercel:env   # puxar env da Vercel
pnpm test             # Playwright E2E (PLAYWRIGHT=True)
```

Deploy: ver `docs/vercel-setup.md` e `docs/vercel-cli.md`.

---

## 12. Referências rápidas

- **Spec produto (AI Drive Jurídico):** `docs/SPEC-AI-DRIVE-JURIDICO.md` — visão, capacidades, roadmap e métricas da plataforma jurídica.
- **Instruções do agente:** `lib/ai/agent-revisor-defesas.ts`
- **Checklist revisor:** `.agents/skills/revisor-defesas-context/SKILL.md`
- **Guia para agentes de IA:** `AGENTS.md`
- **UX/UI Revisor:** `docs/ux-ui-revisor-defesas.md`
- **Base de conhecimento e RAG:** `lib/ai/knowledge-base.md`
- **AI SDK:** [sdk.vercel.ai](https://sdk.vercel.ai/docs/introduction)
- **Vercel AI Gateway:** [vercel.com/docs/ai-gateway](https://vercel.com/docs/ai-gateway)
