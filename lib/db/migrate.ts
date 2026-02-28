import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env" });
config({ path: ".env.local" });

const runMigrate = async () => {
	// Só saltar na Vercel durante o build (pnpm build). Em local, mesmo com VERCEL no .env.local, correr migrações.
	const isVercelBuild =
		process.env.VERCEL === "1" && process.env.npm_lifecycle_event === "build";
	if (isVercelBuild) {
		console.log(
			"⏭️  Vercel build: skipping migrations (run them separately or in CI)",
		);
		process.exit(0);
	}
	if (!process.env.POSTGRES_URL) {
		console.log("⏭️  POSTGRES_URL not defined, skipping migrations");
		process.exit(0);
	}

	const connection = postgres(process.env.POSTGRES_URL, { max: 1 });
	const db = drizzle(connection);

	console.log("⏳ Running migrations...");

	const start = Date.now();
	await migrate(db, { migrationsFolder: "./lib/db/migrations" });
	const end = Date.now();

	console.log("✅ Migrations completed in", end - start, "ms");
	process.exit(0);
};

runMigrate().catch((err) => {
	console.error("❌ Migration failed");
	console.error(err);
	process.exit(1);
});
