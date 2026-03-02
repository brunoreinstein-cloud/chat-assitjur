/**
 * Banco de teses padrão do Redator de Contestações.
 * Lido em tempo de carregamento do módulo e injetado nas instruções do agente
 * (Opção 1: @bancodetese interno, sem depender da base de conhecimento selecionada).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const PATH_BANCO_MD = join(process.cwd(), "lib", "ai", "banco-teses-redator.md");

function loadBancoTeses(): string {
  try {
    return readFileSync(PATH_BANCO_MD, "utf-8").trim();
  } catch {
    return "";
  }
}

/** Conteúdo do ficheiro banco-teses-redator.md (vazio se o ficheiro não existir). */
export const BANCO_TESES_REDATOR_CONTENT = loadBancoTeses();
