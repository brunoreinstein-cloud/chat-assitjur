# Workflow DevKit (useworkflow.dev) — Benefícios e próximos passos

Análise dos benefícios que o [Workflow DevKit](https://useworkflow.dev/) pode trazer ao sistema (chat, Revisor de Defesas, Redator de Contestações) e passos sugeridos para avaliação e eventual adoção.

**Última atualização:** 2026-03-09

---

## 1. O que é o Workflow DevKit

O Workflow DevKit (Vercel) torna funções TypeScript **duráveis e observáveis** com directivas `"use workflow"` e `"use step"`:

- **Workflows** — funções que podem suspender, retomar e manter estado; retries e persistência de estado automáticos.
- **Steps** — unidades de trabalho com retry, replay e observabilidade (traces, logs, métricas).
- **Compatibilidade** — Next.js, Vercel, Express, etc.; mesmo código corre local, Docker ou cloud.
- **AI Agents** — documentação específica para agentes duráveis, streaming a partir de tools, human-in-the-loop, sessões de chat.

Referência: [useworkflow.dev](https://useworkflow.dev/).

---

## 2. Benefícios aplicáveis ao nosso sistema

| Benefício | Aplicação no projeto | Prioridade sugerida |
|-----------|------------------------|---------------------|
| **Workflows duráveis** | O fluxo do Revisor (GATE-1 → FASE A → GATE 0.5 → FASE B → ENTREGA) é hoje orientado por prompt no `streamText`. Poderia ser modelado como workflow durável: cada fase como step; falha num step permite retry sem perder contexto. | Média |
| **Steps com retry automático** | Ferramentas do chat (`createDocument`, `updateDocument`, `getWeather`, etc.) chamadas pelo LLM podem falhar (timeout, rede, BD). Como steps, teriam retry e idempotência configuráveis. | Média |
| **Human-in-the-loop** | O GATE 0.5 (resumo + CONFIRMAR/CORRIGIR) é um ponto de paragem à espera de input humano. O Workflow DevKit documenta padrões de human-in-the-loop (pause, resume, input do utilizador). | Média |
| **Observabilidade** | Traces por execução, replay e “time-travel” por steps ajudam a debugar falhas no fluxo do Revisor ou em tool calls longas. Hoje dependemos de logs e `DEBUG_CHAT`. | Média |
| **Sleep / agendamento** | `sleep("7 days")` sem consumir recursos permite cenários futuros: lembretes (“revisar parecer em X dias”), follow-ups automáticos ou notificações agendadas. Não é prioritário para o MVP atual. | Baixa |
| **Streaming resumível** | O projeto já usa `resumable-stream` e `createResumableStreamContext` no chat. O Workflow DevKit oferece “Resumable Streams” para agentes — avaliar se complementa ou substitui a abordagem atual. | Baixa |
| **Menos “plumbing”** | Evitar filas e retries manuais para operações críticas (ex.: gravar DOCX, chamadas a APIs externas); a directiva compila durabilidade no código. | Geral |

---

## 3. Onde encaixa na arquitetura atual

- **Chat:** `app/(chat)/api/chat/route.ts` — `streamText` com tools, knowledge, agent instructions. Um workflow poderia orquestrar: validação → carregar contexto → streamText (com tools como steps) → persistir mensagens.
- **Revisor:** O fluxo está em `lib/ai/agent-revisor-defesas.ts` (instruções) e nas tools `createRevisorDefesaDocuments`, `createDocument`, `updateDocument`. Os “gates” e fases são lógica no prompt; não há máquina de estados no código. Workflow DevKit permitiria estados explícitos e steps reexecutáveis.
- **Redator de Contestações:** Semelhante: instruções + tools; poderia ganhar durabilidade e retries por step.

---

## 4. Próximos passos (ações sugeridas)

| # | Ação | Detalhe |
|---|------|---------|
| 1 | **Documentação e requisitos** | Ler a doc oficial (Getting Started, Workflows and Steps, AI Agents, Errors & Retrying). Verificar requisitos de runtime (Node, Vercel, limites) e compatibilidade com `streamText` e AI SDK atuais. |
| 2 | **POC mínima** | Criar um workflow simples fora do chat (ex.: função com 2–3 steps, um deles a chamar uma API ou BD) no repo; executar em dev e (se possível) na Vercel. Validar retry, persistência e observabilidade. |
| 3 | **Avaliar integração com o chat** | Se a POC for positiva, desenhar como o POST `/api/chat` poderia iniciar ou continuar um workflow (por exemplo: um step “run streamText” com tools como sub-steps). Avaliar impacto em tempo de resposta, cold start e custos. |
| 4 | **Avaliar fluxo Revisor como workflow** | Especificar o fluxo GATE-1 → FASE A → GATE 0.5 → FASE B como workflow com steps nomeados; identificar onde human-in-the-loop (GATE 0.5) e retries trariam mais valor. Documentar em PROJETO-REVISOR-DEFESAS.md ou SPEC se houver decisão de avançar. |
| 5 | **Decisão de adoção** | Com base na POC e na avaliação: (a) adoptar para novas funcionalidades (ex.: pipelines de pós-processamento), (b) adoptar apenas para o Revisor, ou (c) adiar e rever quando o ecossistema estiver mais maduro (beta). |

---

## 5. Referências

- [Workflow DevKit — useworkflow.dev](https://useworkflow.dev/)
- [Building Durable AI Agents](https://useworkflow.dev/docs/ai-agents/durable-agents) (doc do site)
- [Errors & Retrying](https://useworkflow.dev/docs/foundations/errors-retrying)
- [Human-in-the-Loop](https://useworkflow.dev/docs/ai-agents/human-in-the-loop)
- Projeto: [PROJETO-REVISOR-DEFESAS.md](PROJETO-REVISOR-DEFESAS.md) (fluxo atual), [PLANO-PROXIMOS-PASSOS.md](PLANO-PROXIMOS-PASSOS.md)
