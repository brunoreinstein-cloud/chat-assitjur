# CLAUDE.md — AssistJur

**Fonte da Verdade** do projeto. Documentação compartilhada com o time via git.

## Project Overview

**AssistJur** é uma plataforma de chat com 5 agentes de IA especializados em **contencioso trabalhista**. Stack: Next.js 16, React 19, Vercel AI SDK, PostgreSQL + Drizzle ORM, NextAuth v5.

- **Objetivo:** Auditoria jurídica e redação de contestações assistidas por IA
- **Agentes:** Revisor de Defesas, Redator de Contestações, Avaliador, Assistente Geral, Master
- **Deploy:** Vercel (recomendado) + PostgreSQL (Supabase/Neon) + Redis (Upstash, opcional)

## Quick Start

```bash
pnpm install && pnpm run vercel:env && pnpm run db:migrate && pnpm dev
# Server: http://localhost:3300
```

**Obrigatório em `.env.local`:** `AUTH_SECRET`, `POSTGRES_URL`

## Essential Commands

See @.claude/rules/quick-commands.md for complete list.



## Documentation

See @.claude/rules/patterns.md for coding standards
See @.claude/rules/architecture.md for design decisions
See @.claude/rules/examples.md for common tasks

Full docs in `docs/`:
- ARCHITECTURE.md — 6-layer diagram, design decisions
- DEPLOYMENT.md — Vercel, Redis, env vars
- DESENVOLVIMENTO.md — Setup, patterns, debugging
- MCP.md — Model Context Protocol
- README.md — Product overview

## Auto Memory

This project uses auto memory to accumulate learnings. Claude saves notes on:
- Build/test commands and debugging patterns
- Architecture decisions and code conventions
- Debugging insights and common errors

Memory stored at: `~/.claude/projects/<project>/memory/MEMORY.md`
