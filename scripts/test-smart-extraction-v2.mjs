/**
 * Testa a lógica ACTUALIZADA de buildSmartDocumentContext com B2+B3 fixes.
 * Usa o mesmo algoritmo do ficheiro TypeScript editado (não a cópia inline antiga).
 */

import { readFileSync } from "node:fs";
import { extractText } from "unpdf";

// --------- helper functions (igual ao TS actualizado) ---------
const PAGE_MARKER_RE_GLOBAL = /\[Pag\.\s*\d+\]/g;
const PAGE_MARKER_RE_CAPTURE = /\[Pag\.\s*(\d+)\]/;

function isSignaturePage(t) {
  return (
    t.length < 300 &&
    (t.includes("Assinado eletronicamente") ||
      t.includes("Assinatura Digital") ||
      (t.includes("COMPROVANTE DE ENVIO") && t.length < 600))
  );
}

function splitIntoPagedChunks(text) {
  const markers = [];
  for (const match of text.matchAll(PAGE_MARKER_RE_GLOBAL)) {
    if (match.index === undefined) {
      continue;
    }
    const n = match[0].match(PAGE_MARKER_RE_CAPTURE);
    if (n) {
      markers.push({ index: match.index, pageNum: Number.parseInt(n[1], 10) });
    }
  }
  if (!markers.length) {
    return [];
  }
  const pages = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index;
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
    pages.push({ pageNum: markers[i].pageNum, text: text.slice(start, end) });
  }
  return pages;
}

const KEY_SECTION_KEYWORDS = [
  {
    keywords: ["SENTENÇA", "EM NOME DA REPÚBLICA", "DISPOSITIVO"],
    label: "SENTENÇA",
  },
  {
    keywords: ["ACÓRDÃO", "ACORDÃO", "VISTOS, RELATADOS E DISCUTIDOS"],
    label: "ACÓRDÃO",
  },
  { keywords: ["CONTESTAÇÃO", "CONTESTACAO"], label: "CONTESTAÇÃO" },
  { keywords: ["LAUDO PERICIAL", "LAUDO DE PERÍCIA"], label: "LAUDO PERICIAL" },
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
];

const TITLE_AREA_CHARS = 500; // B2 fix

function buildSmartDocumentContextV2(text, maxChars) {
  if (text.length <= maxChars) {
    return text;
  }
  const pages = splitIntoPagedChunks(text);
  if (!pages.length) {
    return text.slice(0, maxChars);
  }

  const contentPages = pages.filter((p) => !isSignaturePage(p.text));
  const filteredCount = pages.length - contentPages.length;

  const indexBudget = Math.min(9000, Math.floor(maxChars * 0.1));
  const headBudget = Math.floor(maxChars * 0.42);
  const sectionsBudget = maxChars - indexBudget - headBudget;

  const headPages = [];
  let headChars = 0;
  for (const page of contentPages) {
    if (headChars + page.text.length > headBudget) {
      break;
    }
    headPages.push(page);
    headChars += page.text.length;
  }
  const headMaxPageNum = headPages.length ? headPages.at(-1).pageNum : 0;

  const indexPages = contentPages.slice(-3);
  let indexText = indexPages.map((p) => p.text).join("");
  if (indexText.length > indexBudget) {
    indexText = indexText.slice(0, indexBudget);
  }
  const indexStartPageNum = indexPages.length ? indexPages[0].pageNum : 0;

  const headPageNums = new Set(headPages.map((p) => p.pageNum));
  const indexPageNums = new Set(indexPages.map((p) => p.pageNum));
  const middlePages = contentPages.filter(
    (p) => !(headPageNums.has(p.pageNum) || indexPageNums.has(p.pageNum))
  );

  const sections = [];
  let sectionCharsUsed = 0;
  const perSectionBudget = Math.min(
    10_000,
    Math.floor(sectionsBudget / KEY_SECTION_KEYWORDS.length)
  );

  // B3: track extracted pages to avoid duplicates
  const extractedPageNums = new Set();

  for (const { keywords, label } of KEY_SECTION_KEYWORDS) {
    if (sectionCharsUsed >= sectionsBudget) {
      break;
    }

    // B2: only match keyword in first TITLE_AREA_CHARS chars; B3: skip already-extracted pages
    let foundIdx = -1;
    for (let i = 0; i < middlePages.length; i++) {
      if (extractedPageNums.has(middlePages[i].pageNum)) {
        continue; // B3
      }
      const titleArea = middlePages[i].text
        .slice(0, TITLE_AREA_CHARS)
        .toUpperCase();
      if (keywords.some((kw) => titleArea.includes(kw))) {
        foundIdx = i;
        break;
      }
    }
    if (foundIdx === -1) {
      continue;
    }

    const budget = Math.min(
      perSectionBudget,
      sectionsBudget - sectionCharsUsed
    );
    const extracted = [];
    let extractedChars = 0;
    for (
      let i = foundIdx;
      i < Math.min(middlePages.length, foundIdx + 15);
      i++
    ) {
      const page = middlePages[i];
      if (extractedPageNums.has(page.pageNum)) {
        continue; // B3
      }
      if (extractedChars + page.text.length > budget) {
        break;
      }
      extracted.push(page.text);
      extractedPageNums.add(page.pageNum); // B3
      extractedChars += page.text.length;
    }
    if (extracted.length) {
      sections.push({
        label,
        pageNum: middlePages[foundIdx].pageNum,
        text: extracted.join(""),
      });
      sectionCharsUsed += extractedChars;
    }
  }

  const parts = [];
  if (filteredCount > 0) {
    parts.push(
      `[Nota: ${filteredCount} páginas de assinatura eletrónica foram omitidas]\n\n`
    );
  }
  parts.push(headPages.map((p) => p.text).join(""));
  for (const s of sections) {
    parts.push(
      `\n\n[=== SECÇÃO DETECTADA: ${s.label} (a partir de pg. ${s.pageNum}) ===]\n\n`
    );
    parts.push(s.text);
  }
  if (indexText.trim().length > 100 && indexStartPageNum > headMaxPageNum + 5) {
    parts.push(
      `\n\n[=== ÍNDICE CRONOLÓGICO DO PROCESSO (pg. ${indexStartPageNum}+) ===]\n\n`
    );
    parts.push(indexText);
  }
  return parts.join("");
}

// ============================================================
const MAX_CHARS = 92_000; // também teste com novo limite
const pdfPath = "G:/Meu Drive/AssistJur/1000650-10.2019.5.02.0446.pdf";

console.log("Extraindo texto do PDF...");
const buf = readFileSync(pdfPath);
const r = await extractText(new Uint8Array(buf), { mergePages: false });
const fullText = r.text.map((p, i) => `[Pag. ${i + 1}]\n${p}`).join("\n");
console.log(
  `Total: ${r.text.length} páginas, ${fullText.length.toLocaleString()} chars\n`
);

// --- DEBUG: mostrar primeiros 500 chars das páginas problemáticas ---
console.log("=== DEBUG: title area das páginas 148-156 ===");
const pages = [];
for (const match of fullText.matchAll(/\[Pag\.\s*\d+\]/g)) {
  const n = match[0].match(/\[Pag\.\s*(\d+)\]/);
  if (n) {
    pages.push({ index: match.index, pageNum: Number.parseInt(n[1], 10) });
  }
}
for (let i = 0; i < pages.length; i++) {
  const pn = pages[i].pageNum;
  if (pn < 148 || pn > 156) {
    continue;
  }
  const end = i + 1 < pages.length ? pages[i + 1].index : fullText.length;
  const text = fullText.slice(pages[i].index, end);
  const titleArea = text.slice(0, 500).toUpperCase();
  const found = KEY_SECTION_KEYWORDS.filter((k) =>
    k.keywords.some((kw) => titleArea.includes(kw))
  ).map((k) => k.label);
  console.log(
    `  Pg ${pn}: ${found.length ? `✓ ${found.join(", ")}` : "✗ (sem match no title area)"} | preview: ${text.slice(0, 80).replace(/\n/g, " ")}`
  );
}
console.log();

// --- Resultado com algoritmo actualizado ---
const after = buildSmartDocumentContextV2(fullText, MAX_CHARS);
console.log("=== ACTUALIZADO (92K chars, B2+B3 fix) ===");
console.log(
  `Total chars: ${after.length.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`
);

const sectionHeaders = [...after.matchAll(/\[=== (.*?) ===\]/g)];
console.log(`\nSecções incluídas (${sectionHeaders.length}):`);
for (const m of sectionHeaders) {
  console.log("  ✓", m[1]);
}

const uniquePages = [
  ...new Set(
    [...after.matchAll(/\[Pag\. (\d+)\]/g)].map((m) =>
      Number.parseInt(m[1], 10)
    )
  ),
].sort((a, b) => a - b);
console.log(
  `\nPáginas no contexto: ${uniquePages.length} páginas, range pg. ${uniquePages[0]}-${uniquePages.at(-1)}`
);

// mostrar preview de cada secção
const lines = after.split("\n");
let inSection = false,
  lineCount = 0;
for (const line of lines) {
  if (line.includes("[=== ") && line.includes(" ===]")) {
    console.log(`\n${line}`);
    inSection = true;
    lineCount = 0;
  } else if (inSection && lineCount < 4 && line.trim()) {
    console.log(`  ${line.slice(0, 120)}`);
    lineCount++;
    if (lineCount === 4) {
      console.log("  ...");
      inSection = false;
    }
  }
}
