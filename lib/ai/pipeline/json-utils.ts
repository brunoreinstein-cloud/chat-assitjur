/**
 * Utilitários para extração robusta de JSON de respostas LLM.
 * Estratégias em camadas: parse direto → code block → brace-counting → regex fallback.
 */

/**
 * Extrai o primeiro objeto JSON válido de um texto que pode conter
 * prosa, code blocks, ou JSON puro.
 * Retorna `null` se nenhum JSON válido for encontrado.
 */
export function extractJsonObject(text: string): unknown | null {
  // Estratégia 1: Texto é JSON puro
  try {
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed;
      }
    }
  } catch {
    // Não é JSON puro, tentar próxima estratégia
  }

  // Estratégia 2: JSON dentro de code block ```json ... ```
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch?.[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (typeof parsed === "object" && parsed !== null) {
        return parsed;
      }
    } catch {
      // Code block não contém JSON válido
    }
  }

  // Estratégia 3: Brace-counting para encontrar o objeto JSON mais externo balanceado
  const firstBrace = text.indexOf("{");
  if (firstBrace !== -1) {
    const result = extractBalancedBraces(text, firstBrace);
    if (result) {
      try {
        const parsed = JSON.parse(result);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed;
        }
      } catch {
        // Braces balanceadas mas não é JSON válido
      }
    }
  }

  // Estratégia 4: Regex fallback (greedy, do primeiro { ao último })
  const regexMatch = text.match(/\{[\s\S]*\}/);
  if (regexMatch) {
    try {
      const parsed = JSON.parse(regexMatch[0]);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed;
      }
    } catch {
      // Nenhuma estratégia funcionou
    }
  }

  return null;
}

/**
 * Extrai substring com braces balanceadas começando em `startIndex`.
 * Respeita strings JSON (ignora { } dentro de aspas).
 */
function extractBalancedBraces(
  text: string,
  startIndex: number
): string | null {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(startIndex, i + 1);
      }
    }
  }

  return null; // Braces não balanceadas
}
