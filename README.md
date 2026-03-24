# Chatbot — Agentes Jurídicos com IA

![Next.js](https://img.shields.io/badge/Next.js-16.1-black)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![Status](https://img.shields.io/badge/Status-Production-brightgreen)
![Docs](https://img.shields.io/badge/Docs-Complete-brightblue)

Plataforma de chat com **5 agentes de IA** especializados em **contencioso trabalhista**: Assistente Geral, Revisor de Defesas, Redator de Contestações, Avaliador de Contestação e AssistJur.IA Master. Baseada em Next.js 16, React 19 e Vercel AI SDK.

<p align="center">
  <a href="#-funcionalidades"><strong>Funcionalidades</strong></a> ·
  <a href="#-stack"><strong>Stack</strong></a> ·
  <a href="#-quick-start"><strong>Quick Start</strong></a> ·
  <a href="#-documentação"><strong>Documentação</strong></a> ·
  <a href="#-deployment"><strong>Deployment</strong></a> ·
  <a href="#-model-context-protocol"><strong>Model Context Protocol</strong></a>
</p>
<br/>

## 🎯 Funcionalidades

| Feature | Descrição | Status |
|---------|-----------|--------|
| **Chat com LLM** | Streaming em tempo real, histórico persistente, 5 agentes especializados | ✅ |
| **Assistente Geral** | Assistência geral em direito do trabalho, memória persistente | ✅ |
| **Revisor de Defesas** | Auditoria 2-fase (GATE-1 → FASE A → GATE 0.5 → FASE B), output DOCX | ✅ |
| **Redator de Contestações** | Minuta automática (Modelo ou @bancodetese), aprovação HITL, DOCX | ✅ |
| **Avaliador de Contestação** | Avaliação de qualidade (score 0-100), relatório DOCX | ✅ |
| **AssistJur Master** | Pipeline multi-chamadas, intake complexos, output DOCX/XLSX/ZIP | ✅ |
| **Base de Conhecimento** | Documentos (teses, jurisprudência, cláusulas) injetados no contexto | ✅ |
| **Tracking de Processos** | Intake e rastreio de processos trabalhistas | ✅ |
| **Upload de Ficheiros** | PDF, DOCX, XLSX; extração OCR automática | ✅ |
| **Autenticação** | NextAuth v5 + modo visitante (guest) | ✅ |
| **RBAC** | Role-based access control (admin, redator, revisor) | ✅ |
| **MCP Pronto** | Integração plug-and-play com Gmail, Drive, Notion, GitHub | 🔄 |
| **Cache LLM** | Redis opcional para reduzir latência e custos | ✅ |
| **Painel Admin** | Editar prompts, labels, modelos; gerenciar créditos | ✅ |
| **Persistência** | PostgreSQL + Drizzle ORM, histórico completo | ✅ |

## 🛠️ Stack

| Área | Tecnologia | Versão |
|------|-----------|--------|
| **Frontend** | React + Next.js (App Router) | 19 / 16.1 |
| **Styling** | Tailwind CSS + Radix UI | 4.2 / 1.4 |
| **AI Orchestration** | Vercel AI SDK | 6.0 |
| **LLM Provider** | Vercel AI Gateway (xAI Grok, OpenAI) | Latest |
| **Database** | PostgreSQL (Supabase ou Neon) + Drizzle ORM | 15+ / 0.34 |
| **Auth** | NextAuth.js (Auth.js) | 5.0-beta.30 |
| **Storage** | Vercel Blob ou Supabase Storage | Latest |
| **Cache** | Redis (optional, Upstash) | Latest |
| **PDF Processing** | unpdf + pdfjs-dist + pdf-lib | 1.4 / 5.5 / 1.17 |
| **Document Gen** | docx + mammoth (DOCX) | 9.6 / 1.11 |
| **OCR** | tesseract.js (lazy-loaded) | 7.0 |
| **Code Highlight** | shiki | 3.23 |
| **Graphs** | @xyflow/react (flowchart visualization) | 12.10 |
| **Lint/Format** | Biome (via Ultracite) | 2.4 |
| **Testing** | Playwright (E2E) + Vitest (unit) | 1.58 / 2.1 |
| **Package Manager** | pnpm | 10.0 |
| **Deploy** | Vercel | Recommended |

## 🚀 Quick Start

```bash
# 1. Instalar dependências
pnpm install

# 2. Configurar ambiente
pnpm run vercel:env
# Ou manualmente: copiar .env.example para .env.local

# 3. Aplicar migrações BD
pnpm run db:migrate

# 4. Iniciar dev server
pnpm dev

# 5. Abrir em browser
# http://localhost:3300
```

**Primeiro load pode ser mais lento (Turbopack compila sob demand).** Depois é rápido. Opcional: `pnpm run dev:warmup` para aquecer cache.

---

## 💾 Cache & Performance

| Feature | Descrição | Status |
|---------|-----------|--------|
| **LLM Response Cache** | Redis (opcional, reduz latência) | ✅ Implementado |
| **Document Cache** | In-memory com TTL (instância Vercel) | ✅ Implementado |
| **DB Connection Pooling** | Supabase pooler (porta 6543) | ✅ Implementado |
| **Lazy Loading** | tesseract.js, katex, @xyflow (sob demand) | ✅ Implementado |
| **Message Limit** | Últimas 80 mensagens por chat (não todo histórico) | ✅ Implementado |

**Latência típica:** 4-40s total (95% é resposta do LLM).

---

## 🔗 Model Context Protocol (MCP)

AssistJur suporta integração com servidores MCP para acesso a ferramentas externas **sem código custom**.

| Servidor | Ferramentas | Status |
|----------|------------|--------|
| **Gmail MCP** | Leitura/envio de e-mails | 🔄 Pronto |
| **Google Drive MCP** | Documentos e petições | 🔄 Pronto |
| **Notion MCP** | Base de conhecimento | 🔄 Pronto |
| **GitHub MCP** | Repositórios de templates | 🔄 Pronto |

**Ativar MCP:** Configurar env vars (`MCP_GMAIL_URL`, `MCP_GMAIL_TOKEN`, etc.) e agentes usam automaticamente.

Ver [docs/MCP.md](docs/MCP.md) para setup completo.

---

## 📚 Documentação

| Doc | Descrição | Audiência |
|-----|-----------|-----------|
| **[AGENTS.md](AGENTS.md)** | Guia de agentes, prompts, instrções | Dev + Product |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | Diagrama 6-layer, decisões de design, fluxos | Tech Lead + Dev |
| **[docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md)** | Setup local, padrões, estrutura de pastas, debugging | Dev |
| **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** | Vercel, Redis, variáveis, troubleshooting | DevOps + Dev |
| **[docs/MCP.md](docs/MCP.md)** | Model Context Protocol, setup, exemplos | Dev + Product |
| **[docs/vercel-cli.md](docs/vercel-cli.md)** | Vercel CLI commands, env sync | Dev |
| **[docs/vercel-setup.md](docs/vercel-setup.md)** | Vercel setup completo, variables, migrations | DevOps |
| **[scripts/README.md](scripts/README.md)** | Scripts one-off (db seed, healthchecks, benchmarks) | Dev |

---

## 🌍 Provedores de Modelos

Usa [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) para aceder a múltiplos provedores:

| Provider | Modelos | Setup |
|----------|---------|-------|
| **xAI (Grok)** | grok-2-latest | OIDC na Vercel |
| **OpenAI** | gpt-4-turbo, gpt-4o | `OPENAI_API_KEY` |
| **Anthropic** | claude-3.5-sonnet | `ANTHROPIC_API_KEY` |

**Setup:**
- **Em Vercel:** OIDC automático
- **Local ou fora da Vercel:** Definir `AI_GATEWAY_API_KEY`

Trocar provider é uma linha de código em `lib/ai/providers.ts`.

---

## 🚢 Deployment

Deploy recomendado em [Vercel](https://vercel.com).

**Checklist antes de push:**
```bash
pnpm run prepush    # lint + testes + build
pnpm run config:check  # verificar variáveis
```

**Deploy:**
```bash
# Preview (branch atual)
pnpm run vercel:deploy

# Production
pnpm run vercel:deploy:prod
```

**Setup completo:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## 🧠 Agent Skills

O projeto usa [Agent Skills](https://skills.sh) para integração com Claude Code.

```bash
# Listar skills
pnpm run skills:list

# Verificar updates
pnpm run skills:check
```

Skills disponíveis: Next.js, React, AI SDK, Supabase, debugging, revisor-defesas-context, etc.

Ver [.agents/README.md](.agents/README.md) para lista completa.

---

## 📋 Referência de Documentação Adicional

| Doc | Descrição |
|-----|-----------|
| [docs/PROJETO-REVISOR-DEFESAS.md](docs/PROJETO-REVISOR-DEFESAS.md) | Fluxo detalhado do Revisor de Defesas |
| [docs/AGENTES-IA-PERSONALIZADOS.md](docs/AGENTES-IA-PERSONALIZADOS.md) | Customização de prompts e labels |
| [docs/SPEC-AI-DRIVE-JURIDICO.md](docs/SPEC-AI-DRIVE-JURIDICO.md) | Especificação funcional do produto |
| [docs/SPEC-CREDITOS-LLM.md](docs/SPEC-CREDITOS-LLM.md) | Sistema de créditos LLM |
| [docs/REVISAO-DEPENDENCIAS-ARQUITETURA.md](docs/REVISAO-DEPENDENCIAS-ARQUITETURA.md) | Análise de dependências e melhorias |
| [docs/PLANO-IMPLEMENTACAO-REVISAO.md](docs/PLANO-IMPLEMENTACAO-REVISAO.md) | Roadmap de 4 semanas |

---

## 🆘 Precisa de Ajuda?

- **Setup local?** Ver [docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md)
- **Deploy para Vercel?** Ver [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Entender arquitetura?** Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Integrar MCP?** Ver [docs/MCP.md](docs/MCP.md)
- **Scripts de utilidade?** Ver [scripts/README.md](scripts/README.md)

---

## 📄 Licença

MIT

---

**Built with ❤️ for legal professionals**
