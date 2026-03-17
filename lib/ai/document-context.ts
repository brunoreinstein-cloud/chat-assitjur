/**
 * Smart document context extraction for large legal process PDFs (PJe exports).
 *
 * Problem: a PJe export of 1868 pages has 3.1M chars. The naive approach of
 * "take the first 80K chars" only shows pages 1-55 (the Petição Inicial), while
 * the most legally relevant content — Sentença, Contestação, Laudo Pericial — is
 * spread across pages 148, 470, 1200+.
 *
 * Solution: detect page markers ([Pag. N]), filter signature-only pages, and
 * extract a smart budget-split context:
 *   - Head (first ~25 pages): parties, pedidos, initial facts
 *   - Key sections: Sentença, Contestação, Laudo, Recurso, Cálculos
 *   - PJe index (last 3 pages): chronological list of all documents
 */

/** Pattern for [Pag. N] markers inserted by the PDF extraction pipeline. */
const PAGE_MARKER_RE_GLOBAL = /\[Pag\.\s*\d+\]/g;
const PAGE_MARKER_RE_CAPTURE = /\[Pag\.\s*(\d+)\]/;

/** A page is a signature-only page when it's short and purely an e-signature cert. */
function isSignaturePage(pageText: string): boolean {
  return (
    pageText.length < 300 &&
    (pageText.includes("Assinado eletronicamente") ||
      pageText.includes("Assinatura Digital") ||
      (pageText.includes("COMPROVANTE DE ENVIO") && pageText.length < 600))
  );
}

/**
 * Split the document text into pages using [Pag. N] markers.
 * Returns an empty array if no markers are found (non-page-segmented document).
 */
function splitIntoPagedChunks(
  text: string
): Array<{ pageNum: number; text: string }> {
  // Find all marker positions
  const markers: Array<{ index: number; pageNum: number }> = [];
  for (const match of text.matchAll(PAGE_MARKER_RE_GLOBAL)) {
    if (match.index === undefined) continue;
    const numMatch = match[0].match(PAGE_MARKER_RE_CAPTURE);
    if (numMatch) {
      markers.push({ index: match.index, pageNum: parseInt(numMatch[1], 10) });
    }
  }

  if (markers.length === 0) return [];

  const pages: Array<{ pageNum: number; text: string }> = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index;
    const end =
      i + 1 < markers.length ? markers[i + 1].index : text.length;
    pages.push({ pageNum: markers[i].pageNum, text: text.slice(start, end) });
  }
  return pages;
}

/**
 * Section keywords to search for, in priority order.
 * Each entry: { keywords to match, label to show in context header }
 */
const KEY_SECTION_KEYWORDS = [
  {
    keywords: ["SENTENÇA", "EM NOME DA REPÚBLICA", "DISPOSITIVO"],
    label: "SENTENÇA",
  },
  {
    keywords: ["ACÓRDÃO", "ACORDÃO", "VISTOS, RELATADOS E DISCUTIDOS"],
    label: "ACÓRDÃO",
  },
  {
    keywords: ["CONTESTAÇÃO", "CONTESTACAO"],
    label: "CONTESTAÇÃO",
  },
  {
    keywords: ["LAUDO PERICIAL", "LAUDO DE PERÍCIA"],
    label: "LAUDO PERICIAL",
  },
  {
    keywords: [
      "CÁLCULO DE LIQUIDAÇÃO",
      "CONTA DE LIQUIDAÇÃO",
      "PLANILHA DE CÁLCULO",
      "MEMÓRIA DE CÁLCULO",
    ],
    label: "CÁLCULOS",
  },
  {
    keywords: ["RECURSO ORDINÁRIO", "RAZÕES DE RECURSO"],
    label: "RECURSO ORDINÁRIO",
  },
  {
    keywords: ["EMBARGOS DE DECLARAÇÃO", "EMBARGOS À EXECUÇÃO"],
    label: "EMBARGOS",
  },
] as const;

/**
 * Main function: builds a smart context string from a page-segmented document.
 *
 * Budget allocation (for maxChars = 80_000):
 *  - Head  (~40%): pages 1-25 → partes, pedidos, fatos
 *  - Index (~10%): last 3 pages → PJe chronological index
 *  - Key sections (~50%): Sentença, Contestação, Laudo, etc.
 *
 * If the text has no [Pag. N] markers (e.g. DOCX without page stamps), falls
 * back to a simple head+tail truncation.
 */
export function buildSmartDocumentContext(
  text: string,
  maxChars: number,
  documentType?: string
): string {
  // Documents already within budget need no processing
  if (text.length <= maxChars) return text;

  const pages = splitIntoPagedChunks(text);

  // No page markers → fall back to simple truncation (preserve doc type logic)
  if (pages.length === 0) {
    const notice =
      "\n\n[... texto truncado para caber no limite do modelo ...]";
    return text.slice(0, maxChars - notice.length) + notice;
  }

  // --- Filter signature/receipt pages ---
  const contentPages = pages.filter((p) => !isSignaturePage(p.text));
  const filteredCount = pages.length - contentPages.length;

  // --- Budget split ---
  const indexBudget = Math.min(9_000, Math.floor(maxChars * 0.10));
  const headBudget = Math.floor(maxChars * 0.42);
  const sectionsBudget = maxChars - indexBudget - headBudget;

  // --- 1. Head: first N pages that fit in headBudget ---
  const headPages: typeof contentPages = [];
  let headChars = 0;
  for (const page of contentPages) {
    if (headChars + page.text.length > headBudget) break;
    headPages.push(page);
    headChars += page.text.length;
  }
  const headMaxPageNum =
    headPages.length > 0 ? headPages[headPages.length - 1].pageNum : 0;

  // --- 2. PJe index: last 3 content pages (usually the document index) ---
  const indexPages = contentPages.slice(-3);
  let indexText = indexPages.map((p) => p.text).join("");
  if (indexText.length > indexBudget) {
    indexText = indexText.slice(0, indexBudget);
  }
  const indexStartPageNum =
    indexPages.length > 0 ? indexPages[0].pageNum : 0;

  // --- 3. Key sections: search pages between head and index ---
  const headPageNums = new Set(headPages.map((p) => p.pageNum));
  const indexPageNums = new Set(indexPages.map((p) => p.pageNum));
  const middlePages = contentPages.filter(
    (p) => !headPageNums.has(p.pageNum) && !indexPageNums.has(p.pageNum)
  );

  const sections: Array<{ label: string; pageNum: number; text: string }> = [];
  let sectionCharsUsed = 0;
  // Per-section budget: distribute evenly, but cap at reasonable maximum
  const perSectionBudget = Math.min(
    10_000,
    Math.floor(sectionsBudget / KEY_SECTION_KEYWORDS.length)
  );

  for (const { keywords, label } of KEY_SECTION_KEYWORDS) {
    if (sectionCharsUsed >= sectionsBudget) break;

    // Find first middle page matching any keyword
    let foundIdx = -1;
    for (let i = 0; i < middlePages.length; i++) {
      const upper = middlePages[i].text.toUpperCase();
      if (keywords.some((kw) => upper.includes(kw))) {
        foundIdx = i;
        break;
      }
    }
    if (foundIdx === -1) continue;

    // Extract pages from the match point until budget exhausted
    const budget = Math.min(
      perSectionBudget,
      sectionsBudget - sectionCharsUsed
    );
    const extracted: string[] = [];
    let extractedChars = 0;
    for (
      let i = foundIdx;
      i < Math.min(middlePages.length, foundIdx + 15);
      i++
    ) {
      const pageText = middlePages[i].text;
      if (extractedChars + pageText.length > budget) break;
      extracted.push(pageText);
      extractedChars += pageText.length;
    }

    if (extracted.length > 0) {
      sections.push({
        label,
        pageNum: middlePages[foundIdx].pageNum,
        text: extracted.join(""),
      });
      sectionCharsUsed += extractedChars;
    }
  }

  // --- Assemble ---
  const parts: string[] = [];

  if (filteredCount > 0) {
    parts.push(
      `[Nota: ${filteredCount} páginas de assinatura eletrónica foram omitidas automaticamente]\n\n`
    );
  }

  // Head
  parts.push(headPages.map((p) => p.text).join(""));

  // Key sections
  for (const section of sections) {
    parts.push(
      `\n\n[=== SECÇÃO DETECTADA: ${section.label} (a partir de pg. ${section.pageNum}) ===]\n\n`
    );
    parts.push(section.text);
  }

  // PJe index (only if it's well past the head)
  if (indexText.trim().length > 100 && indexStartPageNum > headMaxPageNum + 5) {
    parts.push(
      `\n\n[=== ÍNDICE CRONOLÓGICO DO PROCESSO (pg. ${indexStartPageNum}+) ===]\n\n`
    );
    parts.push(indexText);
  }

  return parts.join("");
}

/**
 * Search for a keyword in a page-segmented document.
 * Returns up to maxResults matches, each with surrounding page context.
 *
 * Used by the `buscarNoProcesso` agent tool.
 */
export function searchInDocumentText(
  text: string,
  query: string,
  maxResults = 5,
  contextPagesEachSide = 2
): Array<{ pageNum: number; snippet: string }> {
  const pages = splitIntoPagedChunks(text);
  if (pages.length === 0) {
    // No page markers — do a plain text search
    const upperText = text.toUpperCase();
    const upperQuery = query.toUpperCase();
    const results: Array<{ pageNum: number; snippet: string }> = [];
    let pos = 0;
    while (results.length < maxResults) {
      const idx = upperText.indexOf(upperQuery, pos);
      if (idx === -1) break;
      const start = Math.max(0, idx - 400);
      const end = Math.min(text.length, idx + 1200);
      results.push({ pageNum: 0, snippet: text.slice(start, end) });
      pos = idx + query.length;
    }
    return results;
  }

  const upperQuery = query.toUpperCase();
  const matchingIndices: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].text.toUpperCase().includes(upperQuery)) {
      matchingIndices.push(i);
    }
    if (matchingIndices.length >= maxResults) break;
  }

  return matchingIndices.map((idx) => {
    const start = Math.max(0, idx - contextPagesEachSide);
    const end = Math.min(pages.length, idx + contextPagesEachSide + 1);
    const snippet = pages.slice(start, end).map((p) => p.text).join("");
    return { pageNum: pages[idx].pageNum, snippet };
  });
}

/**
 * Extract document texts from message parts for use in the search tool.
 * Returns a map of document name → full extracted text.
 */
export function extractDocumentTextsFromParts(
  parts: Array<{ type?: string; name?: string; text?: string }> | undefined
): Map<string, string> {
  const map = new Map<string, string>();
  if (!parts) return map;
  for (const part of parts) {
    if (
      part.type === "document" &&
      typeof part.name === "string" &&
      typeof part.text === "string" &&
      part.text.length > 0
    ) {
      map.set(part.name, part.text);
    }
  }
  return map;
}
