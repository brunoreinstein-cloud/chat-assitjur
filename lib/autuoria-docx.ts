import "server-only";

import {
  AlignmentType,
  BorderStyle,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  Document,
  type FileChild,
  Footer,
  Header,
  HeadingLevel,
  type ICommentOptions,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONT = "Arial";
const FONT_SIZE = 24; // 12pt
const FONT_SIZE_TITLE = 28; // 14pt
const FONT_SIZE_SMALL = 20; // 10pt
const SPACING_AFTER = 100;

/** Margem AutuorIA: 680 DXA (~1.2cm) — mais compacta que o padrão. */
const AUTUORIA_MARGIN = 680;

const COLORS = {
  charcoal: "333333",
  gold: "B8860B",
  white: "FFFFFF",
  border: "AAAAAA",
  blue: "0000FF",
  red: "FF0000",
  green: "228B22",
  yellow: "DAA520",
  gray: "999999",
} as const;

const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
  left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
  right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
  insideHorizontal: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: COLORS.border,
  },
  insideVertical: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: COLORS.border,
  },
} as const;

const run = { font: FONT, size: FONT_SIZE } as const;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function headerCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    shading: { fill: COLORS.charcoal, type: ShadingType.CLEAR },
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({
        children: [
          new TextRun({ text, ...run, color: COLORS.white, bold: true }),
        ],
        spacing: { after: 40 },
      }),
    ],
  });
}

function cell(text: string, widthPct: number, color?: string): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({
        children: [new TextRun({ text, ...run, ...(color ? { color } : {}) })],
        spacing: { after: 40 },
      }),
    ],
  });
}

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: FONT,
        size: FONT_SIZE_TITLE,
        color: COLORS.charcoal,
        bold: true,
      }),
    ],
    spacing: { before: 200, after: SPACING_AFTER },
  });
}

/** Display maps: converte identificadores de texto em emoji para renderização DOCX. */
const CRITICIDADE_DISPLAY: Record<string, string> = {
  critico: "🔴",
  medio: "🟡",
  baixo: "🟢",
  informativo: "⚪",
};

const STATUS_DISPLAY: Record<string, string> = {
  ok: "✅",
  falha: "❌",
  atencao: "⚠️",
};

const CHECKLIST_STATUS_DISPLAY: Record<string, string> = {
  ok: "✅",
  falha: "❌",
  desnecessaria: "Desnecessária",
};

const TESE_STATUS_DISPLAY: Record<string, string> = {
  adequada: "✅",
  parcial: "⚠️",
  inadequada: "❌",
};

const PRESENTE_DISPLAY: Record<string, string> = {
  presente: "✅",
  ausente: "❌",
  parcial: "⚠️",
};

/** Mapeia identificador de criticidade para cor de célula. */
function critColor(crit: string): string {
  if (crit === "critico") return COLORS.red;
  if (crit === "medio") return COLORS.yellow;
  if (crit === "baixo") return COLORS.green;
  return COLORS.gray;
}

// ---------------------------------------------------------------------------
// Quadro de Correções — Types
// ---------------------------------------------------------------------------

export interface QuadroCabecalho {
  processo: string;
  reclamante: string;
  reclamada: string;
  cnpj?: string;
  dtc: string;
  daj: string;
  posicaoProcessual?: string;
  teseCentral: string;
  teseCentralStatus: string;
}

export interface QuadroPrescricao {
  tipo: string;
  calculo: string;
  dataLimite: string;
  status: string;
}

export interface QuadroCorrecao {
  numero: number;
  pedido: string;
  secaoDefesa: string;
  impugnado: string;
  status: string;
  criticidade: string;
  tipo: string;
  acaoRecomendada: string;
}

export interface QuadroChecklistItem {
  defesa: string;
  status: string;
  obs: string;
}

export interface QuadroCorrecaoEscrita {
  tipo: string;
  localizacao: string;
  original: string;
  correcao: string;
}

export interface QuadroDocumento {
  assunto: string;
  documento: string;
  presente: string;
}

export interface QuadroDocReclamanteImpugnado {
  documento: string;
  impugnado: string;
  observacao: string;
}

export interface QuadroResumoIntervencao {
  tipo: string;
  qtd: number;
  obs: string;
}

export interface QuadroAjuste {
  tipo: string;
  localizacao: string;
  descricao: string;
}

export interface QuadroData {
  cabecalho: QuadroCabecalho;
  prescricao: QuadroPrescricao[];
  correcoes: QuadroCorrecao[];
  checklist: QuadroChecklistItem[];
  correcoesEscrita: QuadroCorrecaoEscrita[];
  documentosDefesa: QuadroDocumento[];
  docsReclamanteImpugnados: QuadroDocReclamanteImpugnado[];
  resumoIntervencoes: QuadroResumoIntervencao[];
  ajustesPeca: QuadroAjuste[];
}

// ---------------------------------------------------------------------------
// Quadro de Correções — DOCX Builder (Landscape)
// ---------------------------------------------------------------------------

function buildCabecalho(cab: QuadroCabecalho): Table {
  const rows: [string, string][] = [
    ["Processo", cab.processo],
    ["Reclamante", cab.reclamante],
    ["Reclamada + CNPJ", `${cab.reclamada}${cab.cnpj ? ` — ${cab.cnpj}` : ""}`],
    ["DTC", cab.dtc],
    ["DAJ", cab.daj],
  ];
  if (cab.posicaoProcessual) {
    rows.push(["Posição Processual", cab.posicaoProcessual]);
  }
  rows.push([
    "Tese Central",
    `${cab.teseCentral} ${TESE_STATUS_DISPLAY[cab.teseCentralStatus] ?? cab.teseCentralStatus}`,
  ]);

  return new Table({
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              shading: { fill: COLORS.charcoal, type: ShadingType.CLEAR },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: label,
                      ...run,
                      color: COLORS.white,
                      bold: true,
                    }),
                  ],
                }),
              ],
            }),
            cell(value, 75),
          ],
        })
    ),
    borders: TABLE_BORDERS,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function buildPrescricao(items: QuadroPrescricao[]): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      headerCell("Tipo", 20),
      headerCell("Cálculo", 30),
      headerCell("Data-limite", 25),
      headerCell("Status", 25),
    ],
  });
  const dataRows = items.map(
    (p) =>
      new TableRow({
        children: [
          cell(p.tipo, 20),
          cell(p.calculo, 30),
          cell(p.dataLimite, 25),
          cell(
            p.status,
            25,
            p.status.includes("consumada") ? COLORS.red : undefined
          ),
        ],
      })
  );
  return new Table({
    rows: [header, ...dataRows],
    borders: TABLE_BORDERS,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function buildCorrecoes(items: QuadroCorrecao[]): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      headerCell("Nº", 4),
      headerCell("Pedido (conforme inicial)", 18),
      headerCell("Seção da Defesa", 16),
      headerCell("Impugnado?", 8),
      headerCell("Status", 7),
      headerCell("Crit.", 5),
      headerCell("Tipo", 12),
      headerCell("Ação Recomendada", 30),
    ],
  });

  const dataRows = items.map(
    (c) =>
      new TableRow({
        children: [
          cell(String(c.numero), 4),
          cell(c.pedido, 18),
          cell(c.secaoDefesa, 16),
          cell(c.impugnado, 8),
          cell(STATUS_DISPLAY[c.status] ?? c.status, 7),
          cell(
            CRITICIDADE_DISPLAY[c.criticidade] ?? c.criticidade,
            5,
            critColor(c.criticidade),
          ),
          cell(c.tipo, 12),
          cell(c.acaoRecomendada, 30),
        ],
      })
  );

  return new Table({
    rows: [header, ...dataRows],
    borders: TABLE_BORDERS,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function buildChecklist(items: QuadroChecklistItem[]): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      headerCell("Defesa", 35),
      headerCell("✅/❌", 15),
      headerCell("Obs.", 50),
    ],
  });
  const dataRows = items.map(
    (c) =>
      new TableRow({
        children: [
        cell(c.defesa, 35),
        cell(CHECKLIST_STATUS_DISPLAY[c.status] ?? c.status, 15),
        cell(c.obs, 50),
      ],
      })
  );
  return new Table({
    rows: [header, ...dataRows],
    borders: TABLE_BORDERS,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function buildCorrecoesEscrita(items: QuadroCorrecaoEscrita[]): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      headerCell("Tipo", 15),
      headerCell("Localização", 25),
      headerCell("Original", 30),
      headerCell("Correção", 30),
    ],
  });
  const dataRows = items.map(
    (c) =>
      new TableRow({
        children: [
          cell(c.tipo, 15),
          cell(c.localizacao, 25),
          cell(c.original, 30),
          cell(c.correcao, 30),
        ],
      })
  );
  return new Table({
    rows: [header, ...dataRows],
    borders: TABLE_BORDERS,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function buildDocumentosDefesa(items: QuadroDocumento[]): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      headerCell("Assunto/Tema", 30),
      headerCell("Documento", 50),
      headerCell("Presente?", 20),
    ],
  });
  const dataRows = items.map(
    (d) =>
      new TableRow({
        children: [
          cell(d.assunto, 30),
          cell(d.documento, 50),
          cell(PRESENTE_DISPLAY[d.presente] ?? d.presente, 20),
        ],
      })
  );
  return new Table({
    rows: [header, ...dataRows],
    borders: TABLE_BORDERS,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function buildDocsReclamanteImpugnados(
  items: QuadroDocReclamanteImpugnado[]
): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      headerCell("Documento", 35),
      headerCell("Impugnado?(S/N)", 20),
      headerCell("Observação", 45),
    ],
  });
  const dataRows = items.map(
    (d) =>
      new TableRow({
        children: [
          cell(d.documento, 35),
          cell(d.impugnado, 20),
          cell(d.observacao, 45),
        ],
      })
  );
  return new Table({
    rows: [header, ...dataRows],
    borders: TABLE_BORDERS,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function buildResumoIntervencoes(items: QuadroResumoIntervencao[]): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      headerCell("Tipo", 40),
      headerCell("Qtd", 15),
      headerCell("Obs.", 45),
    ],
  });
  const dataRows = items.map(
    (r) =>
      new TableRow({
        children: [cell(r.tipo, 40), cell(String(r.qtd), 15), cell(r.obs, 45)],
      })
  );
  return new Table({
    rows: [header, ...dataRows],
    borders: TABLE_BORDERS,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function buildAjustesPeca(items: QuadroAjuste[]): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      headerCell("Tipo", 20),
      headerCell("Folha/Parágrafo", 25),
      headerCell("Original → Intervenção", 55),
    ],
  });
  const dataRows = items.map(
    (a) =>
      new TableRow({
        children: [
          cell(a.tipo, 20),
          cell(a.localizacao, 25),
          cell(a.descricao, 55),
        ],
      })
  );
  return new Table({
    rows: [header, ...dataRows],
    borders: TABLE_BORDERS,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/**
 * Gera buffer DOCX do Quadro de Correções em LANDSCAPE.
 */
export async function createQuadroDocxBuffer(
  data: QuadroData
): Promise<Buffer> {
  const children: FileChild[] = [];

  // 1. Cabeçalho
  children.push(sectionTitle("1. Cabeçalho"));
  children.push(buildCabecalho(data.cabecalho));

  // 2. Prescrição
  children.push(sectionTitle("2. Prescrição"));
  children.push(buildPrescricao(data.prescricao));

  // 3. Quadro de Correções
  children.push(sectionTitle("3. Quadro de Correções"));
  children.push(buildCorrecoes(data.correcoes));

  // 4. Checklist
  children.push(sectionTitle("4. Checklist"));
  children.push(buildChecklist(data.checklist));

  // 5. Correções de Escrita
  if (data.correcoesEscrita.length > 0) {
    children.push(sectionTitle("5. Correções de Escrita"));
    children.push(buildCorrecoesEscrita(data.correcoesEscrita));
  }

  // 6. Documentos da Defesa
  children.push(sectionTitle("6. Documentos da Defesa"));
  children.push(buildDocumentosDefesa(data.documentosDefesa));
  if (data.docsReclamanteImpugnados.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Docs do Reclamante — Impugnados?",
            ...run,
            bold: true,
            color: COLORS.charcoal,
          }),
        ],
        spacing: { before: 120, after: 60 },
      })
    );
    children.push(buildDocsReclamanteImpugnados(data.docsReclamanteImpugnados));
  }

  // 7. Resumo de Intervenções
  children.push(sectionTitle("7. Resumo de Intervenções"));
  children.push(buildResumoIntervencoes(data.resumoIntervencoes));

  // 8. Ajustes na Peça
  if (data.ajustesPeca.length > 0) {
    children.push(sectionTitle("8. Ajustes na Peça"));
    children.push(buildAjustesPeca(data.ajustesPeca));
  }

  // Rodapé texto
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Saída gerada por IA. Revisão humana obrigatória antes de qualquer uso profissional.",
          font: FONT,
          size: FONT_SIZE_SMALL,
          color: COLORS.gray,
          italics: true,
        }),
      ],
      spacing: { before: 300 },
    })
  );

  const headerText = `AutuorIA — Quadro de Correções | ${data.cabecalho.processo}`;

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 16_838,
              height: 11_906,
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: AUTUORIA_MARGIN,
              right: AUTUORIA_MARGIN,
              bottom: AUTUORIA_MARGIN,
              left: AUTUORIA_MARGIN,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: headerText,
                    font: FONT,
                    size: FONT_SIZE_SMALL,
                    color: COLORS.charcoal,
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
                    text: "AutuorIA | Pág. ",
                    font: FONT,
                    size: FONT_SIZE_SMALL,
                    color: COLORS.charcoal,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT,
                    size: FONT_SIZE_SMALL,
                    color: COLORS.charcoal,
                  }),
                  new TextRun({
                    text: " / ",
                    font: FONT,
                    size: FONT_SIZE_SMALL,
                    color: COLORS.charcoal,
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: FONT,
                    size: FONT_SIZE_SMALL,
                    color: COLORS.charcoal,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

// ---------------------------------------------------------------------------
// Contestação Revisada — Marker Parser
// ---------------------------------------------------------------------------

export interface RevisadaSegment {
  type: "original" | "insertion" | "deletion";
  text: string;
}

export interface RevisadaComment {
  id: number;
  text: string;
  /** Posição aproximada: índice do parágrafo onde o comentário se aplica. */
  paragraphIndex: number;
}

export interface RevisadaParagraph {
  segments: RevisadaSegment[];
  comments: RevisadaComment[];
  isHeading?: boolean;
  headingLevel?: 1 | 2 | 3;
}

/**
 * Analisa o texto com marcadores [INS]...[/INS], [DEL]...[/DEL],
 * [COMMENT id=N]...[/COMMENT] e produz estrutura tipada.
 */
export function parseRevisadaMarkers(content: string): RevisadaParagraph[] {
  const lines = content.split(/\r?\n/);
  const paragraphs: RevisadaParagraph[] = [];

  for (const line of lines) {
    if (line.trim().length === 0) {
      paragraphs.push({
        segments: [{ type: "original", text: "" }],
        comments: [],
      });
      continue;
    }

    // Check heading
    let isHeading = false;
    let headingLevel: 1 | 2 | 3 | undefined;
    let processedLine = line;

    // Detect markdown-style headings (not common in legal docs, but handle gracefully)
    const h1Match = /^#{1,2}\s+(.+)$/.exec(line);
    const h2Match = /^#{3}\s+(.+)$/.exec(line);
    if (h1Match) {
      isHeading = true;
      headingLevel = 1;
      processedLine = h1Match[1];
    } else if (h2Match) {
      isHeading = true;
      headingLevel = 2;
      processedLine = h2Match[1];
    }

    const segments: RevisadaSegment[] = [];
    const comments: RevisadaComment[] = [];

    // Parse markers
    let remaining = processedLine;
    while (remaining.length > 0) {
      // Find the next marker
      const insIdx = remaining.indexOf("[INS]");
      const delIdx = remaining.indexOf("[DEL]");
      const commentIdx = remaining.indexOf("[COMMENT ");

      const indices = [
        insIdx >= 0 ? insIdx : Number.POSITIVE_INFINITY,
        delIdx >= 0 ? delIdx : Number.POSITIVE_INFINITY,
        commentIdx >= 0 ? commentIdx : Number.POSITIVE_INFINITY,
      ];
      const minIdx = Math.min(...indices);

      if (minIdx === Number.POSITIVE_INFINITY) {
        // No more markers — rest is original text
        if (remaining.length > 0) {
          segments.push({ type: "original", text: remaining });
        }
        break;
      }

      // Text before the marker
      if (minIdx > 0) {
        segments.push({ type: "original", text: remaining.slice(0, minIdx) });
      }
      remaining = remaining.slice(minIdx);

      if (remaining.startsWith("[INS]")) {
        remaining = remaining.slice(5); // skip [INS]
        const closeIdx = remaining.indexOf("[/INS]");
        if (closeIdx === -1) {
          segments.push({ type: "insertion", text: remaining });
          remaining = "";
        } else {
          segments.push({
            type: "insertion",
            text: remaining.slice(0, closeIdx),
          });
          remaining = remaining.slice(closeIdx + 6);
        }
      } else if (remaining.startsWith("[DEL]")) {
        remaining = remaining.slice(5);
        const closeIdx = remaining.indexOf("[/DEL]");
        if (closeIdx === -1) {
          segments.push({ type: "deletion", text: remaining });
          remaining = "";
        } else {
          segments.push({
            type: "deletion",
            text: remaining.slice(0, closeIdx),
          });
          remaining = remaining.slice(closeIdx + 6);
        }
      } else if (remaining.startsWith("[COMMENT ")) {
        // Parse [COMMENT id=N]...[/COMMENT]
        const idMatch = /^\[COMMENT\s+id=(\d+)\]/.exec(remaining);
        if (idMatch) {
          const commentId = Number.parseInt(idMatch[1], 10);
          remaining = remaining.slice(idMatch[0].length);
          const closeIdx = remaining.indexOf("[/COMMENT]");
          if (closeIdx === -1) {
            comments.push({
              id: commentId,
              text: remaining,
              paragraphIndex: paragraphs.length,
            });
            remaining = "";
          } else {
            comments.push({
              id: commentId,
              text: remaining.slice(0, closeIdx),
              paragraphIndex: paragraphs.length,
            });
            remaining = remaining.slice(closeIdx + 10);
          }
        } else {
          // Malformed comment marker — treat as text
          segments.push({ type: "original", text: "[COMMENT " });
          remaining = remaining.slice(9);
        }
      }
    }

    // Default: if no segments were added, add an empty original
    if (segments.length === 0) {
      segments.push({ type: "original", text: "" });
    }

    paragraphs.push({ segments, comments, isHeading, headingLevel });
  }

  return paragraphs;
}

// ---------------------------------------------------------------------------
// Contestação Revisada — DOCX Builder (Portrait, Colors, Comments)
// ---------------------------------------------------------------------------

/**
 * Gera buffer DOCX da Contestação Revisada com marcações coloridas e comentários Word.
 * - Inserções: azul
 * - Remoções: vermelho tachado
 * - Comentários Word com autor "AutuorIA"
 */
export async function createRevisadaDocxBuffer(
  content: string,
  title: string
): Promise<Buffer> {
  const parsed = parseRevisadaMarkers(content);

  // Collect all comments for the Document comments section (ICommentOptions format)
  const allComments: ICommentOptions[] = [];
  const commentMap = new Map<number, { id: number; text: string }>();

  for (const p of parsed) {
    for (const c of p.comments) {
      if (!commentMap.has(c.id)) {
        commentMap.set(c.id, c);
      }
    }
  }

  for (const [, c] of commentMap) {
    allComments.push({
      id: c.id,
      author: "AutuorIA",
      date: new Date(),
      children: [
        new Paragraph({
          children: [new TextRun({ text: c.text, font: FONT, size: 20 })],
        }),
      ],
    });
  }

  // Build paragraphs
  const bodyChildren: FileChild[] = [];

  for (const p of parsed) {
    const runs: (
      | TextRun
      | CommentRangeStart
      | CommentRangeEnd
      | CommentReference
    )[] = [];

    // Determine if this paragraph has comments
    const paraComments = p.comments;
    const hasComments = paraComments.length > 0;

    // Start comment ranges at beginning of paragraph
    if (hasComments) {
      for (const c of paraComments) {
        runs.push(new CommentRangeStart(c.id));
      }
    }

    for (const seg of p.segments) {
      if (seg.text.length === 0 && seg.type === "original") {
        continue;
      }

      switch (seg.type) {
        case "original":
          runs.push(new TextRun({ text: seg.text, ...run }));
          break;
        case "insertion":
          runs.push(
            new TextRun({
              text: seg.text,
              ...run,
              color: COLORS.blue,
            })
          );
          break;
        case "deletion":
          runs.push(
            new TextRun({
              text: seg.text,
              ...run,
              color: COLORS.red,
              strike: true,
            })
          );
          break;
        default:
          break;
      }
    }

    // End comment ranges and add references
    if (hasComments) {
      for (const c of paraComments) {
        runs.push(new CommentRangeEnd(c.id));
        runs.push(new CommentReference(c.id));
      }
    }

    if (p.isHeading) {
      bodyChildren.push(
        new Paragraph({
          heading:
            p.headingLevel === 1
              ? HeadingLevel.HEADING_1
              : p.headingLevel === 2
                ? HeadingLevel.HEADING_2
                : HeadingLevel.HEADING_3,
          children:
            runs.length > 0 ? runs : [new TextRun({ text: "", ...run })],
          spacing: { after: SPACING_AFTER },
        })
      );
    } else {
      bodyChildren.push(
        new Paragraph({
          children:
            runs.length > 0 ? runs : [new TextRun({ text: "", ...run })],
          spacing: { after: 60 },
        })
      );
    }
  }

  const doc = new Document({
    comments: allComments.length > 0 ? { children: allComments } : undefined,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: AUTUORIA_MARGIN,
              right: AUTUORIA_MARGIN,
              bottom: AUTUORIA_MARGIN,
              left: AUTUORIA_MARGIN,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `AutuorIA — Contestação Revisada | ${title}`,
                    font: FONT,
                    size: FONT_SIZE_SMALL,
                    color: COLORS.charcoal,
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
                    text: "AutuorIA | Pág. ",
                    font: FONT,
                    size: FONT_SIZE_SMALL,
                    color: COLORS.charcoal,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT,
                    size: FONT_SIZE_SMALL,
                    color: COLORS.charcoal,
                  }),
                  new TextRun({
                    text: " / ",
                    font: FONT,
                    size: FONT_SIZE_SMALL,
                    color: COLORS.charcoal,
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: FONT,
                    size: FONT_SIZE_SMALL,
                    color: COLORS.charcoal,
                  }),
                ],
              }),
            ],
          }),
        },
        children:
          bodyChildren.length > 0
            ? bodyChildren
            : [new Paragraph({ text: "" })],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
