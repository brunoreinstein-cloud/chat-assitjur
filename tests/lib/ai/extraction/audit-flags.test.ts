import { describe, expect, it } from "vitest";
import {
  ALL_FLAG_CODES,
  buildAuditReport,
  createFlag,
  DEFAULT_CRITICAL_FIELDS,
  detectCamposCriticosVazios,
  detectDatasForaSequencia,
  detectSomaInconsistente,
  detectValoresDivergentes,
  getFlagDefinition,
} from "@/lib/ai/extraction/audit-flags";

describe("audit-flags", () => {
  describe("flag definitions", () => {
    it("has 18 flag codes", () => {
      expect(ALL_FLAG_CODES).toHaveLength(18);
    });

    it("each flag has severity, sla, and label", () => {
      for (const code of ALL_FLAG_CODES) {
        const def = getFlagDefinition(code);
        expect(def.severity).toMatch(/^(CRITICO|ALTO|MEDIO)$/);
        expect(def.slaHours).toBeGreaterThan(0);
        expect(def.label.length).toBeGreaterThan(5);
      }
    });

    it("CRITICO flags have 2h SLA", () => {
      const criticoFlags = ALL_FLAG_CODES.filter(
        (c) => getFlagDefinition(c).severity === "CRITICO"
      );
      expect(criticoFlags.length).toBe(4);
      for (const code of criticoFlags) {
        expect(getFlagDefinition(code).slaHours).toBe(2);
      }
    });

    it("ALTO flags have 4h SLA", () => {
      const altoFlags = ALL_FLAG_CODES.filter(
        (c) => getFlagDefinition(c).severity === "ALTO"
      );
      expect(altoFlags.length).toBe(6);
      for (const code of altoFlags) {
        expect(getFlagDefinition(code).slaHours).toBe(4);
      }
    });

    it("MEDIO flags have 8h SLA", () => {
      const medioFlags = ALL_FLAG_CODES.filter(
        (c) => getFlagDefinition(c).severity === "MEDIO"
      );
      expect(medioFlags.length).toBe(8);
      for (const code of medioFlags) {
        expect(getFlagDefinition(code).slaHours).toBe(8);
      }
    });
  });

  describe("createFlag", () => {
    it("creates flag with correct metadata", () => {
      const flag = createFlag(
        "CNJ_DIGITO_INVALIDO",
        ["cnj"],
        "Dígito 99 inválido"
      );
      expect(flag.code).toBe("CNJ_DIGITO_INVALIDO");
      expect(flag.severity).toBe("CRITICO");
      expect(flag.slaHours).toBe(2);
      expect(flag.fields).toEqual(["cnj"]);
      expect(flag.detail).toBe("Dígito 99 inválido");
      expect(flag.detectedAt).toBeDefined();
    });

    it("assigns ADVOGADO marcador to CRITICO flags", () => {
      const flag = createFlag("PRESCRICAO_DUVIDA", ["prescricao"]);
      expect(flag.marcador).toContain("[ADVOGADO]");
    });

    it("assigns VERIFICAR marcador to ALTO flags", () => {
      const flag = createFlag("CAMPO_CRITICO_VAZIO", ["cnj"]);
      expect(flag.marcador).toContain("[VERIFICAR]");
    });

    it("assigns PENDENTE marcador to MEDIO flags", () => {
      const flag = createFlag("SOMA_INCONSISTENTE", ["total"]);
      expect(flag.marcador).toContain("[PENDENTE]");
    });
  });

  describe("detectCamposCriticosVazios", () => {
    it("detects empty critical fields", () => {
      const fields = {
        cnj: "0001234-56.2024.5.01.0001",
        reclamante: "",
        reclamada: "---",
        valor_causa: "R$ 50.000,00",
      };
      const flags = detectCamposCriticosVazios(fields, [
        "cnj",
        "reclamante",
        "reclamada",
        "valor_causa",
      ]);
      expect(flags.length).toBe(2); // reclamante (empty) + reclamada (---)
      expect(flags.every((f) => f.code === "CAMPO_CRITICO_VAZIO")).toBe(true);
    });

    it("triggers AUSENTE_MULTIPLO when >=3 empty", () => {
      const fields = {
        cnj: "",
        reclamante: "---",
        reclamada: "",
        valor_causa: "",
      };
      const flags = detectCamposCriticosVazios(fields, [
        "cnj",
        "reclamante",
        "reclamada",
        "valor_causa",
      ]);
      const multiplo = flags.find(
        (f) => f.code === "CAMPO_CRITICO_AUSENTE_MULTIPLO"
      );
      expect(multiplo).toBeDefined();
      expect(multiplo?.severity).toBe("CRITICO");
    });

    it("returns empty array when all fields present", () => {
      const fields = {
        cnj: "0001234-56.2024.5.01.0001",
        reclamante: "João Silva",
      };
      const flags = detectCamposCriticosVazios(fields, ["cnj", "reclamante"]);
      expect(flags).toHaveLength(0);
    });
  });

  describe("detectValoresDivergentes", () => {
    it("detects divergence between sources", () => {
      const flags = detectValoresDivergentes([
        {
          field: "valor_condenacao",
          source1: { label: "Sentença", value: 100_000 },
          source2: { label: "Cálculos", value: 95_000 },
        },
      ]);
      expect(flags).toHaveLength(1);
      expect(flags[0].code).toBe("VALORES_DIVERGENTES");
    });

    it("triggers VALOR_ALTO_DIVERGENTE for >50k diff", () => {
      const flags = detectValoresDivergentes([
        {
          field: "valor_condenacao",
          source1: { label: "Sentença", value: 200_000 },
          source2: { label: "Cálculos", value: 100_000 },
        },
      ]);
      expect(flags[0].code).toBe("VALOR_ALTO_DIVERGENTE");
      expect(flags[0].severity).toBe("CRITICO");
    });

    it("ignores negligible differences (<0.01)", () => {
      const flags = detectValoresDivergentes([
        {
          field: "valor",
          source1: { label: "A", value: 100 },
          source2: { label: "B", value: 100.005 },
        },
      ]);
      expect(flags).toHaveLength(0);
    });
  });

  describe("detectDatasForaSequencia", () => {
    it("detects out-of-order dates", () => {
      const flags = detectDatasForaSequencia([
        { field: "data_admissao", date: new Date(2020, 0, 1) },
        { field: "data_demissao", date: new Date(2019, 0, 1) }, // antes da admissão!
        { field: "data_distribuicao", date: new Date(2021, 0, 1) },
      ]);
      expect(flags).toHaveLength(1);
      expect(flags[0].code).toBe("DATA_FORA_SEQUENCIA");
      expect(flags[0].fields).toContain("data_admissao");
      expect(flags[0].fields).toContain("data_demissao");
    });

    it("returns empty for correct sequence", () => {
      const flags = detectDatasForaSequencia([
        { field: "admissao", date: new Date(2018, 0, 1) },
        { field: "demissao", date: new Date(2020, 5, 15) },
        { field: "distribuicao", date: new Date(2020, 8, 1) },
      ]);
      expect(flags).toHaveLength(0);
    });
  });

  describe("detectSomaInconsistente", () => {
    it("detects sum mismatch", () => {
      const flag = detectSomaInconsistente(
        "valor_total",
        [
          { label: "Pedido A", value: 10_000 },
          { label: "Pedido B", value: 20_000 },
        ],
        35_000 // declared: 35k, actual: 30k
      );
      expect(flag).not.toBeNull();
      expect(flag?.code).toBe("SOMA_INCONSISTENTE");
    });

    it("returns null when sum matches", () => {
      const flag = detectSomaInconsistente(
        "total",
        [
          { label: "A", value: 100 },
          { label: "B", value: 200 },
        ],
        300
      );
      expect(flag).toBeNull();
    });

    it("respects tolerance", () => {
      const flag = detectSomaInconsistente(
        "total",
        [{ label: "A", value: 100 }],
        100.005,
        0.01
      );
      expect(flag).toBeNull();
    });
  });

  describe("buildAuditReport", () => {
    it("returns clean report for no flags", () => {
      const report = buildAuditReport([]);
      expect(report.totalFlags).toBe(0);
      expect(report.blocked).toBe(false);
      expect(report.summary).toContain("✅");
    });

    it("blocks when critical flags present", () => {
      const flags = [createFlag("CNJ_DIGITO_INVALIDO", ["cnj"])];
      const report = buildAuditReport(flags);
      expect(report.blocked).toBe(true);
      expect(report.bySeverity.CRITICO).toBe(1);
      expect(report.summary).toContain("BLOQUEADA");
    });

    it("does not block for only MEDIO flags", () => {
      const flags = [createFlag("SOMA_INCONSISTENTE", ["total"])];
      const report = buildAuditReport(flags);
      expect(report.blocked).toBe(false);
    });

    it("counts flags by severity correctly", () => {
      const flags = [
        createFlag("CNJ_DIGITO_INVALIDO", ["cnj"]),
        createFlag("CAMPO_CRITICO_VAZIO", ["rec"]),
        createFlag("SOMA_INCONSISTENTE", ["total"]),
        createFlag("FORMATO_INVALIDO", ["data"]),
      ];
      const report = buildAuditReport(flags);
      expect(report.bySeverity.CRITICO).toBe(1);
      expect(report.bySeverity.ALTO).toBe(1);
      expect(report.bySeverity.MEDIO).toBe(2);
      expect(report.totalFlags).toBe(4);
    });
  });

  describe("DEFAULT_CRITICAL_FIELDS", () => {
    it("includes essential process fields", () => {
      const fields = [...DEFAULT_CRITICAL_FIELDS];
      expect(fields).toContain("numero_processo");
      expect(fields).toContain("cnj");
      expect(fields).toContain("reclamante");
      expect(fields).toContain("reclamada");
      expect(fields).toContain("valor_causa");
      expect(fields.length).toBeGreaterThanOrEqual(10);
    });
  });
});
