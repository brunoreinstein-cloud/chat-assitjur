import "server-only";

import {
  Document,
  type FileChild,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

const FONT_SIZE = 24; // 12pt = 24 half-points
const FONT_SIZE_HEADING = 28; // 14pt

/**
 * Converte texto com formatação simples (**negrito**, linhas ## Título) em filhos
 * de secção DOCX (Paragraph com opcional heading ou TextRuns com bold).
 */
function contentToParagraphs(content: string): FileChild[] {
  const paragraphs: FileChild[] = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed.length === 0) {
      paragraphs.push(new Paragraph({ text: "" }));
      continue;
    }

    // Título nível 1: linha que começa com ##
    const heading1Regex = /^##\s+(.+)$/;
    const heading1Exec = heading1Regex.exec(trimmed);
    if (heading1Exec) {
      paragraphs.push(
        new Paragraph({
          text: heading1Exec[1].trim(),
          heading: HeadingLevel.HEADING_1,
          run: { size: FONT_SIZE_HEADING },
        })
      );
      continue;
    }

    // Parágrafo com possíveis segmentos **negrito**
    const runs = parseBoldSegments(trimmed);
    if (
      runs.length === 1 &&
      typeof runs[0] === "string" &&
      !runs[0].includes("**")
    ) {
      paragraphs.push(new Paragraph(trimmed));
      continue;
    }

    paragraphs.push(
      new Paragraph({
        children: runs.map((r) =>
          typeof r === "string"
            ? new TextRun({ text: r, size: FONT_SIZE })
            : new TextRun({ text: r.text, bold: true, size: FONT_SIZE })
        ),
      })
    );
  }

  return paragraphs;
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
 */
export async function createDocxBuffer(
  _title: string,
  content: string
): Promise<Buffer> {
  const children = contentToParagraphs(content ?? "");
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: children.length > 0 ? children : [new Paragraph("")],
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
