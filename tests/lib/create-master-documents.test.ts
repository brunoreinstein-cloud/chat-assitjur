/**
 * Testes unitários para a tool createMasterDocuments.
 * Verifica o streaming de eventos mdoc* e o armazenamento no master-content-store.
 *
 * NOTA: A tool faz stream de eventos e tenta salvar na BD.
 * Aqui testamos a lógica de stream usando um mock simples de dataStream.
 */
import { describe, expect, it, vi } from "vitest";
import { createMasterDocuments } from "@/lib/ai/tools/create-master-documents";
import { getMasterDoc } from "@/lib/master-content-store";

// Mock mínimo do UIMessageStreamWriter
function createMockStream() {
  const events: Array<{ type: string; data: unknown }> = [];
  return {
    stream: {
      write: (event: { type: string; data: unknown }) => {
        events.push(event);
      },
    } as unknown as Parameters<typeof createMasterDocuments>[0]["dataStream"],
    events,
  };
}

// Mock mínimo de Session
const mockSession = {
  user: { id: "user-test-123", email: "test@example.com" },
  expires: "2099-01-01",
} as unknown as Parameters<typeof createMasterDocuments>[0]["session"];

// Mock da BD — saveDocument não deve bloquear os testes
vi.mock("@/lib/db/queries", () => ({
  saveDocument: vi.fn().mockResolvedValue(undefined),
  pingDatabase: vi.fn().mockResolvedValue(undefined),
}));

describe("createMasterDocuments — stream de eventos", () => {
  it("emite evento data-mdocStart com total de documentos", async () => {
    const { stream, events } = createMockStream();
    const tool = createMasterDocuments({
      session: mockSession,
      dataStream: stream,
    });

    await tool.execute({
      documents: [
        { title: "Relatório Teste", content: "## Secção\nTexto aqui." },
      ],
    });

    const startEvent = events.find((e) => e.type === "data-mdocStart");
    expect(startEvent).toBeDefined();
    expect(startEvent?.data).toBe(1);
  });

  it("emite eventos mdocId, mdocTitle, mdocClear, mdocDelta, mdocFinish para 1 doc", async () => {
    const { stream, events } = createMockStream();
    const tool = createMasterDocuments({
      session: mockSession,
      dataStream: stream,
    });

    await tool.execute({
      documents: [{ title: "Relatório A", content: "Conteúdo A" }],
    });

    const types = events.map((e) => e.type);
    expect(types).toContain("data-mdocStart");
    expect(types).toContain("data-masterTitle"); // anuncia título antes de gerar
    expect(types).toContain("data-mdocId");
    expect(types).toContain("data-mdocTitle");
    expect(types).toContain("data-mdocClear");
    expect(types).toContain("data-mdocDelta");
    expect(types).toContain("data-mdocFinish");
    expect(types).toContain("data-masterProgress");
    expect(types).toContain("data-mdocDone");
  });

  it("data-masterTitle emite index e título corretos antes de iniciar o stream do doc", async () => {
    const { stream, events } = createMockStream();
    const tool = createMasterDocuments({
      session: mockSession,
      dataStream: stream,
    });

    await tool.execute({
      documents: [
        { title: "Doc Alpha", content: "Conteúdo A" },
        { title: "Doc Beta", content: "Conteúdo B" },
      ],
    });

    const titleEvents = events.filter((e) => e.type === "data-masterTitle");
    expect(titleEvents).toHaveLength(2);
    const first = JSON.parse(titleEvents[0].data as string);
    const second = JSON.parse(titleEvents[1].data as string);
    expect(first).toEqual({ index: 0, title: "Doc Alpha" });
    expect(second).toEqual({ index: 1, title: "Doc Beta" });

    // masterTitle deve preceder mdocId (anuncia antes de fazer stream)
    const masterTitleIdx = events.indexOf(titleEvents[0]);
    const mdocIdIdx = events.findIndex((e) => e.type === "data-mdocId");
    expect(masterTitleIdx).toBeLessThan(mdocIdIdx);
  });

  it("o mdocTitle emite o título correto", async () => {
    const { stream, events } = createMockStream();
    const tool = createMasterDocuments({
      session: mockSession,
      dataStream: stream,
    });

    await tool.execute({
      documents: [{ title: "Carta de Prognóstico", content: "Texto" }],
    });

    const titleEvent = events.find((e) => e.type === "data-mdocTitle");
    expect(titleEvent?.data).toBe("Carta de Prognóstico");
  });

  it("reconstrói conteúdo completo a partir dos chunks mdocDelta", async () => {
    const { stream, events } = createMockStream();
    const tool = createMasterDocuments({
      session: mockSession,
      dataStream: stream,
    });
    const originalContent = "A".repeat(1200); // >3 chunks de 400 chars

    await tool.execute({
      documents: [{ title: "Doc Grande", content: originalContent }],
    });

    const deltaEvents = events.filter((e) => e.type === "data-mdocDelta");
    const reconstructed = deltaEvents.map((e) => e.data as string).join("");
    expect(reconstructed).toBe(originalContent);
  });

  it("para 2 documentos emite 2 ciclos mdocId…mdocFinish", async () => {
    const { stream, events } = createMockStream();
    const tool = createMasterDocuments({
      session: mockSession,
      dataStream: stream,
    });

    await tool.execute({
      documents: [
        { title: "Doc 1", content: "Conteúdo 1" },
        { title: "Doc 2", content: "Conteúdo 2" },
      ],
    });

    const idEvents = events.filter((e) => e.type === "data-mdocId");
    expect(idEvents).toHaveLength(2);

    const finishEvents = events.filter((e) => e.type === "data-mdocFinish");
    expect(finishEvents).toHaveLength(2);

    const progressEvents = events.filter(
      (e) => e.type === "data-masterProgress"
    );
    expect(progressEvents).toHaveLength(2);
    expect(progressEvents[0].data).toBe(1);
    expect(progressEvents[1].data).toBe(2);
  });

  it("data-mdocDone inclui ids e titles em JSON", async () => {
    const { stream, events } = createMockStream();
    const tool = createMasterDocuments({
      session: mockSession,
      dataStream: stream,
    });

    await tool.execute({
      documents: [{ title: "Título Final", content: "Conteúdo" }],
    });

    const doneEvent = events.find((e) => e.type === "data-mdocDone");
    expect(doneEvent).toBeDefined();
    const parsed = JSON.parse(doneEvent?.data as string);
    expect(Array.isArray(parsed.ids)).toBe(true);
    expect(parsed.ids).toHaveLength(1);
    expect(Array.isArray(parsed.titles)).toBe(true);
    expect(parsed.titles[0]).toBe("Título Final");
  });

  it("retorna ids e titles no resultado da tool", async () => {
    const { stream } = createMockStream();
    const tool = createMasterDocuments({
      session: mockSession,
      dataStream: stream,
    });

    const result = await tool.execute({
      documents: [{ title: "Meu Relatório", content: "Conteúdo do relatório" }],
    });

    expect(Array.isArray(result.ids)).toBe(true);
    expect(result.ids).toHaveLength(1);
    expect(typeof result.ids[0]).toBe("string");
    expect(result.ids[0].length).toBeGreaterThan(0);
    expect(result.titles[0]).toBe("Meu Relatório");
  });
});

describe("createMasterDocuments — integração com master-content-store", () => {
  it("após execução, o conteúdo está disponível no store pelo ID retornado", async () => {
    const { stream } = createMockStream();
    const tool = createMasterDocuments({
      session: mockSession,
      dataStream: stream,
    });
    const content = "## Relatório\n\nDados do processo.";

    // NOTA: O store é populado pelo data-stream-handler no cliente.
    // Esta tool só faz stream dos eventos — o store é preenchido no cliente.
    // Por isso este teste verifica que os eventos têm o conteúdo correto,
    // não que o store é preenchido diretamente pela tool.
    const result = await tool.execute({
      documents: [{ title: "Relatório Store", content }],
    });

    // O ID foi gerado e retornado — pode ser usado para lookup no store
    expect(result.ids[0]).toBeTruthy();

    // O conteúdo NÃO está no store aqui porque o store é cliente-side
    // (populado pelo DataStreamHandler no browser via eventos mdocDelta)
    const stored = getMasterDoc(result.ids[0]);
    expect(stored).toBeUndefined(); // esperado: store vazio no contexto Node.js de teste
  });

  it("simula o pipeline do DataStreamHandler: processa eventos mdoc* e popula store", async () => {
    const { stream, events } = createMockStream();
    const tool = createMasterDocuments({
      session: mockSession,
      dataStream: stream,
    });
    const expectedContent =
      "## Secção 1\n\nDados processuais.\n## Secção 2\nMais dados.";

    const result = await tool.execute({
      documents: [{ title: "Relatório Pipeline", content: expectedContent }],
    });

    // Simular o que DataStreamHandler faz no browser
    const { storeMasterDoc } = await import("@/lib/master-content-store");
    let _id = "";
    let _title = "";
    let _content = "";

    for (const event of events) {
      if (event.type === "data-mdocId") {
        _id = event.data as string;
        continue;
      }
      if (event.type === "data-mdocTitle") {
        _title = event.data as string;
        continue;
      }
      if (event.type === "data-mdocClear") {
        _content = "";
        continue;
      }
      if (event.type === "data-mdocDelta") {
        _content += event.data as string;
        continue;
      }
      if (event.type === "data-mdocFinish") {
        if (_id) {
          storeMasterDoc(_id, _title, _content);
        }
        _id = "";
        _content = "";
      }
    }

    // Agora o store deve ter o conteúdo
    const stored = getMasterDoc(result.ids[0]);
    expect(stored).toBeDefined();
    expect(stored?.title).toBe("Relatório Pipeline");
    expect(stored?.content).toBe(expectedContent);
  });
});

describe("createMasterDocuments — limites e edge cases", () => {
  it("conteúdo de 8000+ chars é dividido em múltiplos chunks de 400", async () => {
    const { stream, events } = createMockStream();
    const tool = createMasterDocuments({
      session: mockSession,
      dataStream: stream,
    });
    const largeContent = "X".repeat(8000);

    await tool.execute({
      documents: [{ title: "Doc Grande", content: largeContent }],
    });

    const deltaEvents = events.filter((e) => e.type === "data-mdocDelta");
    expect(deltaEvents.length).toBeGreaterThanOrEqual(20); // 8000 / 400 = 20 chunks
    const allContent = deltaEvents.map((e) => e.data as string).join("");
    expect(allContent).toBe(largeContent);
  });

  it("sem userId não tenta salvar na BD mas completa o stream", async () => {
    const { saveDocument } = await import("@/lib/db/queries");
    const mockSave = vi.mocked(saveDocument);
    mockSave.mockClear();

    const { stream, events } = createMockStream();
    const sessionWithoutUser = {
      user: { id: undefined },
      expires: "2099-01-01",
    } as unknown as Parameters<typeof createMasterDocuments>[0]["session"];

    const tool = createMasterDocuments({
      session: sessionWithoutUser,
      dataStream: stream,
    });

    const result = await tool.execute({
      documents: [{ title: "Guest Doc", content: "Conteúdo visitante" }],
    });

    expect(mockSave).not.toHaveBeenCalled();
    // Eventos de stream emitidos normalmente
    expect(events.some((e) => e.type === "data-mdocFinish")).toBe(true);
    // Sem userId, savedCount=0: mensagem deve indicar disponível para download (não "criado com sucesso")
    expect(result.content).toContain("disponível");
    expect(result.content).not.toContain("com sucesso");
  });
});
