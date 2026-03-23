// Pure utility functions extracted from components/multimodal-input.tsx

import { toast } from "sonner";
import type { Attachment } from "@/lib/types";
import {
  ACCEPTED_DROP_EXTENSIONS,
  LARGE_FILE_THRESHOLD,
  PHASE_LABELS,
} from "./constants";
import type {
  DocumentPart,
  FilePart,
  FileUploadResponse,
  UploadPhase,
} from "./types";

export function getPhaseLabel(phase: UploadPhase, fileSize?: number): string {
  if (phase === "extracting" && fileSize && fileSize > LARGE_FILE_THRESHOLD) {
    return "Extraindo texto (documento grande, pode levar 30s+)…";
  }
  return PHASE_LABELS[phase];
}

export function isAcceptedAttachmentType(
  type: string,
  filename?: string
): boolean {
  if (
    type.startsWith("image/") ||
    type === "application/pdf" ||
    type === "application/msword" ||
    type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "application/vnd.ms-excel" ||
    type === "text/csv" ||
    type === "text/plain" ||
    type === "application/vnd.oasis.opendocument.text"
  ) {
    return true;
  }
  // Fallback: Windows/browsers may report application/octet-stream or "" for DOCX/PDF on drag-and-drop
  if ((type === "" || type === "application/octet-stream") && filename) {
    return ACCEPTED_DROP_EXTENSIONS.test(filename);
  }
  return false;
}

export function _setCookie(name: string, value: string) {
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  // biome-ignore lint/suspicious/noDocumentCookie: needed for client-side cookie setting
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
}

export function buildAttachmentFromUploadResponse(
  data: FileUploadResponse,
  file: File
) {
  const {
    url,
    pathname,
    contentType,
    extractedText,
    extractionFailed,
    extractionDetail,
    documentType,
  } = data;
  if (extractionFailed === true) {
    const reason =
      typeof extractionDetail === "string" && extractionDetail.length > 0
        ? ` Motivo: ${extractionDetail}`
        : "";
    toast.warning(
      `Não foi possível extrair o texto deste ficheiro. Pode colar o texto no cartão do documento abaixo.${reason}`
    );
  }
  const docType =
    documentType === "pi" || documentType === "contestacao"
      ? documentType
      : undefined;
  return {
    url: url ?? "",
    name: file.name,
    contentType: contentType ?? file.type,
    ...(typeof pathname === "string" && pathname.length > 0
      ? { pathname }
      : {}),
    ...(typeof extractedText === "string" ? { extractedText } : {}),
    ...(extractionFailed === true ? { extractionFailed: true } : {}),
    ...(docType ? { documentType: docType } : {}),
    ...(typeof data.pageCount === "number"
      ? { pageCount: data.pageCount }
      : {}),
  };
}

export function updateAttachmentByUrl(
  attachments: Attachment[],
  url: string,
  update: Partial<Attachment>
): Attachment[] {
  return attachments.map((a) => (a.url === url ? { ...a, ...update } : a));
}

export function removeAttachmentByUrl(
  attachments: Attachment[],
  url: string
): Attachment[] {
  return attachments.filter((a) => a.url !== url);
}

export function isDocumentContentType(ct: string | undefined): boolean {
  return (
    ct === "application/pdf" ||
    ct === "application/msword" ||
    ct ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

/**
 * Infere PI ou Contestação a partir do nome do ficheiro (ex.: "Inicial.pdf", "Contestação.docx").
 * Usado quando o anexo é adicionado pelo clipe ou drop genérico, para reconhecer o tipo mesmo sem backend.
 */
export function inferDocumentTypeFromFilename(
  filename: string
): "pi" | "contestacao" | undefined {
  const n = filename.toLowerCase().replace(/\s+/g, " ");
  const looksLikeContestacao =
    n.includes("contest") ||
    n.includes("defesa") ||
    n.includes("reclamado") ||
    n.includes("impugna");
  const looksLikePi =
    (n.includes("inicial") ||
      n.includes("petição") ||
      n.includes("peticao") ||
      n.includes("reclamante")) &&
    !looksLikeContestacao;
  if (looksLikeContestacao) {
    return "contestacao";
  }
  if (looksLikePi) {
    return "pi";
  }
  return undefined;
}

/**
 * Se há exatamente 2 anexos de documento com texto e apenas um tem tipo (PI ou Contestação),
 * atribui o tipo em falta ao outro — completa a identificação automática.
 */
export function autoAssignMissingDocumentType(
  attachments: Attachment[]
): Attachment[] {
  const docsWithText = attachments.filter(
    (a) =>
      typeof a.extractedText === "string" &&
      isDocumentContentType(a.contentType)
  );
  if (docsWithText.length !== 2) {
    return attachments;
  }
  const [first, second] = docsWithText;
  const type1 = first.documentType;
  const type2 = second.documentType;
  if (type1 && type2) {
    return attachments;
  }
  if (!(type1 || type2)) {
    return attachments;
  }
  const missingType: "pi" | "contestacao" =
    type1 === "pi" ? "contestacao" : "pi";
  const urlToFix = type1 ? second.url : first.url;
  return attachments.map((a) =>
    a.url === urlToFix ? { ...a, documentType: missingType } : a
  );
}

/** Retorna mensagem de erro se houver documentos sem texto extraído; null se válido para envio. */
export function validateAttachmentsForSubmit(
  attachments: Attachment[]
): string | null {
  const docsWithoutText = attachments.filter(
    (a) => isDocumentContentType(a.contentType) && a.extractedText == null
  );
  if (docsWithoutText.length > 0) {
    return `${docsWithoutText.length} documento(s) sem texto. Cole o texto no cartão do documento ou remova-os para enviar.`;
  }
  return null;
}

/**
 * Validação pré-envio para o Revisor de Defesas: exige PI e Contestação identificados.
 * Aplicar quando o agente é o Revisor (sem instruções customizadas) e há anexos de documento ou primeira mensagem.
 * Retorna mensagem de erro ou null se válido.
 */
export function validateRevisorPiContestacao(
  attachments: Attachment[],
  messageCount: number
): string | null {
  const hasDocumentParts = attachments.some(
    (a) =>
      typeof a.extractedText === "string" &&
      (a.documentType === "pi" || a.documentType === "contestacao")
  );
  if (!hasDocumentParts && messageCount > 0) {
    return null;
  }
  const hasPi = attachments.some(
    (a) => typeof a.extractedText === "string" && a.documentType === "pi"
  );
  const hasContestacao = attachments.some(
    (a) =>
      typeof a.extractedText === "string" && a.documentType === "contestacao"
  );
  if (!(hasPi && hasContestacao)) {
    return "Para auditar a contestação, anexe a Petição Inicial e a Contestação (arraste para os slots ou use o anexo). O tipo é identificado automaticamente quando possível; pode ajustar no menu de cada documento.";
  }
  return null;
}

export function buildAttachmentParts(
  attachments: Attachment[]
): Array<DocumentPart | FilePart> {
  const parts: Array<DocumentPart | FilePart> = [];
  for (const attachment of attachments) {
    if (typeof attachment.extractedText === "string") {
      parts.push({
        type: "document",
        name: attachment.name,
        text: attachment.extractedText,
        ...(attachment.documentType
          ? { documentType: attachment.documentType }
          : {}),
      });
    } else if (attachment.contentType?.startsWith("image/")) {
      parts.push({
        type: "file",
        url: attachment.url,
        name: attachment.name,
        mediaType: attachment.contentType,
      });
    }
  }
  return parts;
}

export async function _getUploadErrorFromResponse(
  response: Response
): Promise<string> {
  if (response.status === 401) {
    return "Inicie sessão para anexar ficheiros. Use «Continuar como visitante» ou entre na sua conta.";
  }
  if (response.status === 413) {
    return "Ficheiro demasiado grande. Em produção o limite é 4,5 MB. Use um ficheiro com menos de 4,5 MB.";
  }
  try {
    const data = (await response.json()) as { error?: string; detail?: string };
    if (typeof data?.error === "string" && data.error.length > 0) {
      let msg = data.error;
      if (typeof data?.detail === "string" && data.detail.length > 0) {
        msg += ` (${data.detail})`;
      }
      return msg;
    }
  } catch {
    // Resposta não é JSON; manter mensagem genérica
  }
  return "Falha ao enviar o arquivo. Tente novamente.";
}
