/** Alinhado ao schema do servidor (2M). Pipeline multi-chamadas processa docs grandes em blocos. */
export const MAX_PART_TEXT_CLIENT = 2_000_000;

export const TRUNCATE_SUFFIX_CLIENT =
  "\n\n[Truncado: o documento excedeu o limite de caracteres.]";

export function truncateMessagePartsForRequest(messages: unknown[]): {
  messages: unknown[];
  lastMessage: unknown;
  didTruncate: boolean;
  truncatedTotal: number;
} {
  let didTruncate = false;
  let truncatedTotal = 0;
  const maxLen = MAX_PART_TEXT_CLIENT - TRUNCATE_SUFFIX_CLIENT.length;
  const out: unknown[] = [];
  for (const msg of messages) {
    const m = msg as { parts?: Array<{ type?: string; text?: string }> };
    if (!m || typeof m !== "object" || !Array.isArray(m.parts)) {
      out.push(msg);
      continue;
    }
    const newParts = m.parts.map((part) => {
      if (
        part?.type === "document" &&
        typeof part.text === "string" &&
        part.text.length > MAX_PART_TEXT_CLIENT
      ) {
        didTruncate = true;
        truncatedTotal +=
          part.text.length - (maxLen + TRUNCATE_SUFFIX_CLIENT.length);
        return {
          ...part,
          text: part.text.slice(0, maxLen) + TRUNCATE_SUFFIX_CLIENT,
        };
      }
      return part;
    });
    out.push({ ...m, parts: newParts });
  }
  return {
    messages: out,
    lastMessage: out.at(-1),
    didTruncate,
    truncatedTotal,
  };
}
