import { describe, expect, it } from "vitest";
import {
  buildQualityReport,
  computeAgentMetrics,
  formatQualityReport,
  type TaskTelemetryRecord,
} from "@/lib/ai/evals/quality-report";

function makeRecord(
  overrides: Partial<TaskTelemetryRecord> = {}
): TaskTelemetryRecord {
  return {
    id: "test-id",
    processoId: null,
    taskId: "revisor-defesas",
    chatId: "chat-1",
    status: "complete",
    creditsUsed: 10,
    startedAt: new Date(),
    completedAt: new Date(),
    result: {
      latencyMs: 5000,
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      stepsCount: 3,
      toolsUsed: ["buscarNoProcesso", "createRevisorDefesaDocuments"],
      finishReason: "stop",
      modelId: "claude-3-5-sonnet",
    },
    ...overrides,
  };
}

describe("quality-report", () => {
  describe("computeAgentMetrics", () => {
    it("computes metrics for completed records", () => {
      const records = [
        makeRecord({
          result: {
            latencyMs: 3000,
            totalTokens: 1000,
            stepsCount: 2,
            toolsUsed: ["toolA"],
            finishReason: "stop",
            modelId: "claude",
          },
        }),
        makeRecord({
          result: {
            latencyMs: 5000,
            totalTokens: 2000,
            stepsCount: 4,
            toolsUsed: ["toolA", "toolB"],
            finishReason: "stop",
            modelId: "claude",
          },
        }),
      ];
      const metrics = computeAgentMetrics("revisor", records);

      expect(metrics.totalExecutions).toBe(2);
      expect(metrics.completedExecutions).toBe(2);
      expect(metrics.errorExecutions).toBe(0);
      expect(metrics.avgLatencyMs).toBe(4000);
      expect(metrics.avgTokens).toBe(1500);
      expect(metrics.totalTokens).toBe(3000);
      expect(metrics.avgSteps).toBe(3);
    });

    it("counts errors separately", () => {
      const records = [
        makeRecord(),
        makeRecord({ status: "error", result: null }),
      ];
      const metrics = computeAgentMetrics("test", records);
      expect(metrics.errorExecutions).toBe(1);
      expect(metrics.completedExecutions).toBe(1);
    });

    it("computes top tools", () => {
      const records = [
        makeRecord({
          result: {
            toolsUsed: ["A", "B", "A"],
            latencyMs: 1,
            totalTokens: 1,
            stepsCount: 1,
            finishReason: "stop",
            modelId: "m",
          },
        }),
        makeRecord({
          result: {
            toolsUsed: ["A", "C"],
            latencyMs: 1,
            totalTokens: 1,
            stepsCount: 1,
            finishReason: "stop",
            modelId: "m",
          },
        }),
      ];
      const metrics = computeAgentMetrics("test", records);
      expect(metrics.topTools[0].tool).toBe("A");
      expect(metrics.topTools[0].count).toBe(3);
    });

    it("handles empty records", () => {
      const metrics = computeAgentMetrics("empty", []);
      expect(metrics.totalExecutions).toBe(0);
      expect(metrics.avgLatencyMs).toBe(0);
      expect(metrics.avgTokens).toBe(0);
    });

    it("aggregates credits", () => {
      const records = [
        makeRecord({ creditsUsed: 10 }),
        makeRecord({ creditsUsed: 20 }),
      ];
      const metrics = computeAgentMetrics("test", records);
      expect(metrics.totalCredits).toBe(30);
    });

    it("tracks finish reason distribution", () => {
      const records = [
        makeRecord({
          result: {
            finishReason: "stop",
            latencyMs: 1,
            totalTokens: 1,
            stepsCount: 1,
            toolsUsed: [],
            modelId: "m",
          },
        }),
        makeRecord({
          result: {
            finishReason: "stop",
            latencyMs: 1,
            totalTokens: 1,
            stepsCount: 1,
            toolsUsed: [],
            modelId: "m",
          },
        }),
        makeRecord({
          result: {
            finishReason: "length",
            latencyMs: 1,
            totalTokens: 1,
            stepsCount: 1,
            toolsUsed: [],
            modelId: "m",
          },
        }),
      ];
      const metrics = computeAgentMetrics("test", records);
      expect(metrics.finishReasons.stop).toBe(2);
      expect(metrics.finishReasons.length).toBe(1);
    });
  });

  describe("buildQualityReport", () => {
    it("builds report with multiple agents", () => {
      const records = [
        makeRecord({ taskId: "revisor-defesas" }),
        makeRecord({ taskId: "revisor-defesas" }),
        makeRecord({ taskId: "redator-contestacao" }),
      ];
      const report = buildQualityReport(records, {
        from: new Date("2026-01-01"),
        to: new Date("2026-03-26"),
      });

      expect(report.byAgent).toHaveLength(2);
      expect(report.totals.executions).toBe(3);
      expect(report.generatedAt).toBeDefined();
    });

    it("calculates error rate", () => {
      const records = [
        makeRecord(),
        makeRecord({ status: "error", result: null }),
      ];
      const report = buildQualityReport(records, {
        from: new Date(),
        to: new Date(),
      });
      expect(report.totals.errorRate).toBe(0.5);
    });

    it("handles empty records", () => {
      const report = buildQualityReport([], {
        from: new Date(),
        to: new Date(),
      });
      expect(report.totals.executions).toBe(0);
      expect(report.totals.errorRate).toBe(0);
    });
  });

  describe("formatQualityReport", () => {
    it("generates markdown", () => {
      const report = buildQualityReport([makeRecord()], {
        from: new Date("2026-01-01"),
        to: new Date("2026-03-26"),
      });
      const md = formatQualityReport(report);
      expect(md).toContain("Relatório de Qualidade");
      expect(md).toContain("revisor-defesas");
      expect(md).toContain("Por Agente");
    });
  });
});
