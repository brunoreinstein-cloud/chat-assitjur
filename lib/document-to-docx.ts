import "server-only";

import {
  Document,
  type FileChild,
  Footer,
  Header,
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

/** Paleta AssistJur.IA Master (Relatório Processual Master) — hex sem # para OOXML */
const ASSISTJUR = {
  charcoal: "333333",
  dourado: "B8860B",
  douradoClaro: "F5E6C8",
  branco: "FFFFFF",
} as const;

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

/** Layout de export DOCX: default (simples) ou assistjur-master (paleta cinza/dourado, header/footer). */
export type DocxLayout = "default" | "assistjur-master";

function paragraphH1Assistjur(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: FONT_FAMILY,
        size: FONT_SIZE_HEADING,
        color: ASSISTJUR.branco,
        bold: true,
      }),
    ],
    shading: { fill: ASSISTJUR.charcoal },
  });
}

function paragraphH2Assistjur(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: FONT_FAMILY,
        size: FONT_SIZE_HEADING,
        color: ASSISTJUR.dourado,
        bold: true,
      }),
    ],
  });
}

/**
 * Converte texto com formatação simples (**negrito**, ##/###/####, tabelas com \t)
 * em filhos de secção DOCX (Paragraph, Table, headings com Arial 12pt/14pt).
 * Com layout "assistjur-master": secções ## com fundo charcoal e texto branco; ### em dourado.
 */
function contentToChildren(
  content: string,
  layout: DocxLayout = "default"
): FileChild[] {
  const result: FileChild[] = [];
  const lines = content.split(/\r?\n/);
  let tableRows: [string, string][] = [];
  const isAssistjur = layout === "assistjur-master";

  function flushTable() {
    if (tableRows.length === 0) {
      return;
    }
    const rows = tableRows.map(([cell1, cell2], i) => {
      const isHeaderRow = isAssistjur && i === 0;
      const run = isHeaderRow
        ? {
            ...runBase,
            color: ASSISTJUR.branco,
            bold: true as const,
          }
        : runBase;
      const cellShading = isHeaderRow
        ? { fill: ASSISTJUR.charcoal }
        : undefined;
      return new TableRow({
        tableHeader: isHeaderRow,
        children: [
          new TableCell({
            shading: cellShading,
            children: [
              new Paragraph({
                children: [new TextRun({ text: cell1, ...run })],
              }),
            ],
          }),
          new TableCell({
            shading: cellShading,
            children: [
              new Paragraph({
                children: [new TextRun({ text: cell2, ...run })],
              }),
            ],
          }),
        ],
      });
    });
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

    const h1 = /^##\s+(.+)$/.exec(trimmed);
    if (h1) {
      result.push(
        isAssistjur
          ? paragraphH1Assistjur(h1[1].trim())
          : new Paragraph({
              text: h1[1].trim(),
              heading: HeadingLevel.HEADING_1,
              run: runHeading,
            })
      );
      continue;
    }

    const h2 = /^###\s+(.+)$/.exec(trimmed);
    if (h2) {
      result.push(
        isAssistjur
          ? paragraphH2Assistjur(h2[1].trim())
          : new Paragraph({
              text: h2[1].trim(),
              heading: HeadingLevel.HEADING_2,
              run: runHeading,
            })
      );
      continue;
    }

    const h3 = /^####\s+(.+)$/.exec(trimmed);
    if (h3) {
      result.push(
        new Paragraph({
          text: h3[1].trim(),
          heading: HeadingLevel.HEADING_3,
          run: isAssistjur
            ? { ...runHeading, color: ASSISTJUR.dourado }
            : runHeading,
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
 * Usado para exportar artefactos de documento (ex.: Revisor, AssistJur) como ficheiro Word.
 * Inclui título no topo; suporta ##/###/####, **negrito** e linhas com \t ou " | " como tabela de 2 colunas.
 * Fonte Arial 12pt (títulos 14pt).
 *
 * @param layout "assistjur-master" — cabeçalho/rodapé BR Consultoria, secções ## com fundo charcoal e texto branco, ### em dourado, primeira linha de tabelas com fundo charcoal.
 */
export async function createDocxBuffer(
  title: string,
  content: string,
  layout: DocxLayout = "default"
): Promise<Buffer> {
  const bodyChildren = contentToChildren(content ?? "", layout);
  const hasTitle = title.trim().length > 0;
  const children: FileChild[] = hasTitle
    ? [
        new Paragraph({
          text: title.trim(),
          heading: HeadingLevel.TITLE,
          run:
            layout === "assistjur-master"
              ? { ...runHeading, color: ASSISTJUR.dourado }
              : runHeading,
        }),
        new Paragraph({ text: "" }),
        ...bodyChildren,
      ]
    : bodyChildren;

  if (layout === "assistjur-master") {
    const headerText = `RELATÓRIO PROCESSUAL MASTER | ${title.trim() || "Documento"}`;
    const footerText =
      "CONFIDENCIAL — BR Consultoria | AssistJur.IA | Revisão humana obrigatória";
    const doc = new Document({
      sections: [
        {
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: headerText,
                      font: FONT_FAMILY,
                      size: 20,
                      color: ASSISTJUR.charcoal,
                    }),
                  ],
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: footerText,
                      font: FONT_FAMILY,
                      size: 18,
                      color: ASSISTJUR.charcoal,
                    }),
                  ],
                }),
              ],
            }),
          },
          properties: {},
          children:
            children.length > 0 ? children : [new Paragraph({ text: "" })],
        },
      ],
    });
    return await Packer.toBuffer(doc);
  }

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

/** Caracteres Unicode comuns substituídos por ASCII para Content-Disposition (ByteString). */
const UNICODE_TO_ASCII: Record<string, string> = {
  "\u2012": "-", // figure dash (U+2012)
  "\u2013": "-", // en dash (U+2013)
  "\u2014": "-", // em dash (U+2014, codepoint 8212)
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
};

/**
 * Garante que a string é segura para cabeçalhos HTTP (ByteString: apenas bytes 0–255).
 * Usar no valor de Content-Disposition filename= para evitar TypeError em runtimes que validam.
 */
export function toByteStringSafe(value: string): string {
  let s = value;
  for (const [u, a] of Object.entries(UNICODE_TO_ASCII)) {
    s = s.replaceAll(u, a);
  }
  return [...s]
    .map((c) => {
      const cp = c.codePointAt(0) ?? 0;
      return cp <= 255 ? c : "";
    })
    .join("");
}

/**
 * Nome de ficheiro seguro para download DOCX (máx. 120 caracteres, extensão .docx).
 * Usa apenas caracteres compatíveis com ByteString (0–255) para o header Content-Disposition.
 */
export function sanitizeDocxFilename(title: string): string {
  let s = title;
  for (const [u, a] of Object.entries(UNICODE_TO_ASCII)) {
    s = s.replaceAll(u, a);
  }
  // Remover qualquer carácter com código > 255 (ex.: emojis, CJK) para ByteString
  s = [...s].filter((c) => (c.codePointAt(0) ?? 0) <= 255).join("");
  const sanitized = s
    .replaceAll(/[<>:"/\\|?*]/g, "_")
    .replaceAll(/\s+/g, "_")
    .trim()
    .slice(0, 115);
  return `${sanitized || "documento"}.docx`;
}
