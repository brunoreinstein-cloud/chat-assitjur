/**
 * Gerador XLSX genérico para módulos do Master agent.
 *
 * Gera workbooks Excel com múltiplas abas a partir de specs estruturados.
 * Usado por M07 (Auditoria), M08 (Cadastro eLaw), M09 (Encerramento),
 * M10 (Aquisição de Créditos).
 *
 * Usa ExcelJS (já instalado) para geração server-side.
 */

import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import type { ChatMessage } from "@/lib/types";

// ─── Tipos ───────────────────────────────────────────────────────────

export interface XlsxSheetSpec {
  /** Nome da aba (max 31 chars para compatibilidade Excel) */
  name: string;
  /** Headers da primeira linha */
  headers: string[];
  /** Linhas de dados (cada array = uma linha) */
  rows: Array<Array<string | number | null>>;
  /** Largura das colunas (em chars). Se omitido, auto-fit. */
  columnWidths?: number[];
}

export interface XlsxDocumentSpec {
  /** Nome do ficheiro (sem extensão) */
  filename: string;
  /** Módulo de origem (M07, M08, M09, M10) */
  moduleId: string;
  /** Abas do workbook */
  sheets: XlsxSheetSpec[];
}

// ─── Templates para módulos específicos ──────────────────────────────

/**
 * M08 — Cadastro eLaw: 2 abas (Dados Processuais + Verbas/Pedidos)
 */
export function buildM08CadastroElaw(
  dados: {
    cnj?: string;
    vara?: string;
    reclamante?: string;
    reclamada?: string;
    cnpj?: string;
    advogadoReclamante?: string;
    advogadoReclamada?: string;
    dataDistribuicao?: string;
    valorCausa?: string;
    fase?: string;
    riscoGlobal?: string;
    resultado?: string;
  },
  verbas: Array<{
    verba: string;
    valor?: string;
    risco?: string;
    fundamentacao?: string;
  }>
): XlsxDocumentSpec {
  return {
    filename: `cadastro-elaw-${dados.cnj ?? "processo"}`,
    moduleId: "M08",
    sheets: [
      {
        name: "Dados Processuais",
        headers: ["Campo", "Valor"],
        rows: [
          ["Número CNJ", dados.cnj ?? "---"],
          ["Vara", dados.vara ?? "---"],
          ["Reclamante", dados.reclamante ?? "---"],
          ["Reclamada", dados.reclamada ?? "---"],
          ["CNPJ", dados.cnpj ?? "---"],
          ["Advogado Reclamante", dados.advogadoReclamante ?? "---"],
          ["Advogado Reclamada", dados.advogadoReclamada ?? "---"],
          ["Data Distribuição", dados.dataDistribuicao ?? "---"],
          ["Valor da Causa", dados.valorCausa ?? "---"],
          ["Fase Processual", dados.fase ?? "---"],
          ["Risco Global", dados.riscoGlobal ?? "---"],
          ["Resultado", dados.resultado ?? "---"],
        ],
        columnWidths: [30, 50],
      },
      {
        name: "Verbas e Pedidos",
        headers: ["Verba/Pedido", "Valor Estimado", "Risco", "Fundamentação"],
        rows: verbas.map((v) => [
          v.verba,
          v.valor ?? "---",
          v.risco ?? "---",
          v.fundamentacao ?? "---",
        ]),
        columnWidths: [35, 20, 15, 50],
      },
    ],
  };
}

/**
 * M09 — Encerramento: 1 aba (Classificação de resultado + valores finais)
 */
export function buildM09Encerramento(dados: {
  cnj?: string;
  reclamante?: string;
  reclamada?: string;
  resultado?: string;
  tipoEncerramento?: string;
  dataEncerramento?: string;
  valorAcordo?: string;
  valorCondenacao?: string;
  valorPago?: string;
  honorarios?: string;
  custas?: string;
  observacoes?: string;
}): XlsxDocumentSpec {
  return {
    filename: `encerramento-${dados.cnj ?? "processo"}`,
    moduleId: "M09",
    sheets: [
      {
        name: "Encerramento",
        headers: ["Campo", "Valor"],
        rows: [
          ["Número CNJ", dados.cnj ?? "---"],
          ["Reclamante", dados.reclamante ?? "---"],
          ["Reclamada", dados.reclamada ?? "---"],
          ["Resultado", dados.resultado ?? "---"],
          ["Tipo de Encerramento", dados.tipoEncerramento ?? "---"],
          ["Data Encerramento", dados.dataEncerramento ?? "---"],
          ["Valor do Acordo", dados.valorAcordo ?? "---"],
          ["Valor da Condenação", dados.valorCondenacao ?? "---"],
          ["Valor Pago", dados.valorPago ?? "---"],
          ["Honorários", dados.honorarios ?? "---"],
          ["Custas", dados.custas ?? "---"],
          ["Observações", dados.observacoes ?? "---"],
        ],
        columnWidths: [30, 50],
      },
    ],
  };
}

// ─── Geração do buffer XLSX ──────────────────────────────────────────

/**
 * Gera um buffer XLSX a partir de um spec.
 * Retorna Buffer pronto para stream ou download.
 */
export async function generateXlsxBuffer(
  spec: XlsxDocumentSpec
): Promise<Buffer> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "AssistJur.IA";
  workbook.created = new Date();

  for (const sheetSpec of spec.sheets) {
    const sheetName = sheetSpec.name.slice(0, 31); // Excel limit
    const sheet = workbook.addWorksheet(sheetName);

    // Headers
    const headerRow = sheet.addRow(sheetSpec.headers);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8E0D4" }, // Gold-accent inspired
    };

    // Data rows
    for (const rowData of sheetSpec.rows) {
      sheet.addRow(rowData);
    }

    // Column widths
    if (sheetSpec.columnWidths) {
      for (let i = 0; i < sheetSpec.columnWidths.length; i++) {
        const col = sheet.getColumn(i + 1);
        col.width = sheetSpec.columnWidths[i];
      }
    } else {
      // Auto-fit: set width based on max content length
      for (let i = 1; i <= sheetSpec.headers.length; i++) {
        const col = sheet.getColumn(i);
        let maxLen = sheetSpec.headers[i - 1].length;
        for (const row of sheetSpec.rows) {
          const cellVal = String(row[i - 1] ?? "");
          if (cellVal.length > maxLen) {
            maxLen = cellVal.length;
          }
        }
        col.width = Math.min(maxLen + 4, 60);
      }
    }

    // Freeze header row
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // Auto-filter on headers
    if (sheetSpec.rows.length > 0) {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: {
          row: 1 + sheetSpec.rows.length,
          column: sheetSpec.headers.length,
        },
      };
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Tool para o Master agent ────────────────────────────────────────

interface CreateXlsxProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

/**
 * Tool factory para geração de XLSX no Master agent.
 * Stream events: data-xlsxStart, data-xlsxReady, data-xlsxError.
 */
export const createMasterXlsx = ({ dataStream }: CreateXlsxProps) =>
  tool({
    description: `Gera documentos XLSX (planilhas Excel) para módulos do Master agent.
Use para:
- M08: Cadastro eLaw (2 abas: dados processuais + verbas)
- M09: Encerramento (classificação + valores finais)
- M10: Aquisição de Créditos (múltiplas abas)
- M07: Auditoria (XLSX complementar ao DOCX)

Retorna confirmação de geração. O ficheiro XLSX é enviado ao cliente via stream.`,
    inputSchema: z.object({
      moduleId: z
        .enum(["M07", "M08", "M09", "M10"])
        .describe("Módulo que está a gerar o XLSX"),
      filename: z.string().describe("Nome do ficheiro (sem extensão .xlsx)"),
      sheets: z
        .array(
          z.object({
            name: z.string().max(31).describe("Nome da aba"),
            headers: z
              .array(z.string())
              .describe("Cabeçalhos da primeira linha"),
            rows: z
              .array(z.array(z.union([z.string(), z.number(), z.null()])))
              .describe("Linhas de dados"),
          })
        )
        .describe("Abas do workbook"),
    }),
    execute: async ({ moduleId, filename, sheets }) => {
      try {
        const spec: XlsxDocumentSpec = {
          filename,
          moduleId,
          sheets: sheets.map((s) => ({
            name: s.name,
            headers: s.headers,
            rows: s.rows,
          })),
        };

        const buffer = await generateXlsxBuffer(spec);
        const base64 = buffer.toString("base64");

        dataStream.write({
          type: "data-xlsxReady" as never,
          data: {
            filename: `${filename}.xlsx`,
            moduleId,
            size: buffer.length,
            base64,
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        });

        return {
          success: true,
          filename: `${filename}.xlsx`,
          moduleId,
          sheetsCount: sheets.length,
          sheetNames: sheets.map((s) => s.name),
          sizeBytes: buffer.length,
          message: `XLSX "${filename}.xlsx" gerado com ${sheets.length} aba(s): ${sheets.map((s) => s.name).join(", ")}`,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Erro ao gerar XLSX";
        return {
          success: false,
          error: message,
        };
      }
    },
  });
