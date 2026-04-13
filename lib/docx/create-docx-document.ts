import "server-only";

import {
  AlignmentType,
  Document,
  type FileChild,
  Footer,
  Header,
  type ICommentOptions,
  type ISectionOptions,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  TextRun,
} from "docx";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateDocxDocumentOptions {
  /** Conteúdo principal do documento (paragraphs, tables, etc.). */
  children: FileChild[];
  /** Texto exibido no header do documento. */
  headerText?: string;
  /** Texto exibido antes da paginação no footer (ex: "CONFIDENCIAL — BR Consultoria"). */
  footerText?: string;
  /** Fonte usada no header/footer. Default: "Calibri". */
  font?: string;
  /** Tamanho da fonte no header/footer em half-points. Default: 20 (10pt). */
  fontSize?: number;
  /** Cor do texto header/footer (hex sem #). Default: "333333". */
  color?: string;
  /** Orientação da página. Default: portrait. */
  orientation?: "portrait" | "landscape";
  /** Margens em DXA (twips). */
  margins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  /** Comentários Word (para a Contestação Revisada). */
  comments?: ICommentOptions[];
}

/** Margem padrão: 25.4mm = 1440 DXA. */
const DEFAULT_MARGIN = 1440;
const DEFAULT_FONT = "Calibri";
const DEFAULT_FONT_SIZE = 20; // 10pt
const DEFAULT_COLOR = "333333";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Cria um Document DOCX com header + footer padronizado (paginação).
 * Elimina boilerplate duplicado entre document-to-docx.ts e autuoria-docx.ts.
 */
export function createDocxDocument(
  options: CreateDocxDocumentOptions
): Document {
  const {
    children,
    headerText,
    footerText = "",
    font = DEFAULT_FONT,
    fontSize = DEFAULT_FONT_SIZE,
    color = DEFAULT_COLOR,
    orientation = "portrait",
    margins,
    comments,
  } = options;

  const runProps = { font, size: fontSize, color } as const;
  const m = margins ?? {
    top: DEFAULT_MARGIN,
    right: DEFAULT_MARGIN,
    bottom: DEFAULT_MARGIN,
    left: DEFAULT_MARGIN,
  };

  const sectionProperties: ISectionOptions["properties"] =
    orientation === "landscape"
      ? {
          page: {
            size: {
              width: 16_838,
              height: 11_906,
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: m,
          },
        }
      : { page: { margin: m } };

  const headers = headerText
    ? {
        default: new Header({
          children: [
            new Paragraph({
              children: [new TextRun({ text: headerText, ...runProps })],
            }),
          ],
        }),
      }
    : undefined;

  const footers = {
    default: new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({
              text: footerText ? `${footerText}    Pág. ` : "Pág. ",
              ...runProps,
            }),
            new TextRun({ children: [PageNumber.CURRENT], ...runProps }),
            new TextRun({ text: " / ", ...runProps }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], ...runProps }),
          ],
        }),
      ],
    }),
  };

  return new Document({
    comments: comments?.length ? { children: comments } : undefined,
    sections: [
      {
        properties: sectionProperties,
        headers,
        footers,
        children:
          children.length > 0 ? children : [new Paragraph({ text: "" })],
      },
    ],
  });
}

/**
 * Atalho: cria Document e converte para Buffer DOCX.
 */
export async function createDocxBuffer(
  options: CreateDocxDocumentOptions
): Promise<Buffer> {
  const doc = createDocxDocument(options);
  return Buffer.from(await Packer.toBuffer(doc));
}
