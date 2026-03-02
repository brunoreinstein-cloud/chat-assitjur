# Modelo de custo atual e margem de mercado

Documento de referência para **custo real de LLM** (o que se paga aos providers) e **margem justa** ao precificar créditos para o utilizador. Ajuda a definir conversão créditos → reais e a calibrar preços whitelabel.

**Público:** decisores comerciais e técnicos.  
**Versão:** 1.0 | **Data:** 2025-03

---

## 1. Unidade de consumo no produto

No projeto vigora:

- **1 crédito = 1000 tokens** (input + output somados).
- Fórmula: `creditsConsumed = ceil((promptTokens + completionTokens) / 1000)`.
- Ver `lib/ai/credits.ts` e `docs/SPEC-CREDITOS-LLM.md`.

O custo **para o fornecedor** (Anthropic, OpenAI, etc.) é por token e **diferenciado** (input vs output). O custo **para o utilizador** do produto é, por agora, **por crédito**, sem distinção de modelo na UI (um único “preço por crédito” ou saldo em créditos).

---

## 2. Custo atual por modelo (API dos providers)

Preços em **USD por milhão de tokens** (input / output), conforme documentação pública dos providers. Valores indicativos; confirmar em [Anthropic Pricing](https://docs.anthropic.com/en/docs/about-claude/pricing), [OpenAI Pricing](https://openai.com/api/pricing/), [Google Gemini Pricing](https://ai.google.dev/gemini-api/docs/pricing). O Vercel AI Gateway pode aplicar markup ou planos próprios.

### 2.1 Anthropic (Claude)

| Modelo              | Input (USD/1M tokens) | Output (USD/1M tokens) | Uso no projeto        |
|---------------------|------------------------|------------------------|------------------------|
| Claude Opus 4.5/4.6 | 5,00                   | 25,00                  | Chat (Revisor, Redator)|
| Claude Sonnet 4.5/4.6 | 3,00                 | 15,00                  | Chat                   |
| Claude Haiku 4.5    | 1,00                   | 5,00                   | Chat, artefactos, título|

### 2.2 OpenAI

| Modelo        | Input (USD/1M tokens) | Output (USD/1M tokens) | Uso no projeto |
|---------------|------------------------|------------------------|----------------|
| GPT-4o        | 5,00                   | 15,00                  | Chat (se escolhido) |
| GPT-4.1 mini  | 0,40                   | 1,60                   | Chat (económico)    |

### 2.3 Google (Gemini)

| Modelo           | Input (USD/1M tokens) | Output (USD/1M tokens) | Uso no projeto |
|------------------|------------------------|------------------------|----------------|
| Gemini 2.5 Pro   | ~1,25                  | ~5,00                  | Chat (se escolhido) |
| Gemini 2.5 Flash / Lite | ~0,10–0,25      | ~0,40–1,50             | Título (Flash Lite)  |

### 2.4 Outros

- **xAI (Grok), etc.:** consultar preços no provider. Incluir na mesma lógica (custo por 1M tokens in/out).

---

## 3. Custo médio por crédito (custo “nosso”)

Um **crédito** = 1000 tokens totais (input + output). O custo real depende da **proporção** input/output e do **modelo**.

### 3.1 Mix típico (revisor / chat jurídico)

Para conversas com documentos longos (PI, Contestação, base de conhecimento) e uma resposta do modelo por turno, um mix razoável é:

- **~70% input / 30% output** (ex.: 50k input + 21k output ≈ 71 créditos, fortemente puxado por input).

Fórmula de custo por 1000 tokens (1 crédito), em USD:

`custo_USD_por_crédito = (0,70 × preço_input_por_1M + 0,30 × preço_output_por_1M) / 1000`

### 3.2 Custo por crédito por modelo (USD e BRL)

Taxa de câmbio de referência: **1 USD = 5,80 BRL** (ajustar conforme política da empresa).

| Modelo              | Custo USD/crédito (70/30) | Custo BRL/crédito |
|---------------------|---------------------------|-------------------|
| Claude Opus 4.5     | ~0,011                    | ~0,064            |
| Claude Sonnet 4.5   | ~0,0066                   | ~0,038            |
| Claude Haiku 4.5    | ~0,0022                   | ~0,013            |
| GPT-4o               | ~0,0065                   | ~0,038            |
| GPT-4.1 mini         | ~0,00076                  | ~0,0044           |

*Cálculo exemplo Opus: (0,70×5 + 0,30×25) / 1000 = 11/1000 = 0,011 USD.*

Se o utilizador escolher **sempre** um modelo caro (ex.: Opus), o custo médio por crédito sobe; se escolher Haiku ou mini, desce. Para **um único preço por crédito** no produto, convém usar um **modelo de custo médio ponderado** (ex.: maior parte do uso em Sonnet/Haiku) ou um **teto** por crédito baseado no modelo mais caro.

### 3.3 Custo por “resposta típica” (ex.: 21k tokens)

- 21 058 tokens ≈ **22 créditos** (como no teu exemplo).
- Com **Claude Opus** (custo ~0,011 USD/crédito): 22 × 0,011 ≈ **0,24 USD** (~1,40 BRL).
- Com **Claude Sonnet**: 22 × 0,0066 ≈ **0,15 USD** (~0,87 BRL).
- Com **Claude Haiku**: 22 × 0,0022 ≈ **0,048 USD** (~0,28 BRL).

---

## 4. Margem justa de mercado

### 4.1 Referências de margem

- **Software B2B / SaaS:** margem bruta típica **60–80%** (preço menos custo direto do produto).
- **Uso de API de IA (usage-based):** margens **30–50%** sobre custo de API são comuns para manter preço competitivo e cobrir risco, suporte e infra.
- **Documento de precificação do projeto** (`docs/PRECIFICACAO-WHITELABEL-ESCRITORIOS.md`): recomenda que licença + excedentes cubram custos e deixem **40–60% de margem bruta**.

Para **créditos como unidade de consumo**, um alvo razoável é:

- **Margem bruta sobre custo de LLM:** 40–50%.
- **Preço mínimo por crédito:** custo médio ponderado / (1 − margem).  
  Ex.: se custo médio = 0,006 USD/crédito e margem 50%: preço mínimo ≈ 0,012 USD/crédito (~0,07 BRL/crédito).

### 4.2 Faixa sugerida: preço por crédito em BRL

| Cenário de custo médio | Custo BRL/crédito | Com 40% margem (preço) | Com 50% margem (preço) |
|------------------------|-------------------|--------------------------|--------------------------|
| Maioria Sonnet/Haiku   | ~0,025            | ~0,042 BRL/crédito       | ~0,050 BRL/crédito       |
| Incluir uso Opus       | ~0,045            | ~0,075 BRL/crédito       | ~0,090 BRL/crédito       |
| Conservador (teto Opus)| ~0,064            | ~0,107 BRL/crédito       | ~0,128 BRL/crédito       |

Recomendação prática:

- Definir **um preço por crédito** para o utilizador (ex.: **R$ 0,05 – R$ 0,10 por crédito**), conforme posicionamento (volume vs premium).
- **22 créditos** a R$ 0,07/crédito ≈ **R$ 1,54** “por resposta” na UI; a R$ 0,10/crédito ≈ **R$ 2,20**.
- Opcional: tabela por modelo (ex.: Haiku mais barato, Opus mais caro); exige UI e lógica de preço por modelo.

### 4.3 O que a margem deve cobrir

Além do custo de API LLM:

- Infraestrutura (Vercel, Postgres, Storage).
- Suporte, onboarding e manutenção.
- Risco de variação de câmbio e de preços dos providers.
- Margem para desconto comercial e canais (whitelabel).

---

## 5. Conversão créditos → reais (para o utilizador)

Para mostrar “Esta resposta: X créditos (Y reais)” ou “Custo desta resposta: R$ Z”:

1. **Definir taxa em config:**  
   `PREÇO_BRL_POR_CRÉDITO` (variável de ambiente ou tabela de config).  
   Ex.: `0.07` (R$ 0,07 por crédito).

2. **Cálculo:**  
   `valorBRL = creditsConsumed * PREÇO_BRL_POR_CRÉDITO`.

3. **Exibir na UI:**  
   No componente que mostra “Esta resposta: 22 créditos (21 058 tokens)”, acrescentar “(~R$ 1,54)” quando a config existir.

Assim o “modelo de custo” (secções 2–3) fica interno; o utilizador vê apenas créditos e, opcionalmente, reais com base numa **taxa de venda** definida por ti.

---

## 6. Resumo

| Item | Valor / ação |
|------|------------------|
| **Unidade no produto** | 1 crédito = 1000 tokens (input+output) |
| **Custo real (ex. Opus)** | ~0,011 USD/crédito (~0,064 BRL a 5,80) |
| **Custo real (ex. Sonnet)** | ~0,0066 USD/crédito (~0,038 BRL) |
| **Margem alvo** | 40–50% sobre custo de LLM |
| **Preço sugerido por crédito** | R$ 0,05 – R$ 0,10 (conforme mix de modelos e posicionamento) |
| **Exemplo: 22 créditos** | Custo ~R$ 0,28 (Haiku) a ~R$ 1,40 (Opus); preço sugerido ~R$ 1,10 – R$ 2,20 |

Atualizar este documento quando:

- Os providers alterarem preços.
- A empresa definir taxa de câmbio e preço por crédito em produção.
- Houver novo modelo ou novo uso (ex.: RAG) com impacto no custo médio.
