# Plano de Implementação — Revisão de Dependências

**Tempo total estimado:** 40-60 horas (distribuídas em 4 semanas)

---

## Fase 1: Análise e Decisão (2-3 dias)

### Task 1.1: Auditar next-auth
```bash
# Verificar versão estável mais recente
npm view next-auth versions --json | tail -10

# Se v5 stable existir (ex: 5.0.0, 5.1.0):
#   → Upgrade direto com: pnpm up next-auth@latest
#   → Possível breaking changes: revisar CHANGELOG
#   → Testar com: pnpm run test:unit && pnpm test
#
# Se ainda em beta:
#   → Manter 5.0.0-beta.30
#   → Monitorar releases semanalmente
```

**Responsável:** Dev principal
**Esforço:** 30 min
**Saída:** Decisão + relatório de breaking changes (se houver)

---

### Task 1.2: Analisar react-data-grid
```bash
# Status do projeto
# 1. Visitar https://github.com/adazzle/react-data-grid
# 2. Verificar: Última release? Ativa ou abandonada? Quando v7 stable?
# 3. Se abandonada → Começar prototipo com TanStack Table
# 4. Se ativa → Fazer upgrade para beta mais recente

# Se upgrade for necessário:
pnpm up react-data-grid@latest
# Possível breaking changes
```

**Responsável:** Dev principal
**Esforço:** 1-2 horas (research + teste)
**Saída:** Decisão (upgrade/manter/migrar) + plano de ação

---

### Task 1.3: Bundle Analysis
```bash
# Analisar tamanho real
pnpm run analyze

# Output esperado:
# - Webpack bundle analyzer abre em browser
# - Identificar libs realmente pesadas
# - Comparar com estimativa de 15MB para tesseract.js

# Tirar screenshot e documentar em findings
```

**Responsável:** Dev principal
**Esforço:** 30 min
**Saída:** Relatório com mapa real de bundle

---

## Fase 2: Documentação (3-5 dias)

### Task 2.1: Documentar Redis
**Arquivo:** `docs/DEPLOYMENT.md` (novo)

```markdown
# Deployment & Infrastructure

## Redis Cache (Opcional em Dev, Recomendado em Prod)

### O que é?
Cache de respostas LLM para reduzir latência e custo.

### Setup em Dev
Não é necessário. Se não configurado, cache LLM é desabilitado.
Cada chat chamará o LLM sem cache (mais lento, mas funciona).

### Setup em Produção (Vercel + Upstash)
1. Criar conta em https://upstash.com
2. Gerar chave Redis
3. Definir em Vercel:
   ```bash
   pnpm run vercel:env:prod
   # Ou manual:
   vercel env add REDIS_URL
   # Copiar URL de Upstash e confirmar
   ```
4. Deploy
   ```bash
   pnpm run vercel:deploy:prod
   ```

### Alternativas
- **Upstash:** Serverless Redis (recomendado para Vercel)
- **AWS ElastiCache:** Self-managed (mais caro)
- **Azure Cache for Redis:** Para arquitetura Azure

### Fallback
Se Redis desconectar, o chat continua funcionando sem cache.
Erros são logged mas não quebram o serviço.
```

**Responsável:** Dev
**Esforço:** 1 hora
**Saída:** `docs/DEPLOYMENT.md` completo

---

### Task 2.2: Documentar MCP
**Arquivo:** `docs/MCP.md` (novo)

```markdown
# Model Context Protocol (MCP) Integration

## O que é MCP?
Permite que agentes usem ferramentas externas (Gmail, Drive, GitHub, Notion)
sem código custom.

## Servidores Disponíveis

### Gmail MCP
Ler e enviar e-mails de processos diretamente do chat.

**Setup:**
1. Criar app OAuth em Google Cloud Console
2. Gerar credenciais
3. Definir em .env.local:
   ```
   MCP_GMAIL_URL=https://...
   MCP_GMAIL_TOKEN=ghosted_...
   ```

**Uso no Chat:**
```
@gmail enviar para cliente@example.com: "Cópia da contestação"
```

### Google Drive MCP
Acessar petições, contratos, documentos salvos no Drive.

**Setup:** Similar a Gmail

**Uso:**
```
@drive buscar "contrato cliente X"
@drive listar /processos/2026
```

### Notion MCP
Usar base de conhecimento do escritório hospedada em Notion.

**Setup:** Gerar integration token

**Uso:**
```
@notion buscar "jurisprudência CLT"
@notion adicionar "[nova tese]"
```

### GitHub MCP
Acessar repositório de templates de petições.

**Setup:** GitHub token

**Uso:**
```
@github buscar template de contestação
@github enviar PR com nova peça
```

## Status Atual do Projeto
Todos os 4 servidores estão definidos em `lib/ai/mcp-config.ts`.
Falta apenas configurar env vars e testar.

## Próximos Passos
1. Priorizar: Qual MCP usar primeiro? (recomendado: Gmail)
2. Implementar setup
3. Testar com agentes
4. Documentar fluxos no painel admin
```

**Responsável:** Dev
**Esforço:** 2-3 horas
**Saída:** `docs/MCP.md` + atualização de `lib/ai/mcp-config.ts` com exemplos

---

### Task 2.3: Atualizar README
**Arquivo:** `README.md` (refactor)

```diff
# Chatbot — Agentes Jurídicos com IA

+ ![Next.js](https://img.shields.io/badge/Next.js-16.1-black)
+ ![React](https://img.shields.io/badge/React-19-blue)
+ ![License](https://img.shields.io/badge/License-MIT-green)
+ ![Status](https://img.shields.io/badge/Status-Production-brightgreen)

+ **[⭐ Veja em ação](https://assistjur.vercel.app)** (GIF ou screenshot)

Plataforma de chat com **5 agentes de IA** especializados...

## 📋 Índice Rápido
- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Quick Start](#quick-start)
- [Documentação](#documentação)
- [Model Context Protocol](#model-context-protocol)
- [Deployment](#deployment)

## 🚀 Quick Start

\`\`\`bash
pnpm install
pnpm db:migrate
pnpm dev
# Abrir http://localhost:3300
\`\`\`

## 🧠 Agentes

| Agente | Uso | Output |
|--------|-----|--------|
| Assistente Geral | Chat + memória | Texto |
| Revisor de Defesas | Auditoria jurídica | DOCX + relatório |
| Redator de Contestações | Minuta de contestação | DOCX |
| Avaliador de Contestação | Qualidade da peça | Relatório DOCX |
| AssistJur Master | Pipeline multi-chamadas | DOCX/XLSX/ZIP |

## 🔗 Model Context Protocol (MCP)

Integração com Gmail, Google Drive, Notion, GitHub para acesso direto
a e-mails, documentos e base de conhecimento. Ver [MCP.md](./MCP.md).

## 💾 Cache & Performance

- **LLM Response Cache:** Redis (opcional, melhora latência)
- **Document Cache:** In-memory com TTL
- **DB Pooling:** Supabase/Neon

## 📚 Documentação

- [AGENTS.md](../AGENTS.md) — Guia de agentes e instruções
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Diagrama e decisões de design
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Setup em Vercel, Redis, variáveis de env
- [DESENVOLVIMENTO.md](./DESENVOLVIMENTO.md) — Setup local, padrões de código
- [MCP.md](./MCP.md) — Integração com servidores MCP
- [REVISAO-DEPENDENCIAS-ARQUITETURA.md](./REVISAO-DEPENDENCIAS-ARQUITETURA.md) — Análise de dependências

## ⚙️ Deploy

Recomendado em [Vercel](https://vercel.com). Ver [DEPLOYMENT.md](./DEPLOYMENT.md).

\`\`\`bash
pnpm run vercel:deploy:prod
\`\`\`
```

**Responsável:** Dev + Product
**Esforço:** 2 horas
**Saída:** README refatorado com badges, links para docs especializadas

---

## Fase 3: Refatoração de Scripts (3-5 dias)

### Task 3.1: Criar `scripts/README.md`
```markdown
# Scripts de Utilidade

## Recorrentes (use pelo npm)
```bash
pnpm dev              # Desenvolvimento
pnpm build            # Build para produção
pnpm lint             # Lint code
pnpm format           # Format code
pnpm test             # Testes E2E
pnpm test:unit        # Testes unitários
pnpm db:migrate       # Aplicar migrações
pnpm db:studio        # Drizzle Studio
\`\`\`

## Setup One-off (pasta scripts/)
```bash
# Setup inicial (seed de dados)
tsx scripts/db-seed-redator-banco.ts

# Migração one-off de agent IDs (histórico)
tsx scripts/db-add-agent-id.ts

# Gerar tipos Supabase
pnpm run supabase:types

# Setup Supabase (config push, etc)
pnpm run supabase:setup
\`\`\`

## Debug
```bash
# Verificar conexão com AI Gateway
tsx scripts/check-ai-connection.ts

# Ping no banco de dados
pnpm run db:ping

# Benchmark LLM latency
tsx scripts/benchmark-llm.ts

# Checklist de config
tsx scripts/check-config.ts
\`\`\`

## Deploy
```bash
# Pre-deploy checks
tsx scripts/pre-deploy.ts

# Vercel
pnpm run vercel:deploy          # Dev
pnpm run vercel:deploy:prod     # Produção

# Ambiente
pnpm run vercel:env:prod        # Pull env production
pnpm run vercel:env             # Pull env development
\`\`\`

## Dicas
- Scripts one-off não precisam estar em package.json
- Muitos scripts em package.json deixam a lista confusa
- Use `scripts/README.md` para documentar alternativas
```

**Responsável:** Dev
**Esforço:** 1 hora
**Saída:** `scripts/README.md` + limpeza opcional de package.json

---

### Task 3.2: Marcar scripts one-off (opcional)
```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "test": "...",
    "_one-off-db:add-agent-id": "tsx scripts/db-add-agent-id.ts",
    "_one-off-db:seed-redator-banco": "tsx scripts/db-seed-redator-banco.ts",
    ...
  }
}
```

**Benefício:** Deixa claro quais são recorrentes vs pontuais.

**Responsável:** Dev
**Esforço:** 30 min
**Saída:** package.json com prefixo `_one-off-` em scripts pontuais

---

## Fase 4: Documentação de Arquitetura (5-7 dias)

### Task 4.1: Criar `docs/ARCHITECTURE.md`
```markdown
# Arquitetura — AssistJur

## Diagrama 6-Layer

\`\`\`
┌─────────────────────────────────────────────────┐
│  Layer 1: Client (React 19 + SWR)               │
│  - Chat UI, Input, Message history              │
│  - Agent selector, Processo tracking            │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│  Layer 2: API Routes (Next.js App Router)       │
│  - POST /api/chat (streaming)                   │
│  - POST /api/processos (intake, extract)        │
│  - GET/POST /api/credits (admin only)           │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│  Layer 3: AI Agents (Vercel AI SDK)             │
│  - 5 agentes: Geral, Revisor, Redator, etc     │
│  - Streaming, tools, memory persistency         │
│  - MCP integration (Gmail, Drive, etc)          │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│  Layer 4: LLM Providers                         │
│  - Vercel AI Gateway (xAI, OpenAI)              │
│  - Redis Cache (LLM response caching)           │
│  - Fallback provider (se principal falhar)      │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│  Layer 5: Data Processing                       │
│  - PDF extraction (unpdf, pdfjs-dist)           │
│  - Document processing (mammoth, docx)          │
│  - OCR (tesseract.js, lazy-loaded)              │
│  - Code highlighting (shiki)                    │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│  Layer 6: Persistence                           │
│  - PostgreSQL (Supabase/Neon)                   │
│  - Drizzle ORM                                  │
│  - Storage (Vercel Blob / Supabase Storage)     │
└─────────────────────────────────────────────────┘
\`\`\`

## Fluxo de Chat

1. User envia mensagem → Client
2. Client POST /api/chat com texto + contexto (base de conhecimento)
3. API Route autentica (NextAuth) → middleware
4. Seleciona agente baseado em seletor ou default
5. Agente chama LLM via Vercel AI SDK
   - Verifica Redis cache (se HIT, retorna cached)
   - Se MISS, chama provider (xAI/OpenAI)
   - Guarda resposta em Redis com TTL
6. Streaming de resposta volta ao cliente
7. Salva chat_message em PostgreSQL (async)

## Agentes

### Assistente Geral
- Prompt: assistir usuário com dúvidas jurídicas
- Memory: Persistida em `memory` table (chave user_id + chat_id)
- Output: Texto (markdown)

### Revisor de Defesas
- Prompt: Auditoria de defesa em 2 fases (GATE-1 → FASE A → GATE 0.5 → FASE B)
- Input: PDF de defesa
- Output: DOCX com parecer + sugestões

### (... etc para outros agentes)

## Decisões de Design

### Por que Vercel AI SDK?
- Suporta múltiplos providers
- Streaming built-in
- SDK para tools é bem documentado
- Integração com Vercel edge functions

### Por que Drizzle + PostgreSQL?
- Type-safe SQL queries
- Migrações versionadas
- Melhor que ORMs heavy para casos de uso específico

### Por que Redis em vez de in-memory?
- Produção necessita multi-instância
- Vercel serverless: cache por instância é inútil
- Redis permite compartilhamento entre reqs

### Por que MCP?
- Padrão aberto (Model Context Protocol)
- Integração plug-and-play com Gmail, Drive, etc
- Não requer código custom para cada integração
```

**Responsável:** Dev principal + Tech Lead
**Esforço:** 3-4 horas
**Saída:** `docs/ARCHITECTURE.md` com diagrama ASCII + explicações

---

### Task 4.2: Criar `docs/DESENVOLVIMENTO.md`
```markdown
# Guia de Desenvolvimento

## Setup Local

### Pré-requisitos
- Node.js 18+
- pnpm 10+
- PostgreSQL local ou Supabase

### Instalação
\`\`\`bash
pnpm install
pnpm run vercel:env          # Pull env vars do Vercel
pnpm db:migrate              # Criar schema local
pnpm dev
\`\`\`

## Estrutura de Pastas

\`\`\`
chatbot/
├── app/                      # Next.js App Router
│   ├── (chat)/              # Grupo de rotas privadas
│   │   ├── api/chat         # POST /api/chat (streaming)
│   │   ├── api/processos    # Intake, extraction
│   │   └── ...
│   └── api/                 # API pública (creditos, etc)
│
├── components/              # React components
│   ├── chat/               # Chat UI
│   ├── admin/              # Admin panel
│   └── elements/           # Shared UI (button, modal, etc)
│
├── lib/                     # Lógica compartilhada
│   ├── ai/                 # Agentes, prompts, MCP
│   ├── db/                 # Drizzle schema, queries
│   ├── cache/              # Redis cache, LLM response
│   ├── upload/             # PDF/DOCX extraction
│   ├── pdf/                # PDF processing
│   └── prompts/            # Instruções dos agentes
│
├── tests/                   # Testes
│   ├── e2e/                # Playwright E2E
│   ├── unit/               # Vitest unitários
│   └── fixtures.ts         # Dados de teste
│
├── docs/                    # Documentação
└── scripts/                 # Utilitários one-off
\`\`\`

## Padrões de Código

### Componentes React
- Use Server Components por padrão
- "use client" apenas quando necessário state/browser APIs
- Prefira props drilling a Context (até 3-4 levels)

### Agentes IA
- Cada agente em lib/prompts/[agent-name]/
- Incluir: prompt.ts, tools.ts, tipos.ts
- Testes unitários: validate-agents.test.ts

### APIs
- Use middleware em lib/ai/middleware/
- Sempre verificar autenticação em private routes
- Logar erros (OpenTelemetry)

### Banco de Dados
- Schema em lib/db/schema.ts
- Queries em lib/db/queries/
- Migrações com drizzle-kit generate

## Comandos Úteis

\`\`\`bash
# Desenvolvimento
pnpm dev
pnpm run dev:warmup           # Aquecer cache local

# Testes
pnpm test                     # E2E (Playwright)
pnpm test:unit                # Unitários (Vitest)
pnpm test:with-dev            # E2E contra localhost:3300

# Lint & Format
pnpm lint                     # Check (ultracite)
pnpm format                   # Fix (ultracite)

# Database
pnpm db:migrate               # Aplicar migrações
pnpm db:studio                # UI para explorar dados
pnpm db:generate              # Gerar tipos

# Deploy
pnpm run prepush              # Build + testes (obrigatório antes de push)
pnpm run vercel:deploy        # Deploy para Vercel (dev)
\`\`\`

## Debugging

### Logs
- Agentes usam console.log (visível em terminal dev)
- Produção: OpenTelemetry → Vercel Logs

### Network
- Abrir DevTools → Network → ver chamadas /api/chat

### State
- Usar React DevTools para inspecionar props/state

### AI SDK
- Ativar verbose logging:
  \`\`\`typescript
  const response = await generateText({
    ...config,
    onChunk: (chunk) => console.log("Chunk:", chunk),
  });
  \`\`\`
```

**Responsável:** Dev
**Esforço:** 2-3 horas
**Saída:** `docs/DESENVOLVIMENTO.md` com estrutura, padrões, debugging

---

## Timeline Resumida

```
Semana 1:
  Mon-Tue   → Fase 1 (análise next-auth, react-data-grid, bundle)
  Wed-Thu   → Fase 2 (documentar Redis, MCP, atualizar README)
  Fri       → Revisão

Semana 2:
  Mon-Tue   → Fase 3 (refatorar scripts)
  Wed-Fri   → Fase 4 (docs/ARCHITECTURE.md, /DESENVOLVIMENTO.md)

Semana 3-4:
  Se decidir fazer E2E tests → Smoke tests por agente
  Se decidir migrar xlsx   → Auditar uso, testar exceljs
```

---

## Próximos Passos

1. **Hoje:** Revisar este plano com time
2. **Amanhã:** Começar Fase 1 (análise de dependências)
3. **Esta semana:** Fase 2 concluída (documentação core)
4. **Próximas 3 semanas:** Fases 3-4 (scripts e arquitetura)

Quer que eu comece por qual fase? Recomendo começar com **Fase 1** (análise rápida) para tomar decisões sobre upgrades.
