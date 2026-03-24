# Chatbot — Agentes Jurídicos com IA

Plataforma de chat com **5 agentes de IA** especializados em **contencioso trabalhista**: Assistente Geral, Revisor de Defesas, Redator de Contestações, Avaliador de Contestação e AssistJur.IA Master. Baseada em Next.js e no Vercel AI SDK.

<p align="center">
  <a href="#funcionalidades"><strong>Funcionalidades</strong></a> ·
  <a href="#stack"><strong>Stack</strong></a> ·
  <a href="#provedores-de-modelos"><strong>Provedores de modelos</strong></a> ·
  <a href="#executar-localmente"><strong>Executar localmente</strong></a> ·
  <a href="#deploy"><strong>Deploy</strong></a> ·
  <a href="#documentação"><strong>Documentação</strong></a> ·
  <a href="#agent-skills"><strong>Agent Skills</strong></a>
</p>
<br/>

## Funcionalidades

- **Chat com LLM** — Streaming, histórico de conversas, **5 agentes built-in** especializados em contencioso trabalhista:
  - **Assistente Geral** — assistente de uso geral, memória persistente.
  - **Revisor de Defesas** — auditoria PI + contestação (fluxo GATE-1 → FASE A → GATE 0.5 → FASE B), gera DOCX.
  - **Redator de Contestações** — redação de minuta de contestação (modo Modelo ou modo @bancodetese), aprovação HITL, gera DOCX.
  - **Avaliador de Contestação** — avaliação de qualidade da contestação, gera relatório DOCX.
  - **AssistJur.IA Master** — agente master com pipeline multi-chamadas para PDFs grandes, gera DOCX/XLSX/JSON + ZIP.
- **Base de conhecimento** — Documentos (teses, precedentes, cláusulas) associados ao utilizador, injetados no contexto do chat; suporte a modo @bancodetese no Redator de Contestações.
- **Ferramentas** — Criar/atualizar documentos, sugestões, memória persistente, human-in-the-loop (aprovação), pipeline multi-chamadas, MCP (Model Context Protocol).
- **Tracking de processos** — Tabelas `Processo` e `TaskExecution` para rastreio de chamados trabalhistas (intake, auditoria de tarefas).
- **Autenticação** — Auth.js (NextAuth) v5; **modo visitante (guest)** para usar o chat sem conta.
- **Upload de ficheiros** — Vercel Blob ou Supabase Storage; suporte a PDF, DOCX, XLSX no chat (extração server-side).
- **Ajuda** — `/ajuda`: guia das funcionalidades (agentes, base de conhecimento, créditos, ficheiros, modo visitante).
- **Painel administrativo** — `/admin/agents`: edição de instruções, etiquetas e modelo padrão dos agentes built-in; APIs de créditos LLM (protegidas por chave).
- **Persistência** — PostgreSQL (Supabase/Neon) com Drizzle ORM; histórico de chats, mensagens, processos e execuções.

## Stack

| Área            | Tecnologia |
|-----------------|------------|
| Framework       | Next.js 16 (App Router), React 19 |
| IA              | Vercel AI SDK, AI Gateway (xAI, OpenAI, etc.) |
| Base de dados   | PostgreSQL (Supabase/Neon), Drizzle ORM |
| Auth            | Auth.js (NextAuth) v5 beta |
| Storage         | Vercel Blob ou Supabase Storage |
| Lint/Format     | Ultracite (Biome) |
| Package manager | pnpm |
| Deploy          | Vercel (recomendado) |

## Provedores de modelos

O projeto usa o [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) para aceder a vários modelos (xAI, OpenAI, etc.). A configuração padrão inclui modelos xAI via gateway.

- **Deploy na Vercel:** autenticação via OIDC.
- **Fora da Vercel:** definir `AI_GATEWAY_API_KEY` em `.env.local`.

Com o [AI SDK](https://ai-sdk.dev/docs/introduction) é possível usar outros provedores (OpenAI, Anthropic, etc.) alterando poucas linhas.

## Executar localmente

Usar as variáveis definidas em [`.env.example`](.env.example). Recomendado: Vercel CLI para puxar env (`pnpm run vercel:env`). Ver [docs/vercel-cli.md](docs/vercel-cli.md).

> Não commitar `.env` ou `.env.local` — contêm segredos.

```bash
pnpm install
pnpm db:migrate   # criar/aplicar migrações
pnpm dev
```

A aplicação fica disponível em [http://localhost:3300](http://localhost:3300). O primeiro carregamento em dev pode ser mais lento (Turbopack compila sob pedido); depois fica rápido. Opcional: com o servidor a correr, noutro terminal `pnpm run dev:warmup` para aquecer a cache.

**Outros comandos úteis:** `pnpm run prebuild` (lint + testes unitários), `pnpm build`, `pnpm db:studio` (Drizzle Studio), `pnpm run format`, `pnpm run lint`. Ver [AGENTS.md](AGENTS.md#comandos-úteis).

## Deploy

Deploy recomendado na [Vercel](https://vercel.com). Checklist e variáveis em [docs/vercel-setup.md](docs/vercel-setup.md) e [docs/vercel-cli.md](docs/vercel-cli.md). Antes do push: `pnpm run prepush` (build completo).

## Documentação

- **[AGENTS.md](AGENTS.md)** — Guia para agentes de IA: visão do projeto, stack, estrutura, regras, variáveis de ambiente, painel admin, base de conhecimento, comandos.
- **[docs/PROJETO-REVISOR-DEFESAS.md](docs/PROJETO-REVISOR-DEFESAS.md)** — Agente Revisor de Defesas: fluxo (GATE-1 → FASE A → GATE 0.5 → FASE B), entradas/saídas (Doc 1–3), API, base de conhecimento.
- **[docs/AGENTES-IA-PERSONALIZADOS.md](docs/AGENTES-IA-PERSONALIZADOS.md)** — Agentes built-in, instruções customizadas e base de conhecimento.
- **[docs/SPEC-AI-DRIVE-JURIDICO.md](docs/SPEC-AI-DRIVE-JURIDICO.md)** — Especificação do produto AI Drive Jurídico.
- **[docs/SPEC-CREDITOS-LLM.md](docs/SPEC-CREDITOS-LLM.md)** — Créditos LLM e painel administrativo.

## Agent Skills

O projeto usa [Agent Skills](https://skills.sh) em `.agents/skills/` (Next.js, React, AI SDK, Supabase, debugging, revisor-defesas-context, etc.).

- **Listar:** `npx skills list` ou `pnpm run skills:list`
- **Atualizar:** `npx skills update` ou `pnpm run skills:check`
- **Visão geral:** [.agents/README.md](.agents/README.md)
