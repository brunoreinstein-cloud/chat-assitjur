import "server-only";

import {
  Document,
  type FileChild,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from "docx";

const FONT_SIZE = 24; // 12pt = 24 half-points
const FONT_SIZE_HEADING = 28; // 14pt
const FONT_FAMILY = "Arial";

const runBase = { font: FONT_FAMILY, size: FONT_SIZE } as const;
const runHeading = { font: FONT_FAMILY, size: FONT_SIZE_HEADING } as const;

const TABLE_SEP_TAB = "\t";
const TABLE_SEP_PIPE = " | "; // instruções do agente: "campo|valor"

/**
 * Detecta se a linha é uma linha de tabela de 2 colunas (tab ou " | ").
 */
function isTableRow(line: string): boolean {
  if (line.includes(TABLE_SEP_TAB)) {
    const parts = line.split(TABLE_SEP_TAB);
    return parts.length === 2 && parts[0].trim().length > 0;
  }
  if (line.includes(TABLE_SEP_PIPE)) {
    const parts = line.split(TABLE_SEP_PIPE);
    return parts.length === 2 && parts[0].trim().length > 0;
  }
  return false;
}

function parseTableRow(line: string): [string, string] {
  const sep = line.includes(TABLE_SEP_TAB) ? TABLE_SEP_TAB : TABLE_SEP_PIPE;
  const idx = line.indexOf(sep);
  return [line.slice(0, idx).trim(), line.slice(idx + sep.length).trim()];
}

/**
 * Converte texto com formatação simples (**negrito**, ##/###/####, tabelas com \t)
 * em filhos de secção DOCX (Paragraph, Table, headings com Arial 12pt/14pt).
 */
function contentToChildren(content: string): FileChild[] {
  const result: FileChild[] = [];
  const lines = content.split(/\r?\n/);
  let tableRows: [string, string][] = [];

  function flushTable() {
    if (tableRows.length === 0) {
      return;
    }
    const rows = tableRows.map(
      ([cell1, cell2]) =>
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: cell1, ...runBase })],
                }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: cell2, ...runBase })],
                }),
              ],
            }),
          ],
        })
    );
    result.push(new Table({ rows }));
    tableRows = [];
  }

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (trimmed.length === 0) {
      flushTable();
      result.push(new Paragraph({ text: "" }));
      continue;
    }

    if (isTableRow(trimmed)) {
      tableRows.push(parseTableRow(trimmed));
      continue;
    }

    flushTable();

    // ## Título nível 1
    const h1 = /^##\s+(.+)$/.exec(trimmed);
    if (h1) {
      result.push(
        new Paragraph({
          text: h1[1].trim(),
          heading: HeadingLevel.HEADING_1,
          run: runHeading,
        })
      );
      continue;
    }

    // ### Título nível 2
    const h2 = /^###\s+(.+)$/.exec(trimmed);
    if (h2) {
      result.push(
        new Paragraph({
          text: h2[1].trim(),
          heading: HeadingLevel.HEADING_2,
          run: runHeading,
        })
      );
      continue;
    }

    // #### Título nível 3
    const h3 = /^####\s+(.+)$/.exec(trimmed);
    if (h3) {
      result.push(
        new Paragraph({
          text: h3[1].trim(),
          heading: HeadingLevel.HEADING_3,
          run: runHeading,
        })
      );
      continue;
    }

    // Parágrafo com **negrito**
    const runs = parseBoldSegments(trimmed);
    if (
      runs.length === 1 &&
      typeof runs[0] === "string" &&
      !runs[0].includes("**")
    ) {
      result.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed, ...runBase })],
        })
      );
      continue;
    }

    result.push(
      new Paragraph({
        children: runs.map((r) =>
          typeof r === "string"
            ? new TextRun({ text: r, ...runBase })
            : new TextRun({ text: r.text, bold: true, ...runBase })
        ),
      })
    );
  }

  flushTable();
  return result;
}

type BoldSegment = string | { text: string };

function parseBoldSegments(line: string): BoldSegment[] {
  const result: BoldSegment[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    const open = remaining.indexOf("**");
    if (open === -1) {
      if (remaining.length > 0) {
        result.push(remaining);
      }
      break;
    }
    if (open > 0) {
      result.push(remaining.slice(0, open));
    }
    remaining = remaining.slice(open + 2);
    const close = remaining.indexOf("**");
    if (close === -1) {
      result.push(`**${remaining}`);
      break;
    }
    result.push({ text: remaining.slice(0, close) });
    remaining = remaining.slice(close + 2);
  }

  return result;
}

/**
 * Gera um buffer DOCX a partir do título e do conteúdo em texto.
 * Usado para exportar artefactos de documento (ex.: Revisor) como ficheiro Word.
 * Inclui título no topo; suporta ##/###/####, **negrito** e linhas com \t como tabela de 2 colunas.
 * Fonte Arial 12pt (títulos 14pt).
 */
export async function createDocxBuffer(
  title: string,
  content: string
): Promise<Buffer> {
  const bodyChildren = contentToChildren(content ?? "");
  const hasTitle = title.trim().length > 0;
  const children: FileChild[] = hasTitle
    ? [
        new Paragraph({
          text: title.trim(),
          heading: HeadingLevel.TITLE,
          run: runHeading,
        }),
        new Paragraph({ text: "" }),
        ...bodyChildren,
      ]
    : bodyChildren;

  const doc = new Document({
    sections: [
      {
        properties: {},
        children:
          children.length > 0 ? children : [new Paragraph({ text: "" })],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

/**
 * Nome de ficheiro seguro para download DOCX (máx. 120 caracteres, extensão .docx).
 */
export function sanitizeDocxFilename(title: string): string {
  const sanitized = title
    .replaceAll(/[<>:"/\\|?*]/g, "_")
    .replaceAll(/\s+/g, "_")
    .trim()
    .slice(0, 115);
  return `${sanitized || "documento"}.docx`;
}
