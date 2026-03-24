# CLAUDE.md — Guia do Projeto AssistJur

**Fonte da Verdade** para qualquer desenvolvimento neste projeto. Claude Code lê este arquivo automaticamente.

---

## 🚀 Quick Commands

Qualquer pessoa deve conseguir rodar estes comandos na primeira tentativa:

```bash
# Setup inicial (primeira vez)
pnpm install
pnpm run vercel:env          # puxar env vars
pnpm run db:migrate          # aplicar migrações

# Development
pnpm dev                      # iniciar servidor (porta 3300)
pnpm run dev:warmup          # aquecer cache

# Verificação antes de commit
pnpm run check               # lint + type check (rápido)
pnpm run lint                # ultracite check
pnpm run format              # ultracite fix
pnpm run test:unit           # testes unitários

# Build + Deploy
pnpm run prepush             # lint + tests + build (obrigatório antes de push)
pnpm run build               # next build
pnpm start                   # prod (local)

# Deploy em Vercel
pnpm run vercel:deploy       # preview branch
pnpm run vercel:deploy:prod  # production

# Database
pnpm run db:migrate          # aplicar migrações
pnpm run db:generate         # gerar tipos após schema change
pnpm run db:studio           # Drizzle Studio (UI para explorar)
pnpm run db:ping             # testar conexão

# Tests
pnpm test                    # Playwright E2E
pnpm run test:with-dev       # E2E contra localhost:3300
pnpm run test:unit           # Vitest unitários
pnpm run test:report         # abrir relatório HTML
```

**Qualquer erro?** Verificar `.env.local` (obrigatório: `AUTH_SECRET`, `POSTGRES_URL`).

---

## 📁 Estrutura do Projeto

```
chatbot/
├── app/                      # Next.js App Router
│   ├── (chat)/              # Grupo privado (requer auth)
│   │   ├── page.tsx         # /chat (lista de conversas)
│   │   ├── [id]/page.tsx    # /chat/[id] (conversa individual)
│   │   ├── layout.tsx       # Layout do chat
│   │   └── api/
│   │       ├── chat/route.ts        # POST /api/chat (core do streaming)
│   │       ├── processos/route.ts   # Intake de processos
│   │       └── credits/route.ts     # Deduction de créditos LLM
│   │
│   └── api/                 # API pública
│       ├── auth/            # NextAuth routes
│       ├── health/          # GET /api/health
│       └── files/upload     # Upload de ficheiros
│
├── components/              # React Components (Server + Client)
│   ├── chat/               # Chat UI
│   ├── admin/              # Painel admin
│   └── elements/           # Shared UI (button, modal, etc.)
│
├── lib/                     # Lógica compartilhada
│   ├── ai/                 # IA + Agentes
│   │   ├── agents/         # 5 agentes (revisor, redator, etc.)
│   │   ├── prompts/        # Instruções dos agentes
│   │   ├── tools/          # Tool definitions
│   │   ├── mcp-config.ts   # Model Context Protocol
│   │   └── providers.ts    # LLM providers (Gateway, etc.)
│   │
│   ├── db/                 # Database
│   │   ├── schema.ts       # Drizzle schema (tabelas)
│   │   ├── migrations/     # SQL migrations
│   │   └── queries/        # Queries por domínio (chats.ts, messages.ts, etc.)
│   │
│   ├── cache/              # Redis + caching
│   ├── upload/             # PDF/DOCX extraction
│   ├── auth/               # Auth helpers + RBAC
│   └── types.ts            # Global types
│
├── tests/                   # Testes
│   ├── e2e/                # Playwright E2E
│   └── lib/                # Testes unitários (Vitest)
│
├── docs/                    # Documentação
│   ├── ARCHITECTURE.md      # Diagrama 6-layer
│   ├── DEPLOYMENT.md        # Vercel, Redis, setup
│   ├── DESENVOLVIMENTO.md   # Padrões, setup local
│   ├── MCP.md              # Model Context Protocol
│   └── scripts/README.md    # Scripts one-off
│
├── scripts/                 # Utilitários one-off
│   ├── verify-doc-links.ts # Verificação de links
│   └── seed-redator-banco.ts
│
├── CLAUDE.md               # Este arquivo (fonte da verdade)
├── AGENTS.md               # Guia dos agentes de IA
├── README.md               # README principal
├── package.json            # Scripts + dependências
├── next.config.ts          # Configuração Next.js
├── tsconfig.json           # TypeScript config
├── tailwind.config.ts      # Tailwind CSS
├── biome.json              # Lint/format (Ultracite)
└── vercel.json             # Configuração Vercel
```

---

## 🏗️ Padrões do Projeto

### 1. Server Components por Padrão

**✅ BOM:** Server Component (não adiciona JS ao cliente)

```typescript
// app/(chat)/page.tsx
export async function ChatPage() {
  const chats = await getChatsByUserId();
  return (
    <div>
      {chats.map(chat => (
        <ChatItem key={chat.id} chat={chat} />
      ))}
    </div>
  );
}
```

**❌ RUIM:** Client Component desnecessário

```typescript
"use client";
// Não fazer isso para apenas renderizar dados
export function ChatPage() {
  const [chats, setChats] = useState([]);
  useEffect(() => { /* fetch */ }, []);
  return ...
}
```

---

### 2. Drizzle ORM — Queries Type-Safe

**✅ Exemplo:** `lib/db/queries/chats.ts`

```typescript
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { chats } from "@/lib/db/schema";

export async function getChatById(id: string, userId: string) {
  const [chat] = await db
    .select()
    .from(chats)
    .where(eq(chats.id, id))
    .limit(1);

  if (chat?.user_id !== userId) throw new Error("Unauthorized");
  return chat;
}

export async function createChat(userId: string, agentId: string) {
  const [chat] = await db
    .insert(chats)
    .values({
      id: nanoid(),
      user_id: userId,
      agent_id: agentId,
      created_at: new Date(),
    })
    .returning();

  return chat;
}
```

**Schema:** `lib/db/schema.ts`

```typescript
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const chats = pgTable("Chat", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  agent_id: text("agent_id").notNull(),
  created_at: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("Message", {
  id: text("id").primaryKey(),
  chat_id: text("chat_id").references(() => chats.id),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
});
```

---

### 3. API Routes com Autenticação

**✅ Exemplo:** `app/(chat)/api/chat/route.ts`

```typescript
import { auth } from "@/lib/auth";
import { getChatById } from "@/lib/db/queries/chats";

export const maxDuration = 60; // Vercel Serverless max

export async function POST(req: Request) {
  try {
    // 1. Autenticar
    const session = await auth();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // 2. Validar entrada
    const { message, chatId } = await req.json();
    if (!message?.trim()) {
      return Response.json({ error: "Empty message" }, { status: 400 });
    }

    // 3. Verificar autorização
    const chat = await getChatById(chatId, session.user.id);

    // 4. Processar (ex: chamar agente)
    const response = await generateAgentResponse(message, chat);

    // 5. Retornar streaming
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("[chat] error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
```

---

### 4. RBAC (Role-Based Access Control)

**✅ Roles definidos em:** `lib/auth/permissions.ts`

```typescript
export type UserRole = "user" | "redator" | "revisor" | "admin";

export async function canEditAgent(userId: string, agentId: string) {
  const user = await getUserWithRole(userId);
  return user.role === "admin" || user.role === "revisor";
}

export async function canViewProcesso(userId: string, processoId: string) {
  const processo = await getProcessoById(processoId);
  return processo.user_id === userId; // Apenas owner pode ver
}
```

**Usar em API routes:**

```typescript
export async function POST(req: Request) {
  const session = await auth();
  if (!canEditAgent(session.user.id, agentId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  // continuar...
}
```

---

### 5. Agentes de IA (5 Agentes Principais)

**Referência:** `lib/ai/agents/` (exemplo para criar novo)

#### Agente: Revisor de Defesas

**Arquivo modelo:** `lib/ai/agents/agente-revisor-defesas.ts`

```typescript
import { generateText } from "ai";
import { gateway } from "@/lib/ai/providers";
import { retrieveKnowledge } from "@/lib/ai/tools";

export const REVISOR_SYSTEM_PROMPT = `
Você é um revisor jurídico especializado em contencioso trabalhista.
Analyze a Petição Inicial e a Contestação em 2 fases:
- GATE-1: Validações básicas (prazo, competência, etc.)
- FASE A: Análise temática (pedidos, prescrição, etc.)
- GATE 0.5: Revisão de qualidade
- FASE B: Recomendações

Sempre cite jurisprudência da base (@bancodetese).
`;

export async function agenteRevisorDefesas(input: {
  defendaPDF: Buffer;
  picoPDF: Buffer;
  userId: string;
  chatId: string;
}) {
  const knowledge = await retrieveKnowledge(input.userId, "jurisprudência");

  const { text } = await generateText({
    model: gateway.languageModel("grok-2-latest"),
    system: REVISOR_SYSTEM_PROMPT,
    prompt: `
Defesa PDF: ${input.defendaPDF.toString()}
Petição Inicial PDF: ${input.picoPDF.toString()}

Base de conhecimento (jurisprudência):
${knowledge.map(doc => `- ${doc.title}: ${doc.content.slice(0, 200)}...`).join("\n")}

Proceder com análise 2-fase.
    `,
    tools: {
      generateReport: {
        description: "Gerar relatório DOCX com parecer",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
          },
          required: ["title", "content"],
        },
      },
      updateDocument: {
        description: "Atualizar documento existente",
        parameters: {
          type: "object",
          properties: {
            docId: { type: "string" },
            updates: { type: "object" },
          },
        },
      },
    },
  });

  return text;
}
```

**Padrão para novo agente:**

1. **Criar arquivo:** `lib/ai/agents/agente-[nome].ts`
2. **Definir SYSTEM_PROMPT:**
   ```typescript
   export const [NOME]_SYSTEM_PROMPT = `Você é um [especialista em X]...`;
   ```
3. **Implementar função principal:**
   ```typescript
   export async function agente[Nome](input: {...}) {
     const { text } = await generateText({
       model: gateway.languageModel("grok-2-latest"),
       system: [NOME]_SYSTEM_PROMPT,
       prompt: ...,
       tools: { /* tools específicas */ },
     });
     return text;
   }
   ```
4. **Registrar no chat route:**
   ```typescript
   // app/(chat)/api/chat/route.ts
   import { agente[Nome] } from "@/lib/ai/agents/agente-[nome]";

   // Dentro de POST /api/chat:
   case "meu-agente":
     response = await agente[Nome]({ ... });
     break;
   ```

---

### 6. Database Migrations

**✅ Criar migração nova:**

```bash
# 1. Alterar schema em lib/db/schema.ts
# 2. Gerar migração
pnpm run db:generate

# 3. Inspecionar SQL gerado
ls lib/db/migrations/

# 4. Aplicar localmente
pnpm run db:migrate

# 5. Fazer commit
git add lib/db/migrations/
git commit -m "feat(db): adicionar coluna xyz"

# 6. Em produção, após deploy:
pnpm run vercel:env:prod
pnpm run db:migrate
```

---

### 7. Upload de Ficheiros (PDF, DOCX, XLSX)

**✅ Referência:** `lib/upload/extract-pdf.ts`

```typescript
import { extractPDF } from "@/lib/upload/extract-pdf";

// No chat route:
const pdfText = await extractPDF(buffer);
// Retorna: { text, images, metadata }

// Com OCR (para PDFs escaneados):
const withOCR = await extractPDFWithOCR(buffer, { ocrIfFails: true });
```

---

### 8. Caching (Redis + Memory)

**✅ LLM Response Cache (Redis):**

```typescript
import { withLLMCache } from "@/lib/cache/llm-response-cache";

// Automático: respostas são cacheadas por 24h
const cached = await withLLMCache(
  "meu-cache-key",
  () => generateText({ /* ... */ })
);
```

**✅ Document Cache (Memory):**

```typescript
import { docCache } from "@/lib/cache/document-cache";

const doc = docCache.get(docId) ?? await getDocumentFromDB(docId);
```

---

## 🔐 Segurança & Boas Práticas

### ✅ DO's

- ✅ Validar entrada em todas as APIs (`zod` para schema validation)
- ✅ Verificar autenticação com `await auth()`
- ✅ Verificar autorização (RBAC) antes de operações
- ✅ Usar prepared statements (Drizzle `eq()`, não SQL strings)
- ✅ Hash de senhas com `bcrypt-ts`
- ✅ Logs estruturados com `console.error("[context]")`
- ✅ Typecheck tudo com `pnpm run check`
- ✅ Testes para regras de negócio críticas

### ❌ DON'Ts

- ❌ Não commitar `.env.local` ou segredos
- ❌ Não concatenar SQL strings (usar Drizzle)
- ❌ Não confiar em entrada do cliente (validar sempre)
- ❌ Não expor stack traces ao usuário (logar internamente)
- ❌ Não deixar `console.log` de debug em produção
- ❌ Não fazer querys N+1 (usar `Promise.all` para paralelizar)

---

## 📊 Arquivos de Referência

### Agentes
- **Revisor de Defesas:** `lib/ai/agents/agente-revisor-defesas.ts` (pipeline 2-fase)
- **Redator de Contestação:** `lib/ai/agents/agente-redator-contestacao.ts` (HITL)
- **Assistente Geral:** `lib/ai/agents/agente-geral.ts` (memory persistente)

### Database
- **Schema:** `lib/db/schema.ts` (15+ tabelas definidas)
- **Queries Chats:** `lib/db/queries/chats.ts` (CRUD de conversas)
- **Queries Créditos:** `lib/db/queries/credits.ts` (deduction, balance)
- **Queries Processos:** `lib/db/queries/processos.ts` (intake, tracking)

### API Routes
- **Chat Streaming:** `app/(chat)/api/chat/route.ts` (core, 400+ linhas)
- **Intake Processos:** `app/(chat)/api/processos/route.ts` (PDF extraction)
- **Créditos:** `app/(chat)/api/credits/route.ts` (admin endpoints)

### Componentes
- **Chat Input:** `components/chat/chat-input.tsx` (multimodal)
- **Message List:** `components/chat/message-list.tsx` (virtualized)
- **Agent Selector:** `components/chat/agent-selector.tsx` (dropdown)

### Tests
- **E2E Chat:** `tests/e2e/chat.test.ts` (Playwright)
- **E2E Auth:** `tests/e2e/auth.test.ts` (login, guest)
- **Unit Utils:** `tests/lib/utils.test.ts` (Vitest)

---

## 🎯 Exemplos Concretos para Tarefas Comuns

### Criar novo agente
```
Crie um novo agente em lib/ai/agents/agente-[nome].ts
Seguindo o padrão de lib/ai/agents/agente-geral.ts
Use generateText() do Vercel AI SDK
Registre em app/(chat)/api/chat/route.ts no switch(agentId)
```

### Adicionar coluna à tabela
```
1. Editar lib/db/schema.ts (adicionar coluna)
2. Rodar pnpm run db:generate (criar migration)
3. Rodar pnpm run db:migrate (aplicar localmente)
4. Atualizar lib/db/queries/*.ts se necessário
5. Commit: "feat(db): add column xyz to Table ABC"
```

### Criar nova rota API
```
1. Criar app/(chat)/api/[recurso]/route.ts
2. Validar autenticação com await auth()
3. Validar entrada com zod schema
4. Usar queries de lib/db/queries/
5. Logar com console.error("[context]")
6. Retornar Response.json()
```

### Adicionar permissão RBAC
```
1. Editar lib/auth/permissions.ts (adicionar função)
2. Usar em API route: if (!canAction(userId)) return 403
3. Testar em tests/e2e/auth.test.ts
```

---

## 📚 Documentação

| Doc | Propósito |
|-----|-----------|
| **CLAUDE.md** (este arquivo) | Fonte da verdade, padrões, quick commands |
| **AGENTS.md** | Instruções dos agentes, prompts, customização |
| **docs/ARCHITECTURE.md** | Diagrama 6-layer, decisões de design |
| **docs/DEPLOYMENT.md** | Vercel, Redis, env vars, troubleshooting |
| **docs/DESENVOLVIMENTO.md** | Setup local, estrutura, debugging |
| **docs/MCP.md** | Model Context Protocol integration |
| **README.md** | Overview de produto, links principais |

---

## 🚨 Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| `Unauthorized` na API | Verificar `await auth()` retorna sessão válida |
| `relation "X" does not exist` | Rodar `pnpm run db:migrate` |
| `POSTGRES_URL not set` | Verificar `.env.local` ou `pnpm run vercel:env` |
| Build falha | Rodar `pnpm run check` para ver erros TypeScript |
| E2E test timeout | Aumentar `timeout` em `playwright.config.ts` |
| Lint errors | Rodar `pnpm run format` para auto-fix |

---

## ✍️ Checklist Antes de Push

- [ ] `pnpm run prepush` passou (lint + tests + build)
- [ ] `pnpm run check` sem erros de tipo
- [ ] `pnpm test:unit` passou
- [ ] Nenhum `console.log` de debug no código
- [ ] Seguir padrões de autenticação + RBAC
- [ ] SQL queries usando Drizzle (não strings)
- [ ] Commit message descritiva (feat/fix/docs/refactor)
- [ ] Não commitar `.env.local` ou segredos

---

**Última atualização:** 24 de março, 2026
**Mantido por:** Equipe de desenvolvimento
**Versão do projeto:** 3.1.0
