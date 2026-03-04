# Benchmark de modelos LLM

Script para comparar **latência**, **tokens** e **custo (créditos)** entre vários modelos com a **mesma pergunta**. Ajuda a escolher o melhor compromisso qualidade/custo para o chat ou para o Revisor de Defesas.

---

## 1. Como executar

Requer **AI_GATEWAY_API_KEY** (ou configuração Vercel) em `.env.local`.

```bash
# Todos os modelos não-reasoning (exceto alguns opcionais)
pnpm run benchmark:llm

# Apenas modelos específicos
pnpm run benchmark:llm -- anthropic/claude-sonnet-4.5 google/gemini-2.5-flash-lite openai/gpt-4.1-mini
```

---

## 2. O que o script faz

1. Envia a **mesma pergunta** a cada modelo.
2. Mede **latência** (tempo até resposta completa).
3. Lê **usage** (input/output tokens) do retorno do AI SDK.
4. Calcula **créditos** com a fórmula do projeto: `ceil(totalTokens / 1000)`.
5. Mostra uma **tabela** e, no fim, uma **pré-visualização** das respostas (primeiros ~80 caracteres) para comparação rápida de qualidade.

Pergunta padrão (jurídica, curta):

> Em uma frase, qual o prazo prescricional bienal na CLT para ações que versem sobre verbas rescisórias? Responde só a pergunta, sem introdução.

Para usar outra pergunta, define a variável de ambiente:

```bash
BENCHMARK_PROMPT="A tua pergunta aqui" pnpm run benchmark:llm
```

---

## 3. Interpretar os resultados

| Coluna    | Significado |
|----------|-------------|
| **Latência** | Tempo em ms até a resposta completa. Menor = mais rápido. |
| **Input**   | Tokens do prompt (pergunta). Sempre igual entre modelos para a mesma pergunta. |
| **Output**  | Tokens da resposta. Pode variar (respostas mais longas = mais custo). |
| **Total**   | Input + Output. |
| **Créditos** | `ceil(total/1000)` — fórmula interna do projeto. Custo real depende do preço por modelo no AI Gateway/fornecedor. |
| **OK**      | ✓ sucesso, ✗ erro (modelo indisponível, quota, rede, etc.). |

- **Melhor latência:** modelo que termina em menos ms.
- **Melhor custo (tokens):** modelo com menos Total (e menos Output, para a mesma pergunta).
- **Qualidade:** comparar a secção “Pré-visualização das respostas” no output; para avaliação mais rigorosa, usar o mesmo prompt em cenários reais (ex.: chat com Revisor de Defesas).

O **custo real** em €/$ depende do preço por token de cada modelo no Vercel AI Gateway ou no fornecedor (Anthropic, Google, OpenAI, xAI). Os “créditos” do script são uma unidade interna do projeto (1 crédito ≈ 1000 tokens); use os totais de tokens para estimar custo nos dashboards dos fornecedores.

---

## 4. Modelos disponíveis

Os IDs usados são os de `lib/ai/models.ts` (catálogo do chat). Por defeito o script usa os **modelos não-reasoning** (compatíveis com tools, ex.: Revisor de Defesas), excluindo alguns opcionais.

Exemplos de IDs:

- `anthropic/claude-haiku-4.5`
- `anthropic/claude-sonnet-4.5`
- `anthropic/claude-sonnet-4.6`
- `google/gemini-2.5-flash-lite`
- `openai/gpt-4.1-mini`
- `xai/grok-4.1-fast-non-reasoning`

Lista completa em `lib/ai/models.ts`.

---

## 5. Ficheiros

| Ficheiro | Descrição |
|----------|-----------|
| `scripts/benchmark-llm.ts` | Script de benchmark (latência, tokens, créditos, pré-visualização). |
| `lib/ai/credits.ts` | `tokensToCredits()` — conversão tokens → créditos. |
| `lib/ai/models.ts` | Catálogo de modelos e `nonReasoningChatModelIds`. |

---

## 6. Ver também

- **Custo e tokens no projeto:** `docs/OTIMIZACAO-CUSTO-TOKENS-LLM.md`
- **Créditos e uso:** `docs/SPEC-CREDITOS-LLM.md`
- **Healthcheck do modelo:** `pnpm run health:ai` (testa um único modelo)
