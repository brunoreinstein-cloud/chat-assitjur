# Arquitetura — AssistJur

Visão técnica de alto nível: camadas, fluxo de dados, decisões de design e roadmap técnico.

---

## Diagrama 6-Layer

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: CLIENT (React 19 + SWR)                               │
│  ├─ Chat UI (message list, input bar)                           │
│  ├─ Agent selector (dropdown com 5 agentes)                     │
│  ├─ Processo tracking (sidebar com processos)                   │
│  ├─ File upload (PDF, DOCX, XLSX)                               │
│  └─ Real-time state (SWR + optimistic updates)                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓ HTTP POST/GET
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: API ROUTES (Next.js App Router)                       │
│  ├─ POST /api/chat (stream LLM response)                        │
│  ├─ GET /api/chat/[id] (fetch chat history)                     │
│  ├─ POST /api/processos (intake new process)                    │
│  ├─ GET /api/processos/[id]/extract (extract PDF text)          │
│  ├─ POST /api/credits (deduct LLM credits)                      │
│  ├─ GET /api/files/upload (Vercel Blob signed URL)              │
│  └─ Auth middleware (NextAuth validation)                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓ AI SDK + Tools
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: AI AGENTS (Vercel AI SDK)                             │
│  ├─ 5 Built-in agents (Geral, Revisor, Redator, etc.)           │
│  ├─ Tool loop (agents → tools → LLM feedback)                   │
│  ├─ Prompt injection (system prompt per agent)                  │
│  ├─ Memory management (last N messages + user context)          │
│  ├─ MCP integration (Gmail, Drive, Notion, GitHub tools)        │
│  └─ HITL (human-in-loop approvals for agents)                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓ LLM Call + Cache
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4: LLM PROVIDERS                                          │
│  ├─ Primary: Vercel AI Gateway (xAI Grok, OpenAI)               │
│  ├─ Fallback: Direct provider (Anthropic, OpenAI, etc.)         │
│  ├─ Cache: Redis (LLM response caching, optional)               │
│  ├─ Rate limiting: Token bucket per user                        │
│  └─ Streaming: Server-sent events to client                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓ Processing
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 5: DATA PROCESSING                                        │
│  ├─ PDF: unpdf (extract text), pdfjs-dist (render)              │
│  ├─ DOCX: mammoth (parse), docx (generate)                      │
│  ├─ XLSX: xlsx (parse), @napi-rs/canvas (render)                │
│  ├─ OCR: tesseract.js (lazy-loaded, scanned PDFs)               │
│  ├─ Syntax: shiki (code highlighting)                           │
│  ├─ Math: katex (equation rendering)                            │
│  ├─ Rich text: ProseMirror (editor), CodeMirror (code)          │
│  └─ Graphs: @xyflow/react (process visualization)               │
└─────────────────────────────────────────────────────────────────┘
                            ↓ SQL Queries
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 6: PERSISTENCE                                            │
│  ├─ Database: PostgreSQL (Supabase or Neon)                     │
│  ├─ ORM: Drizzle (type-safe queries, schema management)         │
│  ├─ Schema tables:                                              │
│  │  ├─ User (auth)                                              │
│  │  ├─ Chat (conversations)                                    │
│  │  ├─ Message (chat history)                                  │
│  │  ├─ Knowledge (base de conhecimento)                        │
│  │  ├─ Processo (intake de processos)                          │
│  │  ├─ TaskExecution (agente execution log)                    │
│  │  ├─ Document (documentos gerados)                           │
│  │  └─ CreditBalance (tracking de créditos LLM)                │
│  ├─ Storage: Vercel Blob or Supabase Storage (files)           │
│  ├─ Cache: Redis (optional, LLM response cache)                │
│  └─ Connection pooling: Port 6543 (Supabase), auto (Neon)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fluxo de uma Requisição (Chat)

```
User digita: "Analise esta defesa"

      ↓
   CLIENT (React)
   └─ Valida mensagem
   └─ Mostra loading estado
   └─ POST /api/chat { message, chatId, agentId }

      ↓
   LAYER 2: API ROUTE (app/(chat)/api/chat/route.ts)
   └─ auth() → validar sessão NextAuth
   └─ getMessageCount() → verificar rate limit
   └─ getChatById() → carregar contexto do chat
   └─ getKnowledgeByIds() → injetar documentos (RAG)
   └─ [PARALELO] 6 queries em Promise.all (~200ms)

      ↓
   LAYER 3: AGENTES (AI SDK)
   ├─ Seleciona agente (ex.: Revisor de Defesas)
   ├─ Injeta system prompt + tools
   ├─ Chama LLM com contexto
   ├─ Tool loop: LLM decide qual tool usar
   │  └─ Ex.: tool.updateDocument() → salva DOCX
   │  └─ Resultado volta ao LLM
   └─ Stream resposta ao cliente
      ↓
   LAYER 4: LLM
   ├─ Verifica Redis cache (hit/miss)
   ├─ Se miss: chama Vercel AI Gateway
   ├─ Gateway roteia para xAI Grok ou OpenAI
   ├─ Streaming de tokens
   └─ Salva resposta em Redis (TTL: 24h)

      ↓
   LAYER 5: Processing
   ├─ Tool: document.update() → toma resposta do LLM
   ├─ Processa DOCX template
   ├─ Gera PDF usando @napi-rs/canvas (opcional)
   └─ Upload para Vercel Blob/Supabase Storage

      ↓
   LAYER 6: Database
   ├─ INSERT Message (mensagem do usuário)
   ├─ INSERT Message (resposta do agente)
   ├─ INSERT Document (DOCX salvo)
   ├─ UPDATE Chat (updated_at)
   ├─ UPDATE CreditBalance (deduz tokens usados)
   └─ [PARALELO em onFinish] 4 operações em Promise.all

      ↓
   CLIENT (React)
   ├─ Receive stream chunks (SSE)
   ├─ Atualiza UI em tempo real
   ├─ onFinish() → revalidate chat history (SWR)
   └─ Mostra documento gerado (se houver)

Total: ~2-15s (depende do modelo e tools usadas)
```

---

## Agentes de IA — Arquitetura

### Assistente Geral
- **Prompt:** Assistência geral em direito do trabalho
- **Tools:** `retrieveKnowledge`, `createMessage` (memória)
- **Output:** Texto markdown
- **Memory:** Persistida por user_id + chat_id

### Revisor de Defesas
- **Prompt:** Auditoria de defesa em 2 fases (GATE-1 → FASE A → GATE 0.5 → FASE B)
- **Input:** PDF de defesa
- **Tools:** `analyzePDF`, `updateDocument`, `requestApproval` (HITL)
- **Output:** DOCX com parecer + sugestões

### Redator de Contestações
- **Prompt:** Redação de minuta de contestação (modelo ou @bancodetese)
- **Input:** Contextode processo
- **Tools:** `searchKnowledge`, `generateDocx`, `requestApproval` (HITL)
- **Output:** DOCX de contestação

### Avaliador de Contestação
- **Prompt:** Avaliação de qualidade da contestação (score 0-100)
- **Input:** DOCX de contestação
- **Tools:** `analyzePDF`, `generateReport`
- **Output:** Relatório DOCX com score

### AssistJur Master
- **Prompt:** Agent "master" com pipeline multi-chamadas
- **Input:** PDF grande (processo + documentos)
- **Tools:** Todos os acima + `zip`, `convertToExcel`
- **Output:** DOCX/XLSX/JSON + ZIP

### Fluxo de Tool Loop

```
LLM Recebe contexto
  ↓
LLM pensa "preciso de tool X"
  ↓
Tool X executa (ex.: extractPDF)
  ↓
Resultado volta ao LLM
  ↓
LLM pensa novamente
  ↓
Se precisa de mais tools: volta passo 2
Se não: gera resposta final
  ↓
Resposta final ao user
```

---

## Decisões de Design

### 1. Por que Next.js App Router?

✅ **Server Components por padrão** — Menos código cliente, mais segurança
✅ **API Routes integradas** — Sem preciso de backend separado
✅ **Streaming nativo** — Respostas do LLM aparecem em tempo real
✅ **Vercel deployment** — Otimizado para plataforma

❌ Alternativas: Express + React SPA seria mais complexo para setup e deployment.

### 2. Por que Vercel AI SDK?

✅ **Multi-provider** — Trocar de LLM é uma linha de código
✅ **Streaming built-in** — Sem preciso de implementar SSE manualmente
✅ **Tools standardized** — Interface consistente para tools
✅ **Suporte ativo** — Vercel mantém e actualiza

❌ Alternativas: LangChain seria mais heavy; raw `anthropic` SDK seria menos flexível.

### 3. Por que Drizzle + Postgres?

✅ **Type-safe** — Queries tipadas em TypeScript, sem SQL strings
✅ **Migrações versionadas** — Git history de schema changes
✅ **Performance** — SQL direto, sem overhead de ORM heavy
✅ **Serverless-friendly** — Connection pooling nativo em Supabase/Neon

❌ Alternativas: Prisma seria mais pesado; raw SQL seria menos type-safe.

### 4. Por que Redis em vez de cache em memória?

✅ **Multi-instância** — Vercel roda em múltiplas funções; cache em memória não persiste
✅ **TTL automático** — Redis expira keys automaticamente
✅ **Compartilhado** — Todos os agentes vêem o mesmo cache

❌ Cache em memória: Vercel serverless faria cache por instância, desperdiçando.

### 5. Por que MCP em vez de integração custom?

✅ **Padrão aberto** — Qualquer servidor MCP funciona
✅ **Sem código** — Não preciso mudar prompts dos agentes
✅ **Seguro** — Credenciais geridas separadamente

❌ Integração custom: Cada Gmail, Drive, Notion seria N lines de código.

---

## Performance & Optimization

### Latência Típica

| Fase | Tempo | Notas |
|------|-------|-------|
| Auth + queries | 0.5-2s | Paralelo em `Promise.all` |
| RAG (buscar docs) | 0.2-1s | Depende de tamanho da base |
| LLM response | 3-30s | Depende do modelo e streaming |
| Tool execution | 0.1-5s | Ex.: document generation |
| Database writes | 0.1-1s | Inserção de mensagens |
| **Total** | **~4-40s** | 95% é o LLM |

### Otimizações Aplicadas

1. **Parallelização:** 6 queries iniciais em `Promise.all` (auth, rate limit, chat, knowledge, files, credits)
2. **Lazy loading:** tesseract.js, katex, @xyflow (carregam só quando usadas)
3. **Message limit:** Carrega apenas últimas 80 mensagens do chat (não todo histórico)
4. **Redis cache:** LLM responses cacheadas (mesma pergunta = resposta instant)
5. **Streaming:** Cliente vê tokens à medida que chegam (não espera fim)
6. **Connection pooling:** Supabase pooler (porta 6543) vs direct connection

### Bottlenecks Atuais

🔴 **LLM latency** (maior culpado)
- Solução: Usar modelo mais rápido (ex.: xAI Grok vs GPT-4 Turbo)

🟠 **Cold start no serverless** (primeira request demora 2-5s extra)
- Solução: Cron job aquecendo a app (já implementado)

🟡 **PDF extraction** (tesseract.js é lento)
- Solução: Rodar OCR em background (não bloqueia chat)

---

## Stack Técnico Resumido

| Componente | Tecnologia | Versão |
|-----------|-----------|--------|
| **Frontend** | React | 19.2 |
| **Framework** | Next.js | 16.1 |
| **Style** | Tailwind CSS | 4.2 |
| **UI Components** | Radix UI | 1.4 |
| **LLM Orchestration** | Vercel AI SDK | 6.0 |
| **ORM** | Drizzle | 0.34 |
| **Database** | PostgreSQL | 15+ (Supabase/Neon) |
| **Auth** | NextAuth.js | 5.0-beta.30 |
| **Storage** | Vercel Blob / Supabase Storage | Latest |
| **Cache** | Redis | (optional, Upstash) |
| **PDF** | unpdf + pdfjs-dist | 1.4 / 5.5 |
| **DOCX** | mammoth + docx | 1.11 / 9.6 |
| **Lint** | Biome (Ultracite) | 2.4 |
| **Testing** | Playwright + Vitest | 1.58 / 2.1 |
| **Deploy** | Vercel | Recommended |

---

## Roadmap Técnico

### Q1 2026 (Agora)
- ✅ 5 agentes core (Geral, Revisor, Redator, Avaliador, Master)
- ✅ RBAC (role-based access control)
- ✅ Tracking de processos
- ✅ Chat multi-processo
- 🔄 MCP integration (Gmail, Drive)

### Q2 2026
- 🔄 E2E tests por agente (smoke tests)
- 🔄 Otimizar bundle (lazy loading, tree shaking)
- 🔄 Upgrade next-auth para stable (quando v5 sair)
- 🔄 Dark mode + tema customizável

### Q3 2026
- 🔄 Integração com sistema de casos (CRM)
- 🔄 Relatórios e analytics (querys complexas)
- 🔄 WebSocket (real-time collaboration)
- 🔄 Mobile app (React Native)

### Q4 2026+
- 🔄 Self-hosted option (não só Vercel)
- 🔄 Custom LLM fine-tuning
- 🔄 Multi-language support (PT, ES, EN)

---

## Documentação Relacionada

- [DESENVOLVIMENTO.md](./DESENVOLVIMENTO.md) — Setup local, padrões, debugging
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Vercel, Redis, env vars
- [MCP.md](./MCP.md) — Model Context Protocol
- [AGENTS.md](../AGENTS.md) — Prompts dos agentes

---

**Dúvidas técnicas?** Consultar:
- `lib/ai/agents/` — Implementação dos agentes
- `app/(chat)/api/chat/route.ts` — Fluxo principal
- `lib/db/schema.ts` — Schema da base de dados
