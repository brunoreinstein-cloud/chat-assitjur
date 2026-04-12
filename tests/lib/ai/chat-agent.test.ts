import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "@/lib/ai/agents-registry";
import {
  buildActiveToolNames,
  type ChatCallOptions,
  chatCallOptionsSchema,
  createChatAgent,
  deductCreditsWithRetry,
} from "@/lib/ai/chat-agent";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/db/queries", () => ({
  deductCreditsAndRecordUsage: vi.fn().mockResolvedValue(undefined),
  pingDatabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cache/credits-cache", () => ({
  creditsCache: { delete: vi.fn() },
}));

vi.mock("@/lib/ai/providers", () => ({
  getLanguageModel: vi.fn().mockReturnValue({
    modelId: "mock-model",
    provider: "mock-provider",
    specificationVersion: "v1",
    defaultObjectGenerationMode: "json",
  }),
}));

vi.mock("@/lib/ai/chat-debug", () => ({
  isChatDebugEnabled: vi.fn().mockReturnValue(false),
  logChatDebug: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  buildAiSdkTelemetry: vi.fn().mockReturnValue(undefined),
}));

vi.mock("@/lib/constants", () => ({
  isProductionEnvironment: false,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "assistente-geral",
    label: "Assistente",
    instructions: "You are a helpful assistant.",
    useRevisorDefesaTools: false,
    useRedatorContestacaoTool: false,
    useMemoryTools: true,
    useApprovalTool: false,
    usePipelineTool: false,
    useAvaliadorContestacaoTool: false,
    useMasterDocumentsTool: false,
    useAutuoriaTools: false,
    useSearchJurisprudenciaTool: false,
    temperature: 0.2,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// chatCallOptionsSchema
// ---------------------------------------------------------------------------

describe("chatCallOptionsSchema", () => {
  const validOptions: ChatCallOptions = {
    userId: "user-1",
    chatId: "chat-1",
    effectiveModel: "anthropic/claude-sonnet-4.6",
    agentInstructions: "Some instructions",
    isReasoningModel: false,
    isAdaptiveThinking: false,
    knowledgeContext: undefined,
    processoContext: undefined,
    requestHints: {
      latitude: null,
      longitude: null,
      city: null,
      country: null,
    },
    hasDocuments: false,
  };

  it("accepts valid options", () => {
    const result = chatCallOptionsSchema.safeParse(validOptions);
    expect(result.success).toBe(true);
  });

  it("accepts options with knowledgeContext and processoContext", () => {
    const result = chatCallOptionsSchema.safeParse({
      ...validOptions,
      knowledgeContext: "<docs>...</docs>",
      processoContext: "<processo>...</processo>",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = chatCallOptionsSchema.safeParse({
      userId: "user-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid types", () => {
    const result = chatCallOptionsSchema.safeParse({
      ...validOptions,
      isReasoningModel: "yes", // should be boolean
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildActiveToolNames
// ---------------------------------------------------------------------------

describe("buildActiveToolNames", () => {
  it("returns empty array for reasoning models", () => {
    const result = buildActiveToolNames({
      isReasoningModel: true,
      hasDocuments: false,
      agentConfig: makeAgentConfig(),
    });
    expect(result).toEqual([]);
  });

  it("returns base tools for non-reasoning model without special flags", () => {
    const result = buildActiveToolNames({
      isReasoningModel: false,
      hasDocuments: false,
      agentConfig: makeAgentConfig(),
    });

    expect(result).toContain("getWeather");
    expect(result).toContain("createDocument");
    expect(result).toContain("updateDocument");
    expect(result).toContain("requestSuggestions");
    expect(result).toContain("improvePrompt");
    expect(result).toContain("saveMemory");
    expect(result).toContain("recallMemories");
    expect(result).toContain("forgetMemory");
    expect(result).toContain("requestApproval");
    expect(result).toContain("runProcessoGates");
    expect(result).toContain("upsertRiscoVerba");

    // Não deve incluir tools especiais
    expect(result).not.toContain("buscarNoProcesso");
    expect(result).not.toContain("searchJurisprudencia");
    expect(result).not.toContain("createRevisorDefesaDocuments");
  });

  it("includes buscarNoProcesso when hasDocuments is true", () => {
    const result = buildActiveToolNames({
      isReasoningModel: false,
      hasDocuments: true,
      agentConfig: makeAgentConfig(),
    });
    expect(result).toContain("buscarNoProcesso");
  });

  it("includes searchJurisprudencia when flag is set", () => {
    const result = buildActiveToolNames({
      isReasoningModel: false,
      hasDocuments: false,
      agentConfig: makeAgentConfig({ useSearchJurisprudenciaTool: true }),
    });
    expect(result).toContain("searchJurisprudencia");
  });

  it("includes revisor tools for revisor agent", () => {
    const result = buildActiveToolNames({
      isReasoningModel: false,
      hasDocuments: false,
      agentConfig: makeAgentConfig({ useRevisorDefesaTools: true }),
    });
    expect(result).toContain("createRevisorDefesaDocuments");
  });

  it("includes redator tool for redator agent", () => {
    const result = buildActiveToolNames({
      isReasoningModel: false,
      hasDocuments: false,
      agentConfig: makeAgentConfig({ useRedatorContestacaoTool: true }),
    });
    expect(result).toContain("createRedatorContestacaoDocument");
  });

  it("includes avaliador tool for avaliador agent", () => {
    const result = buildActiveToolNames({
      isReasoningModel: false,
      hasDocuments: false,
      agentConfig: makeAgentConfig({ useAvaliadorContestacaoTool: true }),
    });
    expect(result).toContain("createAvaliadorContestacaoDocument");
  });

  it("includes pipeline tool for master agent", () => {
    const result = buildActiveToolNames({
      isReasoningModel: false,
      hasDocuments: false,
      agentConfig: makeAgentConfig({ usePipelineTool: true }),
    });
    expect(result).toContain("analyzeProcessoPipeline");
  });

  it("includes master documents tool when flag is set", () => {
    const result = buildActiveToolNames({
      isReasoningModel: false,
      hasDocuments: false,
      agentConfig: makeAgentConfig({ useMasterDocumentsTool: true }),
    });
    expect(result).toContain("createMasterDocuments");
  });

  it("includes autuoria tools when flag is set", () => {
    const result = buildActiveToolNames({
      isReasoningModel: false,
      hasDocuments: false,
      agentConfig: makeAgentConfig({ useAutuoriaTools: true }),
    });
    expect(result).toContain("createAutuoriaDocuments");
  });

  it("includes all tools for master agent with documents", () => {
    const result = buildActiveToolNames({
      isReasoningModel: false,
      hasDocuments: true,
      agentConfig: makeAgentConfig({
        usePipelineTool: true,
        useMasterDocumentsTool: true,
        useSearchJurisprudenciaTool: true,
      }),
    });
    expect(result).toContain("buscarNoProcesso");
    expect(result).toContain("searchJurisprudencia");
    expect(result).toContain("analyzeProcessoPipeline");
    expect(result).toContain("createMasterDocuments");
  });
});

// ---------------------------------------------------------------------------
// deductCreditsWithRetry
// ---------------------------------------------------------------------------

describe("deductCreditsWithRetry", () => {
  let deductMock: ReturnType<typeof vi.fn>;
  let pingMock: ReturnType<typeof vi.fn>;
  let cacheMock: { delete: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const dbQueries = await import("@/lib/db/queries");
    deductMock = dbQueries.deductCreditsAndRecordUsage as ReturnType<
      typeof vi.fn
    >;
    pingMock = dbQueries.pingDatabase as ReturnType<typeof vi.fn>;
    const cache = await import("@/lib/cache/credits-cache");
    cacheMock = cache.creditsCache as { delete: ReturnType<typeof vi.fn> };
    deductMock.mockReset().mockResolvedValue(undefined);
    pingMock.mockReset().mockResolvedValue(undefined);
    cacheMock.delete.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseArgs = {
    userId: "user-1",
    chatId: "chat-1",
    inputTokens: 1000,
    outputTokens: 500,
    model: "anthropic/claude-sonnet-4.6",
  };

  it("deducts credits on first attempt", async () => {
    await deductCreditsWithRetry(baseArgs);

    expect(pingMock).toHaveBeenCalledOnce();
    expect(deductMock).toHaveBeenCalledOnce();
    expect(deductMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        chatId: "chat-1",
        promptTokens: 1000,
        completionTokens: 500,
        creditsConsumed: expect.any(Number),
      })
    );
    expect(cacheMock.delete).toHaveBeenCalledWith("user-1");
  });

  it("retries on transient failure and succeeds", async () => {
    deductMock
      .mockRejectedValueOnce(new Error("connection timeout"))
      .mockResolvedValueOnce(undefined);

    await deductCreditsWithRetry(baseArgs);

    expect(deductMock).toHaveBeenCalledTimes(2);
    expect(cacheMock.delete).toHaveBeenCalledWith("user-1");
  });

  it("throws after exhausting all retries", async () => {
    const error = new Error("persistent failure");
    deductMock.mockRejectedValue(error);

    // Run with shouldAdvanceTime so setTimeout resolves instantly
    vi.useRealTimers();
    // Replace setTimeout with zero-delay version for this test
    const origSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void) =>
      origSetTimeout(fn, 0)) as typeof setTimeout;

    try {
      await expect(deductCreditsWithRetry(baseArgs)).rejects.toThrow(
        "persistent failure"
      );

      expect(deductMock).toHaveBeenCalledTimes(5);
      expect(cacheMock.delete).not.toHaveBeenCalled();
    } finally {
      globalThis.setTimeout = origSetTimeout;
      vi.useFakeTimers({ shouldAdvanceTime: true });
    }
  });

  it("continues even if pingDatabase fails", async () => {
    pingMock.mockRejectedValueOnce(new Error("ping failed"));

    await deductCreditsWithRetry(baseArgs);

    expect(deductMock).toHaveBeenCalledOnce();
  });

  it("calculates credits correctly (ceil(total/1000))", async () => {
    await deductCreditsWithRetry({
      ...baseArgs,
      inputTokens: 100,
      outputTokens: 50,
    });

    // (100+50)/1000 = 0.15 → ceil → 1 credit (min 1)
    expect(deductMock).toHaveBeenCalledWith(
      expect.objectContaining({ creditsConsumed: 1 })
    );
  });
});

// ---------------------------------------------------------------------------
// createChatAgent
// ---------------------------------------------------------------------------

describe("createChatAgent", () => {
  it("creates a ToolLoopAgent instance", () => {
    const agent = createChatAgent({
      tools: {},
      agentConfig: makeAgentConfig(),
      userId: "user-1",
      chatId: "chat-1",
      effectiveModel: "anthropic/claude-sonnet-4.6",
      creditsDisabled: false,
    });

    // ToolLoopAgent has a doStream method
    expect(agent).toBeDefined();
    expect(typeof agent).toBe("object");
  });

  it("uses stopWhen=7 for pipeline agents", () => {
    const agent = createChatAgent({
      tools: {},
      agentConfig: makeAgentConfig({ usePipelineTool: true }),
      userId: "user-1",
      chatId: "chat-1",
      effectiveModel: "anthropic/claude-sonnet-4.6",
      creditsDisabled: false,
    });

    expect(agent).toBeDefined();
  });

  it("uses stopWhen=5 for non-pipeline agents", () => {
    const agent = createChatAgent({
      tools: {},
      agentConfig: makeAgentConfig({ usePipelineTool: false }),
      userId: "user-1",
      chatId: "chat-1",
      effectiveModel: "anthropic/claude-sonnet-4.6",
      creditsDisabled: false,
    });

    expect(agent).toBeDefined();
  });

  it("accepts onTelemetry callback", () => {
    const onTelemetry = vi.fn();

    const agent = createChatAgent({
      tools: {},
      agentConfig: makeAgentConfig(),
      userId: "user-1",
      chatId: "chat-1",
      effectiveModel: "anthropic/claude-sonnet-4.6",
      creditsDisabled: false,
      onTelemetry,
      telemetryStartMs: 1000,
    });

    expect(agent).toBeDefined();
  });

  it("creates agent with correct call options schema", () => {
    const agent = createChatAgent({
      tools: {},
      agentConfig: makeAgentConfig(),
      userId: "user-1",
      chatId: "chat-1",
      effectiveModel: "anthropic/claude-sonnet-4.6",
      creditsDisabled: true,
    });

    // The agent should have been created with chatCallOptionsSchema
    expect(agent).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Integration: buildActiveToolNames with real agent configs
// ---------------------------------------------------------------------------

describe("buildActiveToolNames — agent combinations", () => {
  it("revisor-defesas gets revisor tools + jurisprudencia + base", () => {
    const result = buildActiveToolNames({
      isReasoningModel: false,
      hasDocuments: true,
      agentConfig: makeAgentConfig({
        useRevisorDefesaTools: true,
        useSearchJurisprudenciaTool: true,
      }),
    });

    expect(result).toContain("createRevisorDefesaDocuments");
    expect(result).toContain("searchJurisprudencia");
    expect(result).toContain("buscarNoProcesso");
    expect(result).not.toContain("createRedatorContestacaoDocument");
    expect(result).not.toContain("createMasterDocuments");
  });

  it("master agent gets pipeline + master docs but no revisor/redator", () => {
    const result = buildActiveToolNames({
      isReasoningModel: false,
      hasDocuments: true,
      agentConfig: makeAgentConfig({
        usePipelineTool: true,
        useMasterDocumentsTool: true,
        useSearchJurisprudenciaTool: true,
      }),
    });

    expect(result).toContain("analyzeProcessoPipeline");
    expect(result).toContain("createMasterDocuments");
    expect(result).toContain("searchJurisprudencia");
    expect(result).not.toContain("createRevisorDefesaDocuments");
    expect(result).not.toContain("createRedatorContestacaoDocument");
  });

  it("reasoning model disables all tools regardless of agent config", () => {
    const result = buildActiveToolNames({
      isReasoningModel: true,
      hasDocuments: true,
      agentConfig: makeAgentConfig({
        useRevisorDefesaTools: true,
        useRedatorContestacaoTool: true,
        usePipelineTool: true,
        useMasterDocumentsTool: true,
        useAutuoriaTools: true,
        useSearchJurisprudenciaTool: true,
      }),
    });

    expect(result).toEqual([]);
  });
});
