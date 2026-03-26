import { describe, expect, it } from "vitest";
import {
  applyContextEditing,
  CONTEXT_EDITING_KEEP_LAST_N_MESSAGES,
  CONTEXT_WINDOW_CAPACITY_TOKENS,
  CONTEXT_WINDOW_INPUT_TARGET_TOKENS,
  estimateInputTokens,
  estimateTokensFromText,
  MAX_CHARS_PER_DOCUMENT,
  MAX_TOTAL_DOC_CHARS,
  TOOL_RESULT_PLACEHOLDER,
} from "@/lib/ai/context-window";

describe("context-window", () => {
  describe("constants", () => {
    it("has correct capacity", () => {
      expect(CONTEXT_WINDOW_CAPACITY_TOKENS).toBe(200_000);
    });

    it("input target leaves margin for output", () => {
      expect(CONTEXT_WINDOW_INPUT_TARGET_TOKENS).toBeLessThan(
        CONTEXT_WINDOW_CAPACITY_TOKENS
      );
      expect(
        CONTEXT_WINDOW_CAPACITY_TOKENS - CONTEXT_WINDOW_INPUT_TARGET_TOKENS
      ).toBe(5000);
    });

    it("doc limits are consistent", () => {
      expect(MAX_CHARS_PER_DOCUMENT).toBeLessThanOrEqual(MAX_TOTAL_DOC_CHARS);
    });

    it("keep last N is 10", () => {
      expect(CONTEXT_EDITING_KEEP_LAST_N_MESSAGES).toBe(10);
    });
  });

  describe("estimateTokensFromText", () => {
    it("returns 0 for empty string", () => {
      expect(estimateTokensFromText("")).toBe(0);
    });

    it("estimates ~4 chars per token", () => {
      const text = "a".repeat(100);
      expect(estimateTokensFromText(text)).toBe(25);
    });

    it("rounds up for non-divisible lengths", () => {
      const text = "a".repeat(101);
      expect(estimateTokensFromText(text)).toBe(26);
    });

    it("handles single character", () => {
      expect(estimateTokensFromText("a")).toBe(1);
    });

    it("handles realistic Portuguese text", () => {
      const text = "O réu apresentou contestação tempestiva.";
      const tokens = estimateTokensFromText(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBe(Math.ceil(text.length / 4));
    });
  });

  describe("estimateInputTokens", () => {
    it("returns system prompt tokens for empty messages", () => {
      const tokens = estimateInputTokens(1000, []);
      expect(tokens).toBe(Math.ceil(1000 / 4));
    });

    it("sums system prompt and message parts", () => {
      const messages = [
        { parts: [{ type: "text", text: "Hello world" }] },
        { parts: [{ type: "text", text: "How are you?" }] },
      ];
      const tokens = estimateInputTokens(100, messages);
      expect(tokens).toBeGreaterThan(Math.ceil(100 / 4));
    });

    it("skips messages without parts", () => {
      const messages = [{ parts: undefined as unknown as undefined }, {}];
      const tokens = estimateInputTokens(0, messages as any);
      expect(tokens).toBe(0);
    });

    it("handles tool-result parts", () => {
      const messages = [
        {
          parts: [
            {
              type: "tool-result",
              result: { data: "some result" },
            },
          ],
        },
      ];
      const tokens = estimateInputTokens(0, messages);
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles tool-invocation parts", () => {
      const messages = [
        {
          parts: [
            {
              type: "tool-invocation",
              args: { query: "search term" },
            },
          ],
        },
      ];
      const tokens = estimateInputTokens(0, messages);
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles file parts as 0 tokens", () => {
      const messages = [
        {
          parts: [{ type: "file", url: "data:image/png;base64,abc" }],
        },
      ];
      const tokens = estimateInputTokens(0, messages);
      expect(tokens).toBe(0);
    });
  });

  describe("applyContextEditing", () => {
    const makeMsg = (role: string, text: string, type = "text") => ({
      role,
      parts: [{ type, text }],
    });

    it("returns messages unchanged if count <= keepLastN", () => {
      const messages = [makeMsg("user", "hi"), makeMsg("assistant", "hello")];
      const result = applyContextEditing(messages, 10);
      expect(result).toBe(messages);
    });

    it("keeps last N messages intact", () => {
      const messages = Array.from({ length: 15 }, (_, i) =>
        makeMsg(i % 2 === 0 ? "user" : "assistant", `msg-${i}`)
      );
      const result = applyContextEditing(messages, 10);
      // Last 10 should be identical
      for (let i = 5; i < 15; i++) {
        expect(result[i]).toBe(messages[i]);
      }
    });

    it("replaces tool-result content with placeholder in old messages", () => {
      const messages = [
        {
          role: "assistant",
          parts: [
            { type: "tool-result", result: { big: "data".repeat(1000) } },
          ],
        },
        ...Array.from({ length: 10 }, (_, i) => makeMsg("user", `recent-${i}`)),
      ];
      const result = applyContextEditing(messages, 10);
      expect(result[0].parts[0].result).toBe(TOOL_RESULT_PLACEHOLDER);
    });

    it("removes reasoning parts from old messages", () => {
      const messages = [
        {
          role: "assistant",
          parts: [
            { type: "reasoning", text: "thinking..." },
            { type: "text", text: "answer" },
          ],
        },
        ...Array.from({ length: 10 }, (_, i) => makeMsg("user", `recent-${i}`)),
      ];
      const result = applyContextEditing(messages, 10);
      expect(result[0].parts).toHaveLength(1);
      expect(result[0].parts[0].type).toBe("text");
    });

    it("compacts document text in old messages", () => {
      const docText = `[Petição Inicial: processo-123.pdf]\n${"X".repeat(1000)}`;
      const messages = [
        makeMsg("user", docText),
        ...Array.from({ length: 10 }, (_, i) => makeMsg("user", `recent-${i}`)),
      ];
      const result = applyContextEditing(messages, 10);
      expect(result[0].parts[0].text).toContain("conteúdo omitido");
      expect((result[0].parts[0].text ?? "").length).toBeLessThan(
        docText.length
      );
    });

    it("preserves CAMPOS EXTRAÍDOS block during compaction", () => {
      const camposBlock =
        "[CAMPOS EXTRAÍDOS POR REGEX — processo-123]\nCNJ: 0001234-56.2024.5.01.0001\n[/CAMPOS EXTRAÍDOS POR REGEX]";
      const docText = `[Petição Inicial: proc.pdf]\n${"X".repeat(500)}\n${camposBlock}`;
      const messages = [
        makeMsg("user", docText),
        ...Array.from({ length: 10 }, (_, i) => makeMsg("user", `recent-${i}`)),
      ];
      const result = applyContextEditing(messages, 10);
      expect(result[0].parts[0].text).toContain("CAMPOS EXTRAÍDOS POR REGEX");
    });

    it("truncates long assistant text in old messages", () => {
      const longText = "A".repeat(3000);
      const messages = [
        makeMsg("assistant", longText),
        ...Array.from({ length: 10 }, (_, i) => makeMsg("user", `recent-${i}`)),
      ];
      const result = applyContextEditing(messages, 10);
      expect((result[0].parts[0].text ?? "").length).toBeLessThan(3000);
      expect(result[0].parts[0].text).toContain(
        "resposta resumida para poupar contexto"
      );
    });

    it("does not truncate assistant text with GATE 0.5 markers", () => {
      const gateText = `${"A".repeat(3000)}\n--- GATE_0.5_RESUMO ---\nImportant content`;
      const messages = [
        makeMsg("assistant", gateText),
        ...Array.from({ length: 10 }, (_, i) => makeMsg("user", `recent-${i}`)),
      ];
      const result = applyContextEditing(messages, 10);
      expect(result[0].parts[0].text).toBe(gateText);
    });

    it("handles messages without parts", () => {
      const messages = [
        { role: "user" } as any,
        ...Array.from({ length: 10 }, (_, i) => makeMsg("user", `recent-${i}`)),
      ];
      const result = applyContextEditing(messages, 10);
      expect(result[0]).toBe(messages[0]);
    });

    it("uses default keepLastN of 10", () => {
      const messages = Array.from({ length: 12 }, (_, i) =>
        makeMsg(i % 2 === 0 ? "user" : "assistant", `msg-${i}`)
      );
      const result = applyContextEditing(messages);
      // First 2 are old, last 10 are kept
      for (let i = 2; i < 12; i++) {
        expect(result[i]).toBe(messages[i]);
      }
    });
  });
});
