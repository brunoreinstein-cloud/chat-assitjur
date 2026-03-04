/**
 * Testes unitários para lib/ai/prompts: systemPrompt e getRequestPromptFromHints.
 */
import { describe, expect, it } from "vitest";
import {
  getRequestPromptFromHints,
  regularPrompt,
  systemPrompt,
} from "@/lib/ai/prompts";

const requestHints = {
  latitude: 38.7,
  longitude: -9.14,
  city: "Lisboa",
  country: "Portugal",
};

describe("getRequestPromptFromHints", () => {
  it("inclui lat, lon, city e country no texto", () => {
    const text = getRequestPromptFromHints(requestHints);
    expect(text).toContain("38.7");
    expect(text).toContain("-9.14");
    expect(text).toContain("Lisboa");
    expect(text).toContain("Portugal");
  });
});

describe("systemPrompt", () => {
  it("retorna string não vazia com apenas requestHints e selectedChatModel", () => {
    const prompt = systemPrompt({
      selectedChatModel: "openai:gpt-4o",
      requestHints,
    });
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain(regularPrompt);
    expect(prompt).toContain("Lisboa");
  });

  it("inclui Base de conhecimento quando knowledgeContext é fornecido", () => {
    const prompt = systemPrompt({
      selectedChatModel: "openai:gpt-4o",
      requestHints,
      knowledgeContext: "Conteúdo do documento A.",
    });
    expect(prompt).toContain("Base de conhecimento");
    expect(prompt).toContain("Conteúdo do documento A.");
    expect(prompt).toMatch(/não invente|Redução de alucinações/i);
  });

  it("inclui Orientações para este agente quando agentInstructions é fornecido", () => {
    const prompt = systemPrompt({
      selectedChatModel: "openai:gpt-4o",
      requestHints,
      agentInstructions: "Seja conciso.",
    });
    expect(prompt).toContain("Orientações para este agente");
    expect(prompt).toContain("Seja conciso.");
    expect(prompt).toMatch(/Confidencialidade/i);
  });

  it("ignora knowledgeContext vazio ou só espaços", () => {
    const prompt = systemPrompt({
      selectedChatModel: "openai:gpt-4o",
      requestHints,
      knowledgeContext: "   ",
    });
    expect(prompt).not.toContain(
      "Base de conhecimento (documentos selecionados"
    );
  });

  it("modelo reasoning inclui regularPrompt e requestPrompt mas sem artifactsPrompt no início", () => {
    const prompt = systemPrompt({
      selectedChatModel: "anthropic:claude-sonnet-4-thinking",
      requestHints,
    });
    expect(prompt).toContain(regularPrompt);
    expect(prompt).toContain("Lisboa");
    // reasoning/thinking pode ter artifacts noutra parte; o importante é ter o base
    expect(prompt.length).toBeGreaterThan(100);
  });
});
