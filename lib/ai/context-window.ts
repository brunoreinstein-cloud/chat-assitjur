/**
 * Gestão da janela de contexto do chat: estimativa de tokens, limites e documentação
 * para compaction/context editing.
 *
 * Referência: documentação Anthropic sobre context windows, compaction e context editing.
 */

/** Capacidade típica da janela de contexto (tokens). Modelos Claude 200k; alguns 1M em beta. */
export const CONTEXT_WINDOW_CAPACITY_TOKENS = 200_000;

/**
 * Margem reservada para a resposta do modelo (maxOutputTokens) e overhead.
 * Não enviar mais do que este número de tokens de input para evitar truncagem/erro.
 */
export const CONTEXT_WINDOW_INPUT_TARGET_TOKENS = 180_000;

/**
 * Heurística: ~4 caracteres por token para texto misto (PT/EN).
 * A contagem real varia por modelo e por idioma; usar apenas como estimativa.
 */
const CHARS_PER_TOKEN_ESTIMATE = 4;

/**
 * Estima o número de tokens de uma string (heurística por caracteres).
 * Não substitui a API de token counting do provider quando disponível.
 */
export function estimateTokensFromText(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

/** Parte de mensagem com tipo genérico (para inspeção sem dependência do AI SDK). */
interface PartLike {
  type?: string;
  text?: string;
  result?: unknown;
  [key: string]: unknown;
}

/**
 * Estima tokens de uma parte de mensagem (texto, tool result serializado, etc.).
 */
function estimatePartTokens(part: PartLike): number {
  const type = part.type ?? "";
  if (type === "text" && typeof part.text === "string") {
    return estimateTokensFromText(part.text);
  }
  if (type === "tool-result" && part.result !== undefined) {
    const serialized =
      typeof part.result === "string"
        ? part.result
        : JSON.stringify(part.result);
    return estimateTokensFromText(serialized);
  }
  if (type === "tool-invocation" && part.args !== undefined) {
    const serialized =
      typeof part.args === "string" ? part.args : JSON.stringify(part.args);
    return estimateTokensFromText(serialized);
  }
  if (type === "file" && typeof part.url === "string") {
    return 0;
  }
  return estimateTokensFromText(JSON.stringify(part));
}

/**
 * Estima o total de tokens de input para o modelo: system prompt + mensagens.
 * Usado para decidir se aplicamos context editing mais agressivo ou devolvemos erro.
 */
export function estimateInputTokens(
  systemPromptLength: number,
  messages: Array<{ parts?: PartLike[] }>
): number {
  let total = estimateTokensFromText("x".repeat(systemPromptLength));
  for (const msg of messages) {
    if (!msg.parts?.length) {
      continue;
    }
    for (const part of msg.parts) {
      total += estimatePartTokens(part as PartLike);
    }
  }
  return total;
}

/**
 * Quando true, o provider (ex.: Anthropic) suporta compaction server-side.
 * Atualmente em beta para Claude Opus 4.6; o AI Gateway pode não expor ainda.
 * Quando disponível, ativar em providerOptions para conversas longas.
 */
export const COMPACTION_AVAILABLE = false;

/** Placeholder curto para substituir conteúdo de tool results antigos (poupa tokens). */
export const TOOL_RESULT_PLACEHOLDER =
  "[Resultado da ferramenta omitido para poupar contexto]";

/** Número de mensagens recentes a manter intactas (sem trim de tool results nem strip de reasoning). */
export const CONTEXT_EDITING_KEEP_LAST_N_MESSAGES = 6;

/**
 * Context editing: reduz tokens enviados ao modelo sem alterar a conversa guardada.
 * - Em mensagens "antigas" (fora das últimas N), substitui o conteúdo de tool-result por um placeholder.
 * - Em mensagens assistant antigas, remove partes de reasoning/thinking (a API Claude pode stripá-las, mas removê-las aqui poupa tokens de input).
 *
 * Só deve ser aplicado à cópia das mensagens que é enviada ao modelo, não às mensagens persistidas.
 */
export function applyContextEditing<
  T extends {
    parts?: Array<{ type?: string; result?: unknown; [key: string]: unknown }>;
  },
>(
  messages: T[],
  keepLastN: number = CONTEXT_EDITING_KEEP_LAST_N_MESSAGES
): T[] {
  if (messages.length <= keepLastN) {
    return messages;
  }

  const boundary = messages.length - keepLastN;
  return messages.map((msg, index) => {
    if (!msg.parts?.length) {
      return msg;
    }
    const isOld = index < boundary;
    const newParts = msg.parts.map((part) => {
      const type = part.type ?? "";
      if (!isOld) {
        return part;
      }
      if (type === "tool-result") {
        return {
          ...part,
          result: TOOL_RESULT_PLACEHOLDER,
        };
      }
      if (type === "reasoning" || type === "thinking") {
        return null;
      }
      return part;
    });
    const filtered = newParts.filter((p) => p != null);
    if (
      filtered.length === msg.parts.length &&
      filtered.every((p, i) => p === msg.parts?.[i])
    ) {
      return msg;
    }
    return { ...msg, parts: filtered };
  });
}
