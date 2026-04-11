/**
 * Testes de validação dos agentes built-in (instruções em ficheiros).
 * Garante que lib/ai/agent-*.ts e agent-*.md respeitam docs/ESTRUTURA-INSTRUCOES-AGENTES.md.
 */
import { describe, expect, it } from "vitest";
import { getAgentConfig } from "@/lib/ai/agents-registry";
import {
  AGENT_ID_ASSISTENTE_GERAL,
  AGENT_ID_REDATOR_CONTESTACAO,
  AGENT_ID_REVISOR_DEFESAS,
} from "@/lib/ai/agents-registry-metadata";
import {
  validateAgentInstructions,
  validateAllBuiltInAgents,
} from "@/lib/ai/validate-agents";

describe("Validação de agentes com ficheiros", () => {
  it("todos os agentes built-in passam na validação (sem erros)", () => {
    const results = validateAllBuiltInAgents();
    const failed = results.filter((r) => !r.valid);
    if (failed.length > 0) {
      const warningsPart = (r: (typeof failed)[0]) =>
        r.warnings.length > 0 ? ` [warnings: ${r.warnings.join("; ")}]` : "";
      const msg = failed
        .map((r) => `${r.agentId}: ${r.errors.join("; ")}${warningsPart(r)}`)
        .join("\n");
      expect.fail(`Agentes com erros de validação:\n${msg}`);
    }
    expect(results).toHaveLength(6);
  });

  it("Revisor de Defesas contém todas as tags XML obrigatórias", () => {
    const instructions = getAgentConfig(AGENT_ID_REVISOR_DEFESAS).instructions;
    const result = validateAgentInstructions(
      AGENT_ID_REVISOR_DEFESAS,
      instructions
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    const required = [
      "<role>",
      "<thinking>",
      "<workflow>",
      "<output_format>",
      "<constraints>",
      "<examples>",
    ];
    for (const tag of required) {
      expect(instructions).toContain(tag);
    }
  });

  it("Redator de Contestações contém <role> e <constraints>", () => {
    const instructions = getAgentConfig(
      AGENT_ID_REDATOR_CONTESTACAO
    ).instructions;
    const result = validateAgentInstructions(
      AGENT_ID_REDATOR_CONTESTACAO,
      instructions
    );
    expect(result.valid).toBe(true);
    expect(instructions).toContain("<role>");
    expect(instructions).toContain("</role>");
    expect(instructions).toContain("<constraints>");
    expect(instructions).toContain("</constraints>");
  });

  it("Assistente geral tem instruções curtas e escopo (PODE/NÃO PODE)", () => {
    const instructions = getAgentConfig(AGENT_ID_ASSISTENTE_GERAL).instructions;
    const result = validateAgentInstructions(
      AGENT_ID_ASSISTENTE_GERAL,
      instructions
    );
    expect(result.valid).toBe(true);
    expect(instructions.length).toBeGreaterThan(80);
    expect(instructions).toMatch(/PODE|NÃO PODE|pode fazer|não pode/i);
  });

  it("instruções vazias ou inválidas falham", () => {
    const empty = validateAgentInstructions(AGENT_ID_REVISOR_DEFESAS, "");
    expect(empty.valid).toBe(false);
    expect(
      empty.errors.some((e) => e.includes("ausentes") || e.includes("curtas"))
    ).toBe(true);

    const tooShort = validateAgentInstructions(
      AGENT_ID_ASSISTENTE_GERAL,
      "x".repeat(50)
    );
    expect(tooShort.valid).toBe(false);
  });

  it("Revisor sem tag <workflow> falha", () => {
    const fakeInstructions = `
      <role>Test</role>
      <thinking>Ok</thinking>
      <output_format>Doc</output_format>
      <constraints>None</constraints>
      <examples><example></example></examples>
    `.replaceAll(/\s+/g, " ");
    const result = validateAgentInstructions(
      AGENT_ID_REVISOR_DEFESAS,
      fakeInstructions
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("workflow"))).toBe(true);
  });
});
