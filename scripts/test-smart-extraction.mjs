/**
 * Testa o buildSmartDocumentContext com o processo real.
 * Compara o que o agente via antes (primeiros 80K chars) vs. agora (extração inteligente).
 */

import { readFileSync } from "node:fs";
import { extractText } from "unpdf";

// Simula o buildSmartDocumentContext do ficheiro compilado
// (copy inline para não precisar de tsx aqui)
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

function buildSmartDocumentContext(text, maxChars) {
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

  for (const { keywords, label } of KEY_SECTION_KEYWORDS) {
    if (sectionCharsUsed >= sectionsBudget) {
      break;
    }
    let foundIdx = -1;
    for (let i = 0; i < middlePages.length; i++) {
      const upper = middlePages[i].text.toUpperCase();
      if (keywords.some((kw) => upper.includes(kw))) {
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
      if (extractedChars + middlePages[i].text.length > budget) {
        break;
      }
      extracted.push(middlePages[i].text);
      extractedChars += middlePages[i].text.length;
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
const MAX_CHARS = 80_000;
const pdfPath = "G:/Meu Drive/AssistJur/1000650-10.2019.5.02.0446.pdf";

console.log("Extraindo texto do PDF...");
const buf = readFileSync(pdfPath);
const r = await extractText(new Uint8Array(buf), { mergePages: false });
// Adicionar marcadores [Pag. N] como faz o pipeline de extração
const fullText = r.text.map((p, i) => `[Pag. ${i + 1}]\n${p}`).join("\n");

console.log(
  `Total: ${r.text.length} páginas, ${fullText.length.toLocaleString()} chars\n`
);

// --- ANTES: primeiros 80K chars ---
const before = fullText.slice(0, MAX_CHARS);
const beforePages = [...before.matchAll(/\[Pag\. (\d+)\]/g)].map((m) =>
  Number.parseInt(m[1], 10)
);
console.log("=== ANTES (primeiros 80K chars) ===");
console.log(`Abrange páginas: 1 a ${beforePages.at(-1) ?? "?"}`);
console.log(`Primeiras 200 chars: ${before.slice(0, 200).replace(/\n/g, " ")}`);
console.log();

// --- AGORA: extração inteligente ---
const after = buildSmartDocumentContext(fullText, MAX_CHARS);
console.log("=== AGORA (extração inteligente) ===");
console.log(
  `Total chars: ${after.length.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`
);

// Mostrar secções encontradas
const sectionHeaders = [...after.matchAll(/\[=== (.*?) ===\]/g)];
console.log(`\nSecções incluídas (${sectionHeaders.length}):`);
for (const m of sectionHeaders) {
  console.log("  ✓", m[1]);
}

// Mostrar páginas cobertas
const pagesInContext = [...after.matchAll(/\[Pag\. (\d+)\]/g)].map((m) =>
  Number.parseInt(m[1], 10)
);
const uniquePages = [...new Set(pagesInContext)].sort((a, b) => a - b);
console.log(`\nPáginas no contexto: ${uniquePages.length} páginas`);
console.log(`  Range: pg. ${uniquePages[0]} a pg. ${uniquePages.at(-1)}`);

// Mostrar preview de cada secção
const lines = after.split("\n");
let inSection = false;
let _sectionCount = 0;
let lineCount = 0;
for (const line of lines) {
  if (line.includes("[=== ") && line.includes(" ===]")) {
    console.log(`\n${line}`);
    inSection = true;
    _sectionCount++;
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
