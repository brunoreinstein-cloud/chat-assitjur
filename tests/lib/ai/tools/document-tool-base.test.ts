/**
 * Testes unitários para o document-tool-base.
 * Verifica o ciclo unificado de streaming + save: Start → Id/Title/Kind/Clear → Delta → Finish → Progress → Done.
 */
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createDocumentTool } from "@/lib/ai/tools/document-tool-base";

// Mock mínimo do UIMessageStreamWriter
function createMockStream() {
  const events: Array<{ type: string; data: unknown }> = [];
  return {
    stream: {
      write: (event: { type: string; data: unknown }) => {
        events.push(event);
      },
    } as unknown as Parameters<typeof createDocumentTool>[1]["dataStream"],
    events,
  };
}

const mockSession = {
  user: { id: "user-base-test", email: "test@example.com" },
  expires: "2099-01-01",
} as unknown as Parameters<typeof createDocumentTool>[1]["session"];

// Mock da BD
vi.mock("@/lib/db/queries", () => ({
  saveDocument: vi.fn().mockResolvedValue(undefined),
  pingDatabase: vi.fn().mockResolvedValue(undefined),
  withQueryTimeout: vi
    .fn()
    .mockImplementation((fn: () => Promise<unknown>) => fn()),
  withRetry: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
}));

// Helper: cria uma tool de teste com config mínima
function createTestTool(
  overrides: Partial<Parameters<typeof createDocumentTool>[0]> = {}
) {
  const { stream, events } = createMockStream();
  const tool = createDocumentTool(
    {
      description: "Test tool",
      inputSchema: z.object({
        title: z.string(),
        content: z.string(),
      }),
      prefix: "rdoc",
      progressEventType: "data-revisorProgress",
      generateDocuments(input, ctx) {
        return Promise.resolve([
          { id: ctx.generateId(), title: input.title, content: input.content },
        ]);
      },
      ...overrides,
    },
    { session: mockSession, dataStream: stream }
  );
  return { tool, events, stream };
}

describe("createDocumentTool — ciclo de streaming", () => {
  it("emite Start com total de documentos", async () => {
    const { tool, events } = createTestTool({ prefix: "mdoc" });
    await tool.execute({ title: "T1", content: "C1" });

    const start = events.find((e) => e.type === "data-mdocStart");
    expect(start).toBeDefined();
    expect(start?.data).toBe(1);
  });

  it("emite sequência completa: Id, Title, Kind, Clear, Delta, Finish, Done", async () => {
    const { tool, events } = createTestTool({ prefix: "autuoria" });
    await tool.execute({ title: "T1", content: "C1" });

    const types = events.map((e) => e.type);
    expect(types).toContain("data-autuoriaStart");
    expect(types).toContain("data-autuoriaId");
    expect(types).toContain("data-autuoriaTitle");
    expect(types).toContain("data-autuoriaKind");
    expect(types).toContain("data-autuoriaClear");
    expect(types).toContain("data-autuoriaDelta");
    expect(types).toContain("data-autuoriaFinish");
    expect(types).toContain("data-autuoriaDone");
  });

  it("emite progress event configurável", async () => {
    const { tool, events } = createTestTool({
      prefix: "rdoc",
      progressEventType: "data-revisorProgress",
    });
    await tool.execute({ title: "T1", content: "C1" });

    const progress = events.find((e) => e.type === "data-revisorProgress");
    expect(progress).toBeDefined();
    expect(progress?.data).toBe(1);
  });

  it("reconstrói conteúdo a partir dos chunks Delta (400 chars)", async () => {
    const original = "X".repeat(1200);
    const { tool, events } = createTestTool({ prefix: "rdoc" });
    await tool.execute({ title: "T1", content: original });

    const deltas = events.filter((e) => e.type === "data-rdocDelta");
    expect(deltas.length).toBeGreaterThanOrEqual(3); // 1200/400
    const reconstructed = deltas.map((e) => e.data as string).join("");
    expect(reconstructed).toBe(original);
  });

  it("Done inclui ids e titles em JSON", async () => {
    const { tool, events } = createTestTool({ prefix: "mdoc" });
    await tool.execute({ title: "Relatório", content: "Conteúdo" });

    const done = events.find((e) => e.type === "data-mdocDone");
    expect(done).toBeDefined();
    const parsed = JSON.parse(done?.data as string);
    expect(parsed.ids).toHaveLength(1);
    expect(parsed.titles[0]).toBe("Relatório");
  });
});

describe("createDocumentTool — múltiplos documentos", () => {
  it("emite ciclo completo para cada documento", async () => {
    const { stream, events } = createMockStream();
    const tool = createDocumentTool(
      {
        description: "Multi-doc",
        inputSchema: z.object({ docs: z.array(z.string()) }),
        prefix: "mdoc",
        progressEventType: "data-masterProgress",
        generateDocuments(input, ctx) {
          return Promise.resolve(
            input.docs.map((d: string) => ({
              id: ctx.generateId(),
              title: d,
              content: `content-${d}`,
            }))
          );
        },
      },
      { session: mockSession, dataStream: stream }
    );

    await tool.execute({ docs: ["A", "B", "C"] });

    const idEvents = events.filter((e) => e.type === "data-mdocId");
    expect(idEvents).toHaveLength(3);

    const finishEvents = events.filter((e) => e.type === "data-mdocFinish");
    expect(finishEvents).toHaveLength(3);

    const progressEvents = events.filter(
      (e) => e.type === "data-masterProgress"
    );
    expect(progressEvents).toHaveLength(3);
    expect(progressEvents[0].data).toBe(1);
    expect(progressEvents[1].data).toBe(2);
    expect(progressEvents[2].data).toBe(3);

    const start = events.find((e) => e.type === "data-mdocStart");
    expect(start?.data).toBe(3);
  });
});

describe("createDocumentTool — hooks", () => {
  it("chama preProcess antes de gerar documentos", async () => {
    const preProcessFn = vi.fn().mockResolvedValue(undefined);
    const { tool } = createTestTool({ preProcess: preProcessFn });

    await tool.execute({ title: "T1", content: "C1" });

    expect(preProcessFn).toHaveBeenCalledOnce();
    expect(preProcessFn).toHaveBeenCalledWith({ title: "T1", content: "C1" });
  });

  it("chama onDocumentReady antes de streamar cada doc", async () => {
    const onReady = vi.fn();
    const { tool } = createTestTool({ onDocumentReady: onReady });

    await tool.execute({ title: "T1", content: "C1" });

    expect(onReady).toHaveBeenCalledOnce();
    const [doc, index] = onReady.mock.calls[0];
    expect(doc.title).toBe("T1");
    expect(index).toBe(0);
  });
});

describe("createDocumentTool — save e resultado", () => {
  it("sem userId: não tenta salvar, retorna sucesso", async () => {
    const { saveDocument } = await import("@/lib/db/queries");
    vi.mocked(saveDocument).mockClear();

    const { stream, events } = createMockStream();
    const noUserSession = {
      user: { id: undefined },
      expires: "2099-01-01",
    } as unknown as Parameters<typeof createDocumentTool>[1]["session"];

    const tool = createDocumentTool(
      {
        description: "No user",
        inputSchema: z.object({ title: z.string(), content: z.string() }),
        prefix: "rdoc",
        progressEventType: "data-revisorProgress",
        generateDocuments(input, ctx) {
          return Promise.resolve([
            {
              id: ctx.generateId(),
              title: input.title,
              content: input.content,
            },
          ]);
        },
      },
      { session: noUserSession, dataStream: stream }
    );

    const result = await tool.execute({ title: "T1", content: "C1" });

    expect(saveDocument).not.toHaveBeenCalled();
    expect(result.content).toContain("sucesso");
    expect(events.some((e) => e.type === "data-rdocFinish")).toBe(true);
  });

  it("retorna ids e titles no resultado", async () => {
    const { tool } = createTestTool();
    const result = await tool.execute({ title: "Meu Doc", content: "Texto" });

    expect(result.ids).toHaveLength(1);
    expect(result.titles[0]).toBe("Meu Doc");
    expect(typeof result.ids[0]).toBe("string");
  });

  it("emite data-generationStatus com título", async () => {
    const { tool, events } = createTestTool();
    await tool.execute({ title: "Doc Status", content: "Texto" });

    const status = events.find((e) => e.type === "data-generationStatus");
    expect(status).toBeDefined();
    expect(status?.data).toContain("Doc Status");
  });
});
