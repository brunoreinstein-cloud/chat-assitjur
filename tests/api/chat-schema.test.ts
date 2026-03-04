/**
 * Testes do schema Zod do body POST /api/chat (postRequestBodySchema).
 */
import { describe, expect, it } from "vitest";
import { postRequestBodySchema } from "@/app/(chat)/api/chat/schema";

const validId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const validMessageId = "b1ffcd00-0d1c-5fa9-cc7e-7cc0ce491b22";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    id: validId,
    message: {
      id: validMessageId,
      role: "user" as const,
      parts: [{ type: "text" as const, text: "Olá" }],
    },
    selectedChatModel: "openai:gpt-4o",
    selectedVisibilityType: "private" as const,
    ...overrides,
  };
}

describe("postRequestBodySchema", () => {
  it("aceita body mínimo válido com message", () => {
    const result = postRequestBodySchema.safeParse(validBody());
    expect(result.success).toBe(true);
  });

  it("aceita body com messages (array) em vez de message", () => {
    const result = postRequestBodySchema.safeParse({
      id: validId,
      messages: [{ id: "msg-1", role: "user", parts: [] }],
      selectedChatModel: "openai:gpt-4o",
      selectedVisibilityType: "public",
    });
    expect(result.success).toBe(true);
  });

  it("aceita agentId enum (revisor-defesas)", () => {
    const result = postRequestBodySchema.safeParse(
      validBody({ agentId: "revisor-defesas" })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentId).toBe("revisor-defesas");
    }
  });

  it("aceita agentId UUID (agente customizado)", () => {
    const customAgentId = "c2aabb11-3e4d-5f6a-7b8c-9d0e1f2a3b4c";
    const result = postRequestBodySchema.safeParse(
      validBody({ agentId: customAgentId })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentId).toBe(customAgentId);
    }
  });

  it("aceita knowledgeDocumentIds e agentInstructions opcionais", () => {
    const result = postRequestBodySchema.safeParse(
      validBody({
        agentInstructions: "Seja breve.",
        knowledgeDocumentIds: [validId],
      })
    );
    expect(result.success).toBe(true);
  });

  it("rejeita quando falta message e messages está vazio", () => {
    const result = postRequestBodySchema.safeParse({
      id: validId,
      messages: [],
      selectedChatModel: "openai:gpt-4o",
      selectedVisibilityType: "public",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita id inválido (não UUID)", () => {
    const result = postRequestBodySchema.safeParse(
      validBody({ id: "not-a-uuid" })
    );
    expect(result.success).toBe(false);
  });

  it("rejeita selectedChatModel vazio", () => {
    const result = postRequestBodySchema.safeParse(
      validBody({ selectedChatModel: "" })
    );
    expect(result.success).toBe(false);
  });

  it("rejeita selectedVisibilityType inválido", () => {
    const result = postRequestBodySchema.safeParse(
      validBody({ selectedVisibilityType: "invalid" })
    );
    expect(result.success).toBe(false);
  });
});
