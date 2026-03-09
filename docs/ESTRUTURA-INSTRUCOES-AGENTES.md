# Estrutura das instruções dos agentes

Referência para manter consistência entre os agentes built-in (Revisor, Redator, Assistente, Master).

---

## Estado atual por agente

| Agente | Ficheiro | Estrutura | Observação |
|--------|----------|-----------|------------|
| **Assistente** | `agent-assistente-geral.ts` | Texto corrido (PODE / NÃO PODE). Sem XML, sem blocos. | Propositalmente mínimo; agente leve. ✅ Adequado ao propósito. |
| **Revisor de Defesas** | `agent-revisor-defesas.ts` | **XML completo:** `<role>`, `<thinking>`, `<workflow>`, `<output_format>`, `<constraints>`, `<examples>`. | Padrão de referência (Claude-optimized). ✅ Consistente. |
| **Redator de Contestações** | `agent-redator-contestacao.ts` | **Híbrido:** início com `<role>` + `<constraints>` (XML); corpo em Markdown (# INSTRUÇÃO CONSOLIDADA, ## BLOCO 1…); final com `<examples>`. | Falta `<thinking>`, `<workflow>`, `<output_format>` em XML; fluxo está em Markdown. ⚠️ Misto. |
| **AssistJur Master** | `agent-assistjur-master-instructions.md` | **Só Markdown:** # INSTRUÇÃO MASTER, ## PARTE 0, ### 0.1… Sem tags XML. | Documento longo; muitos módulos. ⚠️ Estilo diferente. |

---

## Padrão recomendado (agentes com fluxo de trabalho)

Para agentes que têm **gates, fases e outputs estruturados** (ex.: Revisor, Redator), usar **XML delimitado** para o modelo interpretar melhor:

1. **`<role>`** — Identidade, siglas, escopo (permitido / proibido).
2. **`<thinking>`** — (Opcional) Chain-of-thought antes de gates/fases.
3. **`<workflow>`** — Gates e fases (ex.: gate_1, fase_a, gate_05, fase_b).
4. **`<output_format>`** — Formato de saída (DOCX, secções, placeholders).
5. **`<constraints>`** — Regras operacionais, anti-alucinação, linguagem.
6. **`<examples>`** — Few-shot (input / analysis / output) quando útil.

**Referência:** `lib/ai/agent-revisor-defesas.ts` (v3.2).

Para agentes **simples** (ex.: Assistente geral): texto ou Markdown curto é suficiente.

Para agentes **muito longos e modulares** (ex.: Master): Markdown com partes numeradas é aceitável, desde que **role, constraints e formato de saída** estejam claros no início ou num bloco dedicado.

---

## Checklist ao criar ou alterar um agente

- [ ] **Identidade e escopo** estão explícitos (role ou equivalente).
- [ ] **Restrições** (anti-alucinação, linguagem, proibições) estão definidas.
- [ ] Se há **fluxo** (gates/fases), está descrito de forma ordenada (workflow ou secção equivalente).
- [ ] **Formato de saída** (documentos, secções, templates) está especificado.
- [ ] **Exemplos** (few-shot) quando o comportamento for crítico.
- [ ] Comentário no topo do ficheiro com **versão** e **resumo** da estrutura (ex.: "Estruturado com XML tags (Claude-optimized)").

---

## Próximos passos (opcionais)

- **Redator:** considerar extrair gates/fluxo para `<workflow>` e resumo de formato para `<output_format>` em XML, mantendo os Blocos em Markdown para detalhe.
- **Master:** manter Markdown; garantir que PARTE 0 (identidade, princípios) e formato de entrega por módulo estejam sempre no início de cada secção relevante.
- **Assistente:** manter como está (instruções curtas).
