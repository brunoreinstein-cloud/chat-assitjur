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
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import type {
  Alerta,
  DocumentoStatus,
  Pedido,
  ProximoPasso,
  RelatorioAnalise,
} from "@/lib/legal/case-analysis.types";

// ---------------------------------------------------------------------------
// Constantes de estilo (alinhadas com document-to-docx.ts)
// ---------------------------------------------------------------------------

const FONT_FAMILY = "Calibri";
const FONT_SIZE = 22; // 11pt (22 half-points)
const FONT_SIZE_H1 = 32; // 16pt — título principal
const FONT_SIZE_H2 = 26; // 13pt — cabeçalho de módulo
const FONT_SIZE_H3 = 23; // 11.5pt — sub-secção
const FONT_SIZE_SMALL = 18; // 9pt
const SPACING_AFTER = 100;
const SPACING_AFTER_H = 140;
const PAGE_MARGIN = convertMillimetersToTwip(25.4);

const COLORS = {
  charcoal: "2B2B2B",
  branco: "FFFFFF",
  dourado: "B8860B",
  douradoClaro: "FEF3C7",
  azul: "1E40AF",
  azulClaro: "DBEAFE",
  vermelho: "DC2626",
  vermelhoClaro: "FEE2E2",
  ambar: "D97706",
  ambarClaro: "FEF3C7",
  verde: "16A34A",
  verdeClaro: "DCFCE7",
  cinzaClaro: "F3F4F6",
  borda: "D1D5DB",
  texto: "1F2937",
  textoSecundario: "6B7280",
} as const;

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

const BORDERS_DEFAULT = {
  top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.borda },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.borda },
  left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.borda },
  right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.borda },
  insideHorizontal: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: COLORS.borda,
  },
  insideVertical: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: COLORS.borda,
  },
} as const;

const BORDERS_HEADER = {
  ...BORDERS_DEFAULT,
  top: { style: BorderStyle.SINGLE, size: 8, color: COLORS.dourado },
} as const;

// ---------------------------------------------------------------------------
// Helpers de construção
// ---------------------------------------------------------------------------

function run(
  text: string,
  opts: {
    bold?: boolean;
    color?: string;
    size?: number;
    italic?: boolean;
    smallCaps?: boolean;
  } = {}
): TextRun {
  return new TextRun({
    text,
    font: FONT_FAMILY,
    size: opts.size ?? FONT_SIZE,
    bold: opts.bold ?? false,
    italics: opts.italic ?? false,
    color: opts.color ?? COLORS.texto,
    smallCaps: opts.smallCaps ?? false,
  });
}

function para(
  children: TextRun[],
  opts: {
    spacingAfter?: number;
    indent?: number;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  } = {}
): Paragraph {
  return new Paragraph({
    children,
    spacing: { after: opts.spacingAfter ?? SPACING_AFTER },
    indent: opts.indent ? { left: opts.indent } : undefined,
    alignment: opts.alignment,
  });
}

function h1(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: FONT_FAMILY,
        size: FONT_SIZE_H1,
        color: COLORS.branco,
        bold: true,
      }),
    ],
    shading: { fill: COLORS.charcoal, type: ShadingType.CLEAR },
    spacing: { after: SPACING_AFTER_H },
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: FONT_FAMILY,
        size: FONT_SIZE_H2,
        color: COLORS.dourado,
        bold: true,
      }),
    ],
    spacing: { before: 200, after: SPACING_AFTER_H },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.dourado },
    },
  });
}

function h3(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: FONT_FAMILY,
        size: FONT_SIZE_H3,
        color: COLORS.azul,
        bold: true,
      }),
    ],
    spacing: { before: 140, after: 80 },
  });
}

function emptyLine(): Paragraph {
  return new Paragraph({ children: [], spacing: { after: 80 } });
}

/**
 * Par de campos: "Label:" valor numa única linha.
 */
function fieldLine(label: string, value: string | null | undefined): Paragraph {
  const v = value?.trim() || "—";
  return para([
    run(`${label}: `, { bold: true, size: FONT_SIZE }),
    run(v, { color: COLORS.textoSecundario }),
  ]);
}

/** Célula de cabeçalho de tabela (fundo cinza). */
function thCell(text: string, widthPct?: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          run(text, { bold: true, size: FONT_SIZE_SMALL, color: COLORS.texto }),
        ],
        spacing: { after: 0 },
      }),
    ],
    shading: { fill: COLORS.cinzaClaro, type: ShadingType.CLEAR },
    borders: BORDERS_DEFAULT,
    width: widthPct
      ? { size: widthPct, type: WidthType.PERCENTAGE }
      : undefined,
  });
}

/** Célula de dados de tabela. */
function tdCell(
  text: string,
  opts: { bold?: boolean; color?: string; widthPct?: number } = {}
): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          run(text || "—", {
            size: FONT_SIZE_SMALL,
            bold: opts.bold,
            color: opts.color,
          }),
        ],
        spacing: { after: 0 },
      }),
    ],
    borders: BORDERS_DEFAULT,
    width: opts.widthPct
      ? { size: opts.widthPct, type: WidthType.PERCENTAGE }
      : undefined,
  });
}

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}

// ---------------------------------------------------------------------------
// Secção M1 — Identificação
// ---------------------------------------------------------------------------

function buildIdentificacao(data: RelatorioAnalise): FileChild[] {
  const id = data.identificacao;
  const items: FileChild[] = [
    h2("M1 — Identificação do Processo"),
    fieldLine("Processo", id.numeroProcesso),
    fieldLine("Vara", id.vara),
    fieldLine("Comarca", id.comarca),
    fieldLine("Ajuizamento", formatDate(id.dataAjuizamento)),
    fieldLine("Audiência", formatDate(id.dataAudiencia)),
    emptyLine(),
    h3("Reclamante"),
    fieldLine("Nome", id.reclamante.nome),
    fieldLine("CPF/CNPJ", id.reclamante.cpfCnpj),
    fieldLine("Localidade", id.reclamante.localidade),
    ...(id.advogadoReclamante
      ? [
          fieldLine("Advogado", id.advogadoReclamante.nome),
          fieldLine("OAB", id.advogadoReclamante.oab),
        ]
      : []),
    emptyLine(),
    h3("Reclamada"),
    fieldLine("Nome", id.reclamada.nome),
    fieldLine("CPF/CNPJ", id.reclamada.cpfCnpj),
    fieldLine("Localidade", id.reclamada.localidade),
    ...(id.advogadoReclamada
      ? [
          fieldLine("Advogado", id.advogadoReclamada.nome),
          fieldLine("OAB", id.advogadoReclamada.oab),
        ]
      : []),
  ];
  return items;
}

// ---------------------------------------------------------------------------
// Secção M2 — Dados do Contrato
// ---------------------------------------------------------------------------

function buildContrato(data: RelatorioAnalise): FileChild[] {
  const c = data.contrato;
  const items: FileChild[] = [
    h2("M2 — Dados do Contrato"),
    fieldLine("Admissão", formatDate(c.admissao)),
    fieldLine("Término", formatDate(c.termino)),
    fieldLine("Rescisão", c.modalidadeRescisao),
    fieldLine("Cargo CTPS", c.cargoCtps),
    fieldLine("Cargo real", c.cargoReal),
    fieldLine("Salário inicial", formatCurrency(c.salarioInicial)),
    fieldLine("Salário final", formatCurrency(c.salarioFinal)),
  ];

  if (c.jornadaAlegada) {
    items.push(
      emptyLine(),
      h3("Jornada Alegada"),
      fieldLine("Escala", c.jornadaAlegada.escala),
      ...(c.jornadaAlegada.horarios.length > 0
        ? [fieldLine("Horários", c.jornadaAlegada.horarios.join(" | "))]
        : []),
      ...(c.jornadaAlegada.observacoes
        ? [fieldLine("Observações", c.jornadaAlegada.observacoes)]
        : [])
    );
  }

  if (c.eventosCronologicos.length > 0) {
    items.push(emptyLine(), h3("Cronologia"));
    for (const ev of c.eventosCronologicos) {
      items.push(
        para(
          [
            run(`${formatDate(ev.data)}  `, {
              bold: true,
              size: FONT_SIZE_SMALL,
            }),
            run(ev.descricao, { size: FONT_SIZE_SMALL }),
            ...(ev.pagReferencia
              ? [
                  run(`  (${ev.pagReferencia})`, {
                    size: FONT_SIZE_SMALL,
                    color: COLORS.textoSecundario,
                    italic: true,
                  }),
                ]
              : []),
          ],
          { indent: 360, spacingAfter: 60 }
        )
      );
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Secção M3 — Mapa de Pedidos
// ---------------------------------------------------------------------------

const RISCO_COLOR: Record<string, string> = {
  provavel: COLORS.vermelho,
  possivel: COLORS.ambar,
  remoto: COLORS.verde,
};

const RISCO_LABEL: Record<string, string> = {
  provavel: "Provável",
  possivel: "Possível",
  remoto: "Remoto",
};

function buildPedidos(data: RelatorioAnalise): FileChild[] {
  const { pedidos, valorTotalPleiteado } = data;
  if (pedidos.length === 0) return [];

  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        thCell("#", 5),
        thCell("Verba", 35),
        thCell("Valor Pleiteado", 18),
        thCell("Fundamento Legal", 27),
        thCell("Risco", 15),
      ],
    }),
    ...pedidos.map(
      (p) =>
        new TableRow({
          children: [
            tdCell(String(p.numero), { widthPct: 5 }),
            tdCell(p.verba, { widthPct: 35 }),
            tdCell(formatCurrency(p.valorPleiteado), { widthPct: 18 }),
            tdCell(p.fundamentoLegal ?? "—", { widthPct: 27 }),
            tdCell(p.risco ? (RISCO_LABEL[p.risco] ?? p.risco) : "—", {
              widthPct: 15,
              color: p.risco ? RISCO_COLOR[p.risco] : undefined,
              bold: !!p.risco,
            }),
          ],
        })
    ),
    // Linha de total
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 2,
          children: [
            new Paragraph({
              children: [run("TOTAL PLEITEADO", { bold: true, size: FONT_SIZE_SMALL })],
              spacing: { after: 0 },
            }),
          ],
          shading: { fill: COLORS.douradoClaro, type: ShadingType.CLEAR },
          borders: BORDERS_DEFAULT,
        }),
        tdCell(formatCurrency(valorTotalPleiteado), {
          bold: true,
          color: COLORS.azul,
        }),
        new TableCell({
          columnSpan: 2,
          children: [new Paragraph({ children: [], spacing: { after: 0 } })],
          borders: BORDERS_DEFAULT,
        }),
      ],
    }),
  ];

  return [
    h2("M3 — Mapa de Pedidos"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDERS_HEADER,
      rows,
    }),
    emptyLine(),
  ];
}

// ---------------------------------------------------------------------------
// Secção M4 — Alertas
// ---------------------------------------------------------------------------

const ALERTA_BG: Record<string, string> = {
  critico: COLORS.vermelhoClaro,
  atencao: COLORS.ambarClaro,
  informativo: COLORS.azulClaro,
};

const ALERTA_LABEL: Record<string, string> = {
  critico: "⚠ CRÍTICO",
  atencao: "⚠ ATENÇÃO",
  informativo: "ℹ INFO",
};

function buildAlertas(data: RelatorioAnalise): FileChild[] {
  const { alertas } = data;
  if (alertas.length === 0) return [];

  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        thCell("Tipo", 12),
        thCell("Módulo", 10),
        thCell("Mensagem", 48),
        thCell("Acção Recomendada", 30),
      ],
    }),
    ...alertas.map(
      (a) =>
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    run(ALERTA_LABEL[a.tipo] ?? a.tipo, {
                      bold: true,
                      size: FONT_SIZE_SMALL,
                      color:
                        a.tipo === "critico"
                          ? COLORS.vermelho
                          : a.tipo === "atencao"
                            ? COLORS.ambar
                            : COLORS.azul,
                    }),
                  ],
                  spacing: { after: 0 },
                }),
              ],
              shading: {
                fill: ALERTA_BG[a.tipo] ?? COLORS.cinzaClaro,
                type: ShadingType.CLEAR,
              },
              borders: BORDERS_DEFAULT,
              width: { size: 12, type: WidthType.PERCENTAGE },
            }),
            tdCell(a.modulo, { widthPct: 10 }),
            tdCell(a.mensagem, { widthPct: 48 }),
            tdCell(a.acao ?? "—", {
              widthPct: 30,
              color: COLORS.textoSecundario,
            }),
          ],
        })
    ),
  ];

  return [
    h2("M4 — Alertas e Pontos de Atenção"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDERS_HEADER,
      rows,
    }),
    emptyLine(),
  ];
}

// ---------------------------------------------------------------------------
// Secção M5 — Documentos
// ---------------------------------------------------------------------------

const DOC_STATUS_LABEL: Record<DocumentoStatus["status"], string> = {
  disponivel: "✔ Disponível",
  parcial: "⚑ Parcial",
  ausente: "✖ Ausente",
};

const DOC_STATUS_COLOR: Record<DocumentoStatus["status"], string> = {
  disponivel: COLORS.verde,
  parcial: COLORS.ambar,
  ausente: COLORS.vermelho,
};

function buildDocumentos(data: RelatorioAnalise): FileChild[] {
  const { documentos } = data;
  if (documentos.length === 0) return [];

  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        thCell("Documento", 45),
        thCell("Status", 18),
        thCell("Páginas", 15),
        thCell("Observações", 22),
      ],
    }),
    ...documentos.map(
      (d) =>
        new TableRow({
          children: [
            tdCell(d.nome, { bold: true, widthPct: 45 }),
            tdCell(DOC_STATUS_LABEL[d.status], {
              color: DOC_STATUS_COLOR[d.status],
              bold: true,
              widthPct: 18,
            }),
            tdCell(d.paginas ?? "—", { widthPct: 15 }),
            tdCell(d.observacoes ?? "—", {
              widthPct: 22,
              color: COLORS.textoSecundario,
            }),
          ],
        })
    ),
  ];

  return [
    h2("M5 — Documentos"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDERS_HEADER,
      rows,
    }),
    emptyLine(),
  ];
}

// ---------------------------------------------------------------------------
// Secção M6 — Próximos Passos
// ---------------------------------------------------------------------------

const PRIORIDADE_COLOR: Record<ProximoPasso["prioridade"], string> = {
  alta: COLORS.vermelho,
  media: COLORS.ambar,
  baixa: COLORS.textoSecundario,
};

const RESPONSAVEL_LABEL: Record<ProximoPasso["responsavel"], string> = {
  advogado: "Advogado",
  ia: "IA",
  sistema: "Sistema",
};

function buildProximosPassos(data: RelatorioAnalise): FileChild[] {
  const { proximosPassos } = data;
  if (proximosPassos.length === 0) return [];

  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        thCell("Acção", 55),
        thCell("Responsável", 20),
        thCell("Prioridade", 15),
        thCell("Estado", 10),
      ],
    }),
    ...proximosPassos.map(
      (p) =>
        new TableRow({
          children: [
            tdCell(p.descricao, {
              bold: !p.concluido,
              widthPct: 55,
              color: p.concluido ? COLORS.textoSecundario : COLORS.texto,
            }),
            tdCell(RESPONSAVEL_LABEL[p.responsavel], { widthPct: 20 }),
            tdCell(p.prioridade.charAt(0).toUpperCase() + p.prioridade.slice(1), {
              color: PRIORIDADE_COLOR[p.prioridade],
              bold: p.prioridade === "alta",
              widthPct: 15,
            }),
            tdCell(p.concluido ? "✔ Feito" : "Pendente", {
              color: p.concluido ? COLORS.verde : COLORS.ambar,
              widthPct: 10,
            }),
          ],
        })
    ),
  ];

  return [
    h2("M6 — Próximos Passos"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDERS_HEADER,
      rows,
    }),
    emptyLine(),
  ];
}

// ---------------------------------------------------------------------------
// Cabeçalho e rodapé
// ---------------------------------------------------------------------------

function buildHeader(data: RelatorioAnalise): Header {
  const id = data.identificacao;
  const title = id.numeroProcesso
    ? `Processo ${id.numeroProcesso}`
    : `${id.reclamante.nome} × ${id.reclamada.nome}`;
  return new Header({
    children: [
      new Paragraph({
        children: [
          run("AssistJur.IA — Relatório de Análise  ", {
            bold: true,
            size: FONT_SIZE_SMALL,
            color: COLORS.dourado,
          }),
          run(title, { size: FONT_SIZE_SMALL, color: COLORS.textoSecundario }),
        ],
        border: {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 4,
            color: COLORS.borda,
          },
        },
        spacing: { after: 80 },
      }),
    ],
  });
}

function buildFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          run("Página ", {
            size: FONT_SIZE_SMALL,
            color: COLORS.textoSecundario,
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            font: FONT_FAMILY,
            size: FONT_SIZE_SMALL,
            color: COLORS.textoSecundario,
          }),
          run(" de ", {
            size: FONT_SIZE_SMALL,
            color: COLORS.textoSecundario,
          }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            font: FONT_FAMILY,
            size: FONT_SIZE_SMALL,
            color: COLORS.textoSecundario,
          }),
          run("    —    Gerado automaticamente. Não substitui análise jurídica.", {
            size: FONT_SIZE_SMALL,
            color: COLORS.textoSecundario,
            italic: true,
          }),
        ],
        alignment: AlignmentType.CENTER,
        border: {
          top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.borda },
        },
        spacing: { before: 80 },
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Gera um Buffer DOCX a partir de um RelatorioAnalise estruturado.
 *
 * @example
 * const buffer = await relatorioToDocxBuffer(relatorio);
 * return new Response(buffer, {
 *   headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
 * });
 */
export async function relatorioToDocxBuffer(
  data: RelatorioAnalise
): Promise<Buffer> {
  const id = data.identificacao;
  const title = id.numeroProcesso
    ? `Relatório de Análise — Processo ${id.numeroProcesso}`
    : `Relatório de Análise — ${id.reclamante.nome} × ${id.reclamada.nome}`;

  const titlePara = h1(title);

  const subtitlePara = para(
    [
      run(
        `${id.reclamante.nome}  ×  ${id.reclamada.nome}   |   Gerado em ${new Date(data.geradoEm).toLocaleDateString("pt-BR")}`,
        { size: FONT_SIZE_SMALL, color: COLORS.textoSecundario }
      ),
    ],
    { spacingAfter: 200 }
  );

  const allChildren: FileChild[] = [
    titlePara,
    subtitlePara,
    ...buildIdentificacao(data),
    ...buildContrato(data),
    ...buildPedidos(data),
    ...buildAlertas(data),
    ...buildDocumentos(data),
    ...buildProximosPassos(data),
  ];

  const doc = new Document({
    creator: "AssistJur.IA",
    title,
    description: `Relatório de Análise — ${title}`,
    sections: [
      {
        properties: PAGE_MARGIN_PROPS,
        headers: { default: buildHeader(data) },
        footers: { default: buildFooter() },
        children: allChildren,
      },
    ],
  });

  const arrayBuffer = await Packer.toBuffer(doc);
  return Buffer.from(arrayBuffer);
}

/**
 * Sugere um nome de ficheiro seguro para o relatório.
 * Ex.: "relatorio_1000650-10.2019.5.02.0446.docx"
 */
export function relatorioFilename(data: RelatorioAnalise): string {
  const id = data.identificacao;
  const base = id.numeroProcesso
    ? `relatorio_${id.numeroProcesso}`
    : `relatorio_${id.reclamante.nome.split(" ")[0]}_${id.reclamada.nome.split(" ")[0]}`;

  // Remove caracteres inválidos em nomes de ficheiro
  const safe = base
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 100);

  return `${safe}.docx`;
}
