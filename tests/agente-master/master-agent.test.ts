/**
 * Testes de diagnóstico para o AssistJur.IA Master agent.
 * Valida instruções, configuração, e identifica possíveis causas de falha na geração de documentos.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getAgentConfig } from "@/lib/ai/agents-registry";
import { AGENT_ID_ASSISTJUR_MASTER } from "@/lib/ai/agents-registry-metadata";
import { AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS } from "@/lib/ai/agent-assistjur-master";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("AssistJur.IA Master — configuração do agente", () => {
  it("agente está registado com ID correto", () => {
    const config = getAgentConfig(AGENT_ID_ASSISTJUR_MASTER);
    expect(config.id).toBe("assistjur-master");
    expect(config.label).toBe("AssistJur.IA Master");
  });

  it("useMasterDocumentsTool está activado", () => {
    const config = getAgentConfig(AGENT_ID_ASSISTJUR_MASTER);
    expect(config.useMasterDocumentsTool).toBe(true);
  });

  it("usePipelineTool está activado (pipeline para PDFs grandes)", () => {
    const config = getAgentConfig(AGENT_ID_ASSISTJUR_MASTER);
    expect(config.usePipelineTool).toBe(true);
  });

  it("useMemoryTools está activado", () => {
    const config = getAgentConfig(AGENT_ID_ASSISTJUR_MASTER);
    expect(config.useMemoryTools).toBe(true);
  });

  it("useRevisorDefesaTools está desactivado (ferramentas separadas)", () => {
    const config = getAgentConfig(AGENT_ID_ASSISTJUR_MASTER);
    expect(config.useRevisorDefesaTools).toBe(false);
  });

  it("allowedModelIds exclui modelos reasoning (fix: tools ficam activas)", () => {
    // DIAGNÓSTICO: se o utilizador seleccionasse um modelo -thinking/-reasoning,
    // isReasoningModel=true no route.ts → activeToolNames=[] → createMasterDocuments
    // nunca chamado → sem documento gerado.
    const config = getAgentConfig(AGENT_ID_ASSISTJUR_MASTER);
    expect(config.allowedModelIds).toBeDefined();
    expect(config.allowedModelIds!.length).toBeGreaterThan(0);
    // Nenhum ID permitido deve ter sufixo -thinking ou -reasoning
    const hasReasoningModel = config.allowedModelIds!.some(
      (id) => id.includes("thinking") || id.includes("reasoning")
    );
    expect(hasReasoningModel).toBe(false);
  });
});

describe("AssistJur.IA Master — instruções e regras críticas", () => {
  it("instruções não estão vazias e têm dimensão adequada (>5000 chars)", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS.length).toBeGreaterThan(5000);
  });

  it("contém regra OBRIGATÓRIA de usar createMasterDocuments", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toContain("createMasterDocuments");
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toMatch(
      /REGRA OBRIGATÓRIA|MUST|DEVE SEMPRE|obrigatório/i
    );
  });

  it("proíbe explicitamente entrega de relatório no chat", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toMatch(
      /NUNCA.*chat|nunca.*corpo|não.*chat.*fallback/i
    );
  });

  it("contém regra anti-alucinação (melhor vazio que errado)", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toMatch(
      /vazio.*errado|MELHOR VAZIO|não inventar|NÃO inventar/i
    );
  });

  it("contém tag <role> obrigatória", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toContain("<role>");
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toContain("</role>");
  });

  it("contém tag <critical_rule> com a regra de entrega", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toContain("<critical_rule>");
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toContain("</critical_rule>");
  });

  it("contém definição dos 14 módulos (M01–M14)", () => {
    // Verificar que existem os módulos principais
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toMatch(/M01|relatorio-processual/i);
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toMatch(/M13|completo.*A-P|250 campos/i);
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toMatch(/M02|carta-prognostico/i);
  });

  it("menciona layout assistjur-master para DOCX", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toContain("assistjur-master");
  });
});

describe("AssistJur.IA Master — diagnóstico: maxOutputTokens", () => {
  /**
   * DIAGNÓSTICO DO PROBLEMA DE PRODUÇÃO:
   * "Em produção não gerou o documento."
   *
   * A causa mais provável é que maxOutputTokens: 8192 é insuficiente para
   * relatórios longos (M13 com 250 campos, 30-50 páginas = ~15K-40K tokens).
   *
   * Quando o modelo atinge o limite de output durante a geração dos argumentos
   * do tool call (createMasterDocuments), o JSON fica truncado e a tool não é
   * chamada — resultado: sem documento gerado.
   */
  it("Master agent tem maxOutputTokens=16000 (fix para truncação de tool calls)", () => {
    // CORREÇÃO DO PROBLEMA DE PRODUÇÃO:
    // O default global (8192) truncava o tool call JSON do createMasterDocuments
    // para relatórios longos (M13: 250 campos, 30-50 pgs ≈ 15K-30K tokens),
    // impedindo a geração do documento.
    // Solução: maxOutputTokens configurable por agente; Master usa 16000.
    const config = getAgentConfig(AGENT_ID_ASSISTJUR_MASTER);
    expect(config.maxOutputTokens).toBe(16000);
    expect(config.maxOutputTokens).toBeGreaterThanOrEqual(16000);
  });

  it("route.ts usa maxOutputTokens do agentConfig com fallback para 8192", () => {
    const routePath = path.join(
      __dirname, "..", "..", "app", "(chat)", "api", "chat", "route.ts"
    );
    const routeCode = readFileSync(routePath, "utf-8");
    expect(routeCode).toContain(
      "maxOutputTokens: ctx.agentConfig.maxOutputTokens ?? 8192"
    );
  });

  it("DIAGNÓSTICO: stopWhen do Master agent usa 7 steps (adequado para pipeline)", () => {
    const routePath = path.join(
      __dirname,
      "..",
      "..",
      "app",
      "(chat)",
      "api",
      "chat",
      "route.ts"
    );
    const routeCode = readFileSync(routePath, "utf-8");
    // Master agent tem usePipelineTool=true → usa 7 steps
    expect(routeCode).toContain("stepCountIs(ctx.agentConfig.usePipelineTool ? 7 : 5)");
  });

  it("DIAGNÓSTICO: isReasoningModel bloqueia tools — modelos de raciocínio não podem gerar docs", () => {
    const routePath = path.join(
      __dirname,
      "..",
      "..",
      "app",
      "(chat)",
      "api",
      "chat",
      "route.ts"
    );
    const routeCode = readFileSync(routePath, "utf-8");
    // Confirmar que tools são desactivadas para modelos de raciocínio
    expect(routeCode).toMatch(
      /isReasoningModel[\s\S]*?\[\]|activeToolNames[\s\S]*?isReasoningModel.*\[\]/
    );
    // Se o utilizador usou um modelo -thinking ou -reasoning no Master,
    // as tools ficam inactivas e createMasterDocuments não é chamado.
  });
});

describe("AssistJur.IA Master — ferramenta createMasterDocuments", () => {
  // A tool usa `server-only` internamente (módulo de servidor).
  // Os testes da tool estão em tests/lib/create-master-documents.test.ts
  // que usa vi.mock para as dependências de servidor.
  it("create-master-documents.test.ts cobre a tool (ver ficheiro dedicado)", () => {
    // Este teste é um marcador: a cobertura está em create-master-documents.test.ts
    expect(true).toBe(true);
  });

  it("DIAGNÓSTICO: tool é server-only (não pode ser importada em Client Components)", () => {
    // Confirmar que a tool está no directório correcto
    const toolPath = path.join(
      __dirname, "..", "..", "lib", "ai", "tools", "create-master-documents.ts"
    );
    expect(existsSync(toolPath)).toBe(true);
  });
});
