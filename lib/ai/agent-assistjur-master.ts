/**
 * Agente AssistJur.IA Master — Análise processual trabalhista unificada (14 módulos).
 * Instruções carregadas de agent-assistjur-master-instructions.md.
 * Uso: relatórios processuais, carta de prognóstico, relatório master, DPSP, OBF, auditoria, eLaw, etc.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const INSTRUCTIONS_PATH = join(
  process.cwd(),
  "lib/ai/agent-assistjur-master-instructions.md"
);

function loadInstructions(): string {
  try {
    return readFileSync(INSTRUCTIONS_PATH, "utf-8");
  } catch {
    // Fallback se o ficheiro não existir (ex.: build/edge)
    return "# AssistJur.IA Master\n\nAgente unificado de análise processual trabalhista (BR Consultoria). Ativação por comando: /relatorio-master, /carta-prognostico, /relatorio-dpsp, /obf, /auditoria, /cadastro-elaw, /encerramento, /aquisicao-creditos, /analise-tst, /modelo-br, /completo, /extracao-calculos, /ajuda. Princípio: melhor vazio que errado. Resposta no chat: apenas confirmação e links dos documentos gerados; relatório nunca no chat. Revisão humana obrigatória.";
  }
}

export const AGENTE_ASSISTJUR_MASTER_INSTRUCTIONS = loadInstructions();
