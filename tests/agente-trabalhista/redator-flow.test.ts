/**
 * Testes de fluxo do Agente Redator de Contestações Trabalhistas.
 * Valida configuração, Gates (-1, 0, 0.5), modos de operação, model restrictions e retry pattern.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS } from "@/lib/ai/agent-redator-contestacao";
import { getAgentConfig } from "@/lib/ai/agents-registry";
import {
  AGENT_ID_ASSISTJUR_MASTER,
  AGENT_ID_REDATOR_CONTESTACAO,
  AGENT_ID_REVISOR_DEFESAS,
} from "@/lib/ai/agents-registry-metadata";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Redator de Contestações — configuração do agente", () => {
  it("agente está registado com ID correto", () => {
    const config = getAgentConfig(AGENT_ID_REDATOR_CONTESTACAO);
    expect(config.id).toBe("redator-contestacao");
    expect(config.label).toBe("Redator de Contestações");
  });

  it("useRedatorContestacaoTool está activado", () => {
    const config = getAgentConfig(AGENT_ID_REDATOR_CONTESTACAO);
    expect(config.useRedatorContestacaoTool).toBe(true);
  });

  it("useRevisorDefesaTools está desactivado (ferramentas separadas)", () => {
    const config = getAgentConfig(AGENT_ID_REDATOR_CONTESTACAO);
    expect(config.useRevisorDefesaTools).toBe(false);
  });

  it("useMemoryTools está activado", () => {
    const config = getAgentConfig(AGENT_ID_REDATOR_CONTESTACAO);
    expect(config.useMemoryTools).toBe(true);
  });

  it("useMasterDocumentsTool está desactivado (não é Master)", () => {
    const config = getAgentConfig(AGENT_ID_REDATOR_CONTESTACAO);
    expect(config.useMasterDocumentsTool).toBeFalsy();
  });

  it("allowedModelIds exclui modelos reasoning (tools devem ficar activas)", () => {
    // Se o utilizador seleccionasse um modelo -thinking/-reasoning,
    // isReasoningModel=true no route.ts → createRedatorContestacaoDocument
    // nunca seria chamado → sem DOCX gerado.
    const config = getAgentConfig(AGENT_ID_REDATOR_CONTESTACAO);
    expect(config.allowedModelIds).toBeDefined();
    expect(config.allowedModelIds?.length).toBeGreaterThan(0);
    const hasReasoningModel = config.allowedModelIds?.some(
      (id) => id.includes("thinking") || id.includes("reasoning")
    );
    expect(hasReasoningModel).toBe(false);
  });

  it("allowedModelIds inclui apenas modelos Sonnet/Opus (recomendados para redação longa)", () => {
    const config = getAgentConfig(AGENT_ID_REDATOR_CONTESTACAO);
    const ids = config.allowedModelIds ?? [];
    expect(
      ids.every((id) => id.includes("sonnet") || id.includes("opus"))
    ).toBe(true);
  });

  it("Redator e Revisor têm allowedModelIds diferentes (Redator: Sonnet/Opus; Revisor: nonReasoning)", () => {
    const redator =
      getAgentConfig(AGENT_ID_REDATOR_CONTESTACAO).allowedModelIds ?? [];
    const revisor =
      getAgentConfig(AGENT_ID_REVISOR_DEFESAS).allowedModelIds ?? [];
    // Revisores incluem haiku/flash (mais rápidos); Redator só Sonnet/Opus
    expect(redator).not.toEqual(revisor);
    // Redator tem menos modelos (só Sonnet/Opus)
    expect(redator.length).toBeLessThanOrEqual(revisor.length);
  });
});

describe("Redator de Contestações — instruções e gates", () => {
  it("instruções não estão vazias e têm dimensão adequada (>5000 chars)", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS.length).toBeGreaterThan(
      5000
    );
  });

  it("contém tag <role> obrigatória", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toContain("<role>");
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toContain("</role>");
  });

  it("contém tag <workflow> com gates definidos", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toContain("<workflow>");
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toContain("</workflow>");
  });

  it("contém tag <constraints> com regras de anti-alucinação", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toContain("<constraints>");
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toContain("</constraints>");
  });

  it("Gate -1 exige (A) Petição Inicial e (B) Modelo ou @bancodetese", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toMatch(
      /GATE -1|gate_minus_1/i
    );
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toContain(
      "Petição Inicial"
    );
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toMatch(/PARAR/i);
  });

  it("Gate -1 bloqueia se faltar (A) ou (B)", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toMatch(
      /\(A\).*Petição|Petição.*\(A\)/
    );
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toMatch(
      /\(B\).*Modelo|\(B\).*teses|@bancodetese/i
    );
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toContain("⛔");
  });

  it("Gate 0.5 aguarda CONFIRMAR ou CORRIGIR antes de redigir", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toContain("CONFIRMAR");
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toContain("CORRIGIR");
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toMatch(
      /gate_05|GATE 0.5|Gate 0.5/i
    );
  });

  it("Fase B chama createRedatorContestacaoDocument", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toContain(
      "createRedatorContestacaoDocument"
    );
  });

  it("proíbe entregar relatório completo no corpo do chat", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toMatch(
      /Nunca.*chat|nunca.*corpo.*chat|não.*chat.*fallback/i
    );
  });

  it("contém regra anti-alucinação (não inventar jurisprudência)", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toMatch(
      /NÃO inventar|proibido.*inventar|não invente|Anti-alucinação/i
    );
  });
});

describe("Redator de Contestações — modo dual (Modelo vs @bancodetese)", () => {
  it("instruções definem MODO 1 (Modelo/Template)", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toMatch(
      /MODO 1.*MODELO|Modo 1.*Modelo/i
    );
  });

  it("instruções definem MODO 2 (@bancodetese/Teses)", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toMatch(
      /MODO 2.*TESES|Modo 2.*teses|@bancodetese/i
    );
  });

  it("instruções exigem declaração de modo no início da resposta (Modo 1 vs Modo 2)", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toMatch(
      /MODO 1 — MODELO|MODO 2 — TESES|DECLARAÇÃO OBRIGATÓRIA DE MODO/i
    );
  });

  it("Modo 1 requer replicação do modelo (não inventar estrutura)", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toMatch(
      /Replicação.*modelo|replicação.*ipsis|Regra 0-A/i
    );
  });

  it("Modo 2 permite selecionar teses por pedido/tema", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toMatch(
      /Seleção de teses|selecionar.*teses|blocos de teses/i
    );
  });

  it("campos pendentes (Bloco 8) são mencionados como mecanismo de lacunas", () => {
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toMatch(
      /Bloco 8|campos pendentes/i
    );
    expect(AGENTE_REDATOR_CONTESTACAO_INSTRUCTIONS).toMatch(/🟡|🔴|🔵/);
  });
});

describe("Redator de Contestações — ferramenta createRedatorContestacaoDocument", () => {
  it("ficheiro da tool existe em lib/ai/tools/", () => {
    const toolPath = path.join(
      __dirname,
      "..",
      "..",
      "lib",
      "ai",
      "tools",
      "create-redator-contestacao-document.ts"
    );
    expect(existsSync(toolPath)).toBe(true);
  });

  it("tool tem inputSchema com campos title e minutaContent", () => {
    const toolPath = path.join(
      __dirname,
      "..",
      "..",
      "lib",
      "ai",
      "tools",
      "create-redator-contestacao-document.ts"
    );
    const src = readFileSync(toolPath, "utf-8");
    expect(src).toContain("title");
    expect(src).toContain("minutaContent");
    expect(src).toContain("inputSchema");
  });

  it("tool implementa retry com backoff (SAVE_MAX_RETRIES, SAVE_RETRY_BASE_MS)", () => {
    const toolPath = path.join(
      __dirname,
      "..",
      "..",
      "lib",
      "ai",
      "tools",
      "create-redator-contestacao-document.ts"
    );
    const src = readFileSync(toolPath, "utf-8");
    // Mesmo padrão que Revisor e Master: retry + exponential backoff
    expect(src).toContain("SAVE_MAX_RETRIES");
    expect(src).toContain("SAVE_RETRY_BASE_MS");
    expect(src).toContain("saveWithRetry");
    expect(src).toContain("saveWithTimeout");
  });

  it("tool faz pingDatabase warm-up antes de gravar", () => {
    const toolPath = path.join(
      __dirname,
      "..",
      "..",
      "lib",
      "ai",
      "tools",
      "create-redator-contestacao-document.ts"
    );
    const src = readFileSync(toolPath, "utf-8");
    expect(src).toContain("pingDatabase");
  });

  it("tool usa SAVE_ATTEMPT_TIMEOUT_MS=5000 (mesmo padrão Revisor e Master)", () => {
    const toolPath = path.join(
      __dirname,
      "..",
      "..",
      "lib",
      "ai",
      "tools",
      "create-redator-contestacao-document.ts"
    );
    const src = readFileSync(toolPath, "utf-8");
    expect(src).toContain("SAVE_ATTEMPT_TIMEOUT_MS");
    expect(src).toContain("5000");
  });

  it("route.ts inclui createRedatorContestacaoDocument quando useRedatorContestacaoTool=true", () => {
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
    expect(routeCode).toContain("createRedatorContestacaoDocument");
    expect(routeCode).toContain("useRedatorContestacaoTool");
  });
});

describe("Redator de Contestações — consistência com agents-registry-metadata", () => {
  it("agents-registry-metadata exporta AGENT_ID_REDATOR_CONTESTACAO='redator-contestacao'", () => {
    expect(AGENT_ID_REDATOR_CONTESTACAO).toBe("redator-contestacao");
  });

  it("agents-registry-metadata tem descrição não-vazia para Redator", async () => {
    const { getAgentConfig: getMetaConfig } = await import(
      "@/lib/ai/agents-registry-metadata"
    );
    const meta = getMetaConfig(AGENT_ID_REDATOR_CONTESTACAO);
    expect(meta.description).toBeTruthy();
    expect(meta.description?.length).toBeGreaterThan(20);
    // Não deve ser placeholder do Assistente Geral
    expect(meta.description).not.toMatch(
      /Assistente jurídico geral|dúvidas sobre o uso/i
    );
  });

  it("agents-registry-metadata tem allowedModelIds para Redator (prevenção de reasoning models)", async () => {
    const { getAgentConfig: getMetaConfig } = await import(
      "@/lib/ai/agents-registry-metadata"
    );
    const meta = getMetaConfig(AGENT_ID_REDATOR_CONTESTACAO);
    expect(meta.allowedModelIds).toBeDefined();
    expect(meta.allowedModelIds?.length).toBeGreaterThan(0);
    const hasReasoning = meta.allowedModelIds?.some(
      (id) => id.includes("thinking") || id.includes("reasoning")
    );
    expect(hasReasoning).toBe(false);
  });

  it("agents-registry-metadata e agents-registry têm o mesmo allowedModelIds para Redator", async () => {
    const { getAgentConfig: getMetaConfig } = await import(
      "@/lib/ai/agents-registry-metadata"
    );
    const meta = getMetaConfig(AGENT_ID_REDATOR_CONTESTACAO);
    const full = getAgentConfig(AGENT_ID_REDATOR_CONTESTACAO);
    // Ambos devem ter a mesma lista de modelos permitidos
    expect(meta.allowedModelIds).toEqual(full.allowedModelIds);
  });

  it("Master não usa createRedatorContestacaoTool (ferramentas isoladas por agente)", () => {
    const master = getAgentConfig(AGENT_ID_ASSISTJUR_MASTER);
    expect(master.useRedatorContestacaoTool).toBeFalsy();
    expect(master.useMasterDocumentsTool).toBe(true);
  });
});
