import { describe, expect, it, vi } from "vitest";

/**
 * Testa a lógica de validação e construção da tool intakeProcesso.
 * DB calls são mockadas para evitar dependência de banco.
 */

// Mock DB modules
vi.mock("@/lib/db/queries/processos", () => ({
  createProcesso: vi.fn().mockResolvedValue({
    id: "proc-uuid-123",
    userId: "user-123",
    numeroAutos: "0001234-56.2024.5.01.0001",
    reclamante: "João Silva",
    reclamada: "Empresa XYZ Ltda",
    vara: "1ª VT São Paulo",
    tribunal: "TRT-01",
    valorCausa: "R$ 150.000,00",
    fase: "conhecimento",
    createdAt: new Date(),
  }),
}));

vi.mock("@/lib/db/queries/chats", () => ({
  linkProcessoToChat: vi.fn().mockResolvedValue(undefined),
}));

import { createIntakeProcessoTool } from "@/lib/ai/tools/intake-processo";

const mockSession = {
  user: { id: "user-123", email: "test@test.com" },
  expires: "2030-01-01",
} as any;

describe("intake-processo tool", () => {
  const tool = createIntakeProcessoTool({
    session: mockSession,
    chatId: "chat-uuid-456",
  });

  const execute = (tool as any).execute as (params: any) => Promise<any>;

  it("has correct description", () => {
    const desc = (tool as any).description as string;
    expect(desc).toContain("processo judicial");
    expect(desc).toContain("automaticamente");
  });

  it("creates processo with valid CNJ", async () => {
    const result = await execute({
      numeroAutos: "0001234-56.2024.5.01.0001",
      reclamante: "João Silva",
      reclamada: "Empresa XYZ Ltda",
      vara: "1ª VT São Paulo",
      tribunal: "TRT-1",
      valorCausa: "R$ 150.000,00",
      tipo: "pi",
    });
    expect(result.success).toBe(true);
    expect(result.processoId).toBe("proc-uuid-123");
    expect(result.message).toContain("✅");
    expect(result.message).toContain("Processo");
  });

  it("creates processo with minimal fields", async () => {
    const result = await execute({
      numeroAutos: "0001234-56.2024.5.01.0001",
      reclamante: "Maria Santos",
      reclamada: "ABC Corp",
      tipo: "pi",
    });
    expect(result.success).toBe(true);
  });

  it("detects tribunal from CNJ when not provided", async () => {
    const { createProcesso } = await import("@/lib/db/queries/processos");
    await execute({
      numeroAutos: "0001234-56.2024.5.15.0001",
      reclamante: "João",
      reclamada: "Empresa",
      tipo: "pi",
    });
    expect(createProcesso).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tribunal: "TRT-15",
        }),
      })
    );
  });

  it("returns error for invalid CNJ format", async () => {
    const result = await execute({
      numeroAutos: "abc-invalid",
      reclamante: "João",
      reclamada: "Empresa",
      tipo: "pi",
    });
    expect(result.error).toContain("inválido");
  });

  it("returns error when user not authenticated", async () => {
    const noAuthTool = createIntakeProcessoTool({
      session: { user: {}, expires: "" } as any,
      chatId: "chat-1",
    });
    const result = await (noAuthTool as any).execute({
      numeroAutos: "0001234-56.2024.5.01.0001",
      reclamante: "João",
      reclamada: "Empresa",
      tipo: "pi",
    });
    expect(result.error).toContain("autenticado");
  });

  it("parses valor BRL correctly", async () => {
    const { createProcesso } = await import("@/lib/db/queries/processos");
    await execute({
      numeroAutos: "0001234-56.2024.5.01.0001",
      reclamante: "João",
      reclamada: "Empresa",
      valorCausa: "R$ 75.000,50",
      tipo: "pi",
    });
    expect(createProcesso).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          valorCausa: expect.stringContaining("75"),
        }),
      })
    );
  });

  it("includes nota about verification in response", async () => {
    const result = await execute({
      numeroAutos: "0001234-56.2024.5.01.0001",
      reclamante: "João",
      reclamada: "Empresa",
      tipo: "contestacao",
    });
    expect(result.nota).toContain("Verifique");
  });

  it("links chat to processo after creation", async () => {
    const { linkProcessoToChat } = await import("@/lib/db/queries/chats");
    await execute({
      numeroAutos: "0001234-56.2024.5.01.0001",
      reclamante: "João",
      reclamada: "Empresa",
      tipo: "pi",
    });
    expect(linkProcessoToChat).toHaveBeenCalledWith({
      chatId: "chat-uuid-456",
      processoId: "proc-uuid-123",
    });
  });

  it("handles duplicate processo error", async () => {
    const { createProcesso } = await import("@/lib/db/queries/processos");
    (createProcesso as any).mockRejectedValueOnce(
      new Error("unique constraint violation: duplicate key")
    );
    const result = await execute({
      numeroAutos: "0001234-56.2024.5.01.0001",
      reclamante: "João",
      reclamada: "Empresa",
      tipo: "pi",
    });
    expect(result.error).toContain("já existe");
    expect(result.duplicado).toBe(true);
  });
});
