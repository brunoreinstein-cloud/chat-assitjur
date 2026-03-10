/**
 * Validação das instruções dos agentes built-in contra a estrutura recomendada.
 * Ref.: docs/ESTRUTURA-INSTRUCOES-AGENTES.md
 */

import { getAgentConfig } from "@/lib/ai/agents-registry";
import {
  AGENT_ID_ASSISTENTE_GERAL,
  AGENT_ID_ASSISTJUR_MASTER,
  AGENT_ID_REDATOR_CONTESTACAO,
  AGENT_ID_REVISOR_DEFESAS,
  type AgentId,
} from "@/lib/ai/agents-registry-metadata";

export interface AgentValidationResult {
  agentId: AgentId;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const MIN_INSTRUCTIONS_LENGTH = 80;
const MAX_INSTRUCTIONS_LENGTH = 500_000;

/** Tags XML recomendadas para agentes com fluxo (Revisor, Redator). */
const COMPLEX_AGENT_XML_TAGS = ["role", "constraints"] as const;

/** Tags obrigatórias para o Revisor (padrão de referência). */
const REVISOR_REQUIRED_TAGS = [
  "role",
  "thinking",
  "workflow",
  "output_format",
  "constraints",
  "examples",
] as const;

function hasTag(instructions: string, tag: string): boolean {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  return instructions.includes(open) && instructions.includes(close);
}

function validateInstructionsLength(instructions: string): string[] {
  const err: string[] = [];
  if (instructions.length < MIN_INSTRUCTIONS_LENGTH) {
    err.push(
      `Instruções muito curtas (mín. ${MIN_INSTRUCTIONS_LENGTH} caracteres, atual: ${instructions.length})`
    );
  }
  if (instructions.length > MAX_INSTRUCTIONS_LENGTH) {
    err.push(
      `Instruções muito longas (máx. ${MAX_INSTRUCTIONS_LENGTH} caracteres, atual: ${instructions.length})`
    );
  }
  return err;
}

function validateRevisor(instructions: string): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const tag of REVISOR_REQUIRED_TAGS) {
    if (!hasTag(instructions, tag)) {
      errors.push(`Revisor de Defesas deve conter blocos <${tag}> e </${tag}>`);
    }
  }

  if (
    !(
      instructions.includes("GATE_0.5_RESUMO") &&
      instructions.includes("CONFIRMAR")
    )
  ) {
    warnings.push(
      "Revisor: verificar se fluxo Gate 0.5 e CONFIRMAR/CORRIGIR estão descritos"
    );
  }

  return { errors, warnings };
}

function validateRedator(instructions: string): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const tag of COMPLEX_AGENT_XML_TAGS) {
    if (!hasTag(instructions, tag)) {
      errors.push(`Redator deve conter blocos <${tag}> e </${tag}>`);
    }
  }

  const hasWorkflow =
    hasTag(instructions, "workflow") ||
    /gate|fase|bloco\s*\d/i.test(instructions);
  if (!hasWorkflow) {
    warnings.push(
      "Redator: considerar descrever workflow/gates ou blocos de forma explícita"
    );
  }

  return { errors, warnings };
}

function validateAssistente(instructions: string): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hasScope =
    /PODE|NÃO PODE|pode fazer|não pode/i.test(instructions) ||
    /o que .*(pode|não)/i.test(instructions);
  if (!hasScope) {
    warnings.push(
      "Assistente: recomenda-se explicitar escopo (o que pode / não pode)"
    );
  }

  return { errors, warnings };
}

function validateMaster(instructions: string): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hasIdentity =
    /INSTRUÇÃO MASTER|PARTE 0|identidade|princípio/i.test(instructions) ||
    instructions.trimStart().startsWith("#");
  if (!hasIdentity) {
    warnings.push(
      "Master: recomenda-se identidade ou PARTE 0 no início do documento"
    );
  }

  return { errors, warnings };
}

/**
 * Valida as instruções de um agente built-in.
 * Usa as instruções do registry (ficheiros .ts/.md), não overrides da BD.
 */
export function validateAgentInstructions(
  agentId: AgentId,
  instructions: string
): AgentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!instructions || typeof instructions !== "string") {
    return {
      agentId,
      valid: false,
      errors: ["Instruções ausentes ou inválidas"],
      warnings: [],
    };
  }

  const trimmed = instructions.trim();
  errors.push(...validateInstructionsLength(trimmed));

  switch (agentId) {
    case AGENT_ID_REVISOR_DEFESAS: {
      const r = validateRevisor(trimmed);
      errors.push(...r.errors);
      warnings.push(...r.warnings);
      break;
    }
    case AGENT_ID_REDATOR_CONTESTACAO: {
      const r = validateRedator(trimmed);
      errors.push(...r.errors);
      warnings.push(...r.warnings);
      break;
    }
    case AGENT_ID_ASSISTENTE_GERAL: {
      const r = validateAssistente(trimmed);
      errors.push(...r.errors);
      warnings.push(...r.warnings);
      break;
    }
    case AGENT_ID_ASSISTJUR_MASTER: {
      const r = validateMaster(trimmed);
      errors.push(...r.errors);
      warnings.push(...r.warnings);
      break;
    }
    default: {
      warnings.push("Agente sem regras de validação específicas");
    }
  }

  return {
    agentId,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Valida todos os agentes built-in (instruções dos ficheiros, sem overrides).
 * Usa o registry já carregado (lib/ai/agents-registry.ts).
 */
export function validateAllBuiltInAgents(): AgentValidationResult[] {
  const ids = [
    AGENT_ID_ASSISTENTE_GERAL,
    AGENT_ID_REVISOR_DEFESAS,
    AGENT_ID_REDATOR_CONTESTACAO,
    AGENT_ID_ASSISTJUR_MASTER,
  ] as const;

  return ids.map((id) => {
    const config = getAgentConfig(id);
    const instructions = config.instructions ?? "";
    return validateAgentInstructions(id, instructions);
  });
}
