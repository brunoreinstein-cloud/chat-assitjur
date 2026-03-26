import { describe, expect, it } from "vitest";
import {
  AGENT_ID_ASSISTENTE_GERAL,
  AGENT_ID_ASSISTJUR_MASTER,
  AGENT_ID_REDATOR_CONTESTACAO,
  AGENT_ID_REVISOR_DEFESAS,
  AGENT_IDS,
  type BuiltInAgentOverridesMap,
  DEFAULT_AGENT_ID_WHEN_EMPTY,
  getAgentConfig,
  getAgentConfigForCustomAgent,
  getAgentConfigWithOverrides,
} from "@/lib/ai/agents-registry";

describe("agents-registry", () => {
  describe("getAgentConfig", () => {
    it("returns config for each built-in agent", () => {
      for (const id of AGENT_IDS) {
        const config = getAgentConfig(id);
        expect(config).toBeDefined();
        expect(config.id).toBe(id);
        expect(config.instructions).toBeTruthy();
        expect(config.label).toBeTruthy();
      }
    });

    it("returns default agent for unknown agentId", () => {
      const config = getAgentConfig("unknown-agent-id");
      expect(config.id).toBe(DEFAULT_AGENT_ID_WHEN_EMPTY);
    });

    it("returns default agent for empty string", () => {
      const config = getAgentConfig("");
      expect(config.id).toBe(DEFAULT_AGENT_ID_WHEN_EMPTY);
    });

    it("revisor has useRevisorDefesaTools=true", () => {
      const config = getAgentConfig(AGENT_ID_REVISOR_DEFESAS);
      expect(config.useRevisorDefesaTools).toBe(true);
      expect(config.useRedatorContestacaoTool).toBe(false);
    });

    it("redator has useRedatorContestacaoTool=true", () => {
      const config = getAgentConfig(AGENT_ID_REDATOR_CONTESTACAO);
      expect(config.useRedatorContestacaoTool).toBe(true);
      expect(config.useRevisorDefesaTools).toBe(false);
    });

    it("master has pipeline and masterDocuments tools", () => {
      const config = getAgentConfig(AGENT_ID_ASSISTJUR_MASTER);
      expect(config.usePipelineTool).toBe(true);
      expect(config.useMasterDocumentsTool).toBe(true);
      expect(config.temperature).toBe(0.1);
      expect(config.maxOutputTokens).toBe(16_000);
    });

    it("assistente-geral has no specialized tools", () => {
      const config = getAgentConfig(AGENT_ID_ASSISTENTE_GERAL);
      expect(config.useRevisorDefesaTools).toBe(false);
      expect(config.useRedatorContestacaoTool).toBe(false);
      expect(config.usePipelineTool).toBeFalsy();
      expect(config.useMasterDocumentsTool).toBeFalsy();
    });
  });

  describe("getAgentConfigWithOverrides", () => {
    it("returns base config when no overrides", () => {
      const config = getAgentConfigWithOverrides(AGENT_ID_REVISOR_DEFESAS);
      expect(config.id).toBe(AGENT_ID_REVISOR_DEFESAS);
      expect(config.useRevisorDefesaTools).toBe(true);
    });

    it("returns base config when overrides map is null", () => {
      const config = getAgentConfigWithOverrides(
        AGENT_ID_REVISOR_DEFESAS,
        null
      );
      expect(config.id).toBe(AGENT_ID_REVISOR_DEFESAS);
    });

    it("returns base config when overrides map has no entry for agent", () => {
      const overrides: BuiltInAgentOverridesMap = {};
      const config = getAgentConfigWithOverrides(
        AGENT_ID_REVISOR_DEFESAS,
        overrides
      );
      expect(config.id).toBe(AGENT_ID_REVISOR_DEFESAS);
    });

    it("applies instructions override", () => {
      const overrides: BuiltInAgentOverridesMap = {
        [AGENT_ID_REVISOR_DEFESAS]: {
          instructions: "Custom instructions",
          label: null,
        },
      };
      const config = getAgentConfigWithOverrides(
        AGENT_ID_REVISOR_DEFESAS,
        overrides
      );
      expect(config.instructions).toBe("Custom instructions");
      // label should remain original
      expect(config.label).toBe("Revisor de Defesas");
    });

    it("applies label override", () => {
      const overrides: BuiltInAgentOverridesMap = {
        [AGENT_ID_REVISOR_DEFESAS]: {
          instructions: null,
          label: "Custom Label",
        },
      };
      const config = getAgentConfigWithOverrides(
        AGENT_ID_REVISOR_DEFESAS,
        overrides
      );
      expect(config.label).toBe("Custom Label");
    });

    it("does not apply empty string overrides", () => {
      const base = getAgentConfig(AGENT_ID_REVISOR_DEFESAS);
      const overrides: BuiltInAgentOverridesMap = {
        [AGENT_ID_REVISOR_DEFESAS]: {
          instructions: "",
          label: "",
        },
      };
      const config = getAgentConfigWithOverrides(
        AGENT_ID_REVISOR_DEFESAS,
        overrides
      );
      expect(config.instructions).toBe(base.instructions);
      expect(config.label).toBe(base.label);
    });

    it("applies tool flags override", () => {
      const overrides: BuiltInAgentOverridesMap = {
        [AGENT_ID_REVISOR_DEFESAS]: {
          instructions: null,
          label: null,
          toolFlags: { useRevisorDefesaTools: false, useMemoryTools: false },
        },
      };
      const config = getAgentConfigWithOverrides(
        AGENT_ID_REVISOR_DEFESAS,
        overrides
      );
      expect(config.useRevisorDefesaTools).toBe(false);
      expect(config.useMemoryTools).toBe(false);
    });

    it("applies defaultModelId override", () => {
      const overrides: BuiltInAgentOverridesMap = {
        [AGENT_ID_REVISOR_DEFESAS]: {
          instructions: null,
          label: null,
          defaultModelId: "anthropic/claude-opus-4.6",
        },
      };
      const config = getAgentConfigWithOverrides(
        AGENT_ID_REVISOR_DEFESAS,
        overrides
      );
      expect(config.defaultModelId).toBe("anthropic/claude-opus-4.6");
    });
  });

  describe("getAgentConfigForCustomAgent", () => {
    it("creates config for custom agent without base", () => {
      const config = getAgentConfigForCustomAgent({
        id: "custom-uuid",
        name: "My Agent",
        instructions: "Custom instructions",
        baseAgentId: null,
      });
      expect(config.id).toBe("custom-uuid");
      expect(config.label).toBe("My Agent");
      expect(config.instructions).toBe("Custom instructions");
      expect(config.useRevisorDefesaTools).toBe(false);
      expect(config.useRedatorContestacaoTool).toBe(false);
    });

    it("enables revisor tools when baseAgentId is revisor", () => {
      const config = getAgentConfigForCustomAgent({
        id: "custom-uuid",
        name: "Custom Revisor",
        instructions: "Custom instructions",
        baseAgentId: AGENT_ID_REVISOR_DEFESAS,
      });
      expect(config.useRevisorDefesaTools).toBe(true);
      expect(config.useRedatorContestacaoTool).toBe(false);
    });

    it("enables redator tool when baseAgentId is redator", () => {
      const config = getAgentConfigForCustomAgent({
        id: "custom-uuid",
        name: "Custom Redator",
        instructions: "Custom instructions",
        baseAgentId: AGENT_ID_REDATOR_CONTESTACAO,
      });
      expect(config.useRedatorContestacaoTool).toBe(true);
      expect(config.useRevisorDefesaTools).toBe(false);
    });

    it("inherits allowedModelIds from base agent", () => {
      const config = getAgentConfigForCustomAgent({
        id: "custom-uuid",
        name: "Custom Redator",
        instructions: "Custom instructions",
        baseAgentId: AGENT_ID_REDATOR_CONTESTACAO,
      });
      expect(config.allowedModelIds).toBeDefined();
      expect(config.allowedModelIds?.length).toBeGreaterThan(0);
    });
  });

  describe("constants", () => {
    it("AGENT_IDS has 5 agents", () => {
      expect(AGENT_IDS.length).toBe(5);
    });

    it("DEFAULT_AGENT_ID_WHEN_EMPTY is assistente-geral", () => {
      expect(DEFAULT_AGENT_ID_WHEN_EMPTY).toBe("assistente-geral");
    });
  });
});
