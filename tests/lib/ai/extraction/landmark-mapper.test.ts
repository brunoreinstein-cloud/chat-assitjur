import { describe, expect, it } from "vitest";
import { mapLandmarks } from "@/lib/ai/extraction/landmark-mapper";

/** Helper: create a fake PJe document with page markers and section content. */
function buildFakeDocument(
  sections: Array<{ page: number; title: string; body?: string }>
): string {
  return sections
    .map(
      (s) =>
        `[Pag. ${s.page}]\n${s.title}\n${s.body ?? "Lorem ipsum dolor sit amet ".repeat(20)}`
    )
    .join("\n");
}

describe("landmark-mapper", () => {
  describe("mapLandmarks", () => {
    it("returns empty map for document without page markers", () => {
      const result = mapLandmarks("Some plain text without markers");
      expect(result.totalPages).toBe(0);
      expect(result.landmarks.every((l) => !l.found)).toBe(true);
      expect(result.summary).toContain("sem marcadores");
    });

    it("detects petição inicial in head region", () => {
      // Need enough pages so page 3 falls within 15% head threshold
      const doc = buildFakeDocument([
        { page: 1, title: "PODER JUDICIÁRIO\nJUSTIÇA DO TRABALHO" },
        {
          page: 3,
          title: "PETIÇÃO INICIAL\nRECLAMAÇÃO TRABALHISTA",
        },
        ...Array.from({ length: 30 }, (_, i) => ({
          page: i + 10,
          title: `Documento genérico ${i}`,
        })),
      ]);
      const result = mapLandmarks(doc);
      const pi = result.landmarks.find((l) => l.type === "peticao_inicial");
      expect(pi?.found).toBe(true);
      expect(pi?.startPage).toBe(3);
      expect(pi?.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("detects sentença in middle of document", () => {
      const doc = buildFakeDocument([
        { page: 1, title: "PODER JUDICIÁRIO" },
        ...Array.from({ length: 50 }, (_, i) => ({
          page: i + 2,
          title: `Página ${i + 2}`,
        })),
        { page: 148, title: "SENTENÇA\nEM NOME DA REPÚBLICA" },
        { page: 200, title: "Final" },
      ]);
      const result = mapLandmarks(doc);
      const sentenca = result.landmarks.find((l) => l.type === "sentenca");
      expect(sentenca?.found).toBe(true);
      expect(sentenca?.startPage).toBe(148);
    });

    it("detects contestação", () => {
      const doc = buildFakeDocument([
        { page: 1, title: "Capa" },
        { page: 30, title: "CONTESTAÇÃO" },
        { page: 100, title: "Final" },
      ]);
      const result = mapLandmarks(doc);
      const contestacao = result.landmarks.find(
        (l) => l.type === "contestacao"
      );
      expect(contestacao?.found).toBe(true);
      expect(contestacao?.startPage).toBe(30);
    });

    it("detects acórdão", () => {
      const doc = buildFakeDocument([
        { page: 1, title: "Capa" },
        {
          page: 200,
          title: "ACÓRDÃO\nVISTOS, RELATADOS E DISCUTIDOS",
        },
        { page: 300, title: "Final" },
      ]);
      const result = mapLandmarks(doc);
      const acordao = result.landmarks.find((l) => l.type === "acordao");
      expect(acordao?.found).toBe(true);
    });

    it("detects cálculos de liquidação", () => {
      const doc = buildFakeDocument([
        { page: 1, title: "Capa" },
        { page: 500, title: "CONTA DE LIQUIDAÇÃO" },
      ]);
      const result = mapLandmarks(doc);
      const calc = result.landmarks.find(
        (l) => l.type === "calculos_liquidacao"
      );
      expect(calc?.found).toBe(true);
    });

    it("filters signature pages", () => {
      const doc = [
        `[Pag. 1]\nPODER JUDICIÁRIO\nConteúdo real aqui ${"x".repeat(400)}`,
        "[Pag. 2]\nAssinado eletronicamente",
        `[Pag. 3]\nConteúdo importante ${"x".repeat(400)}`,
      ].join("\n");
      const result = mapLandmarks(doc);
      expect(result.signaturePages).toBe(1);
      expect(result.contentPages).toBe(2);
    });

    it("detects fase processual from landmarks", () => {
      const doc = buildFakeDocument([
        { page: 1, title: "PETIÇÃO INICIAL" },
        { page: 30, title: "CONTESTAÇÃO" },
        { page: 100, title: "SENTENÇA" },
        { page: 150, title: "RECURSO ORDINÁRIO" },
      ]);
      const result = mapLandmarks(doc);
      expect(result.faseProcessual).toBe("RECURSAL-TRT");
    });

    it("detects EXECUÇÃO DEFINITIVA when trânsito + cálculos present", () => {
      const doc = buildFakeDocument([
        { page: 1, title: "PETIÇÃO INICIAL" },
        { page: 100, title: "SENTENÇA" },
        { page: 200, title: "CERTIFICO O TRÂNSITO EM JULGADO" },
        { page: 250, title: "CONTA DE LIQUIDAÇÃO" },
      ]);
      const result = mapLandmarks(doc);
      expect(result.faseProcessual).toBe("EXECUÇÃO DEFINITIVA");
    });

    it("returns CONHECIMENTO when only PI + contestação", () => {
      const doc = buildFakeDocument([
        { page: 1, title: "PETIÇÃO INICIAL" },
        { page: 30, title: "CONTESTAÇÃO" },
      ]);
      const result = mapLandmarks(doc);
      expect(result.faseProcessual).toBe("CONHECIMENTO");
    });

    it("generates summary with found and not found sections", () => {
      const doc = buildFakeDocument([
        { page: 1, title: "PETIÇÃO INICIAL" },
        { page: 50, title: "SENTENÇA" },
      ]);
      const result = mapLandmarks(doc);
      expect(result.summary).toContain("Mapa de Landmarks");
      expect(result.summary).toContain("Petição Inicial");
      expect(result.summary).toContain("Sentença");
      expect(result.summary).toContain("Seções não localizadas");
    });

    it("reports correct total pages", () => {
      const doc = buildFakeDocument(
        Array.from({ length: 10 }, (_, i) => ({
          page: i + 1,
          title: `Page ${i + 1} content here`,
        }))
      );
      const result = mapLandmarks(doc);
      expect(result.totalPages).toBe(10);
    });

    it("marks not-found landmarks with startPage -1", () => {
      const doc = buildFakeDocument([
        { page: 1, title: "Some unrelated content" },
      ]);
      const result = mapLandmarks(doc);
      for (const landmark of result.landmarks) {
        if (!landmark.found) {
          expect(landmark.startPage).toBe(-1);
          expect(landmark.confidence).toBe(0);
        }
      }
    });
  });
});
