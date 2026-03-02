/**
 * Extração inteligente de metadados de documentos via IA.
 * Identifica título, autor(es), tipo de documento e informações-chave a partir do texto extraído.
 */

import { generateText, Output } from "ai";
import { z } from "zod";
import { getTitleModel } from "@/lib/ai/providers";

/** Metadados extraídos pela IA (título, autor, tipo, resumo/info-chave). */
export type ExtractedMetadata = z.infer<typeof METADATA_SCHEMA>;

const METADATA_SCHEMA = z.object({
  title: z
    .string()
    .describe(
      "Título do documento (ex.: nome da peça, do contrato ou do recurso). Máx. 200 caracteres."
    ),
  author: z
    .string()
    .describe(
      "Autor(es) ou parte que assina (ex.: advogado, empresa, órgão). Vazio se não identificado."
    ),
  documentType: z
    .string()
    .describe(
      "Tipo do documento (ex.: Petição Inicial, Contestação, Contrato, Recurso, Parecer, Tese, Jurisprudência, Outro)."
    ),
  keyInfo: z
    .string()
    .describe(
      "Resumo ou informações-chave em 1-3 frases (partes, objeto, data relevante, nº processo se houver). Máx. 500 caracteres."
    ),
});

/** Máximo de caracteres do texto enviado ao LLM (reduz custo e latência). */
const MAX_TEXT_FOR_METADATA = 12_000;

const METADATA_SYSTEM = `És um assistente que extrai metadados de documentos jurídicos e gerais.
Analisa o texto e o nome do ficheiro e devolve em JSON: título (curto e descritivo), autor(es) ou signatário (se identificável), tipo de documento e informações-chave (resumo breve).
Usa português. Se não conseguires identificar um campo, usa string vazia para autor ou "Outro" para tipo.
Para processos trabalhistas: usa exatamente "Petição Inicial" quando for a peça inicial do reclamante, ou "Contestação" quando for a defesa/contestação do reclamado.`;

function buildMetadataPrompt(textSample: string, filename: string): string {
  return `Nome do ficheiro: ${filename}

Amostra do conteúdo:
---
${textSample}
---

Extrai título, autor, tipo de documento e informações-chave.`;
}

/**
 * Extrai metadados (título, autor, tipo, informações-chave) do texto do documento usando IA.
 * Usa apenas uma amostra do texto para limitar tokens. Em caso de falha, retorna null.
 */
export async function extractDocumentMetadata(
  extractedText: string,
  filename: string
): Promise<ExtractedMetadata | null> {
  const trimmed = extractedText.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const textSample =
    trimmed.length > MAX_TEXT_FOR_METADATA
      ? `${trimmed.slice(0, MAX_TEXT_FOR_METADATA)}\n[...]`
      : trimmed;

  const prompt = buildMetadataPrompt(textSample, filename);

  try {
    const { output } = await generateText({
      model: getTitleModel(),
      system: METADATA_SYSTEM,
      prompt,
      output: Output.object({
        schema: METADATA_SCHEMA,
        name: "DocumentMetadata",
        description:
          "Metadados extraídos do documento (título, autor, tipo, informações-chave)",
      }),
    });

    const parsed = METADATA_SCHEMA.safeParse(output);
    if (!parsed.success) {
      return null;
    }

    const d = parsed.data;
    return {
      title:
        d.title.slice(0, 512).trim() ||
        filename
          .replace(/\.[^.]+$/i, "")
          .trim()
          .slice(0, 512),
      author: d.author.slice(0, 256).trim(),
      documentType: d.documentType.slice(0, 128).trim(),
      keyInfo: d.keyInfo.slice(0, 500).trim(),
    };
  } catch {
    return null;
  }
}
