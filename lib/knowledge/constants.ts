/** Constants and configuration for the knowledge sidebar. */

export const KNOWLEDGE_FILES_ACCEPT =
  ".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx,.csv,.txt,.odt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain,application/vnd.oasis.opendocument.text,image/jpeg,image/png";

/** Máximo de ficheiros por pedido à API (enviados em lotes se for mais). */
export const MAX_FILES_PER_BATCH = 50;

export const MAX_KNOWLEDGE_SELECT = 50;

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export const ACCEPTED_EXTENSIONS =
  /\.(docx?|pdf|jpe?g|png|xlsx?|csv|txt|odt)$/i;

export const RECENT_DOCS_LIMIT = 8;

/** Limites em chars para classificação de cobertura (espelha extract-legal-summary.ts e chat/route.ts). */
export const COVERAGE_FULL_LIMIT = 78_000; // cabe inteiro no structured summary sem amostragem

export const COVERAGE_SAMPLED_LIMIT = 200_000; // amostragem início+fim; cobertura boa mas não total

export const LEGAL_DOC_RE =
  /petição\s+inicial|contestação|peticao\s+inicial|contestacao/i;

export const MAX_ARCHIVOS_FOR_CHAT = 50;
