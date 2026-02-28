import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/prompts/agente-trabalhista";
import { validateSystemPrompt } from "@/lib/prompts/agente-trabalhista/validate";

describe("buildSystemPrompt", () => {
  it("T1: sem contexto retorna string não-vazia", () => {
    const prompt = buildSystemPrompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("T2: com bancoTesesAtivo true inclui referência à Seção 6", () => {
    const prompt = buildSystemPrompt({ bancoTesesAtivo: true });
    expect(prompt).toMatch(/Seção 6|Quadro de Teses/);
    expect(prompt).toMatch(/ATIVO/);
  });

  it("T3: com bancoTesesAtivo false NÃO inclui instrução de incluir Seção 6", () => {
    const prompt = buildSystemPrompt({ bancoTesesAtivo: false });
    expect(prompt).toMatch(/INATIVO/);
    expect(prompt).not.toMatch(/Banco de teses ATIVO.*Seção 6/);
  });

  it("T4: prompt montado NÃO contém siglas proibidas fora da seção de siglas (RTE, RDO, DAJ, DTC como siglas)", () => {
    const prompt = buildSystemPrompt();
    const result = validateSystemPrompt(prompt);
    expect(result.erros.filter((e) => e.startsWith("E2"))).toHaveLength(0);
  });

  it("T5: prompt montado contém todos os 5 marcadores de regra (R1 a R5)", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/R1-PRESCRIÇÃO|R1|Prescrição/);
    expect(prompt).toMatch(/R2-MAPEAMENTO|R2|Mapeamento/);
    expect(prompt).toMatch(/R3-ANTI-ALUCINAÇÃO|R3|Anti-alucinação/);
    expect(prompt).toMatch(/R4-JORNADA|R4|Jornada/);
    expect(prompt).toMatch(/R5-OPORTUNIDADES|R5|Oportunidades/);
  });

  it("T6: com data no ctx injeta a data corretamente", () => {
    const prompt = buildSystemPrompt({ data: "27/02/2025" });
    expect(prompt).toContain("27/02/2025");
  });

  it("T7: com nomeEscritorio injeta o nome corretamente", () => {
    const prompt = buildSystemPrompt({
      nomeEscritorio: "Escritório Silva & Santos",
    });
    expect(prompt).toContain("Escritório Silva & Santos");
  });

  it("T8: separadores '---' entre módulos estão presentes (ordem de montagem)", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("---");
    const result = validateSystemPrompt(prompt);
    expect(result.estatisticas.totalModulos).toBeGreaterThan(0);
  });
});

describe("validateSystemPrompt", () => {
  it("prompt completo é válido (sem erros E1-E6)", () => {
    const prompt = buildSystemPrompt();
    const result = validateSystemPrompt(prompt);
    expect(result.valido).toBe(true);
    expect(result.erros).toHaveLength(0);
  });
});
