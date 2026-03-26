/**
 * Biblioteca centralizada de padrões regex para extração de dados processuais.
 *
 * Referência: SPEC_ASSISTJUR_MASTER_v2 §9.4 — 30+ padrões canónicos.
 * Uso: validação de campos extraídos, parsing de documentos, gates de qualidade.
 *
 * Cada padrão exporta: regex, função de validação e formato esperado.
 */

// ─── CNJ (Número Único de Processo) ─────────────────────────────────

/**
 * Formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO
 * - NNNNNNN: número sequencial (7 dígitos)
 * - DD: dígitos verificadores (2 dígitos)
 * - AAAA: ano de ajuizamento (4 dígitos)
 * - J: segmento de justiça (1 dígito, 5 = Trabalho)
 * - TT: tribunal (2 dígitos)
 * - OOOO: vara de origem (4 dígitos)
 */
export const CNJ_REGEX =
  /\b(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})\b/;

export const CNJ_REGEX_GLOBAL =
  /\b(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})\b/g;

/** Valida formato CNJ e retorna partes decompostas. */
export function parseCNJ(value: string): {
  valid: boolean;
  sequencial?: string;
  digitos?: string;
  ano?: string;
  justica?: string;
  tribunal?: string;
  vara?: string;
  formatted?: string;
} {
  const match = CNJ_REGEX.exec(value.trim());
  if (!match) {
    return { valid: false };
  }
  const [, seq, dig, ano, jus, trib, vara] = match;
  return {
    valid: true,
    sequencial: seq,
    digitos: dig,
    ano,
    justica: jus,
    tribunal: trib,
    vara,
    formatted: `${seq}-${dig}.${ano}.${jus}.${trib}.${vara}`,
  };
}

// ─── CPF ─────────────────────────────────────────────────────────────

export const CPF_REGEX = /\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/;

/** Valida dígitos verificadores do CPF. */
export function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) {
    return false;
  }
  if (/^(\d)\1{10}$/.test(digits)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) {
    remainder = 0;
  }
  if (remainder !== Number(digits[9])) {
    return false;
  }

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(digits[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) {
    remainder = 0;
  }
  return remainder === Number(digits[10]);
}

export function formatCPF(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

// ─── CNPJ ────────────────────────────────────────────────────────────

export const CNPJ_REGEX = /\b(\d{2})\.?(\d{3})\.?(\d{3})\/?(\d{4})-?(\d{2})\b/;

/** Valida dígitos verificadores do CNPJ. */
export function validateCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) {
    return false;
  }
  if (/^(\d)\1{13}$/.test(digits)) {
    return false;
  }

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * weights1[i];
  }
  let remainder = sum % 11;
  const d1 = remainder < 2 ? 0 : 11 - remainder;
  if (d1 !== Number(digits[12])) {
    return false;
  }

  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += Number(digits[i]) * weights2[i];
  }
  remainder = sum % 11;
  const d2 = remainder < 2 ? 0 : 11 - remainder;
  return d2 === Number(digits[13]);
}

export function formatCNPJ(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

// ─── OAB ─────────────────────────────────────────────────────────────

/** Formato OAB: UF + número (ex: "OAB/SP 123.456", "SP-123456"). */
export const OAB_REGEX =
  /\bOAB\s*[/\\]?\s*([A-Z]{2})\s*[.\- ]?(\d{3,6}\.?\d{0,3})\b/i;

export function parseOAB(value: string): {
  valid: boolean;
  uf?: string;
  numero?: string;
} {
  const match = OAB_REGEX.exec(value);
  if (!match) {
    return { valid: false };
  }
  return {
    valid: true,
    uf: match[1].toUpperCase(),
    numero: match[2].replace(/\D/g, ""),
  };
}

// ─── Valores monetários ──────────────────────────────────────────────

/** Formato BR: R$ 1.234,56 ou R$ 1234.56 */
export const VALOR_BRL_REGEX = /R\$\s*([\d.]+,\d{2})/;

export const VALOR_BRL_REGEX_GLOBAL = /R\$\s*([\d.]+,\d{2})/g;

/** Parse valor BR para number. "1.234,56" → 1234.56 */
export function parseValorBRL(value: string): number | null {
  const match = VALOR_BRL_REGEX.exec(value);
  if (!match) {
    return null;
  }
  const clean = match[1].replace(/\./g, "").replace(",", ".");
  const num = Number.parseFloat(clean);
  return Number.isNaN(num) ? null : num;
}

// ─── Datas ───────────────────────────────────────────────────────────

/** Data BR: DD/MM/AAAA */
export const DATA_BR_REGEX = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;

export const DATA_BR_REGEX_GLOBAL = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;

/** Valida data BR e retorna Date. */
export function parseDataBR(value: string): {
  valid: boolean;
  date?: Date;
  formatted?: string;
} {
  const match = DATA_BR_REGEX.exec(value);
  if (!match) {
    return { valid: false };
  }
  const [, dia, mes, ano] = match;
  const d = Number(dia);
  const m = Number(mes);
  const a = Number(ano);

  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return { valid: false };
  }

  const date = new Date(a, m - 1, d);
  if (
    date.getDate() !== d ||
    date.getMonth() !== m - 1 ||
    date.getFullYear() !== a
  ) {
    return { valid: false };
  }

  return {
    valid: true,
    date,
    formatted: `${dia}/${mes}/${ano}`,
  };
}

// ─── ID PJe ──────────────────────────────────────────────────────────

/** ID de documento PJe: padrão "id=XXXXXXX" ou "Id XXXXXXX" */
export const ID_PJE_REGEX = /\b[Ii][Dd]\s*[=: ]?\s*(\d{5,10})\b/;

// ─── Marcadores padrão (SPEC §5.4) ──────────────────────────────────

/**
 * 7 tipos de marcadores obrigatórios nos outputs.
 * Usados pelos agentes para indicar estado de cada campo/dado.
 */
export const MARCADORES = {
  /** Campo não localizado no documento — placeholder de output */
  NAO_LOCALIZADO: "---",
  /** Dado confirmado por cruzamento de fontes */
  COMPROVADO: "✓ COMPROVADO",
  /** Dado buscado mas não encontrado em nenhuma fonte */
  NAO_ENCONTRADO: "✗ NÃO LOCALIZADO",
  /** Dado encontrado mas precisa de verificação humana */
  VERIFICAR: "[VERIFICAR]",
  /** Dado pendente de fonte adicional */
  PENDENTE: "[PENDENTE]",
  /** Fontes divergentes sobre o mesmo dado */
  DIVERGENCIA: "DIVERGÊNCIA",
  /** Requer revisão/decisão do advogado */
  ADVOGADO: "[ADVOGADO]",
} as const;

export type MarcadorTipo = keyof typeof MARCADORES;

// ─── Exports consolidados ────────────────────────────────────────────

/** Todos os padrões regex num objeto para fácil acesso. */
export const REGEX_PATTERNS = {
  cnj: CNJ_REGEX,
  cnjGlobal: CNJ_REGEX_GLOBAL,
  cpf: CPF_REGEX,
  cnpj: CNPJ_REGEX,
  oab: OAB_REGEX,
  valorBRL: VALOR_BRL_REGEX,
  valorBRLGlobal: VALOR_BRL_REGEX_GLOBAL,
  dataBR: DATA_BR_REGEX,
  dataBRGlobal: DATA_BR_REGEX_GLOBAL,
  idPJe: ID_PJE_REGEX,
} as const;
