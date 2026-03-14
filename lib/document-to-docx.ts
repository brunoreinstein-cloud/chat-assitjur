import "server-only";

import {
  AlignmentType,
  BorderStyle,
  convertMillimetersToTwip,
  Document,
  type FileChild,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const FONT_SIZE = 24; // 12pt = 24 half-points
const FONT_SIZE_HEADING = 28; // 14pt
const FONT_SIZE_SMALL = 20; // 10pt para cabeçalho/rodapé
const FONT_FAMILY = "Arial";

/** Espaçamento após cada parágrafo (twips). 120 ≈ 6pt; melhora legibilidade. */
const SPACING_AFTER = 120;
/** Margem de página em todos os lados (25.4 mm = 1 polegada). */
const PAGE_MARGIN = convertMillimetersToTwip(25.4);

const runBase = { font: FONT_FAMILY, size: FONT_SIZE } as const;
const runHeading = { font: FONT_FAMILY, size: FONT_SIZE_HEADING } as const;

/** Paleta AssistJur.IA Master (Relatório Processual Master) — hex sem # para OOXML */
const ASSISTJUR = {
  charcoal: "333333",
  dourado: "B8860B",
  douradoClaro: "F5E6C8",
  branco: "FFFFFF",
  bordaTabela: "AAAAAA", // cinza claro para bordas
} as const;

/** Bordas de tabela padrão (cinza claro, 0.5pt). */
const TABLE_BORDERS_DEFAULT = {
  top: { style: BorderStyle.SINGLE, size: 4, color: ASSISTJUR.bordaTabela },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: ASSISTJUR.bordaTabela },
  left: { style: BorderStyle.SINGLE, size: 4, color: ASSISTJUR.bordaTabela },
  right: { style: BorderStyle.SINGLE, size: 4, color: ASSISTJUR.bordaTabela },
  insideHorizontal: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: ASSISTJUR.bordaTabela,
  },
  insideVertical: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: ASSISTJUR.bordaTabela,
  },
} as const;

/** Bordas de tabela Master: topo dourado, restantes cinza. */
const TABLE_BORDERS_MASTER = {
  top: { style: BorderStyle.SINGLE, size: 8, color: ASSISTJUR.dourado },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: ASSISTJUR.bordaTabela },
  left: { style: BorderStyle.SINGLE, size: 4, color: ASSISTJUR.bordaTabela },
  right: { style: BorderStyle.SINGLE, size: 4, color: ASSISTJUR.bordaTabela },
  insideHorizontal: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: ASSISTJUR.bordaTabela,
  },
  insideVertical: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: ASSISTJUR.bordaTabela,
  },
} as const;

/** Propriedades de margem de página (aplicadas a todas as secções). */
const PAGE_MARGIN_PROPS = {
  page: {
    margin: {
      top: PAGE_MARGIN,
      right: PAGE_MARGIN,
      bottom: PAGE_MARGIN,
      left: PAGE_MARGIN,
    },
  },
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

/**
 * Detecta linha de lista com "- " ou "* " no início.
 * Retorna o texto do item (sem o marcador) ou null se não for lista.
 */
function getBulletText(line: string): string | null {
  const m = /^[-*]\s+(.+)$/.exec(line);
  return m ? (m[1] ?? null) : null;
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
    spacing: { after: SPACING_AFTER },
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
    spacing: { after: SPACING_AFTER },
  });
}

/** Segmento inline com formatação opcional. */
type InlineSegment =
  | string
  | { text: string; bold?: boolean; italic?: boolean };

/**
 * Analisa **negrito** e *itálico* numa linha de texto.
 * Processa ** antes de * para evitar ambiguidades.
 */
function parseInlineFormatting(line: string): InlineSegment[] {
  const result: InlineSegment[] = [];
  let rem = line;

  while (rem.length > 0) {
    const boldIdx = rem.indexOf("**");

    // Localizar primeiro * simples (não parte de **)
    let italicIdx = -1;
    for (let i = 0; i < rem.length; i++) {
      if (rem[i] === "*") {
        const nextIsStar = rem[i + 1] === "*";
        const prevIsStar = i > 0 && rem[i - 1] === "*";
        if (!(nextIsStar || prevIsStar)) {
          italicIdx = i;
          break;
        }
        if (nextIsStar) {
          i++; // saltar o segundo * de **
        }
      }
    }

    const nextIdx =
      boldIdx === -1
        ? italicIdx
        : italicIdx === -1
          ? boldIdx
          : Math.min(boldIdx, italicIdx);

    if (nextIdx === -1) {
      if (rem) {
        result.push(rem);
      }
      break;
    }

    if (nextIdx > 0) {
      result.push(rem.slice(0, nextIdx));
    }
    rem = rem.slice(nextIdx);

    if (rem.startsWith("**")) {
      rem = rem.slice(2);
      const close = rem.indexOf("**");
      if (close === -1) {
        result.push(`**${rem}`);
        break;
      }
      result.push({ text: rem.slice(0, close), bold: true });
      rem = rem.slice(close + 2);
    } else if (rem.startsWith("*")) {
      rem = rem.slice(1);
      // Encontrar * simples de fecho
      let closeIdx = -1;
      for (let i = 0; i < rem.length; i++) {
        if (
          rem[i] === "*" &&
          rem[i + 1] !== "*" &&
          (i === 0 || rem[i - 1] !== "*")
        ) {
          closeIdx = i;
          break;
        }
      }
      if (closeIdx === -1) {
        result.push(`*${rem}`);
        break;
      }
      result.push({ text: rem.slice(0, closeIdx), italic: true });
      rem = rem.slice(closeIdx + 1);
    }
  }

  return result;
}

function inlineToRuns(segments: InlineSegment[]): TextRun[] {
  return segments.map((seg) => {
    if (typeof seg === "string") {
      return new TextRun({ text: seg, ...runBase });
    }
    return new TextRun({
      text: seg.text,
      ...runBase,
      bold: seg.bold ?? false,
      italics: seg.italic ?? false,
    });
  });
}

/**
 * Converte texto com formatação simples (**negrito**, *itálico*, ##/###/####,
 * listas com "- " ou "* ", tabelas com \t ou " | ")
 * em filhos de secção DOCX (Paragraph, Table).
 * Fonte Arial 12pt (títulos 14pt), espaçamento 6pt após cada parágrafo.
 *
 * Com layout "assistjur-master": secções ## com fundo charcoal e texto branco;
 * ### em dourado; bordas de tabela douradas no topo; rodapé com número de página.
 */
function contentToChildren(
  content: string,
  layout: DocxLayout = "default"
): FileChild[] {
  const result: FileChild[] = [];
  const lines = content.split(/\r?\n/);
  let tableRows: [string, string][] = [];
  const isAssistjur = layout === "assistjur-master";
  const borders = isAssistjur ? TABLE_BORDERS_MASTER : TABLE_BORDERS_DEFAULT;

  function flushTable() {
    if (tableRows.length === 0) {
      return;
    }
    const rows = tableRows.map(([cell1, cell2], i) => {
      const isHeaderRow = isAssistjur && i === 0;
      const run = isHeaderRow
        ? { ...runBase, color: ASSISTJUR.branco, bold: true as const }
        : runBase;
      const cellShading = isHeaderRow
        ? { fill: ASSISTJUR.charcoal }
        : undefined;
      return new TableRow({
        tableHeader: isHeaderRow,
        children: [
          new TableCell({
            shading: cellShading,
            width: { size: 2000, type: WidthType.PERCENTAGE }, // 40%
            children: [
              new Paragraph({
                children: [new TextRun({ text: cell1, ...run })],
                spacing: { after: 60 },
              }),
            ],
          }),
          new TableCell({
            shading: cellShading,
            width: { size: 3000, type: WidthType.PERCENTAGE }, // 60%
            children: [
              new Paragraph({
                children: [new TextRun({ text: cell2, ...run })],
                spacing: { after: 60 },
              }),
            ],
          }),
        ],
      });
    });
    result.push(
      new Table({
        rows,
        borders,
        width: { size: 5000, type: WidthType.PERCENTAGE }, // 100%
      })
    );
    tableRows = [];
  }

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (trimmed.length === 0) {
      flushTable();
      result.push(new Paragraph({ text: "", spacing: { after: 60 } }));
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
              spacing: { after: SPACING_AFTER },
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
              spacing: { after: SPACING_AFTER },
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
          spacing: { after: SPACING_AFTER },
        })
      );
      continue;
    }

    // Linha de lista (- item ou * item)
    const bulletText = getBulletText(trimmed);
    if (bulletText !== null) {
      const segs = parseInlineFormatting(bulletText);
      result.push(
        new Paragraph({
          indent: { left: 360, hanging: 180 },
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: "•  ",
              bold: true,
              font: FONT_FAMILY,
              size: FONT_SIZE,
            }),
            ...inlineToRuns(segs),
          ],
        })
      );
      continue;
    }

    // Parágrafo normal com inline formatting (**negrito**, *itálico*)
    const segs = parseInlineFormatting(trimmed);
    const hasFormatting = segs.some((s) => typeof s !== "string");
    if (!hasFormatting && segs.length === 1 && typeof segs[0] === "string") {
      result.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed, ...runBase })],
          spacing: { after: SPACING_AFTER },
        })
      );
    } else {
      result.push(
        new Paragraph({
          children: inlineToRuns(segs),
          spacing: { after: SPACING_AFTER },
        })
      );
    }
  }

  flushTable();
  return result;
}

/**
 * Gera um buffer DOCX a partir do título e do conteúdo em texto.
 * Usado para exportar artefactos de documento (ex.: Revisor, AssistJur) como ficheiro Word.
 *
 * Inclui:
 * - Título no topo
 * - Suporte a ##/###/####, **negrito**, *itálico*, listas (- / *), tabelas (\t ou " | ")
 * - Fonte Arial 12pt (títulos 14pt), espaçamento 6pt entre parágrafos
 * - Margens 25mm, bordas visíveis em tabelas
 *
 * @param layout "assistjur-master" — cabeçalho/rodapé BR Consultoria, paleta charcoal/dourado,
 *   primeira linha de tabelas com fundo charcoal, rodapé com número de página.
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
          spacing: { after: SPACING_AFTER * 2 },
        }),
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
                      size: FONT_SIZE_SMALL,
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
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: `${footerText}    Pág. `,
                      font: FONT_FAMILY,
                      size: FONT_SIZE_SMALL,
                      color: ASSISTJUR.charcoal,
                    }),
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      font: FONT_FAMILY,
                      size: FONT_SIZE_SMALL,
                      color: ASSISTJUR.charcoal,
                    }),
                    new TextRun({
                      text: " / ",
                      font: FONT_FAMILY,
                      size: FONT_SIZE_SMALL,
                      color: ASSISTJUR.charcoal,
                    }),
                    new TextRun({
                      children: [PageNumber.TOTAL_PAGES],
                      font: FONT_FAMILY,
                      size: FONT_SIZE_SMALL,
                      color: ASSISTJUR.charcoal,
                    }),
                  ],
                }),
              ],
            }),
          },
          properties: PAGE_MARGIN_PROPS,
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
        properties: PAGE_MARGIN_PROPS,
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
