import { describe, expect, it, vi } from "vitest";

// "server-only" impede importação fora do servidor Next.js — neutralizar em testes
vi.mock("server-only", () => ({}));
// Mock next/server (after, etc.)
vi.mock("next/server", () => ({ after: vi.fn() }));
// Mock resumable-stream
vi.mock("resumable-stream", () => ({
  createResumableStreamContext: vi.fn(),
}));

import {
  MAX_DOCUMENT_PART_TEXT_DB_LENGTH,
  MAX_DOCUMENT_PART_TEXT_LENGTH,
} from "@/app/(chat)/api/chat/schema";
import {
  normalizeMessageParts,
  truncateDocumentParts,
  truncateDocumentPartsForDb,
  truncateDocumentPartsInBody,
  validateRevisorDocumentParts,
  validateUserMessageContent,
} from "@/lib/ai/chat/parse-request";
import type { ChatMessage } from "@/lib/types";

describe("chat/parse-request", () => {
  describe("validateUserMessageContent", () => {
    it("returns null for non-user messages", () => {
      expect(validateUserMessageContent(undefined)).toBeNull();
    });

    it("returns null for message with text content", () => {
      const message = {
        id: "test",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Hello" }],
      };
      expect(validateUserMessageContent(message)).toBeNull();
    });

    it("returns error for message with only empty text", () => {
      const message = {
        id: "test",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "   " }],
      };
      const result = validateUserMessageContent(message);
      expect(result).toBeInstanceOf(Response);
    });

    it("returns null for message with file part", () => {
      const message = {
        id: "test",
        role: "user" as const,
        parts: [
          {
            type: "file" as const,
            url: "http://example.com",
            mediaType: "image/png",
            name: "test.png",
          },
        ],
      };
      expect(validateUserMessageContent(message)).toBeNull();
    });

    it("returns null for message with document part", () => {
      const message = {
        id: "test",
        role: "user" as const,
        parts: [
          { type: "document" as const, name: "test.pdf", text: "content" },
        ],
      };
      expect(validateUserMessageContent(message)).toBeNull();
    });
  });

  describe("truncateDocumentParts", () => {
    it("does not truncate short documents", () => {
      const parts = [
        { type: "document" as const, name: "test.pdf", text: "short text" },
      ];
      const result = truncateDocumentParts(parts);
      expect(result[0]).toEqual(parts[0]);
    });

    it("truncates documents exceeding MAX_DOCUMENT_PART_TEXT_LENGTH", () => {
      const longText = "A".repeat(MAX_DOCUMENT_PART_TEXT_LENGTH + 1000);
      const parts = [
        { type: "document" as const, name: "test.pdf", text: longText },
      ];
      const result = truncateDocumentParts(parts);
      expect((result[0] as { text: string }).text.length).toBeLessThanOrEqual(
        MAX_DOCUMENT_PART_TEXT_LENGTH
      );
      expect((result[0] as { text: string }).text).toContain("Truncado");
    });

    it("does not affect non-document parts", () => {
      const parts = [
        {
          type: "text" as const,
          text: "A".repeat(MAX_DOCUMENT_PART_TEXT_LENGTH + 1000),
        },
      ];
      const result = truncateDocumentParts(parts);
      expect(result[0]).toEqual(parts[0]);
    });
  });

  describe("truncateDocumentPartsForDb", () => {
    it("truncates at DB limit", () => {
      const longText = "A".repeat(MAX_DOCUMENT_PART_TEXT_DB_LENGTH + 1000);
      const parts = [
        { type: "document" as const, name: "test.pdf", text: longText },
      ];
      const result = truncateDocumentPartsForDb(parts);
      expect((result[0] as { text: string }).text.length).toBeLessThanOrEqual(
        MAX_DOCUMENT_PART_TEXT_DB_LENGTH
      );
      expect((result[0] as { text: string }).text).toContain(
        "disponível apenas durante a sessão"
      );
    });
  });

  describe("truncateDocumentPartsInBody", () => {
    it("truncates parts in body message", () => {
      const longText = "A".repeat(MAX_DOCUMENT_PART_TEXT_LENGTH + 1000);
      const body = {
        id: "test-uuid",
        selectedChatModel: "test-model",
        selectedVisibilityType: "private" as const,
        message: {
          id: "msg-uuid",
          role: "user" as const,
          parts: [
            { type: "document" as const, name: "test.pdf", text: longText },
          ],
        },
      };
      const result = truncateDocumentPartsInBody(body);
      expect(
        (result.message?.parts[0] as { text: string }).text.length
      ).toBeLessThanOrEqual(MAX_DOCUMENT_PART_TEXT_LENGTH);
    });
  });

  describe("normalizeMessageParts", () => {
    it("returns messages unchanged when no parts", () => {
      const messages: ChatMessage[] = [{ id: "1", role: "user", parts: [] }];
      const result = normalizeMessageParts(messages);
      expect(result[0].parts).toEqual([]);
    });

    it("converts document parts to text parts", () => {
      const messages: ChatMessage[] = [
        {
          id: "1",
          role: "user",
          parts: [
            {
              type: "document",
              name: "test.pdf",
              text: "Document content here",
            } as unknown as ChatMessage["parts"][number],
          ],
        },
      ];
      const result = normalizeMessageParts(messages);
      const firstPart = result[0].parts[0] as { type: string; text: string };
      expect(firstPart.type).toBe("text");
      expect(firstPart.text).toContain("Document content here");
      expect(firstPart.text).toContain("[Documento: test.pdf]");
    });

    it("filters out empty text parts", () => {
      const messages: ChatMessage[] = [
        {
          id: "1",
          role: "user",
          parts: [
            { type: "text", text: "" } as ChatMessage["parts"][number],
            { type: "text", text: "Valid" } as ChatMessage["parts"][number],
          ],
        },
      ];
      const result = normalizeMessageParts(messages);
      expect(result[0].parts.length).toBe(1);
    });

    it("orders PI before Contestação", () => {
      const messages: ChatMessage[] = [
        {
          id: "1",
          role: "user",
          parts: [
            {
              type: "document",
              name: "contestacao.pdf",
              text: "Contestacao text",
              documentType: "contestacao",
            } as unknown as ChatMessage["parts"][number],
            {
              type: "document",
              name: "pi.pdf",
              text: "PI text",
              documentType: "pi",
            } as unknown as ChatMessage["parts"][number],
          ],
        },
      ];
      const result = normalizeMessageParts(messages);
      const firstPartText = (result[0].parts[0] as { text: string }).text;
      const secondPartText = (result[0].parts[1] as { text: string }).text;
      expect(firstPartText).toContain("Petição Inicial");
      expect(secondPartText).toContain("Contestação");
    });
  });

  describe("validateRevisorDocumentParts", () => {
    const revisorConfig = {
      id: "revisor-defesas",
      label: "Revisor",
      instructions: "test",
      useRevisorDefesaTools: true,
      useRedatorContestacaoTool: false,
    };

    it("returns null for non-revisor agent", () => {
      const nonRevisorConfig = {
        ...revisorConfig,
        useRevisorDefesaTools: false,
      };
      const message = {
        id: "test",
        role: "user" as const,
        parts: [{ type: "document" as const, name: "test.pdf", text: "text" }],
      };
      expect(
        validateRevisorDocumentParts(message, nonRevisorConfig)
      ).toBeNull();
    });

    it("returns null when no document parts", () => {
      const message = {
        id: "test",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Hello" }],
      };
      expect(validateRevisorDocumentParts(message, revisorConfig)).toBeNull();
    });

    it("returns error when only PI is provided", () => {
      const message = {
        id: "test",
        role: "user" as const,
        parts: [
          {
            type: "document" as const,
            name: "pi.pdf",
            text: "PI",
            documentType: "pi" as const,
          },
        ],
      };
      const result = validateRevisorDocumentParts(message, revisorConfig);
      expect(result).toBeInstanceOf(Response);
    });

    it("returns null when both PI and Contestação are provided", () => {
      const message = {
        id: "test",
        role: "user" as const,
        parts: [
          {
            type: "document" as const,
            name: "pi.pdf",
            text: "PI",
            documentType: "pi" as const,
          },
          {
            type: "document" as const,
            name: "cont.pdf",
            text: "Cont",
            documentType: "contestacao" as const,
          },
        ],
      };
      expect(validateRevisorDocumentParts(message, revisorConfig)).toBeNull();
    });
  });
});
