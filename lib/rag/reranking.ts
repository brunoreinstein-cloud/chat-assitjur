/**
 * Reranking pós-recuperação: diversidade por documento e deduplicação por overlap de texto.
 * Não requer modelo externo — opera sobre os chunks retornados pelo backend de vetores.
 *
 * Algoritmo:
 *  1. Limita chunks por documento fonte (evita que um único doc domine o contexto).
 *  2. Remove chunks com overlap textual alto com chunks já selecionados (Jaccard).
 *
 * Os chunks de entrada devem chegar ordenados do mais para o menos similar (ordem pgvector).
 */

import type { RetrievalChunk } from "./types";

const DEFAULT_MAX_CHUNKS_PER_DOC = 3;
const DEFAULT_TEXT_OVERLAP_THRESHOLD = 0.6; // 60% Jaccard → considerar duplicata

/**
 * Stopwords comuns em português — excluídas da tokenização Jaccard para
 * evitar similaridade inflacionada entre chunks semanticamente distintos.
 */
const PT_STOPWORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "até",
  "com",
  "como",
  "da",
  "das",
  "de",
  "dela",
  "delas",
  "dele",
  "deles",
  "depois",
  "do",
  "dos",
  "e",
  "é",
  "ela",
  "elas",
  "ele",
  "eles",
  "em",
  "entre",
  "era",
  "essa",
  "essas",
  "esse",
  "esses",
  "esta",
  "estas",
  "este",
  "estes",
  "eu",
  "foi",
  "for",
  "foram",
  "há",
  "isso",
  "isto",
  "já",
  "lhe",
  "lhes",
  "mas",
  "me",
  "mesmo",
  "meu",
  "meus",
  "minha",
  "minhas",
  "muito",
  "na",
  "nas",
  "não",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "pela",
  "pelas",
  "pelo",
  "pelos",
  "por",
  "qual",
  "quando",
  "que",
  "se",
  "sem",
  "seu",
  "seus",
  "só",
  "sua",
  "suas",
  "também",
  "te",
  "tem",
  "tendo",
  "ter",
  "tinha",
  "tive",
  "toda",
  "todas",
  "todo",
  "todos",
  "tu",
  "um",
  "uma",
  "umas",
  "uns",
  "você",
  "vocês",
  "vos",
]);

export interface RerankOptions {
  /** Máximo de chunks por documento fonte. Default: 3. */
  maxChunksPerDoc?: number;
  /**
   * Threshold de similaridade Jaccard entre textos (0–1).
   * Chunks com overlap >= threshold são descartados como duplicatas. Default: 0.6.
   */
  textOverlapThreshold?: number;
}

/**
 * Calcula coeficiente de Jaccard entre dois textos (baseado em tokens por espaço).
 * Retorna 0–1; 1 = textos idênticos, 0 = sem palavras em comum.
 */
function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 1 && !PT_STOPWORDS.has(w))
    );
  const setA = tokenize(a);
  const setB = tokenize(b);
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) {
      intersection++;
    }
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Aplica reranking de diversidade sobre os chunks recuperados.
 *
 * @param chunks  Chunks ordenados por similaridade com a query (melhor primeiro).
 * @param opts    Opções de reranking (maxChunksPerDoc, textOverlapThreshold).
 * @returns       Subconjunto dos chunks com maior diversidade (mesma ordem relativa).
 */
export function rerankByDiversity(
  chunks: RetrievalChunk[],
  opts: RerankOptions = {}
): RetrievalChunk[] {
  const maxPerDoc = opts.maxChunksPerDoc ?? DEFAULT_MAX_CHUNKS_PER_DOC;
  const overlapThreshold =
    opts.textOverlapThreshold ?? DEFAULT_TEXT_OVERLAP_THRESHOLD;

  const selected: RetrievalChunk[] = [];
  const docCounts = new Map<string, number>();

  for (const chunk of chunks) {
    // 1. Limite por documento fonte
    const count = docCounts.get(chunk.knowledgeDocumentId) ?? 0;
    if (count >= maxPerDoc) {
      continue;
    }

    // 2. Deduplicação por overlap de texto com chunks já selecionados
    let isDuplicate = false;
    for (const sel of selected) {
      if (jaccardSimilarity(chunk.text, sel.text) >= overlapThreshold) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) {
      continue;
    }

    selected.push(chunk);
    docCounts.set(chunk.knowledgeDocumentId, count + 1);
  }

  return selected;
}
