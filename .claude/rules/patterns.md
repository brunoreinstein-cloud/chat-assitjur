# Coding Patterns

**Paths:** `app/`, `lib/`, `components/`

Common patterns and best practices for AssistJur development.

## 1. Server Components with Streaming

**When:** Page that needs real-time data (chat streams, processing progress)
**Where:** `app/(chat)/` pages
**Pattern:**

```typescript
// app/(chat)/page.tsx
import { Suspense } from 'react';
import ChatStream from '@/components/chat-stream';

export default async function ChatPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ChatStream />
    </Suspense>
  );
}

// components/chat-stream.tsx
'use client';
import { useEffect, useState } from 'react';

export default function ChatStream() {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const eventSource = new EventSource('/api/chat');
    eventSource.onmessage = (e) => {
      setMessages(prev => [...prev, JSON.parse(e.data)]);
    };
    return () => eventSource.close();
  }, []);

  return <div>{messages.map(m => <p key={m.id}>{m.text}</p>)}</div>;
}
```

## 2. Drizzle ORM Queries

**When:** Database operations (read, write, complex queries)
**Where:** `lib/db/queries/`, `app/api/*/route.ts`
**Pattern:**

```typescript
// lib/db/queries/chats.ts
import { db } from '@/lib/db/connection';
import { chats, messages } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function getChatHistory(chatId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(desc(messages.createdAt))
    .limit(80);
}

export async function createChat(userId: string, agentId: string) {
  return db
    .insert(chats)
    .values({ userId, agentId })
    .returning();
}
```

## 3. API Routes with LLM Streaming

**When:** Chat endpoint, agent processing, streaming responses
**Where:** `app/api/chat/route.ts`, `app/(chat)/api/*/route.ts`
**Pattern:**

```typescript
// app/(chat)/api/chat/route.ts
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { getChatHistory } from '@/lib/db/queries/chats';

export async function POST(req: Request) {
  const { message, chatId, agentId } = await req.json();

  // Load context
  const history = await getChatHistory(chatId);

  // Stream response
  const result = streamText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    system: getAgentPrompt(agentId),
    messages: [
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ],
  });

  return result.toDataStreamResponse();
}
```

## 4. RBAC (Role-Based Access Control)

**When:** Protecting routes, checking user permissions
**Where:** `lib/auth/rbac.ts`, API routes
**Pattern:**

```typescript
// lib/auth/rbac.ts
import { auth } from '@/lib/auth';

export async function requireRole(role: 'admin' | 'revisor' | 'redator' | 'user') {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const userRole = session.user.role;
  const hierarchy = { admin: 4, revisor: 3, redator: 2, user: 1 };

  if (hierarchy[userRole] < hierarchy[role]) {
    throw new Error('Insufficient permissions');
  }

  return session.user;
}

// Usage in API route
export async function POST(req: Request) {
  const user = await requireRole('revisor'); // Only revisor+ can access
  // ... protected logic
}
```

## 5. Agentes with generateText Tool Loop

**When:** Multi-step agent processing (Revisor, Redator, Master)
**Where:** `lib/ai/agentes/`
**Pattern:**

```typescript
// lib/ai/agentes/revisor-defesas.ts
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { defineTools, executeTool } from '@/lib/ai/tools';

export async function processDefesa(defesaText: string) {
  const tools = defineTools(['analyze', 'critique', 'suggest', 'export_docx']);

  let response = await generateText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    system: REVISOR_PROMPT,
    prompt: defesaText,
    tools,
    maxSteps: 5,
  });

  // Tool loop continues automatically via maxSteps
  console.log('Final response:', response.text);
  return response.text;
}
```

## 6. Database Migrations (Drizzle)

**When:** Schema changes (new table, column, index)
**Where:** `lib/db/schema.ts` + `lib/db/migrations/`
**Pattern:**

```bash
# 1. Edit schema
# lib/db/schema.ts
export const processos = pgTable('processos', {
  id: uuid().primaryKey(),
  numero: varchar().unique().notNull(),
  // ... add new column here
  updatedAt: timestamp().default(sql`now()`),
});

# 2. Generate migration
pnpm run db:generate

# 3. Review lib/db/migrations/0XXX_*.sql
# 4. Apply migration
pnpm run db:migrate
```

## 7. File Upload & OCR

**When:** Users upload PDF/DOCX for processing
**Where:** `lib/upload/`, `app/api/upload/route.ts`
**Pattern:**

```typescript
// lib/upload/extract-pdf.ts
import { PDFDocument } from 'pdf-lib';
import { unpdf } from 'unpdf';

export async function extractPdfText(buffer: Buffer) {
  const pdf = await PDFDocument.load(buffer);
  const { text } = await unpdf(buffer);

  // Fallback to OCR if text extraction empty
  if (!text.trim()) {
    const { recognize } = await import('tesseract.js');
    return await recognize(buffer, 'por');
  }

  return text;
}

// app/api/upload/route.ts
export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const buffer = await file.arrayBuffer();

  const text = await extractPdfText(Buffer.from(buffer));
  return Response.json({ text });
}
```

## 8. Caching with Redis (Optional)

**When:** Reduce LLM latency for repeated queries
**Where:** `lib/cache/`, `app/api/chat/route.ts`
**Pattern:**

```typescript
// lib/cache/llm-response-cache.ts
import { redis } from '@/lib/cache/redis';

export async function getCachedResponse(key: string) {
  if (!redis) return null;

  try {
    const cached = await redis.get(`llm:${key}`);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null; // Fallback if Redis down
  }
}

export async function cacheResponse(key: string, value: any, ttl = 3600) {
  if (!redis) return;

  try {
    await redis.setex(`llm:${key}`, ttl, JSON.stringify(value));
  } catch {
    // Silent fail — cache is optional
  }
}

// Usage in route
export async function POST(req: Request) {
  const cacheKey = `chat:${chatId}:${messageHash}`;
  let response = await getCachedResponse(cacheKey);

  if (!response) {
    response = await generateResponse(); // LLM call
    await cacheResponse(cacheKey, response);
  }

  return Response.json(response);
}
```

## General Best Practices

- **Use Server Components by default** → Client only when interactive
- **Type everything** → Avoid `any`, use generated Drizzle types
- **Environment variables** → All secrets in `.env.local` (dev) or Vercel dashboard (prod)
- **Error handling** → Catch and log, return meaningful errors to client
- **Testing** → Playwright E2E for critical flows (chat, auth), Vitest for utils
- **Code formatting** → `pnpm format` before commit (Biome enforces)
