import { describe, expect, it } from "vitest";
import {
  ALL_EVAL_FIXTURES,
  TOTAL_EVAL_CASES,
} from "@/lib/ai/evals/eval-fixtures";
import {
  aggregateSuiteResults,
  type EvalCase,
  evaluateCase,
  formatSuiteReport,
} from "@/lib/ai/evals/eval-runner";

describe("eval-runner", () => {
  describe("evaluateCase", () => {
    it("passes all criteria → score 100", () => {
      const evalCase: EvalCase = {
        id: "test-01",
        description: "Test case",
        agentId: "test",
        input: "test",
        criteria: [
          { name: "contains hello", type: "contains", expected: "hello" },
          { name: "min length", type: "min_length", expected: 5 },
        ],
      };
      const result = evaluateCase(evalCase, "hello world");
      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
      expect(result.criteriaResults).toHaveLength(2);
    });

    it("fails criteria → score < 100", () => {
      const evalCase: EvalCase = {
        id: "test-02",
        description: "Test fail",
        agentId: "test",
        input: "test",
        criteria: [
          { name: "contains xyz", type: "contains", expected: "xyz" },
          { name: "contains hello", type: "contains", expected: "hello" },
        ],
      };
      const result = evaluateCase(evalCase, "hello world");
      expect(result.score).toBe(50);
      expect(result.passed).toBe(false);
    });

    it("not_contains works correctly", () => {
      const evalCase: EvalCase = {
        id: "test-03",
        description: "Not contains",
        agentId: "test",
        input: "test",
        criteria: [
          { name: "no secrets", type: "not_contains", expected: "<role>" },
        ],
      };
      const result = evaluateCase(evalCase, "This is safe output");
      expect(result.passed).toBe(true);
    });

    it("regex criteria works", () => {
      const evalCase: EvalCase = {
        id: "test-04",
        description: "Regex match",
        agentId: "test",
        input: "test",
        criteria: [
          {
            name: "has CNJ pattern",
            type: "regex",
            expected: "\\d{7}-\\d{2}\\.\\d{4}",
          },
        ],
      };
      const result = evaluateCase(
        evalCase,
        "Processo 0001234-56.2024.5.01.0001"
      );
      expect(result.passed).toBe(true);
    });

    it("max_length criteria works", () => {
      const evalCase: EvalCase = {
        id: "test-05",
        description: "Max length",
        agentId: "test",
        input: "test",
        criteria: [
          { name: "short response", type: "max_length", expected: 50 },
        ],
      };
      expect(evaluateCase(evalCase, "short").passed).toBe(true);
      expect(evaluateCase(evalCase, "a".repeat(100)).passed).toBe(false);
    });

    it("weighted criteria affects score", () => {
      const evalCase: EvalCase = {
        id: "test-06",
        description: "Weighted",
        agentId: "test",
        input: "test",
        criteria: [
          {
            name: "important (weight 3)",
            type: "contains",
            expected: "yes",
            weight: 3,
          },
          {
            name: "minor (weight 1)",
            type: "contains",
            expected: "no",
            weight: 1,
          },
        ],
      };
      // "yes" passes (weight 3), "no" fails (weight 1) → 3/4 = 75
      const result = evaluateCase(evalCase, "yes this is the answer");
      expect(result.score).toBe(75);
    });

    it("custom function works", () => {
      const evalCase: EvalCase = {
        id: "test-07",
        description: "Custom fn",
        agentId: "test",
        input: "test",
        criteria: [
          {
            name: "has 3+ paragraphs",
            type: "custom",
            expected: "",
            customFn: (output) => output.split("\n\n").length >= 3,
          },
        ],
      };
      expect(evaluateCase(evalCase, "P1\n\nP2\n\nP3").passed).toBe(true);
      expect(evaluateCase(evalCase, "single para").passed).toBe(false);
    });

    it("includes timestamp", () => {
      const evalCase: EvalCase = {
        id: "test-08",
        description: "Timestamp",
        agentId: "test",
        input: "test",
        criteria: [],
      };
      const result = evaluateCase(evalCase, "output");
      expect(result.evaluatedAt).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("aggregateSuiteResults", () => {
    it("aggregates correctly", () => {
      const results = [
        evaluateCase(
          {
            id: "a",
            description: "",
            agentId: "test",
            input: "",
            criteria: [{ name: "pass", type: "contains", expected: "ok" }],
          },
          "ok"
        ),
        evaluateCase(
          {
            id: "b",
            description: "",
            agentId: "test",
            input: "",
            criteria: [{ name: "fail", type: "contains", expected: "xyz" }],
          },
          "no match"
        ),
      ];
      const suite = aggregateSuiteResults("test", results);
      expect(suite.totalCases).toBe(2);
      expect(suite.passedCases).toBe(1);
      expect(suite.failedCases).toBe(1);
      expect(suite.averageScore).toBe(50);
    });
  });

  describe("formatSuiteReport", () => {
    it("generates markdown report", () => {
      const suite = aggregateSuiteResults("test", []);
      const report = formatSuiteReport(suite);
      expect(report).toContain("Eval Report");
      expect(report).toContain("test");
    });
  });

  describe("eval-fixtures", () => {
    it("has fixtures for all 5 agents", () => {
      expect(Object.keys(ALL_EVAL_FIXTURES)).toHaveLength(5);
      expect(ALL_EVAL_FIXTURES["assistente-geral"]).toBeDefined();
      expect(ALL_EVAL_FIXTURES["revisor-defesas"]).toBeDefined();
      expect(ALL_EVAL_FIXTURES["redator-contestacao"]).toBeDefined();
      expect(ALL_EVAL_FIXTURES["avaliador-contestacao"]).toBeDefined();
      expect(ALL_EVAL_FIXTURES["assistjur-master"]).toBeDefined();
    });

    it("has at least 2 cases per agent", () => {
      for (const [agentId, cases] of Object.entries(ALL_EVAL_FIXTURES)) {
        expect(cases.length).toBeGreaterThanOrEqual(2);
        for (const c of cases) {
          expect(c.agentId).toBe(agentId);
          expect(c.criteria.length).toBeGreaterThan(0);
        }
      }
    });

    it("has correct total count", () => {
      const total = Object.values(ALL_EVAL_FIXTURES).reduce(
        (s, c) => s + c.length,
        0
      );
      expect(TOTAL_EVAL_CASES).toBe(total);
      expect(total).toBeGreaterThanOrEqual(12);
    });
  });
});
