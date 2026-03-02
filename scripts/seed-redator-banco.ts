/**
 * Seed do documento "Banco de Teses Padrão" do Redator em RAG.
 * Usa conexão direta à BD (sem server-only). Correr: pnpm run db:seed-redator-banco
 *
 * Requer: POSTGRES_URL, API de embeddings (AI_GATEWAY_API_KEY ou provider).
 */

import { config } from "dotenv";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  user,
  knowledgeDocument,
  knowledgeChunk,
} from "../lib/db/schema";
import { chunkText, embedChunks } from "../lib/ai/rag";

config({ path: ".env" });
config({ path: ".env.local" });

const REDATOR_BANCO_SYSTEM_USER_ID =
  "00000000-0000-4000-8000-000000000001";
const REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID =
  "00000000-0000-4000-8000-000000000002";
const PATH_BANCO_MD = join(process.cwd(), "lib", "ai", "banco-teses-redator.md");

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error("POSTGRES_URL não definido. Abortar.");
    process.exit(1);
  }

  const connection = postgres(process.env.POSTGRES_URL, { max: 1 });
  const db = drizzle(connection);

  await db
    .insert(user)
    .values({
      id: REDATOR_BANCO_SYSTEM_USER_ID,
      email: "system@redator-banco.internal",
      password: null,
    })
    .onConflictDoNothing({ target: user.id });

  let content: string;
  try {
    content = readFileSync(PATH_BANCO_MD, "utf-8").trim();
  } catch (err) {
    console.error("Ficheiro lib/ai/banco-teses-redator.md não encontrado.", err);
    process.exit(1);
  }
  if (!content) {
    console.error("Conteúdo do banco vazio. Abortar.");
    process.exit(1);
  }

  const title = "Banco de Teses Padrão (Redator)";
  const existing = await db
    .select()
    .from(knowledgeDocument)
    .where(
      and(
        eq(knowledgeDocument.id, REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID),
        eq(knowledgeDocument.userId, REDATOR_BANCO_SYSTEM_USER_ID)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    console.log(
      "Documento banco já existe; a atualizar conteúdo e reindexar chunks..."
    );
    await db
      .update(knowledgeDocument)
      .set({ content })
      .where(
        and(
          eq(knowledgeDocument.id, REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID),
          eq(knowledgeDocument.userId, REDATOR_BANCO_SYSTEM_USER_ID)
        )
      );
    await db
      .delete(knowledgeChunk)
      .where(
        eq(knowledgeChunk.knowledgeDocumentId, REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID)
      );
  } else {
    await db.insert(knowledgeDocument).values({
      id: REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID,
      userId: REDATOR_BANCO_SYSTEM_USER_ID,
      title,
      content,
    });
    console.log("Documento banco criado.");
  }

  const chunks = chunkText(content);
  if (chunks.length === 0) {
    console.log("Nenhum chunk gerado. Terminado.");
    await connection.end();
    process.exit(0);
  }

  const embedded = await embedChunks(chunks);
  if (embedded == null || embedded.length !== chunks.length) {
    console.error(
      "Falha ao gerar embeddings (verifique AI_GATEWAY_API_KEY ou provider)."
    );
    await connection.end();
    process.exit(1);
  }

  await db.insert(knowledgeChunk).values(
    chunks.map((text, i) => ({
      knowledgeDocumentId: REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID,
      chunkIndex: i,
      text,
      embedding: embedded[i]?.embedding ?? [],
    }))
  );

  await connection.end();
  console.log(`✅ Banco de Teses Padrão indexado: ${chunks.length} chunks.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
