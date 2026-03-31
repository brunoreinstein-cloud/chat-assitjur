// Constants extracted from components/multimodal-input.tsx

import type { UploadPhase } from "./types";

export const PHASE_LABELS: Record<UploadPhase, string> = {
  uploading: "Enviando…",
  extracting: "Extraindo texto…",
  classifying: "Classificando…",
  done: "Concluído",
};

/** Tamanho a partir do qual mostra label estendida na extração (10 MB). */
export const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;

/**
 * Limite do body em produção (Vercel). Ficheiros maiores usam upload direto para Blob.
 * Em dev, Next.js aceita até 34 MB (next.config.ts), então usamos upload server-side
 * para todos os ficheiros, evitando a necessidade de tunnel para o callback do Blob.
 */
export const BODY_SIZE_LIMIT_BYTES =
  process.env.NODE_ENV === "production" ? 4.5 * 1024 * 1024 : 32 * 1024 * 1024;

/** Máximo de documentos da base de conhecimento selecionáveis no popover @ e no formulário de agente. */
export const MAX_KNOWLEDGE_SELECT = 50;

/** Tipos MIME aceites para anexos (chat e base de conhecimento). */
export const ACCEPTED_FILE_ACCEPT =
  "image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain,application/vnd.oasis.opendocument.text,application/zip,application/x-zip-compressed";

export const ACCEPTED_DROP_EXTENSIONS =
  /\.(docx?|pdf|jpe?g|png|xlsx?|csv|txt|odt|zip)$/i;

/** Quick prompts surfaced in the composer after a document is uploaded (first message only). */
export const POST_UPLOAD_PROMPTS: {
  docType: "pi" | "contestacao" | "any";
  agentId: string | "any";
  label: string;
  text: string;
}[] = [
  // AssistJur.IA Master
  {
    docType: "any",
    agentId: "assistjur-master",
    label: "🧠 Análise completa",
    text: "Faça uma análise completa do documento anexado, identificando pontos críticos.",
  },
  {
    docType: "contestacao",
    agentId: "assistjur-master",
    label: "📊 Mapear pedidos",
    text: "Mapeie todos os pedidos da contestação e avalie o risco de cada um.",
  },
  {
    docType: "pi",
    agentId: "assistjur-master",
    label: "⚖️ Estratégia defensiva",
    text: "Elabore uma estratégia defensiva completa para o caso anexado.",
  },
  // Redator de Contestações
  {
    docType: "pi",
    agentId: "redator-contestacao",
    label: "✍️ Redigir contestação",
    text: "Redija uma contestação trabalhista para a PI anexada.",
  },
  {
    docType: "any",
    agentId: "redator-contestacao",
    label: "📋 Extrair pedidos",
    text: "Extraia todos os pedidos do documento anexado para eu contestar.",
  },
  // Generic (shown for any agent)
  {
    docType: "contestacao",
    agentId: "any",
    label: "🔍 Analisar contestação",
    text: "Analise a contestação anexada e identifique os principais argumentos defensivos.",
  },
  {
    docType: "pi",
    agentId: "any",
    label: "📋 Mapear pedidos",
    text: "Mapeie todos os pedidos da petição inicial anexada.",
  },
  {
    docType: "any",
    agentId: "any",
    label: "📄 Resumir",
    text: "Resuma o documento anexado destacando os pontos principais.",
  },
  {
    docType: "any",
    agentId: "any",
    label: "❓ Tirar dúvidas",
    text: "Tenho dúvidas sobre este documento:",
  },
];
