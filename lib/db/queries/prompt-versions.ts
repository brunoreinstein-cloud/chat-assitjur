/**
 * Queries para versionamento de prompts (PromptVersion).
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/connection";
import { promptVersion } from "@/lib/db/schema";

/** Lista todas as versões de um agente, ordenadas por version desc. */
export function getPromptVersions(agentId: string, limit = 50) {
  const db = getDb();
  return db
    .select({
      id: promptVersion.id,
      agentId: promptVersion.agentId,
      version: promptVersion.version,
      label: promptVersion.label,
      modelId: promptVersion.modelId,
      createdAt: promptVersion.createdAt,
      createdBy: promptVersion.createdBy,
      changeNote: promptVersion.changeNote,
    })
    .from(promptVersion)
    .where(eq(promptVersion.agentId, agentId))
    .orderBy(desc(promptVersion.version))
    .limit(limit);
}

/** Busca uma versão específica de um agente (incluindo content). */
export async function getPromptVersion(agentId: string, version: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(promptVersion)
    .where(
      and(
        eq(promptVersion.agentId, agentId),
        eq(promptVersion.version, version)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Retorna o número da versão mais recente para um agente. */
export async function getLatestVersionNumber(agentId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({
      maxVersion: sql<number>`COALESCE(MAX(${promptVersion.version}), 0)`,
    })
    .from(promptVersion)
    .where(eq(promptVersion.agentId, agentId));
  return rows[0]?.maxVersion ?? 0;
}

/** Cria uma nova versão (snapshot) de prompt. Auto-incrementa o número da versão. */
export async function createPromptVersion(data: {
  agentId: string;
  content: string;
  label?: string | null;
  modelId?: string | null;
  toolFlags?: Record<string, boolean> | null;
  createdBy?: string | null;
  changeNote?: string | null;
}) {
  const db = getDb();
  const nextVersion = (await getLatestVersionNumber(data.agentId)) + 1;
  const rows = await db
    .insert(promptVersion)
    .values({
      agentId: data.agentId,
      version: nextVersion,
      content: data.content,
      label: data.label ?? null,
      modelId: data.modelId ?? null,
      toolFlags: data.toolFlags ?? null,
      createdBy: data.createdBy ?? null,
      changeNote: data.changeNote ?? null,
    })
    .returning();
  return rows[0];
}
