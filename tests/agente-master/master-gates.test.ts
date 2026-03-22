/**
 * Testes de gates e módulos do AssistJur.IA Master.
 * Valida os 14 módulos, restrições de modelo e consistência entre registries.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS } from "@/lib/ai/agent-assistjur-master";
import { getAgentConfig } from "@/lib/ai/agents-registry";
import {
  AGENT_ID_ASSISTENTE_GERAL,
  AGENT_ID_ASSISTJUR_MASTER,
  AGENT_ID_REDATOR_CONTESTACAO,
  AGENT_ID_REVISOR_DEFESAS,
  AGENT_IDS,
} from "@/lib/ai/agents-registry-metadata";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Todos os comandos de módulo do Master (M01–M14). */
const MASTER_MODULE_COMMANDS = [
  "/relatorio-processual", // M01
  "/carta-prognostico", // M02
  "/relatorio-master", // M03
  "/relatorio-dpsp", // M04
  "/obf", // M05
  "/ficha-apolice", // M06
  "/auditoria", // M07
  "/cadastro-elaw", // M08
  "/encerramento", // M09
  "/aquisicao-creditos", // M10
  "/analise-tst", // M11
  "/modelo-br", // M12
  "/completo", // M13
  "/extracao-calculos", // M14
] as const;

describe("AssistJur.IA Master — 14 módulos nas instruções", () => {
  it("instruções contêm todos os 14 comandos de módulo (M01–M14)", () => {
    for (const cmd of MASTER_MODULE_COMMANDS) {
      expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toContain(cmd);
    }
  });

  it("módulos principais (featured) estão presentes: M03, M02, M08, M07, M12, M13", () => {
    const featured = [
      "/relatorio-master", // M03
      "/carta-prognostico", // M02
      "/cadastro-elaw", // M08
      "/auditoria", // M07
      "/modelo-br", // M12
      "/completo", // M13
    ] as const;
    for (const cmd of featured) {
      expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toContain(cmd);
    }
  });

  it("módulo M13 (/completo) — relatório completo A-P com 250 campos", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toMatch(
      /\/completo|M13|250 campos|Relatório Completo A-P/i
    );
  });

  it("módulo M02 (/carta-prognostico) — risco e provisão", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toMatch(
      /carta-prognostico|carta de prognóstico|provisão/i
    );
  });

  it("módulo M08 (/cadastro-elaw) — planilha eLaw", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toMatch(
      /cadastro-elaw|eLaw|planilha.*eLaw/i
    );
  });

  it("módulo M07 (/auditoria) — auditoria trabalhista", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toMatch(
      /auditoria|Auditoria 360/i
    );
  });
});

describe("AssistJur.IA Master — regras críticas de entrega", () => {
  it("instrução proíbe entregar relatório no chat (NUNCA)", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toMatch(
      /NUNCA.*chat|nunca.*corpo|não.*chat.*fallback/i
    );
  });

  it("instrução exige uso de createMasterDocuments", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toContain(
      "createMasterDocuments"
    );
  });

  it("instrução contém regra OBRIGATÓRIA de gerar DOCX", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toMatch(
      /REGRA OBRIGATÓRIA|MUST|DEVE SEMPRE|obrigatório/i
    );
  });

  it("instrução define layout assistjur-master para DOCX", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toContain("assistjur-master");
  });

  it("instrução contém regra anti-alucinação (melhor vazio que inventado)", () => {
    expect(AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS).toMatch(
      /vazio.*errado|MELHOR VAZIO|não inventar|NÃO inventar/i
    );
  });
});

describe("AssistJur.IA Master — ferramenta createMasterDocuments", () => {
  it("ficheiro da tool existe em lib/ai/tools/", () => {
    const toolPath = path.join(
      __dirname,
      "..",
      "..",
      "lib",
      "ai",
      "tools",
      "create-master-documents.ts"
    );
    expect(existsSync(toolPath)).toBe(true);
  });

  it("tool tem inputSchema com array de documents (title + content)", () => {
    const toolPath = path.join(
      __dirname,
      "..",
      "..",
      "lib",
      "ai",
      "tools",
      "create-master-documents.ts"
    );
    const src = readFileSync(toolPath, "utf-8");
    expect(src).toContain("documents");
    expect(src).toContain("title");
    expect(src).toContain("content");
    expect(src).toContain("inputSchema");
  });

  it("tool tem retry com backoff (mesmo padrão que Revisor e Redator)", () => {
    const toolPath = path.join(
      __dirname,
      "..",
      "..",
      "lib",
      "ai",
      "tools",
      "create-master-documents.ts"
    );
    const src = readFileSync(toolPath, "utf-8");
    // Padrão retry uniforme em todos os agentes
    expect(src).toMatch(/saveWithRetry|SAVE_MAX_RETRIES|retry/i);
  });
});

describe("AssistJur.IA Master — consistência com agents-registry-metadata", () => {
  it("AGENT_IDS exporta exatamente 4 agentes", () => {
    expect(AGENT_IDS).toHaveLength(4);
    expect(AGENT_IDS).toContain(AGENT_ID_ASSISTENTE_GERAL);
    expect(AGENT_IDS).toContain(AGENT_ID_REVISOR_DEFESAS);
    expect(AGENT_IDS).toContain(AGENT_ID_REDATOR_CONTESTACAO);
    expect(AGENT_IDS).toContain(AGENT_ID_ASSISTJUR_MASTER);
  });

  it("todos os 4 agentes têm descrição não-vazia e única no metadata", async () => {
    const { getAgentConfig: getMetaConfig } = await import(
      "@/lib/ai/agents-registry-metadata"
    );
    const descriptions = AGENT_IDS.map(
      (id) => getMetaConfig(id).description ?? ""
    );
    // Todas as descrições devem ser não-vazias
    for (const desc of descriptions) {
      expect(desc.length).toBeGreaterThan(20);
    }
    // Todas as descrições devem ser únicas
    const uniqueDescs = new Set(descriptions);
    expect(uniqueDescs.size).toBe(AGENT_IDS.length);
  });

  it("Master tem allowedModelIds no metadata (previne reasoning models)", async () => {
    const { getAgentConfig: getMetaConfig } = await import(
      "@/lib/ai/agents-registry-metadata"
    );
    const meta = getMetaConfig(AGENT_ID_ASSISTJUR_MASTER);
    expect(meta.allowedModelIds).toBeDefined();
    expect(meta.allowedModelIds?.length).toBeGreaterThan(0);
    const hasReasoning = meta.allowedModelIds?.some(
      (id) => id.includes("thinking") || id.includes("reasoning")
    );
    expect(hasReasoning).toBe(false);
  });

  it("Master e Revisor têm o mesmo conjunto de allowedModelIds (nonReasoningChatModelIds)", async () => {
    const { getAgentConfig: getMetaConfig } = await import(
      "@/lib/ai/agents-registry-metadata"
    );
    const masterMeta = getMetaConfig(AGENT_ID_ASSISTJUR_MASTER);
    const revisorMeta = getMetaConfig(AGENT_ID_REVISOR_DEFESAS);
    // Ambos usam nonReasoningChatModelIds
    expect(masterMeta.allowedModelIds).toEqual(revisorMeta.allowedModelIds);
  });

  it("agents-registry-metadata e agents-registry têm mesmo allowedModelIds para Master", async () => {
    const { getAgentConfig: getMetaConfig } = await import(
      "@/lib/ai/agents-registry-metadata"
    );
    const meta = getMetaConfig(AGENT_ID_ASSISTJUR_MASTER);
    const full = getAgentConfig(AGENT_ID_ASSISTJUR_MASTER);
    expect(meta.allowedModelIds).toEqual(full.allowedModelIds);
  });

  it("Assistente Geral NÃO tem allowedModelIds (todos os modelos permitidos)", async () => {
    const { getAgentConfig: getMetaConfig } = await import(
      "@/lib/ai/agents-registry-metadata"
    );
    const meta = getMetaConfig(AGENT_ID_ASSISTENTE_GERAL);
    // Assistente geral não restringe modelos
    expect(meta.allowedModelIds).toBeUndefined();
  });
});

describe("AssistJur.IA Master — route.ts e pipeline", () => {
  it("route.ts aplica stepCountIs=7 para usePipelineTool (Master)", () => {
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
    expect(routeCode).toContain(
      "stepCountIs(ctx.agentConfig.usePipelineTool ? 7 : 5)"
    );
  });

  it("route.ts usa maxOutputTokens do agentConfig com fallback para 8192", () => {
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
    expect(routeCode).toContain(
      "maxOutputTokens: ctx.agentConfig.maxOutputTokens ?? 8192"
    );
  });

  it("route.ts bloqueia tools para modelos reasoning (isReasoningModel → [])", () => {
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
    expect(routeCode).toMatch(
      /isReasoningModel[\s\S]*?\[\]|activeToolNames[\s\S]*?isReasoningModel.*\[\]/
    );
  });

  it("config Master: maxOutputTokens=16000 (suporte a M13: 250 campos, 30-50 pgs)", () => {
    const config = getAgentConfig(AGENT_ID_ASSISTJUR_MASTER);
    expect(config.maxOutputTokens).toBe(16_000);
  });

  it("config Master: usePipelineTool=true e useMasterDocumentsTool=true", () => {
    const config = getAgentConfig(AGENT_ID_ASSISTJUR_MASTER);
    expect(config.usePipelineTool).toBe(true);
    expect(config.useMasterDocumentsTool).toBe(true);
  });
});
