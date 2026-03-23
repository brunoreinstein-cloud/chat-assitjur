import { readFileSync } from "node:fs";
import { extractText } from "unpdf";

const pdfPath =
  process.argv[2] || "G:/Meu Drive/AssistJur/1000650-10.2019.5.02.0446.pdf";
const start = Date.now();
const buf = readFileSync(pdfPath);
console.log("File size:", (buf.length / 1024 / 1024).toFixed(1), "MB");

const r = await extractText(new Uint8Array(buf), { mergePages: false });
const pages = r.text;
const total = pages.length;
const elapsed = Date.now() - start;
console.log("Total pages:", total, "- Extraction time:", `${elapsed}ms`);
console.log(
  "Total chars:",
  pages.reduce((a, p) => a + p.length, 0)
);

// Show sampled pages
const samples = [
  [0, "PAGE 1"],
  [1, "PAGE 2"],
  [Math.floor(total * 0.1), "10%"],
  [Math.floor(total * 0.25), "25%"],
  [Math.floor(total * 0.5), "50%"],
  [Math.floor(total * 0.75), "75%"],
  [total - 2, "LAST-2"],
  [total - 1, "LAST"],
];

for (const [i, lbl] of samples) {
  const p = pages[i];
  if (!p) {
    continue;
  }
  console.log(`\n=== ${lbl} (pg ${i + 1}/${total}) [${p.length} chars] ===`);
  console.log(p.slice(0, 500).replace(/\n/g, " | "));
}
