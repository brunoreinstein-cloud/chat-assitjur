/**
 * Extração de resumo estruturado para documentos jurídicos trabalhistas.
 * Produz ~8-12k chars de markdown estruturado para PI e Contestação,
 * permitindo que o Revisor analise documentos de qualquer tamanho sem truncamento.
 */

import { generateText } from "ai";
import { getTitleModel } from "@/lib/ai/providers";

/** Máx. chars do início do documento enviados ao LLM. */
const SAMPLE_HEAD_CHARS = 70_000;
/** Chars do final do documento (captura OAB/assinaturas da PI e requerimentos da Contestação). */
const SAMPLE_TAIL_CHARS = 8000;

/** Detecta se o conteúdo é uma Petição Inicial trabalhista. */
function isPeticaoInicial(content: string): boolean {
  const sample = content.slice(0, 3000).toUpperCase();
  return (
    sample.includes("PETIÇÃO INICIAL") ||
    sample.includes("PETICAO INICIAL") ||
    (sample.includes("RECLAMANTE") &&
      sample.includes("RECLAMADA") &&
      sample.includes("EXCELENTÍSSIMO")) ||
    (sample.includes("RECLAMANTE") &&
      sample.includes("RECLAMADA") &&
      sample.includes("EXCELENTISSIMO"))
  );
}

/** Detecta se o conteúdo é uma Contestação trabalhista. */
function isContestacao(content: string): boolean {
  const sample = content.slice(0, 3000).toUpperCase();
  return (
    sample.includes("CONTESTAÇÃO") ||
    sample.includes("CONTESTACAO") ||
    (sample.includes("RECLAMADA") &&
      (sample.includes("IMPUGNA") || sample.includes("CONTESTA")))
  );
}

/** Monta amostra do documento: início + fim para documentos longos. */
function buildSample(content: string): string {
  if (content.length <= SAMPLE_HEAD_CHARS + SAMPLE_TAIL_CHARS) {
    return content;
  }
  const head = content.slice(0, SAMPLE_HEAD_CHARS);
  const tail = content.slice(-SAMPLE_TAIL_CHARS);
  return `${head}\n\n[... trecho intermediário omitido para caber no limite ...]\n\n--- FINAL DO DOCUMENTO (últimos ${SAMPLE_TAIL_CHARS} chars) ---\n${tail}`;
}

const SYSTEM_PI =
  "Você é um extrator de informações jurídicas trabalhistas. Recebe o texto (completo ou amostrado) de uma Petição Inicial e devolve um resumo estruturado em markdown PT-BR. Seja exaustivo nos pedidos — liste TODOS que encontrar. Máx. 12.000 chars.";

const SYSTEM_CONTESTACAO =
  "Você é um extrator de informações jurídicas trabalhistas. Recebe o texto (completo ou amostrado) de uma Contestação e devolve um resumo estruturado em markdown PT-BR. Seja exaustivo nas impugnações — cubra TODOS os pedidos visíveis. Máx. 12.000 chars.";

function buildPromptPI(sample: string): string {
  return `Texto da Petição Inicial:
---
${sample}
---

Extrai e organiza em markdown:

## Petição Inicial — Resumo Estruturado

**PROCESSO:** [número]
**VARA:** [vara/comarca]
**RECLAMANTE:** [nome e função/cargo]
**RECLAMADA:** [razão social]
**ADVOGADA(O) RECLAMANTE:** [nome — OAB/UF nº XXXXXX] (buscar no bloco de assinaturas do corpo do texto; em PDFs PJe NÃO é no final — o final é índice de documentos com hashes)

**DATAS DO CONTRATO:**
- Admissão: [data]
- Término: [data]
- Rescisão: [modalidade]
- Ajuizamento (DAJ): [data]
- Audiência: [data e hora, se visível]

**PEDIDOS (liste TODOS — numerados):**
| # | Verba | Fundamento resumido |
|---|-------|---------------------|
[uma linha por pedido]

**PROVAS/DOCUMENTOS MENCIONADOS:** [lista]

**OBSERVAÇÕES:** [secções não visíveis no texto disponível, se houver]`;
}

function buildPromptContestacao(sample: string): string {
  return `Texto da Contestação:
---
${sample}
---

Extrai e organiza em markdown:

## Contestação — Resumo Estruturado

**DADOS DO CONTRATO (versão da Reclamada):**
- Admissão: [data]
- Término: [data]
- Motivo rescisão: [modalidade alegada]
- Cargo: [cargo]
- Salário: [valor, se mencionado]

**TESES PROCESSUAIS:** [prescrição, incompetência, etc.]

**IMPUGNAÇÕES POR PEDIDO:**
| Pedido | Status | Tese principal (1-2 linhas) |
|--------|--------|-----------------------------|
[uma linha por pedido; Status: Impugnado / Parcial / Impugnação genérica / NÃO VISÍVEL]

**DOCUMENTOS JUNTADOS:** [lista]

**OBSERVAÇÕES:** [secções não visíveis (contestação truncada), se houver]`;
}

/**
 * Extrai resumo estruturado de PI ou Contestação trabalhista.
 * Retorna string markdown (~8-12k chars) ou null se o documento não for PI/Contestação.
 */
export async function extractLegalSummary(
  content: string
): Promise<string | null> {
  const trimmed = content.trim();
  if (trimmed.length < 500) {
    return null;
  }

  const isPI = isPeticaoInicial(trimmed);
  const isCont = !isPI && isContestacao(trimmed);

  if (!(isPI || isCont)) {
    return null;
  }

  const sample = buildSample(trimmed);
  const system = isPI ? SYSTEM_PI : SYSTEM_CONTESTACAO;
  const prompt = isPI ? buildPromptPI(sample) : buildPromptContestacao(sample);

  try {
    const { text } = await generateText({
      model: getTitleModel(),
      system,
      prompt,
      maxOutputTokens: 8000,
    });
    return text.trim() || null;
  } catch {
    return null;
  }
}
