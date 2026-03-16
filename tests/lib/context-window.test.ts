/**
 * Testes unitários para lib/ai/context-window.ts
 * Foco: estimateTokensFromText, constantes de truncagem, estimateInputTokens, applyContextEditing.
 */
import { describe, expect, it } from "vitest";
import {
  applyContextEditing,
  CONTEXT_WINDOW_CAPACITY_TOKENS,
  CONTEXT_WINDOW_INPUT_TARGET_TOKENS,
  estimateInputTokens,
  estimateTokensFromText,
  MAX_CHARS_PER_DOCUMENT,
  MAX_TOTAL_DOC_CHARS,
  TOOL_RESULT_PLACEHOLDER,
} from "@/lib/ai/context-window";

// ---------------------------------------------------------------------------
// estimateTokensFromText
// ---------------------------------------------------------------------------
describe("estimateTokensFromText", () => {
  it("retorna 0 para string vazia", () => {
    expect(estimateTokensFromText("")).toBe(0);
  });

  it("estima ~1 token por 4 caracteres", () => {
    // 100 chars → 25 tokens
    expect(estimateTokensFromText("a".repeat(100))).toBe(25);
  });

  it("arredonda para cima (ceil)", () => {
    // 5 chars → ceil(5/4) = 2
    expect(estimateTokensFromText("hello")).toBe(2);
  });

  it("lida com texto longo (1M chars)", () => {
    const text = "x".repeat(1_000_000);
    expect(estimateTokensFromText(text)).toBe(250_000);
  });
});

// ---------------------------------------------------------------------------
// Constantes exportadas
// ---------------------------------------------------------------------------
describe("constantes de truncagem", () => {
  it("MAX_CHARS_PER_DOCUMENT = 80_000", () => {
    expect(MAX_CHARS_PER_DOCUMENT).toBe(80_000);
  });

  it("MAX_TOTAL_DOC_CHARS = 180_000", () => {
    expect(MAX_TOTAL_DOC_CHARS).toBe(180_000);
  });

  it("capacidade da janela = 200k tokens", () => {
    expect(CONTEXT_WINDOW_CAPACITY_TOKENS).toBe(200_000);
  });

  it("input target = 195k tokens", () => {
    expect(CONTEXT_WINDOW_INPUT_TARGET_TOKENS).toBe(195_000);
  });
});

// ---------------------------------------------------------------------------
// estimateInputTokens
// ---------------------------------------------------------------------------
describe("estimateInputTokens", () => {
  it("retorna tokens do system prompt quando não há mensagens", () => {
    const tokens = estimateInputTokens(400, []);
    // 400 chars → 100 tokens
    expect(tokens).toBe(100);
  });

  it("soma tokens do system prompt + mensagens de texto", () => {
    const messages = [
      { parts: [{ type: "text", text: "a".repeat(200) }] },
      { parts: [{ type: "text", text: "b".repeat(100) }] },
    ];
    // system: 400 chars = 100 tokens; msg1: 200/4=50; msg2: 100/4=25
    const tokens = estimateInputTokens(400, messages);
    expect(tokens).toBe(100 + 50 + 25);
  });

  it("conta tool-result serializado", () => {
    const messages = [
      {
        parts: [{ type: "tool-result", result: { key: "value" } }],
      },
    ];
    const tokens = estimateInputTokens(0, messages);
    // JSON.stringify({key:"value"}) = 15 chars → ceil(15/4) = 4
    expect(tokens).toBe(4);
  });

  it("ignora mensagens sem parts", () => {
    const messages = [{}, { parts: [] }];
    const tokens = estimateInputTokens(0, messages);
    expect(tokens).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyContextEditing
// ---------------------------------------------------------------------------
describe("applyContextEditing", () => {
  it("não altera quando mensagens <= keepLastN", () => {
    const messages = [
      { parts: [{ type: "text", text: "hello" }] },
      { parts: [{ type: "text", text: "world" }] },
    ];
    const result = applyContextEditing(messages, 5);
    expect(result).toBe(messages); // mesma referência
  });

  it("substitui tool-result em mensagens antigas por placeholder", () => {
    const messages = [
      { parts: [{ type: "tool-result", result: "big data" }] },
      { parts: [{ type: "text", text: "a" }] },
      { parts: [{ type: "text", text: "b" }] },
    ];
    const result = applyContextEditing(messages, 2);
    // Mensagem 0 é antiga (antes de boundary=1)
    expect(result[0].parts?.[0].result).toBe(TOOL_RESULT_PLACEHOLDER);
    // Mensagens 1 e 2 intactas
    expect(result[1].parts?.[0].text).toBe("a");
    expect(result[2].parts?.[0].text).toBe("b");
  });

  it("remove reasoning/thinking de mensagens antigas", () => {
    const messages = [
      {
        parts: [
          { type: "reasoning", text: "thinking..." },
          { type: "text", text: "answer" },
        ],
      },
      { parts: [{ type: "text", text: "recent" }] },
    ];
    const result = applyContextEditing(messages, 1);
    // Mensagem 0: reasoning removido, text mantido
    expect(result[0].parts).toHaveLength(1);
    expect(result[0].parts?.[0].type).toBe("text");
  });

  it("mantém texto normal em mensagens antigas", () => {
    const messages = [
      { parts: [{ type: "text", text: "old text" }] },
      { parts: [{ type: "text", text: "new text" }] },
    ];
    const result = applyContextEditing(messages, 1);
    expect(result[0].parts?.[0].text).toBe("old text");
  });
});

// ---------------------------------------------------------------------------
// Simulação do cálculo do indicador de contexto (client-side)
// Testa a lógica de cap que espelha a truncagem server-side.
// ---------------------------------------------------------------------------
describe("lógica de cap do indicador de contexto", () => {
  /**
   * Replica a lógica de cálculo do context-usage-indicator.tsx
   * para testar sem dependências de React.
   */
  function calcAttachmentTokens(
    attachments: Array<{ extractedText?: string }>
  ): number {
    let tokens = 0;
    let totalDocChars = 0;
    for (const att of attachments) {
      if (att.extractedText) {
        const remaining = Math.max(0, MAX_TOTAL_DOC_CHARS - totalDocChars);
        const cappedLen = Math.min(
          att.extractedText.length,
          MAX_CHARS_PER_DOCUMENT,
          remaining
        );
        totalDocChars += cappedLen;
        tokens += estimateTokensFromText(att.extractedText.slice(0, cappedLen));
      }
    }
    return tokens;
  }

  it("doc pequeno (10K chars) não é truncado", () => {
    const text = "x".repeat(10_000);
    const tokens = calcAttachmentTokens([{ extractedText: text }]);
    expect(tokens).toBe(2500); // 10_000 / 4
  });

  it("doc grande (3M chars) é limitado a MAX_CHARS_PER_DOCUMENT", () => {
    const text = "x".repeat(3_000_000);
    const tokens = calcAttachmentTokens([{ extractedText: text }]);
    // Capped a 80K chars → 20K tokens
    expect(tokens).toBe(20_000);
  });

  it("múltiplos docs respeitam MAX_TOTAL_DOC_CHARS", () => {
    // 3 docs de 80K cada = 240K chars, mas total cap é 180K
    const docs = Array.from({ length: 3 }, () => ({
      extractedText: "x".repeat(100_000),
    }));
    const tokens = calcAttachmentTokens(docs);
    // doc1: min(100K, 80K, 180K) = 80K → total=80K
    // doc2: min(100K, 80K, 100K) = 80K → total=160K
    // doc3: min(100K, 80K, 20K) = 20K → total=180K
    // Total chars: 180K → 45K tokens
    expect(tokens).toBe(45_000);
  });

  it("PDF 1868 págs (~3.1M chars) mostra uso razoável, não 900%", () => {
    const text = "x".repeat(3_142_616); // simulando o PDF real
    const tokens = calcAttachmentTokens([{ extractedText: text }]);
    const pct = Math.round((tokens / CONTEXT_WINDOW_INPUT_TARGET_TOKENS) * 100);
    // 80K chars → 20K tokens → 20K/195K ≈ 10%
    expect(pct).toBeLessThanOrEqual(15);
    expect(pct).toBeGreaterThan(5);
  });

  it("sem extractedText retorna 0 tokens", () => {
    const tokens = calcAttachmentTokens([{}, { extractedText: "" }]);
    expect(tokens).toBe(0);
  });
});
