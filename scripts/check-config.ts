/**
 * Verifica se a configuração do projeto está completa (variáveis de ambiente).
 * Não imprime valores, apenas indica o que está definido ou em falta.
 *
 * Uso: pnpm exec tsx scripts/check-config.ts
 */
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local" });

const required = ["AUTH_SECRET", "POSTGRES_URL"] as const;
const forChat = ["AI_GATEWAY_API_KEY"] as const;
const _forUpload = [
	"BLOB_READ_WRITE_TOKEN",
	"NEXT_PUBLIC_SUPABASE_URL",
	"SUPABASE_SERVICE_ROLE_KEY",
] as const;
const optional = ["AUTH_URL", "REDIS_URL", "SUPABASE_STORAGE_BUCKET"] as const;

function has(name: string): boolean {
	const v = process.env[name];
	return typeof v === "string" && v.trim().length > 0;
}

function check(
	label: string,
	vars: readonly string[],
	required: boolean,
): boolean {
	const missing = vars.filter((name) => !has(name));
	const ok = missing.length === 0;
	if (required && !ok) {
		console.error(`❌ ${label}: em falta ${missing.join(", ")}`);
		return false;
	}
	if (!required && missing.length > 0) {
		console.log(`⚠️  ${label} (opcional): em falta ${missing.join(", ")}`);
		return true;
	}
	console.log(`✅ ${label}`);
	return true;
}

// Supabase: precisa de URL + service role para upload; Blob é alternativa
const hasUpload =
	has("BLOB_READ_WRITE_TOKEN") ||
	(has("NEXT_PUBLIC_SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY"));

function main(): void {
	console.log("Verificação de configuração (.env.local)\n");

	let ok = true;
	ok = check("Obrigatórias (app e guest)", required, true) && ok;
	ok = check("Chat (LLM)", forChat, true) && ok;
	if (hasUpload) {
		console.log("✅ Upload de ficheiros");
	} else {
		console.error(
			"❌ Upload de ficheiros: define BLOB_READ_WRITE_TOKEN ou (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
		);
		ok = false;
	}
	check("Opcionais", optional, false);

	if (
		process.env.POSTGRES_URL?.includes("supabase.co") &&
		process.env.POSTGRES_URL?.includes(":5432")
	) {
		console.error(
			"\n❌ POSTGRES_URL: com Supabase usa o pooler (porta 6543), não 5432.",
		);
		ok = false;
	}

	console.log("");
	if (ok) {
		console.log("Configuração OK. Podes correr: pnpm dev");
	} else {
		console.log("Corrige os itens em falta em .env.local (ver .env.example).");
		process.exit(1);
	}
}

main();
