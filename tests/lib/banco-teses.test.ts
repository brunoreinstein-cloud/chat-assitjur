/**
 * Testes unitários para resolveEffectiveKnowledgeIds e buildKnowledgeContext.
 * Cobre a lógica de injeção automática do Banco de Teses (@bancodetese).
 */
import { describe, expect, it } from "vitest";
import { AGENT_ID_REDATOR_CONTESTACAO } from "@/lib/ai/agents-registry";
import { REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID } from "@/lib/ai/redator-banco-rag";
import {
  buildKnowledgeContext,
  MAX_KNOWLEDGE_CONTEXT_CHARS,
  REDATOR_BANCO_UNAVAILABLE_MESSAGE,
  resolveEffectiveKnowledgeIds,
} from "@/lib/ai/resolve-knowledge-ids";

const OTHER_AGENT = "assistente-geral";
const USER_DOC_ID = "aaaaaaaa-0000-0000-0000-000000000001";

// ---------------------------------------------------------------------------
// resolveEffectiveKnowledgeIds
// ---------------------------------------------------------------------------

describe("resolveEffectiveKnowledgeIds", () => {
  it("Redator sem docs → injeta banco", () => {
    expect(
      resolveEffectiveKnowledgeIds(
        undefined,
        AGENT_ID_REDATOR_CONTESTACAO,
        "",
        undefined
      )
    ).toEqual([REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID]);
  });

  it("Redator com docs selecionados → usa docs, não injeta banco", () => {
    expect(
      resolveEffectiveKnowledgeIds(
        [USER_DOC_ID],
        AGENT_ID_REDATOR_CONTESTACAO,
        "",
        undefined
      )
    ).toEqual([USER_DOC_ID]);
  });

  it("outro agente + @bancodetese na mensagem → injeta banco", () => {
    expect(
      resolveEffectiveKnowledgeIds(
        undefined,
        OTHER_AGENT,
        "Quero usar @bancodetese nesta análise",
        undefined
      )
    ).toEqual([REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID]);
  });

  it("outro agente + @bancodetese nas instruções → injeta banco", () => {
    expect(
      resolveEffectiveKnowledgeIds(
        undefined,
        OTHER_AGENT,
        "olá",
        "Use @bancodetese para embasar as teses"
      )
    ).toEqual([REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID]);
  });

  it("docs selecionados + @bancodetese na mensagem → usa docs do utilizador (seleção tem prioridade)", () => {
    expect(
      resolveEffectiveKnowledgeIds(
        [USER_DOC_ID],
        OTHER_AGENT,
        "@bancodetese",
        undefined
      )
    ).toEqual([USER_DOC_ID]);
  });

  it("outro agente sem menção → []", () => {
    expect(
      resolveEffectiveKnowledgeIds(undefined, OTHER_AGENT, "olá", undefined)
    ).toEqual([]);
  });

  it("@BancoDeTese (case-insensitive) → injeta banco", () => {
    expect(
      resolveEffectiveKnowledgeIds(
        undefined,
        OTHER_AGENT,
        "@BancoDeTese",
        undefined
      )
    ).toEqual([REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID]);
  });

  it("@BANCODETESE maiúsculas nas instruções → injeta banco", () => {
    expect(
      resolveEffectiveKnowledgeIds(undefined, OTHER_AGENT, "", "@BANCODETESE")
    ).toEqual([REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID]);
  });

  it("knowledgeDocumentIds vazio ([]) sem menção → []", () => {
    expect(
      resolveEffectiveKnowledgeIds([], OTHER_AGENT, "olá", undefined)
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildKnowledgeContext
// ---------------------------------------------------------------------------

describe("buildKnowledgeContext", () => {
  it("retorna conteúdo quando presente", () => {
    const raw = "<knowledge_base>tese sobre horas extras</knowledge_base>";
    expect(buildKnowledgeContext(raw, [])).toBe(raw);
  });

  it("trunca quando excede MAX_KNOWLEDGE_CONTEXT_CHARS", () => {
    const big = "x".repeat(MAX_KNOWLEDGE_CONTEXT_CHARS + 1000);
    const ctx = buildKnowledgeContext(big, []);
    expect(ctx).toContain("[... base de conhecimento truncada");
    expect(ctx?.length).toBeLessThanOrEqual(
      MAX_KNOWLEDGE_CONTEXT_CHARS + 200 // sufixo de truncagem
    );
  });

  it("banco intencionado mas RAG vazio → usa fallback do ficheiro .md (não retorna mensagem de erro)", () => {
    const ctx = buildKnowledgeContext("", [
      REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID,
    ]);
    // O ficheiro banco-teses-redator.md existe no repo → fallback deve ter conteúdo
    expect(ctx).not.toBe(REDATOR_BANCO_UNAVAILABLE_MESSAGE);
    expect(ctx).toBeTruthy();
    expect(ctx?.length).toBeGreaterThan(100);
  });

  it("banco intencionado mas RAG vazio → fallback contém teses trabalhistas", () => {
    const ctx = buildKnowledgeContext("", [
      REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID,
    ]);
    expect(ctx).toContain("prescrição");
  });

  it("RAG vazio e banco não intencionado → undefined", () => {
    expect(buildKnowledgeContext("", [])).toBeUndefined();
  });

  it("RAG vazio e banco não intencionado (outro doc) → undefined", () => {
    expect(buildKnowledgeContext("", [USER_DOC_ID])).toBeUndefined();
  });
});
