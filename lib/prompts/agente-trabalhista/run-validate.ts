/**
 * Script para validar o system prompt do Agente Revisor.
 * Uso: pnpm run validate:prompt
 */
import { buildSystemPrompt } from "./index";
import { validateSystemPrompt } from "./validate";

const prompt = buildSystemPrompt();
const result = validateSystemPrompt(prompt);

if (result.valido) {
	process.stdout.write("Prompt válido.\n");
	if (result.avisos.length > 0) {
		process.stdout.write("Avisos:\n");
		for (const a of result.avisos) {
			process.stdout.write(`  ${a}\n`);
		}
	}
	process.stdout.write(
		`Tokens estimados: ${result.estatisticas.totalTokensEstimados}; módulos: ${result.estatisticas.totalModulos}\n`,
	);
} else {
	process.stderr.write("Prompt inválido:\n");
	for (const e of result.erros) {
		process.stderr.write(`  ${e}\n`);
	}
	for (const a of result.avisos) {
		process.stderr.write(`  (aviso) ${a}\n`);
	}
	process.exit(1);
}
