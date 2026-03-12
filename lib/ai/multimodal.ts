/**
 * Multi-Modal Agent — Cookbook pattern.
 *
 * Utilitários para lidar com entradas multimodais (imagens + PDFs + texto)
 * dentro do mesmo chat. Garante que partes de imagem são:
 *  1. Mantidas para modelos com visão (Claude, GPT-4V, Gemini).
 *  2. Removidas silenciosamente para modelos sem visão, com fallback para
 *     texto descritivo do anexo (evita erros de API).
 *
 * Tipos de media suportados para visão:
 *  - image/jpeg, image/png, image/gif, image/webp
 *
 * Uso no pipeline:
 *  normalizeMessageParts() chama stripImagePartsIfNeeded() automaticamente
 *  quando o modelo não suporta visão.
 */

/** Media types de imagem aceites pelos modelos de visão. */
export const VISION_IMAGE_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/**
 * Retorna true se a parte é uma imagem (file part com mediaType de imagem).
 */
export function isImageFilePart(part: unknown): boolean {
  const p = part as { type?: string; mediaType?: string };
  return (
    p?.type === "file" &&
    typeof p.mediaType === "string" &&
    VISION_IMAGE_MEDIA_TYPES.has(p.mediaType.toLowerCase())
  );
}

/**
 * Remove partes de imagem de uma lista de partes de mensagem.
 * Usado quando o modelo selecionado não suporta visão.
 *
 * Substitui a imagem por um placeholder de texto informativo
 * para que o LLM saiba que houve um arquivo de imagem que não pôde ser processado.
 *
 * @param parts  Partes de mensagem originais.
 * @returns      Partes sem imagens (com placeholders textuais).
 */
export function stripImageParts(parts: unknown[]): unknown[] {
  return parts.flatMap((part) => {
    if (!isImageFilePart(part)) {
      return [part];
    }
    const p = part as { mediaType?: string; name?: string };
    const label = p.name ?? `imagem (${p.mediaType ?? "desconhecido"})`;
    return [
      {
        type: "text" as const,
        text: `[Imagem anexada: "${label}" — o modelo selecionado não suporta visão. Para analisar imagens, selecione Claude Sonnet, GPT-4o ou Gemini.]`,
      },
    ];
  });
}

/**
 * Retorna estatísticas das partes de imagem numa lista.
 * Útil para logging e telemetria.
 */
export function countImageParts(parts: unknown[]): {
  total: number;
  byMediaType: Record<string, number>;
} {
  const byMediaType: Record<string, number> = {};
  let total = 0;
  for (const part of parts) {
    if (isImageFilePart(part)) {
      const mediaType = (part as { mediaType?: string }).mediaType ?? "unknown";
      byMediaType[mediaType] = (byMediaType[mediaType] ?? 0) + 1;
      total++;
    }
  }
  return { total, byMediaType };
}
