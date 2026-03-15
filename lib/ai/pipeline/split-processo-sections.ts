/**
 * Divisão temática de PDFs processuais trabalhistas em secções e blocos.
 * Usa marcadores [Pag. N] (inseridos na extração) para rastrear páginas.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Fase processual para roteamento de RAGs especializados. */
export type PhaseType =
  | "identificacao"
  | "defesa"
  | "instrucao"
  | "sentenca"
  | "recurso"
  | "execucao"
  | "encerramento";

export interface ProcessoSection {
  /** Nome legível da secção (ex: "Petição Inicial") */
  label: string;
  /** Página inicial (de [Pag. N]) */
  startPage: number;
  /** Página final (inclusive) */
  endPage: number;
  /** Texto completo da secção (com marcadores) */
  text: string;
  /** Fase processual para roteamento de RAG especializado */
  phaseType: PhaseType;
}

export interface ProcessoBlock {
  /** Label composto (ex: "Petição Inicial + Procuração") */
  label: string;
  /** Secções agrupadas neste bloco */
  sections: ProcessoSection[];
  /** Texto concatenado de todas as secções */
  text: string;
  /** Intervalo de páginas [início, fim] */
  pageRange: [number, number];
  /** Fase processual predominante (maioria das secções do bloco) */
  primaryPhase?: PhaseType;
}

// ---------------------------------------------------------------------------
// Padrões de marcos processuais (case-insensitive)
// Ordem reflecte a sequência típica de um processo trabalhista.
// ---------------------------------------------------------------------------

const SECTION_PATTERNS: Array<{
  label: string;
  pattern: RegExp;
  phaseType: PhaseType;
}> = [
  {
    label: "Petição Inicial",
    pattern:
      /\b(?:PETI[ÇC][ÃA]O\s+INICIAL|RECLAMA[ÇC][ÃA]O\s+TRABALHISTA|RECLAMA(?:T[ÓO]RIA|NTE))\b/i,
    phaseType: "identificacao",
  },
  {
    label: "Procuração / Documentos Iniciais",
    pattern: /\b(?:PROCURA[ÇC][ÃA]O|SUBSTABELECIMENTO|CARTA\s+DE\s+PREPOSTO)\b/i,
    phaseType: "identificacao",
  },
  {
    label: "Contestação",
    pattern:
      /\b(?:CONTESTA[ÇC][ÃA]O|DEFESA|RESPOSTA\s+D[AO]\s+RECLAMAD[AO])\b/i,
    phaseType: "defesa",
  },
  {
    label: "Reconvenção",
    pattern: /\b(?:RECONVEN[ÇC][ÃA]O|PEDIDO\s+CONTRAPOSTO)\b/i,
    phaseType: "defesa",
  },
  {
    label: "Réplica",
    pattern: /\b(?:R[ÉE]PLICA|IMPUGNA[ÇC][ÃA]O\s+[ÀA]\s+CONTESTA[ÇC][ÃA]O)\b/i,
    phaseType: "defesa",
  },
  {
    label: "Ata de Audiência",
    pattern: /\b(?:ATA\s+DE\s+AUDI[ÊE]NCIA|TERMO\s+DE\s+AUDI[ÊE]NCIA)\b/i,
    phaseType: "instrucao",
  },
  {
    label: "Laudo Pericial",
    pattern: /\b(?:LAUDO\s+PERICIAL|PER[ÍI]CIA|LAUDO\s+T[ÉE]CNICO)\b/i,
    phaseType: "instrucao",
  },
  {
    label: "Sentença",
    pattern:
      /\b(?:SENTEN[ÇC]A|DECIS[ÃA]O|VISTOS|ISTO\s+POSTO|DISPOSITIVO)\b/i,
    phaseType: "sentenca",
  },
  {
    label: "Acórdão",
    pattern: /\b(?:AC[ÓO]RD[ÃA]O|EMENTA|V\.\s*ACÓRDÃO)\b/i,
    phaseType: "recurso",
  },
  {
    label: "Recurso",
    pattern:
      /\b(?:RECURSO\s+ORDIN[ÁA]RIO|RECURSO\s+DE\s+REVISTA|EMBARGOS\s+DE\s+DECLARA[ÇC][ÃA]O|AGRAVO\s+DE\s+INSTRUMENTO|AGRAVO\s+INTERNO)\b/i,
    phaseType: "recurso",
  },
  {
    label: "Cálculos / Liquidação",
    pattern:
      /\b(?:C[ÁA]LCULOS|LIQUIDA[ÇC][ÃA]O|PLANILHA\s+DE\s+C[ÁA]LCULO|CONTA\s+DE\s+LIQUIDA[ÇC][ÃA]O)\b/i,
    phaseType: "execucao",
  },
  // --- Padrões especializados de Execução (Sprint 3) ---
  {
    label: "Embargos à Execução",
    pattern:
      /\b(?:EMBARGOS\s+[ÀA]\s+EXECU[ÇC][ÃA]O|IMPUGNA[ÇC][ÃA]O\s+AOS?\s+C[ÁA]LCULOS)\b/i,
    phaseType: "execucao",
  },
  {
    label: "Agravo de Petição",
    pattern: /\b(?:AGRAVO\s+DE\s+PETI[ÇC][ÃA]O)\b/i,
    phaseType: "execucao",
  },
  {
    label: "Penhora / Bloqueio / Alvará",
    pattern:
      /\b(?:PENHORA|BLOQUEIO|ALVAR[ÁA]|BACENJUD|RENAJUD)\b/i,
    phaseType: "execucao",
  },
  // --- Fim padrões de Execução ---
  {
    label: "Certidão / Trânsito em Julgado",
    pattern:
      /\b(?:CERTID[ÃA]O|TR[ÂA]NSITO\s+EM\s+JULGADO|TRANSITOU\s+EM\s+JULGADO)\b/i,
    phaseType: "encerramento",
  },
  {
    label: "Acordo",
    pattern: /\b(?:ACORDO|CONCILIA[ÇC][ÃA]O|TERMO\s+DE\s+ACORDO)\b/i,
    phaseType: "encerramento",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extrai número de página do marcador [Pag. N] mais próximo antes de `offset`. */
function findPageAtOffset(text: string, offset: number): number {
  const PAGE_RE = /\[Pag\.\s*(\d+)\]/g;
  let page = 1;
  let match: RegExpExecArray | null;
  while ((match = PAGE_RE.exec(text)) !== null) {
    if (match.index > offset) break;
    page = parseInt(match[1], 10);
  }
  return page;
}

/** Extrai o maior número de página presente no texto. */
function findMaxPage(text: string): number {
  const PAGE_RE = /\[Pag\.\s*(\d+)\]/g;
  let max = 1;
  let match: RegExpExecArray | null;
  while ((match = PAGE_RE.exec(text)) !== null) {
    const p = parseInt(match[1], 10);
    if (p > max) max = p;
  }
  return max;
}

// ---------------------------------------------------------------------------
// splitIntoSections
// ---------------------------------------------------------------------------

/**
 * Divide o texto processual completo (com marcadores [Pag. N]) em secções temáticas.
 * Cada secção vai do seu marco até o próximo marco (ou fim do texto).
 */
export function splitIntoSections(fullText: string): ProcessoSection[] {
  // 1. Encontrar todas as ocorrências de marcos processuais
  const markers: Array<{ label: string; offset: number; phaseType: PhaseType }> = [];

  for (const { label, pattern, phaseType } of SECTION_PATTERNS) {
    const global = new RegExp(pattern.source, "gi");
    let match: RegExpExecArray | null;
    while ((match = global.exec(fullText)) !== null) {
      // Evitar duplicatas muito próximas (<500 chars) do mesmo label
      const isDuplicate = markers.some(
        (m) => m.label === label && Math.abs(m.offset - match!.index) < 500
      );
      if (!isDuplicate) {
        markers.push({ label, offset: match.index, phaseType });
      }
    }
  }

  // 2. Ordenar por posição no texto
  markers.sort((a, b) => a.offset - b.offset);

  // 3. Se não encontrou marcos suficientes, retornar texto inteiro como única secção
  if (markers.length === 0) {
    return [
      {
        label: "Documento Integral",
        startPage: 1,
        endPage: findMaxPage(fullText),
        text: fullText,
        phaseType: "identificacao" as PhaseType,
      },
    ];
  }

  // 4. Construir secções
  const sections: ProcessoSection[] = [];

  // Texto antes do primeiro marco (se houver)
  if (markers[0].offset > 200) {
    sections.push({
      label: "Capa / Pré-Processual",
      startPage: 1,
      endPage: findPageAtOffset(fullText, markers[0].offset - 1),
      text: fullText.slice(0, markers[0].offset),
      phaseType: "identificacao",
    });
  }

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].offset;
    const end = i + 1 < markers.length ? markers[i + 1].offset : fullText.length;
    const sectionText = fullText.slice(start, end);
    sections.push({
      label: markers[i].label,
      startPage: findPageAtOffset(fullText, start),
      endPage: findPageAtOffset(fullText, end - 1),
      text: sectionText,
      phaseType: markers[i].phaseType,
    });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// mergeSectionsIntoBlocks
// ---------------------------------------------------------------------------

/**
 * Agrupa secções em blocos temáticos (target: 5-7 blocos).
 * Secções pequenas adjacentes são fundidas. Secções muito grandes são mantidas sozinhas.
 */
export function mergeSectionsIntoBlocks(
  sections: ProcessoSection[],
  targetBlocks: number = 6
): ProcessoBlock[] {
  if (sections.length <= targetBlocks) {
    // Cada secção vira um bloco
    return sections.map((s) => ({
      label: s.label,
      sections: [s],
      text: s.text,
      pageRange: [s.startPage, s.endPage] as [number, number],
    }));
  }

  // Calcular tamanho médio alvo por bloco
  const totalChars = sections.reduce((sum, s) => sum + s.text.length, 0);
  const targetCharsPerBlock = totalChars / targetBlocks;

  const blocks: ProcessoBlock[] = [];
  let currentSections: ProcessoSection[] = [];
  let currentChars = 0;

  for (const section of sections) {
    currentSections.push(section);
    currentChars += section.text.length;

    // Fechar bloco se atingiu tamanho alvo ou se é uma secção "âncora"
    const isAnchor = /Sentença|Acórdão|Cálculos|Laudo|Ata de Audiência|Embargos à Execução/i.test(section.label);
    if (currentChars >= targetCharsPerBlock || isAnchor) {
      blocks.push(buildBlock(currentSections));
      currentSections = [];
      currentChars = 0;
    }
  }

  // Secções restantes
  if (currentSections.length > 0) {
    // Fundir com último bloco se for pequeno, senão criar novo
    if (blocks.length > 0 && currentChars < targetCharsPerBlock * 0.3) {
      const lastBlock = blocks[blocks.length - 1];
      lastBlock.sections.push(...currentSections);
      lastBlock.text += "\n\n" + currentSections.map((s) => s.text).join("\n\n");
      lastBlock.label += " + " + currentSections.map((s) => s.label).join(" + ");
      lastBlock.pageRange[1] =
        currentSections[currentSections.length - 1].endPage;
    } else {
      blocks.push(buildBlock(currentSections));
    }
  }

  return blocks;
}

function buildBlock(sections: ProcessoSection[]): ProcessoBlock {
  const labels = [...new Set(sections.map((s) => s.label))];

  // Determinar fase predominante (maioria das secções)
  const phaseCounts = new Map<PhaseType, number>();
  for (const s of sections) {
    phaseCounts.set(s.phaseType, (phaseCounts.get(s.phaseType) ?? 0) + 1);
  }
  let primaryPhase: PhaseType | undefined;
  let maxCount = 0;
  for (const [phase, count] of phaseCounts) {
    if (count > maxCount) {
      maxCount = count;
      primaryPhase = phase;
    }
  }

  return {
    label: labels.join(" + "),
    sections,
    text: sections.map((s) => s.text).join("\n\n"),
    pageRange: [
      sections[0].startPage,
      sections[sections.length - 1].endPage,
    ],
    primaryPhase,
  };
}
