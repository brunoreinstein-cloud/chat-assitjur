/**
 * scripts/test-pdf-optimizer.ts
 *
 * Testa o PDF optimizer com um PDF real ou sintético.
 *
 * Uso:
 *   npx tsx scripts/test-pdf-optimizer.ts                    # gera PDF sintético
 *   npx tsx scripts/test-pdf-optimizer.ts caminho/para.pdf   # usa PDF existente
 */

import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

import { optimizePdfBuffer } from "../lib/pdf/pdf-optimizer";

// Forçar logs de dev
(process.env as Record<string, string>).NODE_ENV = "development";

async function createSyntheticPdf(targetSizeKB: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pageCount = Math.max(10, Math.ceil(targetSizeKB / 50));

  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595, 842]); // A4
    // Texto denso para gerar peso
    const lines = Array.from(
      { length: 40 },
      (_, j) =>
        `[Página ${i + 1}] Linha ${j + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Processo nº 0001234-56.2023.5.02.0001.`
    );
    let y = 800;
    for (const line of lines) {
      page.drawText(line, { x: 30, y, size: 7, font, color: rgb(0, 0, 0) });
      y -= 12;
      if (y < 30) {
        break;
      }
    }
    // Metadados pesados para testar limpeza
    doc.setTitle("Processo Trabalhista - Teste de Otimização - ".repeat(20));
    doc.setAuthor("Autor Teste ".repeat(50));
    doc.setSubject(
      "Assunto muito longo para testar remoção de metadados ".repeat(30)
    );
    doc.setKeywords(Array.from({ length: 100 }, (_, k) => `keyword-${k}`));
    doc.setProducer("Producer muito longo ".repeat(30));
    doc.setCreator("Creator muito longo ".repeat(30));
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function printResult(
  label: string,
  result: Awaited<ReturnType<typeof optimizePdfBuffer>>
) {
  const fmtKB = (b: number) => `${(b / 1024).toFixed(1)} KB`;
  const fmtMB = (b: number) => `${(b / (1024 * 1024)).toFixed(1)} MB`;
  const fmt = (b: number) => (b > 1024 * 1024 ? fmtMB(b) : fmtKB(b));

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"═".repeat(60)}`);
  console.log(
    `  Sucesso:    ${result.success ? "✓" : "✗"} ${result.error ?? ""}`
  );
  console.log(`  Método:     ${result.method}`);
  console.log(`  Antes:      ${fmt(result.sizeBefore)}`);
  console.log(`  Depois:     ${fmt(result.sizeAfter)}`);
  console.log(`  Redução:    ${result.reductionPercent}%`);
  console.log(`  Tempo:      ${result.durationMs}ms`);
  console.log(`${"─".repeat(60)}`);
}

async function main() {
  const pdfPath = process.argv[2];

  console.log("\n🧪 Teste do PDF Optimizer (pure-JS)\n");

  // ── Teste 1: PDF pequeno (deve dar skip) ─────────────────────
  console.log("📋 Teste 1: PDF pequeno (< 500 KB) → deve dar skip");
  const smallPdf = await createSyntheticPdf(100); // ~100 KB
  console.log(`   Gerado: ${(smallPdf.length / 1024).toFixed(1)} KB`);
  const r1 = await optimizePdfBuffer(smallPdf, "pequeno.pdf");
  printResult("PDF Pequeno (skip esperado)", r1);
  console.assert(r1.method === "skip", "Esperado: skip");

  // ── Teste 2: PDF médio sintético (passo 1: resave) ──────────
  console.log("\n📋 Teste 2: PDF médio sintético → passo 1 (resave)");
  const mediumPdf = await createSyntheticPdf(800); // ~800 KB
  console.log(`   Gerado: ${(mediumPdf.length / 1024).toFixed(1)} KB`);
  const r2 = await optimizePdfBuffer(mediumPdf, "medio.pdf");
  printResult("PDF Médio (resave esperado)", r2);

  // ── Teste 3: PDF grande sintético (pode ir ao passo 2) ──────
  console.log("\n📋 Teste 3: PDF grande sintético → passo 1 ou 2");
  const largePdf = await createSyntheticPdf(3000); // ~3 MB
  console.log(`   Gerado: ${(largePdf.length / 1024).toFixed(1)} KB`);
  const r3 = await optimizePdfBuffer(largePdf, "grande.pdf", { mode: "ebook" });
  printResult("PDF Grande", r3);

  // ── Teste 4: Todos os presets ────────────────────────────────
  console.log(
    "\n📋 Teste 4: Comparação de presets (screen vs ebook vs printer)"
  );
  const testBuffer = largePdf;
  for (const mode of ["screen", "ebook", "printer"] as const) {
    const r = await optimizePdfBuffer(testBuffer, `preset-${mode}.pdf`, {
      mode,
    });
    printResult(`Preset: ${mode}`, r);
  }

  // ── Teste 5: PDF real (se fornecido) ────────────────────────
  if (pdfPath) {
    console.log(`\n📋 Teste 5: PDF real → ${pdfPath}`);
    try {
      const realPdf = readFileSync(pdfPath);
      console.log(
        `   Tamanho: ${(realPdf.length / (1024 * 1024)).toFixed(1)} MB`
      );
      const r5 = await optimizePdfBuffer(
        Buffer.from(realPdf),
        pdfPath.split(/[\\/]/).pop() ?? "real.pdf"
      );
      printResult("PDF Real", r5);

      // Salvar resultado para inspeção visual
      if (r5.success && r5.reductionPercent > 0) {
        const outPath = pdfPath.replace(/\.pdf$/i, "-otimizado.pdf");
        writeFileSync(outPath, r5.outputBuffer);
        console.log(`\n   💾 PDF otimizado salvo em: ${outPath}`);
        console.log("   Abra ambos para comparar qualidade visual.");
      }
    } catch (err) {
      console.error(
        `   ✗ Erro ao ler PDF: ${err instanceof Error ? err.message : err}`
      );
    }
  } else {
    console.log(
      "\n💡 Dica: passe um PDF real como argumento para testar com dados reais:"
    );
    console.log(
      "   npx tsx scripts/test-pdf-optimizer.ts caminho/para/documento.pdf\n"
    );
  }

  console.log("\n✅ Testes concluídos.\n");
}

main().catch(console.error);
