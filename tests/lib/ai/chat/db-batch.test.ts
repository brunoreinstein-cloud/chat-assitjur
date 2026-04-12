import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AGENT_ID_WHEN_EMPTY } from "@/lib/ai/agents-registry";
import {
  getAgentConfigAndEffectiveModel,
  getEarlyValidationResponse,
  resolveAgentConfigFromBatch,
  resolveAgentId,
  saveUserMessageToDb,
} from "@/lib/ai/chat/db-batch";
import type { ChatDbBatchResult } from "@/lib/ai/chat/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/db/queries", () => ({
  saveMessages: vi.fn().mockResolvedValue(undefined),
  saveChat: vi.fn().mockResolvedValue(undefined),
  getChatById: vi.fn().mockResolvedValue(null),
  getCustomAgentById: vi.fn().mockResolvedValue(null),
  getMessageCountByUserId: vi.fn().mockResolvedValue(0),
  getMessagesByChatId: vi.fn().mockResolvedValue([]),
  getKnowledgeDocumentsByIds: vi.fn().mockResolvedValue([]),
  getOrCreateCreditBalance: vi.fn().mockResolvedValue(100),
  updateChatAgentId: vi.fn().mockResolvedValue(undefined),
  createTaskExecution: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cache/credits-cache", () => ({
  creditsCache: { get: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/cache/agent-overrides-cache", () => ({
  getCachedBuiltInAgentOverrides: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/ai/chat-debug", () => ({
  isChatDebugEnabled: vi.fn().mockReturnValue(false),
  logChatDebug: vi.fn(),
}));

vi.mock("@/lib/ai/models", () => ({
  DEFAULT_CHAT_MODEL: "anthropic/claude-sonnet-4.6",
  chatModels: [],
  nonReasoningChatModelIds: ["anthropic/claude-sonnet-4.6"],
  modelReasoningType: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/ai/agent-models", () => ({
  isModelAllowedForAgent: vi.fn().mockReturnValue(true),
  getDefaultModelForAgent: vi
    .fn()
    .mockReturnValue("anthropic/claude-sonnet-4.6"),
}));

vi.mock("@/app/(chat)/actions", () => ({
  generateTitleFromUserMessage: vi.fn().mockResolvedValue("Generated Title"),
}));

vi.mock("@/lib/errors", () => {
  class ChatbotError extends Error {
    type: string;
    surface?: string;
    constructor(type: string, message?: string) {
      super(message ?? type);
      this.type = type;
      if (type.includes(":")) {
        this.surface = type.split(":")[1];
      }
    }
    toResponse() {
      return new Response(this.message, { status: 400 });
    }
  }
  return {
    ChatbotError,
    databaseUnavailableResponse: () =>
      new Response("Database unavailable", { status: 503 }),
    isDatabaseConnectionError: vi.fn().mockReturnValue(false),
    isStatementTimeoutError: vi.fn().mockReturnValue(false),
    isLikelyDatabaseError: vi.fn().mockReturnValue(false),
  };
});

// ---------------------------------------------------------------------------
// resolveAgentId
// ---------------------------------------------------------------------------

describe("resolveAgentId", () => {
  it("returns trimmed agent ID when provided", () => {
    expect(resolveAgentId("  revisor-defesas  ")).toBe("revisor-defesas");
  });

  it("returns default agent ID when empty string", () => {
    expect(resolveAgentId("")).toBe(DEFAULT_AGENT_ID_WHEN_EMPTY);
  });

  it("returns default agent ID when undefined", () => {
    expect(resolveAgentId(undefined as unknown as string)).toBe(
      DEFAULT_AGENT_ID_WHEN_EMPTY
    );
  });

  it("returns default agent ID when null", () => {
    expect(resolveAgentId(null as unknown as string)).toBe(
      DEFAULT_AGENT_ID_WHEN_EMPTY
    );
  });

  it("returns default agent ID when whitespace only", () => {
    expect(resolveAgentId("   ")).toBe(DEFAULT_AGENT_ID_WHEN_EMPTY);
  });

  it("preserves valid agent IDs", () => {
    expect(resolveAgentId("assistente-geral")).toBe("assistente-geral");
    expect(resolveAgentId("redator-contestacao")).toBe("redator-contestacao");
  });

  it("preserves custom agent UUIDs", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(resolveAgentId(uuid)).toBe(uuid);
  });
});

// ---------------------------------------------------------------------------
// resolveAgentConfigFromBatch
// ---------------------------------------------------------------------------

describe("resolveAgentConfigFromBatch", () => {
  const emptyOverrides = {} as ChatDbBatchResult["builtInOverrides"];

  it("returns built-in config for built-in agent", () => {
    const config = resolveAgentConfigFromBatch(
      true,
      "assistente-geral",
      emptyOverrides,
      null as ChatDbBatchResult["customAgentFromBatch"]
    );

    expect(config.id).toBe("assistente-geral");
    expect(config.label).toBeTruthy();
    expect(config.instructions).toBeTruthy();
  });

  it("returns revisor config with correct tool flags", () => {
    const config = resolveAgentConfigFromBatch(
      true,
      "revisor-defesas",
      emptyOverrides,
      null as ChatDbBatchResult["customAgentFromBatch"]
    );

    expect(config.id).toBe("revisor-defesas");
    expect(config.useRevisorDefesaTools).toBe(true);
    expect(config.useRedatorContestacaoTool).toBe(false);
  });

  it("returns redator config with correct tool flags", () => {
    const config = resolveAgentConfigFromBatch(
      true,
      "redator-contestacao",
      emptyOverrides,
      null as ChatDbBatchResult["customAgentFromBatch"]
    );

    expect(config.id).toBe("redator-contestacao");
    expect(config.useRedatorContestacaoTool).toBe(true);
    expect(config.useRevisorDefesaTools).toBe(false);
  });

  it("falls back to default agent for missing custom agent", () => {
    const config = resolveAgentConfigFromBatch(
      false,
      "nonexistent-uuid",
      emptyOverrides,
      null as ChatDbBatchResult["customAgentFromBatch"]
    );

    // Should fall back to DEFAULT_AGENT_ID_WHEN_EMPTY
    expect(config.id).toBe(DEFAULT_AGENT_ID_WHEN_EMPTY);
  });

  it("applies built-in overrides when provided", () => {
    const overrides = {
      "assistente-geral": {
        instructions: "Custom instructions override",
        label: "Custom Label",
      },
    } as ChatDbBatchResult["builtInOverrides"];

    const config = resolveAgentConfigFromBatch(
      true,
      "assistente-geral",
      overrides,
      null as ChatDbBatchResult["customAgentFromBatch"]
    );

    expect(config.instructions).toContain("Custom instructions override");
  });
});

// ---------------------------------------------------------------------------
// getAgentConfigAndEffectiveModel
// ---------------------------------------------------------------------------

describe("getAgentConfigAndEffectiveModel", () => {
  const baseBatchResult: ChatDbBatchResult = {
    messageCount: 0,
    chat: null,
    messagesFromDb: [],
    knowledgeDocsResult: [],
    builtInOverrides: {},
    balanceFromDb: 100,
    customAgentFromBatch: null as ChatDbBatchResult["customAgentFromBatch"],
  };

  it("returns agentConfig and effectiveModel for valid request", () => {
    const result = getAgentConfigAndEffectiveModel(
      "assistente-geral",
      "anthropic/claude-sonnet-4.6",
      baseBatchResult,
      { role: "user", parts: [{ type: "text", text: "hello" }] } as any
    );

    expect(result).not.toBeInstanceOf(Response);
    const data = result as { agentConfig: any; effectiveModel: string };
    expect(data.agentConfig.id).toBe("assistente-geral");
    expect(data.effectiveModel).toBe("anthropic/claude-sonnet-4.6");
  });

  it("resolves effective model correctly", () => {
    const result = getAgentConfigAndEffectiveModel(
      "assistente-geral",
      "anthropic/claude-sonnet-4.6",
      baseBatchResult,
      { role: "user", parts: [{ type: "text", text: "test" }] } as any
    );

    expect(result).not.toBeInstanceOf(Response);
    const data = result as { effectiveModel: string };
    expect(data.effectiveModel).toBe("anthropic/claude-sonnet-4.6");
  });
});

// ---------------------------------------------------------------------------
// getEarlyValidationResponse
// ---------------------------------------------------------------------------

describe("getEarlyValidationResponse", () => {
  it("returns error Response when session is null", async () => {
    const result = await getEarlyValidationResponse(null, null as any);
    expect(result).toBeInstanceOf(Response);
  });

  it("returns error Response when session has no user", async () => {
    const result = await getEarlyValidationResponse(
      { user: undefined } as any,
      null as any
    );
    expect(result).toBeInstanceOf(Response);
  });
});

// ---------------------------------------------------------------------------
// saveUserMessageToDb
// ---------------------------------------------------------------------------

describe("saveUserMessageToDb", () => {
  let saveMessagesMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const dbQueries = await import("@/lib/db/queries");
    saveMessagesMock = dbQueries.saveMessages as ReturnType<typeof vi.fn>;
    saveMessagesMock.mockReset().mockResolvedValue(undefined);
  });

  it("returns null for non-user messages", async () => {
    const result = await saveUserMessageToDb(
      { role: "assistant", parts: [] } as any,
      "chat-1"
    );
    expect(result).toBeNull();
    expect(saveMessagesMock).not.toHaveBeenCalled();
  });

  it("returns null when message is null/undefined", async () => {
    const result = await saveUserMessageToDb(null as any, "chat-1");
    expect(result).toBeNull();
  });

  it("saves user message and returns null on success", async () => {
    const result = await saveUserMessageToDb(
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Hello world" }],
      } as any,
      "chat-1"
    );

    expect(result).toBeNull();
    expect(saveMessagesMock).toHaveBeenCalledOnce();
    expect(saveMessagesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            chatId: "chat-1",
            id: "msg-1",
            role: "user",
          }),
        ]),
      })
    );
  });

  it("returns error Response when saveMessages fails with DB error", async () => {
    // Make isDatabaseConnectionError return true for this error
    const { isDatabaseConnectionError } = await import("@/lib/errors");
    (isDatabaseConnectionError as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      true
    );
    saveMessagesMock.mockRejectedValueOnce(new Error("connection refused"));

    const result = await saveUserMessageToDb(
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Test" }],
      } as any,
      "chat-1"
    );

    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(503);
  });

  it("returns generic error Response when saveMessages fails with non-DB error", async () => {
    saveMessagesMock.mockRejectedValueOnce(new Error("unknown error"));

    const result = await saveUserMessageToDb(
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Test" }],
      } as any,
      "chat-1"
    );

    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(400);
  });
});
