/**
 * Gestão da janela de contexto do chat: estimativa de tokens, limites e documentação
 * para compaction/context editing.
 *
 * Referência: documentação Anthropic sobre context windows, compaction e context editing.
 */

/** Capacidade típica da janela de contexto (tokens). Modelos Claude 200k; alguns 1M em beta. */
export const CONTEXT_WINDOW_CAPACITY_TOKENS = 200_000;

/**
 * Limites de truncagem aplicados server-side em route.ts.
 * Exportados aqui para que o indicador de contexto no cliente
 * possa espelhar a mesma lógica sem duplicar constantes.
 */
/**
 * Limite de caracteres de um único documento no contexto do LLM.
 * Aumentado de 80K → 92K após introdução da extração inteligente de secções:
 * o budget agora cobre head + Sentença + Contestação + Laudo + Índice PJe
 * sem desperdiçar chars em páginas de assinatura ou conteúdo irrelevante.
 * @see lib/ai/document-context.ts buildSmartDocumentContext
 */
export const MAX_CHARS_PER_DOCUMENT = 130_000;

/**
 * Limite total de caracteres de todos os documentos combinados.
 * Aumentado de 200K → 350K para o caso AutuorIA (PI + Contestação inteiros).
 * PI grande pode extrair 130K chars + Contestação 130K = 260K mínimo necessário.
 * 350K chars ≈ 87.5K tokens = 44% da janela disponível para docs — margem segura
 * mesmo com histórico de conversa longo e system prompt extenso do AutuorIA.
 * Claude suporta 200K tokens de input; docs não devem exceder 50% do budget.
 */
export const MAX_TOTAL_DOC_CHARS = 350_000;

/**
 * Margem reservada para a resposta do modelo (maxOutputTokens ~8k) e overhead.
 * Claude suporta 200k de contexto; reservamos 5k para output, resultando em 195k de input.
 * Anteriormente era 180k (20k de margem), mas 5k é suficiente para respostas típicas.
 */
export const CONTEXT_WINDOW_INPUT_TARGET_TOKENS = 195_000;

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
export const CONTEXT_EDITING_KEEP_LAST_N_MESSAGES = 10;

/**
 * Regex para detectar text parts que contêm documentos injetados (PI, Contestação, Documento genérico).
 * Match no início do texto (após whitespace opcional).
 */
const DOCUMENT_TEXT_PREFIX_RE =
  /^\s*\[(Petição Inicial|Contestação|Documento)\s*:/;

/**
 * Regex para extrair blocos [CAMPOS EXTRAÍDOS POR REGEX …] preservados durante compaction.
 * Captura tudo entre os delimitadores (inclusive).
 */
const CAMPOS_EXTRAIDOS_RE =
  /\[CAMPOS EXTRAÍDOS POR REGEX[\s\S]*?\[\/CAMPOS EXTRAÍDOS POR REGEX\]/;

/**
 * Regex para extrair bloco [VALIDAÇÃO CRUZADA PI × CONTESTAÇÃO …] preservado durante compaction.
 */
const VALIDACAO_CRUZADA_RE =
  /\[VALIDAÇÃO CRUZADA PI × CONTESTAÇÃO[\s\S]*?\[\/VALIDAÇÃO CRUZADA PI × CONTESTAÇÃO\]/;

/** Delimitadores GATE 0.5 — mensagens que os contêm não devem ser truncadas. */
const GATE_05_MARKERS = [
  "--- GATE_0.5_RESUMO ---",
  "--- GATE_0.5_AVALIACAO ---",
];

/** Limiar (chars) acima do qual text parts do assistant são truncadas em mensagens antigas. */
const ASSISTANT_TEXT_TRUNCATE_THRESHOLD = 2000;
/** Comprimento alvo após truncagem de text parts do assistant. */
const ASSISTANT_TEXT_TRUNCATE_TARGET = 800;

/**
 * Compacta uma text part que contém um documento (PI/Contestação/Documento).
 * Preserva blocos estruturados ([CAMPOS EXTRAÍDOS…] e [VALIDAÇÃO CRUZADA…]) e substitui
 * o texto integral por um placeholder curto.
 */
function compactDocumentText(text: string): string {
  const preserved: string[] = [];
  const camposMatch = CAMPOS_EXTRAIDOS_RE.exec(text);
  if (camposMatch) {
    preserved.push(camposMatch[0]);
  }
  const validacaoMatch = VALIDACAO_CRUZADA_RE.exec(text);
  if (validacaoMatch) {
    preserved.push(validacaoMatch[0]);
  }
  // Extrair nome do documento do prefixo (ex.: "[Petição Inicial: nome.pdf …]")
  const nameMatch =
    /^\s*\[(?:Petição Inicial|Contestação|Documento)\s*:\s*([^\]]{1,80})/.exec(
      text
    );
  const docName = nameMatch ? nameMatch[1].trim() : "documento";

  const placeholder = `[Documento: ${docName} — conteúdo omitido para poupar contexto.${preserved.length > 0 ? " Dados estruturados preservados abaixo." : ""}]`;
  return preserved.length > 0
    ? `${placeholder}\n\n${preserved.join("\n\n")}`
    : placeholder;
}

/**
 * Context editing: reduz tokens enviados ao modelo sem alterar a conversa guardada.
 * - Em mensagens "antigas" (fora das últimas N):
 *   1. Substitui conteúdo de tool-result por um placeholder curto.
 *   2. Remove partes de reasoning/thinking.
 *   3. Compacta text parts que contêm documentos (PI, Contestação), preservando blocos estruturados.
 *   4. Trunca text parts longas do assistant (excepto as que contêm resumos GATE 0.5).
 *
 * Só deve ser aplicado à cópia das mensagens que é enviada ao modelo, não às mensagens persistidas.
 */
export function applyContextEditing<
  T extends {
    role?: string;
    parts?: Array<{
      type?: string;
      text?: string;
      result?: unknown;
      [key: string]: unknown;
    }>;
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
    if (!isOld) {
      return msg;
    }

    const isAssistant = msg.role === "assistant";

    // Verificar se a mensagem contém delimitadores GATE 0.5 (não truncar)
    const hasGateMarker =
      isAssistant &&
      msg.parts.some(
        (p) =>
          p.type === "text" &&
          typeof p.text === "string" &&
          GATE_05_MARKERS.some((m) => p.text?.includes(m))
      );

    const newParts = msg.parts.map((part) => {
      const type = part.type ?? "";

      // Tool results → placeholder
      if (type === "tool-result") {
        return {
          ...part,
          result: TOOL_RESULT_PLACEHOLDER,
        };
      }

      // Reasoning/thinking → remover
      if (type === "reasoning" || type === "thinking") {
        return null;
      }

      // Text parts — compactar documentos e truncar respostas longas
      if (type === "text" && typeof part.text === "string") {
        const text = part.text;

        // Documentos injetados (user messages com PI/Contestação/Documento)
        if (DOCUMENT_TEXT_PREFIX_RE.test(text) && text.length > 500) {
          return { ...part, text: compactDocumentText(text) };
        }

        // Respostas longas do assistant (excepto GATE 0.5)
        if (
          isAssistant &&
          !hasGateMarker &&
          text.length > ASSISTANT_TEXT_TRUNCATE_THRESHOLD
        ) {
          return {
            ...part,
            text:
              text.slice(0, ASSISTANT_TEXT_TRUNCATE_TARGET) +
              "\n[… resposta resumida para poupar contexto …]",
          };
        }
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
