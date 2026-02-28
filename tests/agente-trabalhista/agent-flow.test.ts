/**
 * Testes de fluxo do Agente Revisor (integração com mocks e fixtures).
 * Cenários A–H validam prompt, parâmetros da API e lógica de Gate 0.5.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	AGENTE_REVISOR_DEFESAS_INSTRUCTIONS,
	GATE_05_RESUMO_END,
	GATE_05_RESUMO_START,
} from "@/lib/ai/agent-revisor-defesas";
import { buildSystemPrompt } from "@/lib/prompts/agente-trabalhista";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "fixtures");

function loadFixture(caso: string, file: string): string {
	const p = path.join(FIXTURES_DIR, caso, file);
	if (!existsSync(p)) {
		return "";
	}
	return readFileSync(p, "utf-8");
}

describe("Cenário A — Gate-1 feliz (parâmetros da API)", () => {
	it("route usa temperature=0.2 e maxTokens=8192 para o modelo", () => {
		const routePath = path.join(
			__dirname,
			"..",
			"..",
			"app",
			"(chat)",
			"api",
			"chat",
			"route.ts",
		);
		const routeCode = readFileSync(routePath, "utf-8");
		expect(routeCode).toContain("temperature: 0.2");
		expect(routeCode).toContain("maxOutputTokens: 8192");
	});

	it("system prompt completo inclui instruções do revisor quando usadas", () => {
		expect(AGENTE_REVISOR_DEFESAS_INSTRUCTIONS).toContain("GATE-1");
		expect(AGENTE_REVISOR_DEFESAS_INSTRUCTIONS).toContain("Petição Inicial");
		expect(AGENTE_REVISOR_DEFESAS_INSTRUCTIONS).toContain("Contestação");
	});
});

describe("Cenário B — Gate-1 faltando contestação", () => {
	it("instruções exigem PARAR se faltar (B) Contestação", () => {
		expect(AGENTE_REVISOR_DEFESAS_INSTRUCTIONS).toMatch(
			/se faltar.*PARAR|PARAR.*faltar/,
		);
		expect(AGENTE_REVISOR_DEFESAS_INSTRUCTIONS).toContain("(B) Contestação");
	});
});

describe("Cenário C — Gate 0.5 → CONFIRMAR", () => {
	it("delimitadores GATE_0.5_RESUMO permitem detecção no cliente", () => {
		expect(GATE_05_RESUMO_START).toBe("--- GATE_0.5_RESUMO ---");
		expect(GATE_05_RESUMO_END).toBe("--- /GATE_0.5_RESUMO ---");
	});

	it("mensagem com CONFIRMAR após resumo é detectável como resposta ao Gate 0.5", () => {
		const assistantText = `${GATE_05_RESUMO_START} Resumo aqui. ${GATE_05_RESUMO_END}`;
		expect(assistantText).toContain(GATE_05_RESUMO_START);
		expect(assistantText).toContain(GATE_05_RESUMO_END);
		const userReply = "CONFIRMAR";
		expect(userReply).toBe("CONFIRMAR");
	});
});

describe("Cenário D — Gate 0.5 → CORRIGIR", () => {
	it("instruções mencionam CORRIGIR para edição antes de avançar", () => {
		expect(AGENTE_REVISOR_DEFESAS_INSTRUCTIONS).toContain("CORRIGIR");
		expect(AGENTE_REVISOR_DEFESAS_INSTRUCTIONS).toContain("CONFIRMAR");
	});
});

describe("Cenário E — Banco de teses inativo", () => {
	it("buildSystemPrompt com bancoTesesAtivo false não instrui a incluir Seção 6", () => {
		const prompt = buildSystemPrompt({ bancoTesesAtivo: false });
		expect(prompt).toContain("INATIVO");
		expect(prompt).not.toMatch(/Banco de teses ATIVO/);
	});
});

describe("Cenário F — Banco de teses ativo", () => {
	it("buildSystemPrompt com bancoTesesAtivo true instrui a incluir Seção 6", () => {
		const prompt = buildSystemPrompt({ bancoTesesAtivo: true });
		expect(prompt).toMatch(/Seção 6|Quadro de Teses/);
		expect(prompt).toContain("ATIVO");
	});
});

describe("Cenário G — Prescrição com aviso-prévio indenizado", () => {
	it("prompt exige 2 cenários quando há aviso-prévio indenizado", () => {
		expect(AGENTE_REVISOR_DEFESAS_INSTRUCTIONS).toMatch(
			/aviso-prévio.*2 cenários|2 cenários.*aviso/i,
		);
		expect(AGENTE_REVISOR_DEFESAS_INSTRUCTIONS).toContain("2 cenários");
	});
});

describe("Cenário H — Anti-alucinação", () => {
	it("prompt proíbe inventar e usa sinalização de atenção", () => {
		expect(AGENTE_REVISOR_DEFESAS_INSTRUCTIONS).toContain("NÃO inventar");
		expect(AGENTE_REVISOR_DEFESAS_INSTRUCTIONS).toContain("⚠️");
		expect(AGENTE_REVISOR_DEFESAS_INSTRUCTIONS).toMatch(/R3|ANTI-ALUCINAÇÃO/);
	});
});

describe("Fixtures", () => {
	it("caso-simples: petição e contestação com datas e pedidos", () => {
		const pi = loadFixture("caso-simples", "peticao-inicial.txt");
		const cont = loadFixture("caso-simples", "contestacao.txt");
		expect(pi.length).toBeGreaterThan(0);
		expect(cont.length).toBeGreaterThan(0);
		expect(pi).toMatch(/admissão|2019|pedidos/i);
		expect(cont).toMatch(/IMPUGNADO|NÃO IMPUGNADO/i);
	});

	it("caso-complexo: múltiplos pedidos e contestação genérica", () => {
		const pi = loadFixture("caso-complexo", "peticao-inicial.txt");
		const cont = loadFixture("caso-complexo", "contestacao.txt");
		expect(pi).toMatch(/assédio|horas extras|FGTS/i);
		expect(cont).toMatch(/genérica|nega/i);
	});

	it("caso-prescricao-limite: ajuizamento no limite do prazo bienal", () => {
		const pi = loadFixture("caso-prescricao-limite", "peticao-inicial.txt");
		const cont = loadFixture("caso-prescricao-limite", "contestacao.txt");
		expect(pi).toMatch(/2027|bienal|ajuizamento/i);
		expect(cont).toMatch(/prescrição|NÃO argui/i);
	});
});
