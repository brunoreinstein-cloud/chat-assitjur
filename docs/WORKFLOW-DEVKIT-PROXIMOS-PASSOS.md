# Workflow DevKit (useworkflow.dev) — Avaliação e Decisão

Análise dos benefícios que o [Workflow DevKit](https://useworkflow.dev/) pode trazer ao sistema (chat, Revisor de Defesas, Redator de Contestações) e decisão sobre adopção.

**Última atualização:** 2026-03-23

> **Decisão actual: adiar.** Produto em beta com API instável e custo de integração alto; o problema de "falha mid-flow" não é um pain point activo. Reavaliar quando sair de beta ou quando surgir um caso concreto de falha no meio do fluxo.

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

## 4. Avaliação de risco/benefício

### Ganho potencial

O fluxo do Revisor (GATE-1 → FASE A → GATE 0.5 → FASE B) é hoje orquestrado por prompt dentro do `streamText`. Workflow DevKit permitiria:

- Cada fase como step explícito com retry automático.
- Estado durável entre fases sem depender do contexto de prompt.
- Human-in-the-loop nativo no GATE 0.5 (pause/resume).

### Por que adiar

| Factor | Detalhe |
|--------|---------|
| **Beta instável** | `useworkflow.dev` é um produto em beta do ecossistema Vercel. A API pode mudar a qualquer momento, invalidando integrações. |
| **Custo de integração alto** | Migrar a orquestração do Revisor de “lógica no prompt” para workflows duráveis exige reescrever a estrutura de agente; não é uma adição incremental. |
| **Sem pain point activo** | O problema de “falha no meio do fluxo” não acontece na prática hoje. O ganho imediato é baixo para o custo envolvido. |
| **Alternativa existente** | O fluxo por prompt funciona e já inclui `resumable-stream`; não há urgência de substituir. |

### Condições para reavaliar

- O produto sair de beta com API estável e garantias de SLA.
- Surgir um caso concreto e recorrente de falha mid-flow no Revisor ou Redator.
- Aparecer um novo cenário (ex.: pipeline de pós-processamento assíncrono) onde workflows duráveis sejam a solução natural.

## 5. Próximos passos (se/quando reavaliar)

Se no futuro as condições acima se verificarem, a sequência recomendada é:

| # | Ação | Detalhe |
|---|------|---------|
| 1 | **POC mínima isolada** | Criar um workflow simples fora do chat (2–3 steps, uma chamada a API ou BD) para validar retry, persistência e observabilidade antes de qualquer integração no repo principal. |
| 2 | **Avaliar integração com o chat** | Se a POC for positiva, desenhar como o POST `/api/chat` poderia iniciar/continuar um workflow; avaliar impacto em cold start e custos. |
| 3 | **Modelar o Revisor como workflow** | Especificar GATE-1 → FASE A → GATE 0.5 → FASE B como workflow com steps nomeados; documentar em PROJETO-REVISOR-DEFESAS.md se houver decisão de avançar. |

---

## 6. Referências

- [Workflow DevKit — useworkflow.dev](https://useworkflow.dev/)
- [Building Durable AI Agents](https://useworkflow.dev/docs/ai-agents/durable-agents) (doc do site)
- [Errors & Retrying](https://useworkflow.dev/docs/foundations/errors-retrying)
- [Human-in-the-Loop](https://useworkflow.dev/docs/ai-agents/human-in-the-loop)
- Projeto: [PROJETO-REVISOR-DEFESAS.md](PROJETO-REVISOR-DEFESAS.md) (fluxo atual), [PLANO-PROXIMOS-PASSOS.md](PLANO-PROXIMOS-PASSOS.md)
