import { describe, expect, it } from "vitest";
import {
  buildM08CadastroElaw,
  buildM09Encerramento,
  generateXlsxBuffer,
  type XlsxDocumentSpec,
} from "@/lib/ai/tools/create-xlsx-documents";

describe("create-xlsx-documents", () => {
  describe("buildM08CadastroElaw", () => {
    it("creates spec with 2 sheets", () => {
      const spec = buildM08CadastroElaw(
        {
          cnj: "0001234-56.2024.5.01.0001",
          reclamante: "João Silva",
          reclamada: "Empresa XYZ Ltda",
        },
        [
          { verba: "Horas extras", valor: "R$ 50.000,00", risco: "Provável" },
          { verba: "Dano moral", valor: "R$ 30.000,00", risco: "Possível" },
        ]
      );

      expect(spec.moduleId).toBe("M08");
      expect(spec.sheets).toHaveLength(2);
      expect(spec.sheets[0].name).toBe("Dados Processuais");
      expect(spec.sheets[1].name).toBe("Verbas e Pedidos");
    });

    it("first sheet has 12 rows of process data", () => {
      const spec = buildM08CadastroElaw({}, []);
      expect(spec.sheets[0].rows.length).toBe(12);
      expect(spec.sheets[0].headers).toEqual(["Campo", "Valor"]);
    });

    it("second sheet has verba rows", () => {
      const spec = buildM08CadastroElaw({}, [
        { verba: "Horas extras" },
        { verba: "Dano moral" },
        { verba: "FGTS" },
      ]);
      expect(spec.sheets[1].rows).toHaveLength(3);
      expect(spec.sheets[1].headers).toEqual([
        "Verba/Pedido",
        "Valor Estimado",
        "Risco",
        "Fundamentação",
      ]);
    });

    it("uses --- for missing fields", () => {
      const spec = buildM08CadastroElaw({}, []);
      const rows = spec.sheets[0].rows;
      // All values should be "---" when no data provided
      for (const row of rows) {
        expect(row[1]).toBe("---");
      }
    });

    it("fills provided fields correctly", () => {
      const spec = buildM08CadastroElaw(
        { cnj: "0001234-56.2024.5.01.0001", reclamante: "João" },
        []
      );
      const cnjRow = spec.sheets[0].rows.find((r) => r[0] === "Número CNJ");
      expect(cnjRow?.[1]).toBe("0001234-56.2024.5.01.0001");
    });
  });

  describe("buildM09Encerramento", () => {
    it("creates spec with 1 sheet", () => {
      const spec = buildM09Encerramento({
        cnj: "0001234-56.2024.5.01.0001",
        resultado: "Procedente em parte",
      });
      expect(spec.moduleId).toBe("M09");
      expect(spec.sheets).toHaveLength(1);
      expect(spec.sheets[0].name).toBe("Encerramento");
    });

    it("has 12 rows of encerramento data", () => {
      const spec = buildM09Encerramento({});
      expect(spec.sheets[0].rows.length).toBe(12);
    });

    it("includes filename with cnj", () => {
      const spec = buildM09Encerramento({ cnj: "001234" });
      expect(spec.filename).toContain("001234");
    });
  });

  describe("generateXlsxBuffer", () => {
    it("generates a valid buffer", async () => {
      const spec: XlsxDocumentSpec = {
        filename: "test",
        moduleId: "M08",
        sheets: [
          {
            name: "Test",
            headers: ["Col A", "Col B"],
            rows: [
              ["Value 1", 100],
              ["Value 2", 200],
            ],
          },
        ],
      };
      const buffer = await generateXlsxBuffer(spec);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("generates buffer with multiple sheets", async () => {
      const spec: XlsxDocumentSpec = {
        filename: "multi",
        moduleId: "M10",
        sheets: [
          {
            name: "Sheet 1",
            headers: ["A"],
            rows: [["data"]],
          },
          {
            name: "Sheet 2",
            headers: ["B"],
            rows: [["data2"]],
          },
        ],
      };
      const buffer = await generateXlsxBuffer(spec);
      expect(buffer.length).toBeGreaterThan(0);

      // Verify we can read it back
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as any);
      expect(wb.worksheets).toHaveLength(2);
      expect(wb.worksheets[0].name).toBe("Sheet 1");
      expect(wb.worksheets[1].name).toBe("Sheet 2");
    });

    it("sets headers as bold", async () => {
      const spec: XlsxDocumentSpec = {
        filename: "styled",
        moduleId: "M08",
        sheets: [
          {
            name: "Data",
            headers: ["Campo", "Valor"],
            rows: [["Test", "123"]],
          },
        ],
      };
      const buffer = await generateXlsxBuffer(spec);
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as any);
      const headerRow = wb.worksheets[0].getRow(1);
      expect(headerRow.getCell(1).font?.bold).toBe(true);
    });

    it("handles empty rows", async () => {
      const spec: XlsxDocumentSpec = {
        filename: "empty",
        moduleId: "M09",
        sheets: [
          {
            name: "Empty",
            headers: ["A", "B"],
            rows: [],
          },
        ],
      };
      const buffer = await generateXlsxBuffer(spec);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("respects column widths", async () => {
      const spec: XlsxDocumentSpec = {
        filename: "widths",
        moduleId: "M08",
        sheets: [
          {
            name: "Widths",
            headers: ["Narrow", "Wide"],
            rows: [["x", "y"]],
            columnWidths: [10, 50],
          },
        ],
      };
      const buffer = await generateXlsxBuffer(spec);
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as any);
      const col1 = wb.worksheets[0].getColumn(1);
      const col2 = wb.worksheets[0].getColumn(2);
      expect(col1.width).toBe(10);
      expect(col2.width).toBe(50);
    });
  });
});
