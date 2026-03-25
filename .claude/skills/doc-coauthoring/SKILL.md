---
name: doc-coauthoring
description: Co-autoria de peças jurídicas no fluxo AssistJur. Use para redigir ou revisar contestações, recursos (RO/RR) e relatórios aplicando os 6 Gates de validação e os 7 Princípios Invioláveis do Playbook v9.0.
disable-model-invocation: true
allowed-tools: Read, Bash(pnpm run db:*)
---

Fluxo de co-autoria em 3 estágios para peças jurídicas trabalhistas (perspectiva da Reclamada).

## Alvo e contexto
$ARGUMENTS (ex: `contestacao RTT-2345/2026`, `RO recurso ordinário processo X`, `relatorio-master processo Y`)

---

## Estágio 1 — Context Gathering (coleta de contexto)

### 1.1 Identificar tipo de peça
- **Contestação** → agente Redator de Contestações (`lib/ai/agent-redator-contestacao.ts`)
- **Revisão de defesa** → agente Revisor de Defesas (`lib/ai/agent-revisor-defesas.ts`)
- **Relatório processual** → AssistJur Master M01-M04 (`lib/ai/agent-assistjur-master.ts`)
- **Recurso (RO/RR)** → Revisor de Defesas com escopo recursal (Tipo D)

### 1.2 Localizar documentos do processo
Verificar se o processo já está cadastrado e se há documentos carregados:
- PDFs do PJe (petição inicial, sentença, cálculos)
- Planilhas de verbas
- Knowledge base do escritório

### 1.3 Checklist de entrada (obrigatório antes de redigir)

| Item | Verificado |
|------|-----------|
| Polo passivo (Reclamada) identificado | ☐ |
| Pedidos da inicial mapeados | ☐ |
| Valor da causa | ☐ |
| Teses de defesa disponíveis (banco-teses-redator) | ☐ |
| Documentos anexos relevantes | ☐ |
| Prazo de resposta | ☐ |

Se algum item crítico estiver ausente, **reportar ao usuário antes de continuar**.

---

## Estágio 2 — Drafting & Refinement (redação e refinamento)

### 2.1 Estrutura padrão da contestação trabalhista

```
I.    PRELIMINARES (ilegitimidade, inépcia, prescrição)
II.   DA IMPUGNAÇÃO AOS FATOS
III.  DAS TESES DE DEFESA (por pedido)
IV.   DOS PEDIDOS
V.    DO VALOR DA CAUSA (se contestado)
```

### 2.2 Os 6 Gates de validação — aplicar em sequência

**Gate 1 — Identificação de partes e pedidos**
- Reclamante identificado com CPF/CNPJ?
- Todos os pedidos da inicial estão mapeados?
- Há pedidos implícitos não declarados?

**Gate 2 — Rastreabilidade das teses**
- Cada tese tem referência a documento ou jurisprudência específica?
- Fonte = documento processual, banco de teses, ou legislação?
- Evitar afirmações sem âncora documental

**Gate 3 — Consistência interna**
- Datas são coerentes (admissão → rescisão → pedidos)?
- Valores impugnados são plausíveis com o contrato de trabalho?
- Contradições internas entre seções?

**Gate 4 — Completude**
- Todos os pedidos da inicial foram contestados?
- Preliminares aplicáveis foram arguidas?
- Documentos probatórios relevantes foram arrolados?

**Gate 5 — Anti-alucinação**
- Nenhuma data, valor ou nome foi inferido sem documento-fonte?
- Campos ausentes estão marcados como `[NÃO LOCALIZADO]` e não preenchidos?
- Jurisprudência citada é real e acessível?

**Gate 6 — Revisão final**
- Linguagem jurídica formal e objetiva?
- Sem repetições desnecessárias?
- Formato ABNT + numeração sequencial?

### 2.3 Princípios Invioláveis aplicados à redação

- **Melhor vazio que inventado:** campo não localizado = `[NÃO LOCALIZADO]`, nunca inventar
- **Rastreabilidade tripla:** cada fato deve ter (1) nº página no PDF, (2) trecho literal, (3) documento-fonte
- **Precedência de título:** Sentença > Acórdão > Ata > Cálculos > Contestação > Inicial
- **Zero alucinação:** confiança < 0.998 em campo crítico → FLAG para revisão humana

---

## Estágio 3 — Reader Testing (validação com leitor fresco)

Simular o ponto de vista de:

### 3.1 O juiz como leitor
- A peça é compreensível sem contexto externo?
- Os pedidos de improcedência estão claros e fundamentados?
- Há risco de interpretação contrária à Reclamada?

### 3.2 O advogado revisando antes de protocolar
- Alguma tese pode ser usada contra a Reclamada?
- Há admissões implícitas de fatos alegados?
- A peça está completa para protocolo no PJe?

### 3.3 O auditor pós-sentença
- Se a sentença for desfavorável, quais teses podem embasar recurso?
- Os pedidos subsidiários estão preservados?

---

## Entregável

Ao concluir, reportar:
- **Status dos 6 Gates** (✅ / ⚠️ / ❌ para cada)
- **Itens pendentes** (documentos faltantes, campos `[NÃO LOCALIZADO]`)
- **Teses utilizadas** (referências ao banco de teses)
- **Recomendação de ação:** pronto para protocolo / requer revisão humana / falta documento X
