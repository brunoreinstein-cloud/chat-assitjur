import { readFileSync } from "node:fs";
import { extractText } from "unpdf";

const buf = readFileSync(
  "G:/Meu Drive/AssistJur/1000650-10.2019.5.02.0446.pdf"
);
const r = await extractText(new Uint8Array(buf), { mergePages: false });
const pages = r.text;
const total = pages.length;

// Stats
let emptyPages = 0,
  signaturePages = 0,
  shortPages = 0;
const sectionMarkers = [];

const KEYWORDS = [
  "SENTENÇA",
  "ACÓRDÃO",
  "DECISÃO",
  "PETIÇÃO INICIAL",
  "CONTESTAÇÃO",
  "LAUDO PERICIAL",
  "CÁLCULO",
  "RECURSO ORDINÁRIO",
  "EMBARGOS",
  "SUMÁRIO",
  "ÍNDICE",
  "DISPOSITIVO",
  "AUDIÊNCIA",
];

pages.forEach((p, i) => {
  if (p.length === 0) {
    emptyPages++;
    return;
  }
  if (p.length < 200 && p.includes("Assinado eletronicamente")) {
    signaturePages++;
    return;
  }
  if (p.length < 400) {
    shortPages++;
  }

  for (const kw of KEYWORDS) {
    if (p.toUpperCase().includes(kw)) {
      sectionMarkers.push({
        page: i + 1,
        keyword: kw,
        snippet: p.slice(0, 150).replace(/\n/g, " "),
      });
    }
  }
});

console.log("=== DIAGNÓSTICO DO PDF ===");
console.log(`Total páginas: ${total}`);
console.log(`Páginas vazias: ${emptyPages}`);
console.log(`Páginas de assinatura (<200 chars): ${signaturePages}`);
console.log(`Páginas curtas (<400 chars): ${shortPages}`);
console.log(
  `Páginas com conteúdo real: ${total - emptyPages - signaturePages}`
);
console.log(
  `\nChars totais: ${pages.reduce((a, p) => a + p.length, 0).toLocaleString()}`
);
console.log(
  `Avg chars/página: ${Math.round(pages.reduce((a, p) => a + p.length, 0) / total)}`
);

console.log("\n=== SECÇÕES ENCONTRADAS ===");
// Show first occurrence of each keyword
const seen = new Set();
for (const m of sectionMarkers) {
  if (!seen.has(m.keyword)) {
    seen.add(m.keyword);
    console.log(`[pg ${m.page}] ${m.keyword}: ${m.snippet}`);
  }
}

console.log("\n=== DISTRIBUIÇÃO POR FAIXA ===");
const ranges = [
  [1, 100],
  [101, 300],
  [301, 600],
  [601, 900],
  [901, 1200],
  [1201, 1500],
  [1501, 1868],
];
for (const [start, end] of ranges) {
  const slice = pages.slice(start - 1, end);
  const chars = slice.reduce((a, p) => a + p.length, 0);
  const sigPages = slice.filter(
    (p) => p.length < 200 && p.includes("Assinado")
  ).length;
  console.log(
    `  Pgs ${start}-${end}: ${chars.toLocaleString()} chars, ${sigPages} pgs assinatura`
  );
}

// Last 3 pages (usually the index)
console.log("\n=== ÚLTIMAS 3 PÁGINAS (ÍNDICE) ===");
for (let i = total - 3; i < total; i++) {
  console.log(`\n--- Página ${i + 1} [${pages[i].length} chars] ---`);
  console.log(pages[i].slice(0, 800));
}
