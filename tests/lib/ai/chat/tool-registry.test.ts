import { describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "@/lib/ai/agents-registry";
import { buildToolsForAgent } from "@/lib/ai/chat/tool-registry";
import type { StreamExecuteContext } from "@/lib/ai/chat/types";

// ---------------------------------------------------------------------------
// Mocks — all tool factories return a sentinel object
// ---------------------------------------------------------------------------

vi.mock("@/lib/ai/tools/get-weather", () => ({
  getWeather: { _tool: "getWeather" },
}));
vi.mock("@/lib/ai/tools/create-document", () => ({
  createDocument: () => ({ _tool: "createDocument" }),
}));
vi.mock("@/lib/ai/tools/update-document", () => ({
  updateDocument: () => ({ _tool: "updateDocument" }),
}));
vi.mock("@/lib/ai/tools/request-suggestions", () => ({
  requestSuggestions: () => ({ _tool: "requestSuggestions" }),
}));
vi.mock("@/lib/ai/tools/improve-prompt", () => ({
  improvePromptTool: { _tool: "improvePrompt" },
}));
vi.mock("@/lib/ai/tools/memory", () => ({
  createMemoryTools: () => ({
    saveMemory: { _tool: "saveMemory" },
    recallMemories: { _tool: "recallMemories" },
    forgetMemory: { _tool: "forgetMemory" },
  }),
}));
vi.mock("@/lib/ai/tools/human-in-the-loop", () => ({
  requestApproval: { _tool: "requestApproval" },
}));
vi.mock("@/lib/ai/tools/run-processo-gates", () => ({
  runProcessoGates: { _tool: "runProcessoGates" },
}));
vi.mock("@/lib/ai/tools/upsert-risco-verba", () => ({
  upsertRiscoVerba: { _tool: "upsertRiscoVerba" },
}));
vi.mock("@/lib/ai/tools/search-jurisprudencia", () => ({
  createSearchJurisprudenciaTool: () => ({ _tool: "searchJurisprudencia" }),
}));
vi.mock("@/lib/ai/tools/search-document", () => ({
  createSearchDocumentTool: () => ({ _tool: "buscarNoProcesso" }),
}));
vi.mock("@/lib/ai/tools/create-revisor-defesa-documents", () => ({
  createRevisorDefesaDocuments: () => ({
    _tool: "createRevisorDefesaDocuments",
  }),
}));
vi.mock("@/lib/ai/tools/create-redator-contestacao-document", () => ({
  createRedatorContestacaoDocument: () => ({
    _tool: "createRedatorContestacaoDocument",
  }),
}));
vi.mock("@/lib/ai/tools/create-avaliador-contestacao-document", () => ({
  createAvaliadorContestacaoDocument: () => ({
    _tool: "createAvaliadorContestacaoDocument",
  }),
}));
vi.mock("@/lib/ai/tools/analyze-processo-pipeline", () => ({
  analyzeProcessoPipeline: () => ({ _tool: "analyzeProcessoPipeline" }),
}));
vi.mock("@/lib/ai/tools/create-master-documents", () => ({
  createMasterDocuments: () => ({ _tool: "createMasterDocuments" }),
}));
vi.mock("@/lib/ai/tools/create-autuoria-documents", () => ({
  createAutuoriaDocuments: () => ({ _tool: "createAutuoriaDocuments" }),
}));
vi.mock("@/lib/ai/tools/intake-processo", () => ({
  createIntakeProcessoTool: () => ({ _tool: "intakeProcesso" }),
}));

// ---------------------------------------------------------------------------
// Helpers
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

function makeContext(
  overrides: Partial<StreamExecuteContext> = {}
): StreamExecuteContext {
  return {
    session: { user: { id: "user-1" }, expires: "" } as any,
    agentInstructions: "test",
    agentConfig: makeAgentConfig(overrides.agentConfig as any),
    agentId: "assistente-geral",
    effectiveModel: "anthropic/claude-sonnet-4.6",
    requestHints: {},
    knowledgeContext: undefined,
    processoContext: undefined,
    messagesForModel: [] as any,
    isReasoningModel: false,
    isAdaptiveThinking: false,
    titlePromise: null,
    id: "chat-1",
    requestStart: Date.now(),
    preStreamEnd: Date.now(),
    documentTexts: new Map(),
    mcpTools: {},
    processoId: null,
    ...overrides,
  } as StreamExecuteContext;
}

const mockDataStream = {} as any;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildToolsForAgent", () => {
  it("includes base tools for all agents", () => {
    const tools = buildToolsForAgent(makeContext(), mockDataStream);

    expect(tools.getWeather).toBeDefined();
    expect(tools.createDocument).toBeDefined();
    expect(tools.updateDocument).toBeDefined();
    expect(tools.requestSuggestions).toBeDefined();
    expect(tools.improvePrompt).toBeDefined();
    expect(tools.saveMemory).toBeDefined();
    expect(tools.recallMemories).toBeDefined();
    expect(tools.forgetMemory).toBeDefined();
    expect(tools.requestApproval).toBeDefined();
    expect(tools.runProcessoGates).toBeDefined();
    expect(tools.upsertRiscoVerba).toBeDefined();
    expect(tools.searchJurisprudencia).toBeDefined();
  });

  it("does not include buscarNoProcesso when no documents", () => {
    const tools = buildToolsForAgent(makeContext(), mockDataStream);
    expect(tools.buscarNoProcesso).toBeUndefined();
  });

  it("includes buscarNoProcesso when documentTexts has entries", () => {
    const docs = new Map([["doc1", "text content"]]);
    const tools = buildToolsForAgent(
      makeContext({ documentTexts: docs }),
      mockDataStream
    );
    expect(tools.buscarNoProcesso).toBeDefined();
  });

  it("does not include revisor tools by default", () => {
    const tools = buildToolsForAgent(makeContext(), mockDataStream);
    expect(tools.createRevisorDefesaDocuments).toBeUndefined();
  });

  it("includes revisor tools when useRevisorDefesaTools is true", () => {
    const ctx = makeContext({
      agentConfig: makeAgentConfig({ useRevisorDefesaTools: true }),
    });
    ctx.agentConfig = makeAgentConfig({ useRevisorDefesaTools: true });
    const tools = buildToolsForAgent(ctx, mockDataStream);
    expect(tools.createRevisorDefesaDocuments).toBeDefined();
  });

  it("includes redator tool when useRedatorContestacaoTool is true", () => {
    const ctx = makeContext();
    ctx.agentConfig = makeAgentConfig({ useRedatorContestacaoTool: true });
    const tools = buildToolsForAgent(ctx, mockDataStream);
    expect(tools.createRedatorContestacaoDocument).toBeDefined();
  });

  it("includes avaliador tool when useAvaliadorContestacaoTool is true", () => {
    const ctx = makeContext();
    ctx.agentConfig = makeAgentConfig({ useAvaliadorContestacaoTool: true });
    const tools = buildToolsForAgent(ctx, mockDataStream);
    expect(tools.createAvaliadorContestacaoDocument).toBeDefined();
  });

  it("includes pipeline tool when usePipelineTool is true", () => {
    const ctx = makeContext();
    ctx.agentConfig = makeAgentConfig({ usePipelineTool: true });
    const tools = buildToolsForAgent(ctx, mockDataStream);
    expect(tools.analyzeProcessoPipeline).toBeDefined();
  });

  it("includes master documents tool when useMasterDocumentsTool is true", () => {
    const ctx = makeContext();
    ctx.agentConfig = makeAgentConfig({ useMasterDocumentsTool: true });
    const tools = buildToolsForAgent(ctx, mockDataStream);
    expect(tools.createMasterDocuments).toBeDefined();
  });

  it("includes autuoria tools when useAutuoriaTools is true", () => {
    const ctx = makeContext();
    ctx.agentConfig = makeAgentConfig({ useAutuoriaTools: true });
    const tools = buildToolsForAgent(ctx, mockDataStream);
    expect(tools.createAutuoriaDocuments).toBeDefined();
  });

  it("includes intakeProcesso when processoId is null", () => {
    const ctx = makeContext({ processoId: null });
    const tools = buildToolsForAgent(ctx, mockDataStream) as Record<
      string,
      unknown
    >;
    expect(tools.intakeProcesso).toBeDefined();
  });

  it("excludes intakeProcesso when processoId is set", () => {
    const ctx = makeContext({ processoId: "processo-123" });
    const tools = buildToolsForAgent(ctx, mockDataStream) as Record<
      string,
      unknown
    >;
    expect(tools.intakeProcesso).toBeUndefined();
  });

  it("injects MCP tools when provided", () => {
    const ctx = makeContext({
      mcpTools: {
        gmailSend: { _tool: "gmailSend" },
        driveSearch: { _tool: "driveSearch" },
      },
    });
    const tools = buildToolsForAgent(ctx, mockDataStream) as Record<
      string,
      unknown
    >;
    expect(tools.gmailSend).toBeDefined();
    expect(tools.driveSearch).toBeDefined();
  });

  it("does not inject MCP tools when mcpTools is empty", () => {
    const ctx = makeContext({ mcpTools: {} });
    const tools = buildToolsForAgent(ctx, mockDataStream) as Record<
      string,
      unknown
    >;
    expect(tools.gmailSend).toBeUndefined();
  });

  it("includes all tools for master agent configuration", () => {
    const ctx = makeContext({
      documentTexts: new Map([["doc1", "text"]]),
      processoId: null,
      mcpTools: { externalTool: { _tool: "ext" } },
    });
    ctx.agentConfig = makeAgentConfig({
      usePipelineTool: true,
      useMasterDocumentsTool: true,
    });
    const tools = buildToolsForAgent(ctx, mockDataStream) as Record<
      string,
      unknown
    >;

    // Base tools
    expect(tools.getWeather).toBeDefined();
    expect(tools.createDocument).toBeDefined();
    // Conditional tools
    expect(tools.buscarNoProcesso).toBeDefined();
    expect(tools.analyzeProcessoPipeline).toBeDefined();
    expect(tools.createMasterDocuments).toBeDefined();
    expect(tools.intakeProcesso).toBeDefined();
    // MCP tools
    expect(tools.externalTool).toBeDefined();
    // Excluded tools
    expect(tools.createRevisorDefesaDocuments).toBeUndefined();
    expect(tools.createRedatorContestacaoDocument).toBeUndefined();
  });
});
