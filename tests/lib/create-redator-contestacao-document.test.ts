/**
 * Testes unitários para a tool createRedatorContestacaoDocument.
 * Verifica o streaming de eventos data-redator* e o padrão non-blocking de save.
 */
import { describe, expect, it, vi } from "vitest";
import { createRedatorContestacaoDocument } from "@/lib/ai/tools/create-redator-contestacao-document";

// Mock mínimo do UIMessageStreamWriter
function createMockStream() {
  const events: Array<{ type: string; data: unknown }> = [];
  return {
    stream: {
      write: (event: { type: string; data: unknown }) => {
        events.push(event);
      },
    } as unknown as Parameters<
      typeof createRedatorContestacaoDocument
    >[0]["dataStream"],
    events,
  };
}

// Mock mínimo de Session
const mockSession = {
  user: { id: "user-test-redator", email: "test@example.com" },
  expires: "2099-01-01",
} as unknown as Parameters<
  typeof createRedatorContestacaoDocument
>[0]["session"];

// Mock da BD
vi.mock("@/lib/db/queries", () => ({
  saveDocument: vi.fn().mockResolvedValue(undefined),
  pingDatabase: vi.fn().mockResolvedValue(undefined),
  withQueryTimeout: vi
    .fn()
    .mockImplementation((fn: () => Promise<unknown>) => fn()),
  withRetry: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
}));

describe("createRedatorContestacaoDocument — stream de eventos", () => {
  it("emite data-redatorStart com total=1", async () => {
    const { stream, events } = createMockStream();
    const tool = createRedatorContestacaoDocument({
      session: mockSession,
      dataStream: stream,
    });

    await tool.execute({
      title: "Contestacao_001_minuta",
      minutaContent: "Texto da minuta.",
    });

    const startEvent = events.find((e) => e.type === "data-redatorStart");
    expect(startEvent).toBeDefined();
    expect(startEvent?.data).toBe(1);
  });

  it("emite sequência completa: redatorId, redatorTitle, redatorClear, redatorDelta, redatorFinish", async () => {
    const { stream, events } = createMockStream();
    const tool = createRedatorContestacaoDocument({
      session: mockSession,
      dataStream: stream,
    });

    await tool.execute({
      title: "Contestacao_002",
      minutaContent: "Conteúdo da contestação.",
    });

    const types = events.map((e) => e.type);
    expect(types).toContain("data-redatorStart");
    expect(types).toContain("data-redatorKind");
    expect(types).toContain("data-redatorId");
    expect(types).toContain("data-redatorTitle");
    expect(types).toContain("data-redatorClear");
    expect(types).toContain("data-redatorDelta");
    expect(types).toContain("data-redatorFinish");
    expect(types).toContain("data-redatorProgress");
    expect(types).toContain("data-redatorDone");
  });

  it("NÃO emite eventos data-* genéricos (data-id, data-kind, data-title, data-finish)", async () => {
    const { stream, events } = createMockStream();
    const tool = createRedatorContestacaoDocument({
      session: mockSession,
      dataStream: stream,
    });

    await tool.execute({
      title: "Teste Colisão",
      minutaContent: "Verificar que prefixo genérico não é usado.",
    });

    const genericEvents = events.filter(
      (e) =>
        e.type === "data-id" ||
        e.type === "data-kind" ||
        e.type === "data-title" ||
        e.type === "data-clear" ||
        e.type === "data-textDelta" ||
        e.type === "data-finish"
    );
    expect(genericEvents).toHaveLength(0);
  });

  it("reconstrói conteúdo completo a partir dos chunks redatorDelta", async () => {
    const { stream, events } = createMockStream();
    const tool = createRedatorContestacaoDocument({
      session: mockSession,
      dataStream: stream,
    });
    const originalContent = "B".repeat(1200); // >3 chunks de 400

    await tool.execute({
      title: "Doc Chunks",
      minutaContent: originalContent,
    });

    const deltaEvents = events.filter((e) => e.type === "data-redatorDelta");
    const reconstructed = deltaEvents.map((e) => e.data as string).join("");
    expect(reconstructed).toBe(originalContent);
  });

  it("data-redatorDone inclui ids e titles em JSON", async () => {
    const { stream, events } = createMockStream();
    const tool = createRedatorContestacaoDocument({
      session: mockSession,
      dataStream: stream,
    });

    await tool.execute({
      title: "Título Final Redator",
      minutaContent: "Conteúdo",
    });

    const doneEvent = events.find((e) => e.type === "data-redatorDone");
    expect(doneEvent).toBeDefined();
    const parsed = JSON.parse(doneEvent?.data as string);
    expect(Array.isArray(parsed.ids)).toBe(true);
    expect(parsed.ids).toHaveLength(1);
    expect(parsed.titles[0]).toBe("Título Final Redator");
  });

  it("retorna id e title no resultado da tool", async () => {
    const { stream } = createMockStream();
    const tool = createRedatorContestacaoDocument({
      session: mockSession,
      dataStream: stream,
    });

    const result = await tool.execute({
      title: "Minuta Teste",
      minutaContent: "Conteúdo da minuta",
    });

    expect(Array.isArray(result.ids)).toBe(true);
    expect(result.ids).toHaveLength(1);
    expect(typeof result.ids[0]).toBe("string");
    expect(result.ids[0].length).toBeGreaterThan(0);
    expect(result.titles[0]).toBe("Minuta Teste");
  });
});

describe("createRedatorContestacaoDocument — save non-blocking", () => {
  it("sem userId não tenta salvar na BD mas completa o stream", async () => {
    const { saveDocument } = await import("@/lib/db/queries");
    const mockSave = vi.mocked(saveDocument);
    mockSave.mockClear();

    const { stream, events } = createMockStream();
    const sessionWithoutUser = {
      user: { id: undefined },
      expires: "2099-01-01",
    } as unknown as Parameters<
      typeof createRedatorContestacaoDocument
    >[0]["session"];

    const tool = createRedatorContestacaoDocument({
      session: sessionWithoutUser,
      dataStream: stream,
    });

    const result = await tool.execute({
      title: "Guest Minuta",
      minutaContent: "Conteúdo visitante",
    });

    expect(mockSave).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "data-redatorFinish")).toBe(true);
    // Sem userId = sem saves necessários = sucesso
    expect(result.content).toContain("sucesso");
  });

  it("emite data-generationStatus com título do documento", async () => {
    const { stream, events } = createMockStream();
    const tool = createRedatorContestacaoDocument({
      session: mockSession,
      dataStream: stream,
    });

    await tool.execute({
      title: "Contestacao_003",
      minutaContent: "Texto",
    });

    const statusEvent = events.find((e) => e.type === "data-generationStatus");
    expect(statusEvent).toBeDefined();
    expect(statusEvent?.data).toContain("Contestacao_003");
  });
});

describe("createRedatorContestacaoDocument — pipeline DataStreamHandler", () => {
  it("simula processamento dos eventos redator* e popula o redator-content-store", async () => {
    const { stream, events } = createMockStream();
    const tool = createRedatorContestacaoDocument({
      session: mockSession,
      dataStream: stream,
    });
    const expectedContent =
      "## DA PRELIMINAR\n\nTexto da contestação completa.";

    const result = await tool.execute({
      title: "Pipeline Redator",
      minutaContent: expectedContent,
    });

    // Simular o que DataStreamHandler faz no browser
    const { storeRedatorDoc, getRedatorDoc } = await import(
      "@/lib/redator-content-store"
    );
    let _id = "";
    let _title = "";
    let _content = "";

    for (const event of events) {
      if (event.type === "data-redatorId") {
        _id = event.data as string;
        continue;
      }
      if (event.type === "data-redatorTitle") {
        _title = event.data as string;
        continue;
      }
      if (event.type === "data-redatorClear") {
        _content = "";
        continue;
      }
      if (event.type === "data-redatorDelta") {
        _content += event.data as string;
        continue;
      }
      if (event.type === "data-redatorFinish") {
        if (_id) {
          storeRedatorDoc(_id, _title, _content);
        }
        _id = "";
        _content = "";
      }
    }

    // Store deve ter o conteúdo
    const stored = getRedatorDoc(result.ids[0]);
    expect(stored).toBeDefined();
    expect(stored?.title).toBe("Pipeline Redator");
    expect(stored?.content).toBe(expectedContent);
  });
});
