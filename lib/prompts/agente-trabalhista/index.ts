/**
 * Monta o system prompt do Agente Revisor de Defesas Trabalhistas.
 * Ponto de entrada para contexto dinâmico (banco de teses, nome do escritório, data).
 */

import { AGENTE_REVISOR_DEFESAS_INSTRUCTIONS } from "@/lib/ai/agent-revisor-defesas";

export interface AgenteTrabalhistaContext {
  /** Se true, instrui o modelo a incluir a Seção 6 (Quadro de Teses) no Doc 1. */
  bancoTesesAtivo?: boolean;
  /** Nome do escritório para personalização (ex.: cabeçalho). */
  nomeEscritorio?: string;
  /** Data de referência para o parecer (default: hoje). */
  data?: string;
}

const SEPARATOR = "\n---\n";

/**
 * Constrói o system prompt completo. Sem ctx usa apenas as instruções base.
 * Com ctx injeta contexto dinâmico no final (banco de teses, escritório, data).
 */
export function buildSystemPrompt(ctx?: AgenteTrabalhistaContext): string {
  const parts: string[] = [AGENTE_REVISOR_DEFESAS_INSTRUCTIONS];

  const data =
    ctx?.data ??
    new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  const nomeEscritorio = ctx?.nomeEscritorio?.trim();
  const bancoTesesAtivo = ctx?.bancoTesesAtivo === true;

  const dynamic: string[] = [];
  dynamic.push(`## CONTEXTO DINÂMICO\nData de referência: ${data}.`);
  if (nomeEscritorio) {
    dynamic.push(`Escritório: ${nomeEscritorio}.`);
  }
  if (bancoTesesAtivo) {
    dynamic.push(
      "Banco de teses ATIVO: inclua a Seção 6 (Quadro de Teses) no Doc 1 quando aplicável."
    );
  } else {
    dynamic.push(
      "Banco de teses INATIVO: não inclua a Seção 6 nem o Quadro de Teses no Doc 1."
    );
  }

  parts.push(SEPARATOR);
  parts.push(dynamic.join("\n"));

  return parts.join("");
}
