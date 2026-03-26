import { describe, expect, it } from "vitest";
import {
  createProgressComplete,
  createProgressError,
  createProgressEvent,
  PIPELINE_LABELS,
  PIPELINE_STEPS,
} from "@/lib/ai/pipeline-progress";

describe("pipeline-progress", () => {
  describe("PIPELINE_STEPS", () => {
    it("has all expected steps", () => {
      expect(PIPELINE_STEPS.READING_DOCUMENT).toBe("reading_document");
      expect(PIPELINE_STEPS.EXTRACTING_METADATA).toBe("extracting_metadata");
      expect(PIPELINE_STEPS.MAPPING_LANDMARKS).toBe("mapping_landmarks");
      expect(PIPELINE_STEPS.ANALYZING_PEDIDOS).toBe("analyzing_pedidos");
      expect(PIPELINE_STEPS.AUDITING_FLAGS).toBe("auditing_flags");
      expect(PIPELINE_STEPS.GENERATING_DOCX).toBe("generating_docx");
      expect(PIPELINE_STEPS.GENERATING_XLSX).toBe("generating_xlsx");
      expect(PIPELINE_STEPS.INTAKE_PROCESSO).toBe("intake_processo");
      expect(PIPELINE_STEPS.SEARCHING_JURISPRUDENCIA).toBe(
        "searching_jurisprudencia"
      );
      expect(PIPELINE_STEPS.COMPLETE).toBe("complete");
      expect(PIPELINE_STEPS.ERROR).toBe("error");
    });
  });

  describe("PIPELINE_LABELS", () => {
    it("has label for every step", () => {
      for (const step of Object.values(PIPELINE_STEPS)) {
        expect(PIPELINE_LABELS[step]).toBeDefined();
        expect(PIPELINE_LABELS[step].length).toBeGreaterThan(0);
      }
    });

    it("complete label contains checkmark", () => {
      expect(PIPELINE_LABELS[PIPELINE_STEPS.COMPLETE]).toContain("✅");
    });
  });

  describe("createProgressEvent", () => {
    it("creates event with correct type", () => {
      const event = createProgressEvent("reading_document");
      expect(event.type).toBe("pipeline-progress");
      expect(event.data.step).toBe("reading_document");
      expect(event.data.status).toBe("running");
    });

    it("uses label from PIPELINE_LABELS", () => {
      const event = createProgressEvent("reading_document");
      expect(event.data.label).toBe("Lendo documento...");
    });

    it("supports custom label", () => {
      const event = createProgressEvent("custom_step", {
        label: "My custom label",
      });
      expect(event.data.label).toBe("My custom label");
    });

    it("supports current/total for progress", () => {
      const event = createProgressEvent("analyzing_pedidos", {
        current: 3,
        total: 12,
      });
      expect(event.data.current).toBe(3);
      expect(event.data.total).toBe(12);
    });

    it("supports custom status", () => {
      const event = createProgressEvent("reading_document", {
        status: "done",
      });
      expect(event.data.status).toBe("done");
    });

    it("falls back to step name if no label found", () => {
      const event = createProgressEvent("unknown_step");
      expect(event.data.label).toBe("unknown_step");
    });
  });

  describe("createProgressComplete", () => {
    it("creates complete event", () => {
      const event = createProgressComplete();
      expect(event.data.step).toBe("complete");
      expect(event.data.status).toBe("done");
      expect(event.data.label).toContain("✅");
    });
  });

  describe("createProgressError", () => {
    it("creates error event with default label", () => {
      const event = createProgressError();
      expect(event.data.step).toBe("error");
      expect(event.data.status).toBe("error");
      expect(event.data.label).toContain("Erro");
    });

    it("creates error event with custom label", () => {
      const event = createProgressError("PDF corrompido");
      expect(event.data.label).toBe("PDF corrompido");
    });
  });
});
