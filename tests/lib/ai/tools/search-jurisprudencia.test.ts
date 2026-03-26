import { describe, expect, it } from "vitest";
import { searchJurisprudencia } from "@/lib/ai/tools/search-jurisprudencia";

describe("searchJurisprudencia", () => {
  // Access the execute function from the tool definition
  const execute = (searchJurisprudencia as any).execute as (params: {
    query: string;
    tipo?: string;
    tribunal?: string;
    maxResults?: number;
  }) => Promise<any>;

  it("finds results for common labor law topics", async () => {
    const result = await execute({
      query: "dano moral",
      tipo: "todos",
      maxResults: 5,
    });
    expect(result.found).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].referencia).toBeDefined();
    expect(result.results[0].ementa).toBeDefined();
  });

  it("finds Súmula 338 for jornada de trabalho", async () => {
    const result = await execute({
      query: "jornada de trabalho horas extras",
      tipo: "todos",
      maxResults: 10,
    });
    expect(result.found).toBe(true);
    const refs = result.results.map((r: any) => r.referencia);
    expect(refs).toContain("Súmula 338");
  });

  it("filters by tipo=sumula", async () => {
    const result = await execute({
      query: "gestante estabilidade",
      tipo: "sumula",
      maxResults: 5,
    });
    expect(result.found).toBe(true);
    for (const r of result.results) {
      expect(r.tipo).toBe("Súmula");
    }
  });

  it("filters by tipo=oj", async () => {
    const result = await execute({
      query: "verbas rescisórias",
      tipo: "oj",
      maxResults: 5,
    });
    expect(result.found).toBe(true);
    for (const r of result.results) {
      expect(r.tipo).toBe("OJ");
    }
  });

  it("filters by tribunal", async () => {
    const result = await execute({
      query: "terceirização",
      tipo: "todos",
      tribunal: "TST",
      maxResults: 5,
    });
    expect(result.found).toBe(true);
    for (const r of result.results) {
      expect(r.tribunal).toBe("TST");
    }
  });

  it("returns not found for irrelevant query", async () => {
    const result = await execute({
      query: "receita de bolo de chocolate",
      tipo: "todos",
      maxResults: 5,
    });
    expect(result.found).toBe(false);
    expect(result.results).toHaveLength(0);
  });

  it("respects maxResults limit", async () => {
    const result = await execute({
      query: "trabalho",
      tipo: "todos",
      maxResults: 2,
    });
    expect(result.results.length).toBeLessThanOrEqual(2);
  });

  it("includes relevancia field in results", async () => {
    const result = await execute({
      query: "terceirização vínculo",
      tipo: "todos",
      maxResults: 5,
    });
    expect(result.found).toBe(true);
    for (const r of result.results) {
      expect(["alta", "média", "baixa"]).toContain(r.relevancia);
    }
  });

  it("includes nota about verification", async () => {
    const result = await execute({
      query: "horas extras",
      tipo: "todos",
      maxResults: 5,
    });
    expect(result.nota).toBeDefined();
    expect(result.nota).toContain("verifique");
  });

  it("has correct tool description", () => {
    const desc = (searchJurisprudencia as any).description;
    expect(desc).toContain("jurisprudência");
    expect(desc).toContain("Súmulas");
  });
});
