import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("resumable-stream", () => ({
  createResumableStreamContext: vi.fn(),
}));
vi.mock("@/lib/ai/chat-debug", () => ({
  isChatDebugEnabled: vi.fn().mockReturnValue(false),
  logChatDebug: vi.fn(),
}));
vi.mock("@/lib/rag", () => ({
  retrieveKnowledgeContext: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db/queries", () => ({
  getUserFilesByIds: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/ai/tools/validation-tools", () => ({
  validationToolsForValidate: {},
}));
vi.mock("@/lib/ai/resolve-knowledge-ids", () => ({
  buildKnowledgeContext: vi.fn((raw: string) =>
    raw.length > 0 ? raw : undefined
  ),
}));

import { buildKnowledgeContextFromParts } from "@/lib/ai/chat/context-builder";

// ---------------------------------------------------------------------------
// buildKnowledgeContextFromParts
// ---------------------------------------------------------------------------

describe("buildKnowledgeContextFromParts", () => {
  it("returns undefined when no chunks, no docs, no user files", () => {
    const result = buildKnowledgeContextFromParts([], [], [], []);
    expect(result).toBeUndefined();
  });

  it("builds context from RAG chunks", () => {
    const ragChunks = [
      {
        knowledgeDocumentId: "doc-1",
        title: "Súmula 443 TST",
        text: "Presume-se discriminatória a despedida...",
      },
      {
        knowledgeDocumentId: "doc-1",
        title: "Súmula 443 TST",
        text: "... de empregado portador de doença grave.",
      },
    ];

    const result = buildKnowledgeContextFromParts(
      ragChunks as any,
      [],
      [],
      ["doc-1"]
    );

    expect(result).toBeDefined();
    expect(result).toContain("knowledge_base");
    expect(result).toContain("Súmula 443 TST");
    expect(result).toContain("Presume-se discriminatória");
    expect(result).toContain("portador de doença grave");
  });

  it("groups RAG chunks by document", () => {
    const ragChunks = [
      {
        knowledgeDocumentId: "doc-1",
        title: "Doc A",
        text: "Chunk 1 from A",
      },
      {
        knowledgeDocumentId: "doc-2",
        title: "Doc B",
        text: "Chunk 1 from B",
      },
      {
        knowledgeDocumentId: "doc-1",
        title: "Doc A",
        text: "Chunk 2 from A",
      },
    ];

    const result = buildKnowledgeContextFromParts(
      ragChunks as any,
      [],
      [],
      ["doc-1", "doc-2"]
    );

    expect(result).toBeDefined();
    expect(result).toContain("Doc A");
    expect(result).toContain("Doc B");
  });

  it("injects structured summaries from knowledge docs", () => {
    const knowledgeDocs = [
      {
        id: "doc-1",
        title: "Petição Inicial",
        content: "Conteúdo completo da PI...",
        structuredSummary: "## Resumo\n- Reclamante: João\n- Pedidos: X, Y",
      },
    ];

    const result = buildKnowledgeContextFromParts(
      [],
      knowledgeDocs as any,
      [],
      ["doc-1"]
    );

    expect(result).toBeDefined();
    expect(result).toContain("Resumo Estruturado");
    expect(result).toContain("Reclamante: João");
  });

  it("falls back to full doc content when no RAG chunks and no structured summary", () => {
    const knowledgeDocs = [
      {
        id: "doc-1",
        title: "Contestação",
        content: "Conteúdo completo da contestação para fallback...",
        structuredSummary: null,
      },
    ];

    const result = buildKnowledgeContextFromParts(
      [],
      knowledgeDocs as any,
      [],
      ["doc-1"]
    );

    expect(result).toBeDefined();
    expect(result).toContain("Conteúdo completo da contestação para fallback");
  });

  it("does NOT fall back to full doc when RAG chunks exist", () => {
    const ragChunks = [
      {
        knowledgeDocumentId: "doc-1",
        title: "Contestação",
        text: "Only this RAG chunk",
      },
    ];
    const knowledgeDocs = [
      {
        id: "doc-1",
        title: "Contestação",
        content: "Full content that should NOT appear",
        structuredSummary: null,
      },
    ];

    const result = buildKnowledgeContextFromParts(
      ragChunks as any,
      knowledgeDocs as any,
      [],
      ["doc-1"]
    );

    expect(result).toBeDefined();
    expect(result).toContain("Only this RAG chunk");
    expect(result).not.toContain("Full content that should NOT appear");
  });

  it("includes user files with extractedTextCache", () => {
    const userFiles = [
      {
        id: "file-1",
        filename: "laudo.pdf",
        extractedTextCache: "Texto extraído do laudo pericial...",
        structuredSummary: null,
      },
    ];

    const result = buildKnowledgeContextFromParts([], [], userFiles as any, []);

    expect(result).toBeDefined();
    expect(result).toContain("laudo.pdf");
    expect(result).toContain("Texto extraído do laudo pericial");
  });

  it("includes user files with structuredSummary", () => {
    const userFiles = [
      {
        id: "file-1",
        filename: "sentenca.pdf",
        extractedTextCache: "Full text...",
        structuredSummary: "## Resumo\n- Juiz: Ana\n- Decisão: Procedente",
      },
    ];

    const result = buildKnowledgeContextFromParts([], [], userFiles as any, []);

    expect(result).toBeDefined();
    expect(result).toContain("Resumo Estruturado");
    expect(result).toContain("Decisão: Procedente");
    // Also includes full text
    expect(result).toContain("Full text...");
  });

  it("skips user files with empty extractedTextCache", () => {
    const userFiles = [
      {
        id: "file-1",
        filename: "empty.pdf",
        extractedTextCache: "   ",
        structuredSummary: null,
      },
    ];

    const result = buildKnowledgeContextFromParts([], [], userFiles as any, []);

    // No content to wrap → buildKnowledgeContext gets empty string → returns undefined
    expect(result).toBeUndefined();
  });

  it("combines RAG chunks, knowledge docs summaries, and user files", () => {
    const ragChunks = [
      {
        knowledgeDocumentId: "doc-1",
        title: "PI",
        text: "RAG chunk from PI",
      },
    ];
    const knowledgeDocs = [
      {
        id: "doc-1",
        title: "PI",
        content: "Full PI",
        structuredSummary: "Summary of PI",
      },
    ];
    const userFiles = [
      {
        id: "file-1",
        filename: "extra.pdf",
        extractedTextCache: "Extra file content",
        structuredSummary: null,
      },
    ];

    const result = buildKnowledgeContextFromParts(
      ragChunks as any,
      knowledgeDocs as any,
      userFiles as any,
      ["doc-1"]
    );

    expect(result).toBeDefined();
    // Structured summary from knowledge doc
    expect(result).toContain("Summary of PI");
    // RAG chunk
    expect(result).toContain("RAG chunk from PI");
    // User file
    expect(result).toContain("Extra file content");
  });

  it("wraps all content in knowledge_base tags", () => {
    const ragChunks = [
      {
        knowledgeDocumentId: "doc-1",
        title: "Test",
        text: "Content",
      },
    ];

    const result = buildKnowledgeContextFromParts(
      ragChunks as any,
      [],
      [],
      ["doc-1"]
    );

    expect(result).toContain("<knowledge_base>");
    expect(result).toContain("</knowledge_base>");
  });
});
