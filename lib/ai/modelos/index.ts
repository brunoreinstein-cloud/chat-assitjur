import { readFile } from "node:fs/promises";
import path from "node:path";

/** Títulos que indicam uso do modelo ROTEIRO ADVOGADO */
const ROTEIRO_ADVOGADO_KEYS = ["ROTEIRO_ADVOGADO", "ROTEIRO ADVOGADO"];
/** Títulos que indicam uso do modelo ROTEIRO PREPOSTO */
const ROTEIRO_PREPOSTO_KEYS = ["ROTEIRO_PREPOSTO", "ROTEIRO PREPOSTO"];
/** Títulos que indicam uso do modelo PARECER EXECUTIVO / AVALIAÇÃO */
const PARECER_KEYS = [
	"PARECER_EXECUTIVO",
	"PARECER EXECUTIVO",
	"AVALIACAO_DEFESA",
	"AVALIACAO",
];

const MODELOS_DIR = path.join(process.cwd(), "lib", "ai", "modelos");

export type ModeloRevisor =
	| "roteiro_advogado"
	| "roteiro_preposto"
	| "parecer_executivo"
	| null;

/**
 * Indica qual modelo de documento do Revisor (se algum) deve ser usado para o título dado.
 */
export function getModeloRevisorFromTitle(title: string): ModeloRevisor {
	const upper = title.toUpperCase();
	if (
		ROTEIRO_ADVOGADO_KEYS.some((k) => upper.includes(k.replaceAll(" ", "_")))
	) {
		return "roteiro_advogado";
	}
	if (
		ROTEIRO_PREPOSTO_KEYS.some((k) => upper.includes(k.replaceAll(" ", "_")))
	) {
		return "roteiro_preposto";
	}
	if (PARECER_KEYS.some((k) => upper.includes(k.replaceAll(" ", "_")))) {
		return "parecer_executivo";
	}
	return null;
}

const MODELO_FILES: Record<Exclude<ModeloRevisor, null>, string> = {
	roteiro_advogado: "MODELO_ROTEIRO_ADVOGADO.txt",
	roteiro_preposto: "MODELO_ROTEIRO_PREPOSTO.txt",
	parecer_executivo: "MODELO_PARECER_EXECUTIVO.txt",
};

/** Cache em memória dos templates (evita I/O repetido na mesma instância; útil em FASE B com 3 docs). */
const templateCache = new Map<Exclude<ModeloRevisor, null>, string | null>();

/**
 * Carrega o texto do modelo para o tipo indicado. Devolve null se não existir ou falhar.
 * Usa cache em memória para evitar leituras repetidas do disco.
 */
export async function loadModeloRevisor(
	tipo: Exclude<ModeloRevisor, null>,
): Promise<string | null> {
	const cached = templateCache.get(tipo);
	if (cached !== undefined) {
		return cached;
	}
	const file = MODELO_FILES[tipo];
	const filePath = path.join(MODELOS_DIR, file);
	try {
		const content = await readFile(filePath, "utf-8");
		templateCache.set(tipo, content);
		return content;
	} catch {
		templateCache.set(tipo, null);
		return null;
	}
}
