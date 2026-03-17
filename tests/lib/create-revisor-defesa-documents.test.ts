/**
 * Testes unitários para a tool createRevisorDefesaDocuments.
 * Verifica o streaming de eventos rdoc* e a lógica de retry/save.
 *
 * NOTA: A tool chama generateRevisorDocumentContent (IA) internamente.
 * Aqui mockamos essa função para retornar conteúdo previsível.
 */
import { describe, expect, it, vi } from "vitest";
import { createRevisorDefesaDocuments } from "@/lib/ai/tools/create-revisor-defesa-documents";
import { getRevisorDoc } from "@/lib/revisor-content-store";

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock da geração de conteúdo IA — retorna imediatamente sem chamar a API real
vi.mock("@/artifacts/text/server", () => ({
  generateRevisorDocumentContent: vi.fn().mockImplementation((title: string) =>
    Promise.resolve(`## ${title}\n\nConteúdo gerado para ${title}.`)
  ),
}));

// Mock da BD — saveDocument e pingDatabase não devem bloquear
vi.mock("@/lib/db/queries", () => ({
  saveDocument: vi.fn().mockResolvedValue(undefined),
  pingDatabase: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockStream() {
  const events: Array<{ type: string; data: unknown }> = [];
  return {
    stream: {
      write: (event: { type: string; data: unknown }) => {
        events.push(event);
      },
    } as unknown as Parameters<typeof createRevisorDefesaDocuments>[0]["dataStream"],
    events,
  };
}

const mockSession = {
  user: { id: "user-test-456", email: "revisor@example.com" },
  expires: "2099-01-01",
} as unknown as Parameters<typeof createRevisorDefesaDocuments>[0]["session"];

const DEFAULT_INPUT = {
  avaliacaoTitle: "Avaliação — Caso Silva",
  roteiroAdvogadoTitle: "Roteiro Advogado — Caso Silva",
  roteiroPrepostoTitle: "Roteiro Preposto — Caso Silva",
  contextoResumo: "Resumo do caso para testes.",
};

// ─── Testes: stream de eventos ────────────────────────────────────────────────

describe("createRevisorDefesaDocuments — stream de eventos", () => {
  it("emite evento data-rdocStart com total de 3 documentos", async () => {
    const { stream, events } = createMockStream();
    const tool = createRevisorDefesaDocuments({ session: mockSession, dataStream: stream });
    await tool.execute(DEFAULT_INPUT);

    // O evento rdocStart indica o total de docs que vêm a seguir
    const startEvent = events.find((e) => e.type === "data-rdocStart");
    expect(startEvent).toBeDefined();
    expect(startEvent?.data).toBe(3);
  });

  it("emite os tipos de eventos obrigatórios para 3 docs", async () => {
    const { stream, events } = createMockStream();
    const tool = createRevisorDefesaDocuments({ session: mockSession, dataStream: stream });
    await tool.execute(DEFAULT_INPUT);

    const types = events.map((e) => e.type);
    expect(types).toContain("data-rdocId");
    expect(types).toContain("data-rdocTitle");
    expect(types).toContain("data-rdocKind");
    expect(types).toContain("data-rdocClear");
    expect(types).toContain("data-rdocDelta");
    expect(types).toContain("data-rdocFinish");
    expect(types).toContain("data-revisorProgress");
    expect(types).toContain("data-rdocDone");
  });

  it("emite exatamente 3 ciclos rdocId…rdocFinish", async () => {
    const { stream, events } = createMockStream();
    const tool = createRevisorDefesaDocuments({ session: mockSession, dataStream: stream });
    await tool.execute(DEFAULT_INPUT);

    expect(events.filter((e) => e.type === "data-rdocId")).toHaveLength(3);
    expect(events.filter((e) => e.type === "data-rdocFinish")).toHaveLength(3);
    expect(events.filter((e) => e.type === "data-rdocTitle")).toHaveLength(3);
    expect(events.filter((e) => e.type === "data-rdocClear")).toHaveLength(3);
  });

  it("rdocTitle emite os 3 títulos na ordem correta", async () => {
    const { stream, events } = createMockStream();
    const tool = createRevisorDefesaDocuments({ session: mockSession, dataStream: stream });
    await tool.execute(DEFAULT_INPUT);

    const titleEvents = events.filter((e) => e.type === "data-rdocTitle");
    expect(titleEvents[0]?.data).toBe(DEFAULT_INPUT.avaliacaoTitle);
    expect(titleEvents[1]?.data).toBe(DEFAULT_INPUT.roteiroAdvogadoTitle);
    expect(titleEvents[2]?.data).toBe(DEFAULT_INPUT.roteiroPrepostoTitle);
  });

  it("rdocKind é sempre 'text' para os 3 documentos", async () => {
    const { stream, events } = createMockStream();
    const tool = createRevisorDefesaDocuments({ session: mockSession, dataStream: stream });
    await tool.execute(DEFAULT_INPUT);

    const kindEvents = events.filter((e) => e.type === "data-rdocKind");
    expect(kindEvents).toHaveLength(3);
    for (const e of kindEvents) {
      expect(e.data).toBe("text");
    }
  });

  it("revisorProgress incrementa de 1 a 3 na ordem", async () => {
    const { stream, events } = createMockStream();
    const tool = createRevisorDefesaDocuments({ session: mockSession, dataStream: stream });
    await tool.execute(DEFAULT_INPUT);

    const progressEvents = events.filter((e) => e.type === "data-revisorProgress");
    expect(progressEvents).toHaveLength(3);
    expect(progressEvents[0]?.data).toBe(1);
    expect(progressEvents[1]?.data).toBe(2);
    expect(progressEvents[2]?.data).toBe(3);
  });

  it("revisorProgress é emitido fora do bloco if(userId), mesmo sem userId", async () => {
    const { stream, events } = createMockStream();
    const sessionWithoutUser = {
      user: { id: undefined },
      expires: "2099-01-01",
    } as unknown as Parameters<typeof createRevisorDefesaDocuments>[0]["session"];

    const tool = createRevisorDefesaDocuments({ session: sessionWithoutUser, dataStream: stream });
    await tool.execute(DEFAULT_INPUT);

    // Sem userId, os 3 eventos de progresso DEVEM ser emitidos na mesma
    const progressEvents = events.filter((e) => e.type === "data-revisorProgress");
    expect(progressEvents).toHaveLength(3);
  });

  it("reconstrói conteúdo a partir dos chunks rdocDelta", async () => {
    const { generateRevisorDocumentContent } = await import("@/artifacts/text/server");
    vi.mocked(generateRevisorDocumentContent).mockResolvedValueOnce("A".repeat(1000));

    const { stream, events } = createMockStream();
    const tool = createRevisorDefesaDocuments({ session: mockSession, dataStream: stream });
    await tool.execute(DEFAULT_INPUT);

    // Apenas os deltas do 1º documento (rdocId muda a cada ciclo)
    const rdocIds = events.filter((e) => e.type === "data-rdocId").map((e) => e.data as string);
    const firstId = rdocIds[0];

    // Recolhe deltas entre o 1º rdocClear e o 1º rdocFinish
    let capturing = false;
    const firstDocDeltas: string[] = [];
    let docCount = 0;
    for (const ev of events) {
      if (ev.type === "data-rdocId") {
        docCount++;
        if (docCount > 1) break;
      }
      if (docCount === 1 && ev.type === "data-rdocDelta") {
        firstDocDeltas.push(ev.data as string);
      }
    }

    expect(firstDocDeltas.join("")).toBe("A".repeat(1000));
    expect(firstId).toBeTruthy();
  });

  it("rdocDone inclui ids e titles de todos os 3 documentos", async () => {
    const { stream, events } = createMockStream();
    const tool = createRevisorDefesaDocuments({ session: mockSession, dataStream: stream });
    await tool.execute(DEFAULT_INPUT);

    const doneEvent = events.find((e) => e.type === "data-rdocDone");
    expect(doneEvent).toBeDefined();
    const parsed = JSON.parse(doneEvent?.data as string);
    expect(Array.isArray(parsed.ids)).toBe(true);
    expect(parsed.ids).toHaveLength(3);
    expect(Array.isArray(parsed.titles)).toBe(true);
    expect(parsed.titles[0]).toBe(DEFAULT_INPUT.avaliacaoTitle);
    expect(parsed.titles[1]).toBe(DEFAULT_INPUT.roteiroAdvogadoTitle);
    expect(parsed.titles[2]).toBe(DEFAULT_INPUT.roteiroPrepostoTitle);
  });
});

// ─── Testes: resultado da tool ────────────────────────────────────────────────

describe("createRevisorDefesaDocuments — resultado", () => {
  it("retorna 3 ids únicos e os 3 títulos corretos", async () => {
    const { stream } = createMockStream();
    const tool = createRevisorDefesaDocuments({ session: mockSession, dataStream: stream });
    const result = await tool.execute(DEFAULT_INPUT);

    expect(result.ids).toHaveLength(3);
    expect(new Set(result.ids).size).toBe(3); // todos diferentes
    expect(result.titles[0]).toBe(DEFAULT_INPUT.avaliacaoTitle);
    expect(result.titles[1]).toBe(DEFAULT_INPUT.roteiroAdvogadoTitle);
    expect(result.titles[2]).toBe(DEFAULT_INPUT.roteiroPrepostoTitle);
  });

  it("com userId e BD OK: conteúdo menciona 'criados'", async () => {
    const { saveDocument } = await import("@/lib/db/queries");
    vi.mocked(saveDocument).mockResolvedValue(undefined);

    const { stream } = createMockStream();
    const tool = createRevisorDefesaDocuments({ session: mockSession, dataStream: stream });
    const result = await tool.execute(DEFAULT_INPUT);

    expect(result.content).toContain("criados");
    expect(result.ids).toHaveLength(3);
  });

  it("sem userId: saveDocument não é chamado e conteúdo indica disponível", async () => {
    const { saveDocument } = await import("@/lib/db/queries");
    const mockSave = vi.mocked(saveDocument);
    mockSave.mockClear();

    const sessionWithoutUser = {
      user: { id: undefined },
      expires: "2099-01-01",
    } as unknown as Parameters<typeof createRevisorDefesaDocuments>[0]["session"];

    const { stream } = createMockStream();
    const tool = createRevisorDefesaDocuments({ session: sessionWithoutUser, dataStream: stream });
    const result = await tool.execute(DEFAULT_INPUT);

    expect(mockSave).not.toHaveBeenCalled();
    expect(result.content).toContain("disponíveis");
    expect(result.content).not.toContain("criados");
  });
});

// ─── Testes: integração com revisor-content-store ────────────────────────────

describe("createRevisorDefesaDocuments — integração com revisor-content-store", () => {
  it("simula pipeline DataStreamHandler: popula store com os 3 docs", async () => {
    const { stream, events } = createMockStream();
    const tool = createRevisorDefesaDocuments({ session: mockSession, dataStream: stream });
    const result = await tool.execute(DEFAULT_INPUT);

    // Simular o que DataStreamHandler faz no browser
    const { storeRevisorDoc } = await import("@/lib/revisor-content-store");
    let _id = "";
    let _title = "";
    let _content = "";

    for (const event of events) {
      if (event.type === "data-rdocId") {
        _id = event.data as string;
        continue;
      }
      if (event.type === "data-rdocTitle") {
        _title = event.data as string;
        continue;
      }
      if (event.type === "data-rdocClear") {
        _content = "";
        continue;
      }
      if (event.type === "data-rdocDelta") {
        _content += event.data as string;
        continue;
      }
      if (event.type === "data-rdocFinish") {
        if (_id) storeRevisorDoc(_id, _title, _content);
        _id = "";
        _content = "";
      }
    }

    // Os 3 docs devem estar no store
    for (let i = 0; i < 3; i++) {
      const stored = getRevisorDoc(result.ids[i]);
      expect(stored).toBeDefined();
      expect(stored?.title).toBe(result.titles[i]);
      expect(typeof stored?.content).toBe("string");
      expect(stored?.content.length).toBeGreaterThan(0);
    }
  });
});
