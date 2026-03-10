# Estrutura das instruções dos agentes

Referência para manter consistência entre os agentes built-in (Revisor, Redator, Assistente, Master). **Todos os agentes estão alinhados** ao padrão XML na cabeça das instruções.

---

## Estado atual por agente (alinhado)

| Agente | Ficheiro | Estrutura | Observação |
|--------|----------|-----------|------------|
| **Assistente** | `agent-assistente-geral.ts` | **XML:** `<role>`, `<constraints>`. Sem workflow/output (agente simples). | ✅ Alinhado. |
| **Revisor de Defesas** | `agent-revisor-defesas.ts` | **XML completo:** `<role>`, `<thinking>`, `<workflow>`, `<output_format>`, `<constraints>`, `<examples>`. | Padrão de referência. ✅ Alinhado. |
| **Redator de Contestações** | `agent-redator-contestacao.ts` | **XML na cabeça:** `<role>`, `<thinking>`, `<workflow>`, `<output_format>`, `<constraints>`; depois Markdown (# INSTRUÇÃO CONSOLIDADA, Blocos); final com `<examples>`. | ✅ Alinhado. |
| **AssistJur Master** | `agent-assistjur-master-instructions.md` | **XML no topo:** `<role>`, `<thinking>`, `<workflow>`, `<output_format>`, `<constraints>`; depois # INSTRUÇÃO MASTER e Markdown (PARTE 0, 1…). | ✅ Alinhado. |

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

## Validação dos agentes com ficheiros

As instruções dos agentes built-in (ficheiros em `lib/ai/agent-*.ts` e `agent-*.md`) podem ser **validadas automaticamente** contra esta estrutura.

- **Módulo:** `lib/ai/validate-agents.ts`  
  - `validateAgentInstructions(agentId, instructions)` — valida um bloco de instruções para um agente.  
  - `validateAllBuiltInAgents()` — valida todos os agentes do registry (instruções carregadas dos ficheiros).  
  - Regras: comprimento mínimo/máximo; para **Revisor** exige as tags `<role>`, `<thinking>`, `<workflow>`, `<output_format>`, `<constraints>`, `<examples>`; para **Redator** exige `<role>` e `<constraints>`; para **Assistente** e **Master** aplicam-se avisos de boa prática (escopo, identidade).

- **Testes:** `tests/validate-agents.test.ts`  
  - Garante que todos os agentes built-in passam na validação (sem erros).  
  - Testes específicos por agente (tags XML, escopo PODE/NÃO PODE, instruções vazias ou inválidas).

**Como validar:**

```bash
# Todos os testes unitários (inclui validação dos agentes)
pnpm run test:unit

# Apenas os testes de validação dos agentes
pnpm run test:unit -- tests/validate-agents.test.ts
```

A validação usa as instruções **dos ficheiros** (registry), não os overrides da BD (admin). Para validar após alterar um ficheiro de agente, basta correr os testes acima.

---

## Manutenção

- Ao adicionar novo agente com fluxo (gates/fases), usar os 6 blocos XML na cabeça; o corpo pode ser Markdown longo para detalhe.
- Assistente permanece mínimo (apenas `<role>` e `<constraints>`); sem `<workflow>` nem `<output_format>` por não ter fluxo estruturado.
