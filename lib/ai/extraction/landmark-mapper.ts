/**
 * Passo 0 — Mapeamento de Landmarks (SPEC §3.3, §9.5)
 *
 * Localiza e mapeia as seções-chave de um PDF processual PJe ANTES
 * da extração, reduzindo drasticamente o tempo de análise em PDFs >500 pgs.
 *
 * Fluxo: PDF → páginas → detectar landmarks → mapa de páginas → guiar extração.
 *
 * Performance: O(N) scan único sobre todas as páginas (sem LLM call).
 */

// ─── Tipos ───────────────────────────────────────────────────────────

export type LandmarkType =
  | "capa"
  | "peticao_inicial"
  | "contestacao"
  | "reconvencao"
  | "replica"
  | "ata_audiencia"
  | "laudo_pericial"
  | "sentenca"
  | "acordao"
  | "embargos_declaracao"
  | "recurso_ordinario"
  | "recurso_revista"
  | "calculos_liquidacao"
  | "certidao_transito"
  | "homologacao"
  | "ctps_adp"
  | "documentos_contratuais"
  | "indice_pje";

export interface Landmark {
  type: LandmarkType;
  label: string;
  /** Primeira página onde o landmark foi detectado. -1 = não encontrado. */
  startPage: number;
  /** Última página do bloco (estimativa). -1 = não determinado. */
  endPage: number;
  /** Confiança da detecção (0-1). 1 = keyword exata no título. */
  confidence: number;
  /** Se true, seção está presente no documento. */
  found: boolean;
}

export interface LandmarkMap {
  /** Total de páginas do documento. */
  totalPages: number;
  /** Total de páginas de conteúdo (excluindo assinaturas). */
  contentPages: number;
  /** Landmarks detectados (encontrados e não encontrados). */
  landmarks: Landmark[];
  /** Fase processual detectada. */
  faseProcessual: string;
  /** Páginas que são apenas assinatura digital. */
  signaturePages: number;
  /** Resumo textual para injeção no prompt do agente. */
  summary: string;
}

// ─── Definição dos landmarks a buscar ────────────────────────────────

interface LandmarkDef {
  type: LandmarkType;
  label: string;
  /** Keywords que devem aparecer na área de título da página (primeiros 600 chars). */
  titleKeywords: string[];
  /** Keywords que podem aparecer em qualquer parte da página (fallback). */
  bodyKeywords?: string[];
  /** Se true, pode aparecer múltiplas vezes (ex: atas de audiência). */
  multiple?: boolean;
  /** Região preferencial (início, meio, fim do documento). */
  region?: "head" | "middle" | "tail";
}

const LANDMARK_DEFS: LandmarkDef[] = [
  {
    type: "capa",
    label: "Capa / Cabeçalho",
    titleKeywords: [
      "PODER JUDICIÁRIO",
      "JUSTIÇA DO TRABALHO",
      "TRIBUNAL REGIONAL",
    ],
    region: "head",
  },
  {
    type: "peticao_inicial",
    label: "Petição Inicial",
    titleKeywords: [
      "PETIÇÃO INICIAL",
      "RECLAMAÇÃO TRABALHISTA",
      "EXCELENTÍSSIMO",
    ],
    bodyKeywords: ["RECLAMANTE", "RECLAMADA", "REQUER"],
    region: "head",
  },
  {
    type: "contestacao",
    label: "Contestação",
    titleKeywords: ["CONTESTAÇÃO", "CONTESTACAO", "DEFESA"],
    bodyKeywords: ["IMPUGNA", "CONTESTA", "PRELIMINARMENTE"],
  },
  {
    type: "reconvencao",
    label: "Reconvenção",
    titleKeywords: ["RECONVENÇÃO", "PEDIDO RECONVENCIONAL"],
  },
  {
    type: "replica",
    label: "Réplica",
    titleKeywords: ["RÉPLICA", "REPLICA", "IMPUGNAÇÃO À CONTESTAÇÃO"],
  },
  {
    type: "ata_audiencia",
    label: "Ata de Audiência",
    titleKeywords: [
      "ATA DE AUDIÊNCIA",
      "ATA DA AUDIÊNCIA",
      "AUDIÊNCIA DE INSTRUÇÃO",
      "AUDIÊNCIA INICIAL",
    ],
    multiple: true,
  },
  {
    type: "laudo_pericial",
    label: "Laudo Pericial",
    titleKeywords: [
      "LAUDO PERICIAL",
      "LAUDO DE PERÍCIA",
      "PERÍCIA TÉCNICA",
      "LAUDO DO PERITO",
    ],
  },
  {
    type: "sentenca",
    label: "Sentença",
    titleKeywords: ["SENTENÇA", "EM NOME DA REPÚBLICA", "CONCLUSÃO E DECISÃO"],
    bodyKeywords: ["DISPOSITIVO", "JULGO", "CONDENO"],
  },
  {
    type: "acordao",
    label: "Acórdão",
    titleKeywords: [
      "ACÓRDÃO",
      "ACORDÃO",
      "VISTOS, RELATADOS E DISCUTIDOS",
      "VISTOS, RELATADOS",
    ],
  },
  {
    type: "embargos_declaracao",
    label: "Embargos de Declaração",
    titleKeywords: ["EMBARGOS DE DECLARAÇÃO", "EMBARGOS DECLARATÓRIOS"],
  },
  {
    type: "recurso_ordinario",
    label: "Recurso Ordinário",
    titleKeywords: [
      "RECURSO ORDINÁRIO",
      "RAZÕES DE RECURSO ORDINÁRIO",
      "CONTRARRAZÕES",
    ],
  },
  {
    type: "recurso_revista",
    label: "Recurso de Revista / Agravo",
    titleKeywords: [
      "RECURSO DE REVISTA",
      "AGRAVO DE INSTRUMENTO",
      "AGRAVO INTERNO",
      "AIRR",
    ],
  },
  {
    type: "calculos_liquidacao",
    label: "Cálculos de Liquidação",
    titleKeywords: [
      "CÁLCULO DE LIQUIDAÇÃO",
      "CONTA DE LIQUIDAÇÃO",
      "PLANILHA DE CÁLCULO",
      "MEMÓRIA DE CÁLCULO",
    ],
    bodyKeywords: ["DEMONSTRATIVO", "VALORES APURADOS"],
  },
  {
    type: "certidao_transito",
    label: "Certidão de Trânsito em Julgado",
    titleKeywords: [
      "CERTIDÃO DE TRÂNSITO",
      "TRANSITOU EM JULGADO",
      "CERTIFICO O TRÂNSITO",
    ],
  },
  {
    type: "homologacao",
    label: "Sentença de Homologação",
    titleKeywords: [
      "HOMOLOGAÇÃO",
      "HOMOLOGO",
      "HOMOLOGA O ACORDO",
      "HOMOLOGA OS CÁLCULOS",
    ],
  },
  {
    type: "ctps_adp",
    label: "CTPS / ADP",
    titleKeywords: [
      "CTPS",
      "CARTEIRA DE TRABALHO",
      "ADP",
      "PERFIL PROFISSIOGRÁFICO",
    ],
  },
  {
    type: "documentos_contratuais",
    label: "Documentos Contratuais",
    titleKeywords: [
      "TRCT",
      "TERMO DE RESCISÃO",
      "HOLERITE",
      "CONTRACHEQUE",
      "CONTRATO DE TRABALHO",
    ],
  },
  {
    type: "indice_pje",
    label: "Índice PJe",
    titleKeywords: [
      "ÍNDICE",
      "INDICE",
      "LISTA DE DOCUMENTOS",
      "MOVIMENTAÇÃO PROCESSUAL",
    ],
    region: "tail",
  },
];

// ─── Constantes ──────────────────────────────────────────────────────

/** Área de título: primeiros N chars da página para busca de keywords. */
const TITLE_AREA_CHARS = 600;

/** Página é assinatura se tem < N chars e contém marcador de e-signature. */
const SIGNATURE_MAX_CHARS = 300;

const SIGNATURE_MARKERS = [
  "Assinado eletronicamente",
  "Assinatura Digital",
  "COMPROVANTE DE ENVIO",
];

/** Regex para [Pag. N] markers. */
const PAGE_MARKER_RE_GLOBAL = /\[Pag\.\s*\d+\]/g;
const PAGE_MARKER_RE_CAPTURE = /\[Pag\.\s*(\d+)\]/;

// ─── Funções auxiliares ──────────────────────────────────────────────

function splitIntoPages(
  text: string
): Array<{ pageNum: number; text: string }> {
  const markers: Array<{ index: number; pageNum: number }> = [];
  for (const match of text.matchAll(PAGE_MARKER_RE_GLOBAL)) {
    if (match.index === undefined) {
      continue;
    }
    const numMatch = match[0].match(PAGE_MARKER_RE_CAPTURE);
    if (numMatch) {
      markers.push({
        index: match.index,
        pageNum: Number.parseInt(numMatch[1], 10),
      });
    }
  }

  if (markers.length === 0) {
    return [];
  }

  const pages: Array<{ pageNum: number; text: string }> = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index;
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
    pages.push({ pageNum: markers[i].pageNum, text: text.slice(start, end) });
  }
  return pages;
}

function isSignaturePage(pageText: string): boolean {
  if (pageText.length >= SIGNATURE_MAX_CHARS) {
    return false;
  }
  return SIGNATURE_MARKERS.some((marker) => pageText.includes(marker));
}

function containsKeyword(text: string, keywords: string[]): boolean {
  const upper = text.toUpperCase();
  return keywords.some((kw) => upper.includes(kw.toUpperCase()));
}

// ─── Função principal ────────────────────────────────────────────────

/**
 * Mapeia landmarks de um documento processual PJe.
 *
 * Scan O(N) sobre todas as páginas. Sem chamada LLM.
 * Retorna mapa completo com landmarks encontrados e não encontrados.
 */
export function mapLandmarks(documentText: string): LandmarkMap {
  const allPages = splitIntoPages(documentText);

  // Fallback para documentos sem markers de página
  if (allPages.length === 0) {
    return {
      totalPages: 0,
      contentPages: 0,
      landmarks: LANDMARK_DEFS.map((def) => ({
        type: def.type,
        label: def.label,
        startPage: -1,
        endPage: -1,
        confidence: 0,
        found: false,
      })),
      faseProcessual: "indeterminada",
      signaturePages: 0,
      summary:
        "Documento sem marcadores de página [Pag. N]. Landmark mapping não disponível.",
    };
  }

  const signaturePageNums = new Set<number>();
  const contentPages: Array<{ pageNum: number; text: string }> = [];

  for (const page of allPages) {
    if (isSignaturePage(page.text)) {
      signaturePageNums.add(page.pageNum);
    } else {
      contentPages.push(page);
    }
  }

  const totalPages = allPages.length;
  const headThreshold = Math.floor(totalPages * 0.15);
  const tailThreshold = Math.floor(totalPages * 0.85);

  const landmarks: Landmark[] = [];

  for (const def of LANDMARK_DEFS) {
    let bestMatch: { pageNum: number; confidence: number } | null = null;

    for (const page of contentPages) {
      // Filtrar por região se especificada
      if (def.region === "head" && page.pageNum > headThreshold) {
        continue;
      }
      if (def.region === "tail" && page.pageNum < tailThreshold) {
        continue;
      }

      const titleArea = page.text.slice(0, TITLE_AREA_CHARS);

      // Busca no título (alta confiança)
      if (
        containsKeyword(titleArea, def.titleKeywords) &&
        (!bestMatch || bestMatch.confidence < 0.95)
      ) {
        bestMatch = { pageNum: page.pageNum, confidence: 0.95 };
        if (!def.multiple) {
          break;
        }
      }

      // Busca no corpo (média confiança, só se não encontrou no título)
      if (
        !bestMatch &&
        def.bodyKeywords &&
        containsKeyword(page.text, def.bodyKeywords)
      ) {
        bestMatch = { pageNum: page.pageNum, confidence: 0.7 };
      }
    }

    // Estimar endPage: próximo landmark ou +20 páginas
    const endPage = bestMatch
      ? Math.min(bestMatch.pageNum + 20, totalPages)
      : -1;

    landmarks.push({
      type: def.type,
      label: def.label,
      startPage: bestMatch?.pageNum ?? -1,
      endPage,
      confidence: bestMatch?.confidence ?? 0,
      found: bestMatch !== null,
    });
  }

  // Refinar endPages: cada landmark termina onde o próximo começa
  const foundLandmarks = landmarks
    .filter((l) => l.found)
    .sort((a, b) => a.startPage - b.startPage);

  for (let i = 0; i < foundLandmarks.length - 1; i++) {
    foundLandmarks[i].endPage = foundLandmarks[i + 1].startPage - 1;
  }

  // Detectar fase processual
  const faseProcessual = detectFaseFromLandmarks(landmarks);

  // Gerar resumo textual
  const summary = buildLandmarkSummary(
    landmarks,
    totalPages,
    contentPages.length,
    signaturePageNums.size,
    faseProcessual
  );

  return {
    totalPages,
    contentPages: contentPages.length,
    landmarks,
    faseProcessual,
    signaturePages: signaturePageNums.size,
    summary,
  };
}

// ─── Detecção de fase a partir dos landmarks ─────────────────────────

function detectFaseFromLandmarks(landmarks: Landmark[]): string {
  const has = (type: LandmarkType) =>
    landmarks.some((l) => l.type === type && l.found);

  if (has("homologacao")) {
    return "ACORDO/HOMOLOGAÇÃO";
  }
  if (has("recurso_revista")) {
    return "RECURSAL-TST";
  }
  if (has("recurso_ordinario") || has("acordao")) {
    return "RECURSAL-TRT";
  }
  if (has("calculos_liquidacao") && has("certidao_transito")) {
    return "EXECUÇÃO DEFINITIVA";
  }
  if (has("calculos_liquidacao")) {
    return "EXECUÇÃO PROVISÓRIA";
  }
  if (has("sentenca")) {
    return "PÓS-SENTENÇA";
  }
  if (has("contestacao")) {
    return "CONHECIMENTO";
  }
  if (has("peticao_inicial")) {
    return "INICIAL";
  }
  return "INDETERMINADA";
}

// ─── Resumo textual ──────────────────────────────────────────────────

function buildLandmarkSummary(
  landmarks: Landmark[],
  totalPages: number,
  contentPages: number,
  signaturePages: number,
  fase: string
): string {
  const found = landmarks.filter((l) => l.found);
  const notFound = landmarks.filter((l) => !l.found);

  const lines: string[] = [
    "## Mapa de Landmarks (Passo 0)",
    `**Páginas:** ${totalPages} total, ${contentPages} conteúdo, ${signaturePages} assinaturas`,
    `**Fase processual:** ${fase}`,
    `**Seções localizadas:** ${found.length}/${landmarks.length}`,
    "",
  ];

  if (found.length > 0) {
    lines.push("### Seções encontradas");
    lines.push("| Seção | Página | Confiança |");
    lines.push("|-------|--------|-----------|");
    for (const l of found) {
      const conf =
        l.confidence >= 0.9
          ? "🟢 Alta"
          : l.confidence >= 0.7
            ? "🟡 Média"
            : "🔴 Baixa";
      const pageRange =
        l.endPage > 0 && l.endPage !== l.startPage
          ? `${l.startPage}–${l.endPage}`
          : `${l.startPage}`;
      lines.push(`| ${l.label} | pg. ${pageRange} | ${conf} |`);
    }
    lines.push("");
  }

  if (notFound.length > 0) {
    lines.push("### Seções não localizadas");
    lines.push(notFound.map((l) => `- ${l.label}`).join("\n"));
  }

  return lines.join("\n");
}
