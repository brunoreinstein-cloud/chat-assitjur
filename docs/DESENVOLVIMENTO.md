# Guia de Desenvolvimento

Setup local, padrões de código, estrutura de pastas e debugging.

---

## Setup Local (5 Minutos)

### Pré-requisitos

- **Node.js 18+** (use `nvm use` se tiver `.nvmrc`)
- **pnpm 10+** (`npm install -g pnpm`)
- **PostgreSQL** (local ou remoto via Supabase)
- **Git** para controle de versão

### Instalação

```bash
# 1. Clonar repositório
git clone https://github.com/seu-org/chatbot.git
cd chatbot

# 2. Instalar dependências
pnpm install

# 3. Puxar variáveis de ambiente (se tiver Vercel configurado)
pnpm run vercel:env
# Ou copiar .env.example para .env.local e editar manualmente

# 4. Aplicar migrações (criar schema na BD)
pnpm run db:migrate

# 5. Iniciar dev server
pnpm dev
```

**Pronto!** Abrir [http://localhost:3300](http://localhost:3300)

### Variáveis de Ambiente (`.env.local`)

```bash
# Obrigatórias
AUTH_SECRET=seu_secret_aqui (gerar com: openssl rand -base64 32)
AUTH_URL=http://localhost:3300
POSTGRES_URL=postgresql://user:password@localhost:5432/chatbot

# AI Gateway (opcional em local)
AI_GATEWAY_API_KEY=seu_key # ou omitir se ter ANTHROPIC_API_KEY

# Upload (opcional)
BLOB_READ_WRITE_TOKEN=seu_token # ou usar Supabase

# Supabase (opcional)
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Redis (opcional)
REDIS_URL=redis://localhost:6379

# Development
NODE_ENV=development
```

---

## Estrutura de Pastas

```
chatbot/
│
├── app/                          # Next.js App Router
│   ├── (chat)/                  # Grupo privado (requer auth)
│   │   ├── layout.tsx           # Layout do chat
│   │   ├── page.tsx             # Rota /chat
│   │   ├── api/
│   │   │   ├── chat/
│   │   │   │   └── route.ts     # POST /api/chat (streaming)
│   │   │   ├── processos/
│   │   │   │   ├── route.ts     # POST (intake), GET (lista)
│   │   │   │   └── extract/route.ts
│   │   │   └── credits/
│   │   │       └── route.ts     # POST (deduzir), GET (saldo)
│   │   └── [id]/                # Rotas dinâmicas
│   │       └── page.tsx         # /chat/[id]
│   │
│   ├── api/                      # API pública
│   │   ├── auth/                # NextAuth routes
│   │   ├── health/              # Health checks
│   │   ├── files/               # Upload/download
│   │   └── document/            # GET /api/document?id=...
│   │
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Home page (redireciona para /chat ou login)
│   └── [...rest]/               # 404 fallback
│
├── components/                   # React Components (Server + Client)
│   ├── chat/
│   │   ├── chat-input.tsx       # Input bar do chat
│   │   ├── message-list.tsx     # Histórico de mensagens
│   │   ├── agent-selector.tsx   # Dropdown de agentes
│   │   └── message-item.tsx     # Uma mensagem individual
│   │
│   ├── admin/
│   │   ├── agent-editor.tsx     # Edit agent prompts
│   │   ├── credit-panel.tsx     # Admin credits
│   │   └── process-panel.tsx    # Gerenciar processos
│   │
│   ├── elements/                # UI Components reutilizáveis
│   │   ├── button.tsx
│   │   ├── modal.tsx
│   │   ├── dialog.tsx
│   │   ├── select.tsx
│   │   └── ...
│   │
│   ├── markdown/                # Rendering
│   │   ├── code-block.tsx       # Com syntax highlight (shiki)
│   │   ├── math-block.tsx       # KaTeX
│   │   └── markdown.tsx         # Parser genérico
│   │
│   └── prose/                   # Editor components
│       ├── prose-editor.tsx     # ProseMirror editor
│       └── prose-viewer.tsx     # Visualizador
│
├── lib/                          # Lógica compartilhada
│   ├── ai/
│   │   ├── agents/              # Implementação dos agentes
│   │   │   ├── agente-geral.ts
│   │   │   ├── agente-revisor-defesas.ts
│   │   │   ├── agente-redator-contestacao.ts
│   │   │   ├── agente-avaliador.ts
│   │   │   └── agente-master.ts
│   │   │
│   │   ├── prompts/             # Instruções dos agentes
│   │   │   ├── agente-trabalhista/
│   │   │   │   ├── prompt.ts
│   │   │   │   ├── tools.ts
│   │   │   │   └── types.ts
│   │   │   └── ...
│   │   │
│   │   ├── tools/               # Tool definitions
│   │   │   ├── document.ts      # Create/update docs
│   │   │   ├── knowledge.ts     # RAG queries
│   │   │   ├── approval.ts      # HITL
│   │   │   └── ...
│   │   │
│   │   ├── middleware/          # LLM response cache, rate limiting
│   │   │   ├── index.ts
│   │   │   └── rate-limiter.ts
│   │   │
│   │   ├── mcp-config.ts        # Model Context Protocol
│   │   ├── providers.ts         # LLM providers (Gateway, Anthropic, etc.)
│   │   └── types.ts             # Types compartilhados
│   │
│   ├── db/
│   │   ├── schema.ts            # Drizzle schema (tabelas)
│   │   ├── migrate.ts           # Executar migrações
│   │   ├── connection.ts        # Pool da BD
│   │   │
│   │   ├── migrations/          # SQL migrations
│   │   │   ├── 0001_init.sql
│   │   │   ├── 0002_add_processes.sql
│   │   │   └── ...
│   │   │
│   │   └── queries/             # Queries por domínio
│   │       ├── chats.ts         # getChatById, createChat, etc.
│   │       ├── messages.ts      # getMessages, createMessage, etc.
│   │       ├── knowledge.ts     # getKnowledgeDocuments, etc.
│   │       ├── processos.ts     # getProcessos, createProcesso, etc.
│   │       ├── credits.ts       # getCreditBalance, deductCredits, etc.
│   │       ├── users.ts         # getUserById, etc.
│   │       └── memory.ts        # User memory/preferences
│   │
│   ├── cache/
│   │   ├── llm-response-cache.ts # Redis cache para respostas LLM
│   │   ├── document-cache.ts     # Cache de documentos (memória)
│   │   ├── credits-cache.ts      # Cache de saldo de créditos
│   │   └── lru-ttl-map.ts        # Estrutura LRU com TTL
│   │
│   ├── upload/
│   │   ├── extract-pdf.ts        # Extract text/images from PDF
│   │   ├── extract-docs.ts       # Extract from DOCX/XLSX
│   │   ├── ocr.ts                # OCR usando tesseract.js
│   │   └── s3.ts                 # Upload (Vercel Blob / Supabase)
│   │
│   ├── pdf/
│   │   ├── pdf-optimizer.ts      # Compress PDFs
│   │   ├── pdf-converter.ts      # Convert PDF to images
│   │   └── pdfjs-utils.ts        # Utils usando pdfjs-dist
│   │
│   ├── auth/
│   │   ├── index.ts              # Funções auth (getCurrentUser, etc.)
│   │   └── permissions.ts        # RBAC (canEditAgent, canViewProcess, etc.)
│   │
│   ├── utils.ts                  # Utilitários genéricos
│   ├── constants.ts              # Constantes (max file size, etc.)
│   └── types.ts                  # Types globais
│
├── tests/
│   ├── e2e/                      # Testes end-to-end (Playwright)
│   │   ├── api.test.ts
│   │   ├── auth.test.ts
│   │   ├── chat.test.ts
│   │   └── agents/               # Testes por agente
│   │       ├── agent-revisor.test.ts
│   │       └── ...
│   │
│   ├── unit/                     # Testes unitários (Vitest)
│   │   ├── utils.test.ts
│   │   └── ...
│   │
│   ├── prompts/                  # Validação de prompts
│   │   └── validate-agents.test.ts
│   │
│   ├── fixtures.ts               # Dados de teste
│   ├── global-setup.ts           # Setup dos testes
│   └── helpers.ts                # Helpers (auth, API calls, etc.)
│
├── docs/
│   ├── ARCHITECTURE.md           # Diagrama 6-layer
│   ├── DESENVOLVIMENTO.md        # Este arquivo
│   ├── DEPLOYMENT.md             # Vercel, Redis, env vars
│   ├── MCP.md                    # Model Context Protocol
│   ├── AGENTS.md                 # Prompts dos agentes
│   └── vercel-*.md               # Vercel CLI, setup
│
├── scripts/
│   ├── README.md                 # Índice de scripts one-off
│   ├── db-seed-redator-banco.ts  # Seed inicial
│   ├── db-add-agent-id.ts        # Migração histórica
│   ├── health-ai.ts              # Verificar conexão
│   ├── benchmark-llm.ts          # Benchmark latência
│   └── ...
│
├── public/                       # Assets estáticos
│   ├── images/
│   └── ...
│
├── .agents/                      # Agent Skills (integration com Claude)
│   ├── skills/
│   │   ├── next-js/
│   │   ├── react/
│   │   └── ...
│   └── README.md
│
├── supabase/
│   ├── config.toml               # Configuração Supabase (buckets, etc.)
│   └── seed.sql                  # Seed SQL (opcional)
│
├── .env.example                  # Template de env vars
├── .env.local                    # (Não commitar!) Env local
├── .gitignore                    # Git ignore rules
├── package.json                  # Scripts e dependências
├── pnpm-lock.yaml                # Lockfile (commitar!)
├── tsconfig.json                 # TypeScript config
├── next.config.ts                # Next.js config
├── vercel.json                   # Vercel config (crons, functions, etc.)
├── playwright.config.ts          # Playwright config
├── vitest.config.ts              # Vitest config
├── tailwind.config.ts            # Tailwind config
├── biome.json                    # Biome (lint/format)
├── README.md                     # README principal
└── AGENTS.md                     # Documentação de agentes
```

---

## Padrões de Código

### 1. Components (React 19)

**Server Components por padrão**, `use client` apenas quando necessário (state, hooks, browser APIs).

```typescript
// ✅ BOM: Server Component
export async function ChatHistory({ chatId }: { chatId: string }) {
  const messages = await getMessagesByChatId(chatId);
  return (
    <div>
      {messages.map(msg => (
        <MessageItem key={msg.id} message={msg} />
      ))}
    </div>
  );
}

// ✅ BOM: Client Component quando precisa state
"use client";
export function ChatInput({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSend(text);
      }}
    />
  );
}
```

### 2. API Routes

Sempre validar auth e retornar JSON tipado.

```typescript
// app/(chat)/api/chat/route.ts
import { auth } from "@/lib/auth";

export const maxDuration = 60; // Vercel Serverless max

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { message, chatId } = await req.json();
    if (!message || !chatId) {
      return Response.json({ error: "Missing fields" }, { status: 400 });
    }

    // Usar encoder para streaming
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Lógica do chat
        controller.enqueue(encoder.encode("data: ..."));
        controller.close();
      },
    });

    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
  } catch (error) {
    console.error("[chat] error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
```

### 3. Database Queries

Usar Drizzle para queries type-safe.

```typescript
// lib/db/queries/chats.ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { chats } from "@/lib/db/schema";

export async function getChatById(id: string, userId: string) {
  const result = await db
    .select()
    .from(chats)
    .where(eq(chats.id, id))
    .limit(1);

  if (result.length === 0) return null;

  const chat = result[0];
  if (chat.user_id !== userId) throw new Error("Unauthorized");

  return chat;
}

export async function createChat(userId: string, agent: string) {
  const [chat] = await db
    .insert(chats)
    .values({
      id: nanoid(),
      user_id: userId,
      agent_id: agent,
      created_at: new Date(),
    })
    .returning();

  return chat;
}
```

### 4. Agentes

Cada agente em `lib/ai/agents/`, com system prompt, tools, tipos.

```typescript
// lib/ai/agents/agente-geral.ts
import { generateText } from "ai";
import { gateway } from "@/lib/ai/providers";

export async function agenteGeral(userMessage: string, context: string) {
  const systemPrompt = `Você é um assistente jurídico especializado em direito do trabalho...`;

  const { text } = await generateText({
    model: gateway.languageModel("grok-2-latest"),
    system: systemPrompt,
    prompt: `${context}\n\nUser: ${userMessage}`,
    tools: {
      searchKnowledge: {
        description: "Buscar documentos na base de conhecimento",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
      },
    },
  });

  return text;
}
```

### 5. Types

Definir types compartilhados em `lib/types.ts`:

```typescript
// lib/types.ts
export type Message = {
  id: string;
  chatId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
};

export type Chat = {
  id: string;
  userId: string;
  agentId: string;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Agent = {
  id: string;
  name: string;
  prompt: string;
  tools: Tool[];
};
```

---

## Comandos Úteis

### Development

```bash
# Iniciar servidor (Turbopack, hot reload)
pnpm dev

# Aquecer cache (compilar rotas em background)
pnpm run dev:warmup

# Servidor em porta específica
pnpm dev -- -p 3301
```

### Lint & Format

```bash
# Verificar lint (Biome)
pnpm run lint

# Fixar lint automaticamente
pnpm run format

# Verificar tudo (lint + types + tests)
pnpm run check
```

### Database

```bash
# Aplicar migrações pendentes
pnpm run db:migrate

# Gerar tipagem para nova migration
pnpm run db:generate

# Drizzle Studio (UI para explorar dados)
pnpm run db:studio

# Testar conexão
pnpm run db:ping

# Listar tabelas
pnpm run db:tables
```

### Testes

```bash
# E2E tests (Playwright)
pnpm test

# Contra servidor em 3300
pnpm run test:with-dev

# Mostrar relatório de tests
pnpm run test:report

# Testes unitários
pnpm run test:unit

# Monitorar & re-run ao mudar arquivos
pnpm run test:unit -- --watch
```

### Build & Deploy

```bash
# Build completo (lint + tests + next build)
pnpm run prepush

# Next.js build
pnpm run build

# Iniciar production
pnpm start

# Análise de bundle
pnpm run analyze

# Deploy preview
pnpm run vercel:deploy

# Deploy production
pnpm run vercel:deploy:prod
```

### Vercel & Environment

```bash
# Puxar env vars (Development)
pnpm run vercel:env

# Puxar env vars (Production)
pnpm run vercel:env:prod

# Revisar env vars
pnpm run vercel:review

# Enviar env vars de .env.local para Vercel
pnpm run vercel:env:push

# Ver logs de deployment
pnpm run vercel:logs
```

---

## Debugging

### VS Code Launch Config

Criar `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["dev"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    },
    {
      "name": "Jest: current file",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["${file}", "--runInBand"],
      "console": "integratedTerminal"
    }
  ]
}
```

### Logs & Console

```typescript
// Em rotas API ou Server Components
console.log("[component] debug message", data); // Verde no terminal dev
console.warn("[component] warning", data);       // Amarelo
console.error("[component] error", data);        // Vermelho
```

Em produção, logs vão para Vercel → Logs → Runtime.

### Network Debuggin g

```bash
# Ver requisições HTTP
# Chrome DevTools → Network tab

# Ver requisições SSE (streaming)
# Chrome DevTools → Network → selecionar chamada /api/chat
# → Response (ver chunks chegando em tempo real)
```

### Database Debugging

```bash
# Explorar dados em UI
pnpm run db:studio

# Query SQL direto (Supabase SQL Editor)
SELECT * FROM "Chat" WHERE user_id = 'xxx';
SELECT * FROM "Message" WHERE chat_id = 'xxx' ORDER BY created_at DESC;
```

### LLM / AI SDK Debugging

```typescript
// Adicionar logging ao agent
const { text } = await generateText({
  model: gateway.languageModel("grok-2-latest"),
  system: systemPrompt,
  prompt: userMessage,
  tools: { /* ... */ },
  onChunk: (chunk) => {
    console.log("[ai] chunk:", JSON.stringify(chunk));
  },
});
```

### Performance Profiling

```bash
# Em desenvolvimento, a rota /api/chat já loga timings
# Procurar no terminal por: "[chat-timing]"

# Exemplo output:
# [chat-timing] auth: 0.2s
# [chat-timing] queries: 1.1s
# [chat-timing] preStream total: 1.5s
# [chat-timing] execute started
# [chat-timing] onFinish: 8.3s
```

---

## Workflow Típico

### Adicionar Uma Nova Feature

```bash
# 1. Criar branch
git checkout -b feat/my-feature

# 2. Desenvolver localmente
pnpm dev
# (editar código, testar)

# 3. Verificar tudo
pnpm run check          # lint + types
pnpm run test:unit      # testes unitários
pnpm test               # testes E2E

# 4. Fazer commit
git add .
git commit -m "feat(chat): adicionar suporte a /help"

# 5. Fazer push e abrir PR
git push origin feat/my-feature
# Abrir PR no GitHub

# 6. Aguardar aprovação + merge
git checkout main
git pull
```

### Corrigir Um Bug

```bash
# 1. Criar branch
git checkout -b fix/bug-description

# 2. Reproduzir bug
pnpm dev
# (testar o problema)

# 3. Corrigir código
# (editar arquivo)

# 4. Adicionar teste (regressão)
# tests/e2e/...test.ts

# 5. Verificar
pnpm run prepush

# 6. Commit + Push
git commit -m "fix(chat): não processar mensagens vazias"
git push origin fix/bug-description
```

---

## Dicas & Boas Práticas

### ✅ DO's

- ✅ Usar types/interfaces em vez de `any`
- ✅ Fazer commit frequentemente (pequenos commits)
- ✅ Descrever commits em inglês (padrão git)
- ✅ Testar localmente antes de push
- ✅ Usar `pnpm run check` antes de PR

### ❌ DON'Ts

- ❌ Não commitar `.env.local` ou segredos
- ❌ Não fazer force push (a menos que seja branch pessoal)
- ❌ Não deixar `console.log` de debug em produção (OK em dev)
- ❌ Não alterar schema da BD sem migration (`drizzle-kit generate`)
- ❌ Não instalar pacotes sem avaliar peso (use `npm bundle-phobia`)

---

## Próximos Passos

- Ler [ARCHITECTURE.md](./ARCHITECTURE.md) para entender estrutura
- Ler [AGENTS.md](../AGENTS.md) para entender agentes
- Explorar `lib/ai/agents/` para ver exemplos reais

---

**Alguma dúvida?** Procurar em:
- `src/` diretório (código similar)
- Commit history (`git log --oneline`)
- Pull requests anteriores (aprender com revisões)
