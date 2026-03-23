import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { builtInAgentOverride, customAgent } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { getDb, toDatabaseError } from "../connection";

// --- CustomAgent (agentes personalizados do utilizador) ---

export async function getCustomAgentsByUserId(userId: string) {
  try {
    return await getDb()
      .select()
      .from(customAgent)
      .where(eq(customAgent.userId, userId))
      .orderBy(asc(customAgent.name));
  } catch (err) {
    toDatabaseError(err, "Failed to get custom agents by user id");
  }
}

export async function getCustomAgentById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await getDb()
      .select()
      .from(customAgent)
      .where(and(eq(customAgent.id, id), eq(customAgent.userId, userId)))
      .limit(1);
    return row ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to get custom agent by id");
  }
}

export async function createCustomAgent({
  userId,
  name,
  instructions,
  baseAgentId,
  knowledgeDocumentIds,
}: {
  userId: string;
  name: string;
  instructions: string;
  baseAgentId?: string | null;
  knowledgeDocumentIds?: string[];
}) {
  try {
    const [created] = await getDb()
      .insert(customAgent)
      .values({
        userId,
        name,
        instructions,
        baseAgentId: baseAgentId ?? null,
        knowledgeDocumentIds: knowledgeDocumentIds ?? [],
      })
      .returning();
    if (!created) {
      throw new ChatbotError(
        "bad_request:database",
        "Failed to create custom agent"
      );
    }
    return created;
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create custom agent"
    );
  }
}

export async function updateCustomAgentById({
  id,
  userId,
  name,
  instructions,
  baseAgentId,
  knowledgeDocumentIds,
}: {
  id: string;
  userId: string;
  name?: string;
  instructions?: string;
  baseAgentId?: string | null;
  knowledgeDocumentIds?: string[];
}) {
  try {
    const updates: {
      name?: string;
      instructions?: string;
      baseAgentId?: string | null;
      knowledgeDocumentIds?: string[];
    } = {};
    if (name !== undefined) {
      updates.name = name;
    }
    if (instructions !== undefined) {
      updates.instructions = instructions;
    }
    if (baseAgentId !== undefined) {
      updates.baseAgentId = baseAgentId ?? null;
    }
    if (knowledgeDocumentIds !== undefined) {
      updates.knowledgeDocumentIds = knowledgeDocumentIds;
    }
    if (Object.keys(updates).length === 0) {
      return (await getCustomAgentById({ id, userId })) ?? null;
    }
    const [updated] = await getDb()
      .update(customAgent)
      .set(updates)
      .where(and(eq(customAgent.id, id), eq(customAgent.userId, userId)))
      .returning();
    return updated ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to update custom agent");
  }
}

export async function deleteCustomAgentById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [deleted] = await getDb()
      .delete(customAgent)
      .where(and(eq(customAgent.id, id), eq(customAgent.userId, userId)))
      .returning();
    return deleted ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to delete custom agent");
  }
}

// --- Built-in agent overrides (admin painel) ---

/** Devolve todos os overrides de agentes built-in (por agentId). */
export async function getBuiltInAgentOverrides(): Promise<
  Record<
    string,
    {
      instructions: string | null;
      label: string | null;
      defaultModelId?: string | null;
      toolFlags?: Record<string, boolean> | null;
    }
  >
> {
  try {
    const rows = await getDb()
      .select({
        agentId: builtInAgentOverride.agentId,
        instructions: builtInAgentOverride.instructions,
        label: builtInAgentOverride.label,
        defaultModelId: builtInAgentOverride.defaultModelId,
        toolFlags: builtInAgentOverride.toolFlags,
      })
      .from(builtInAgentOverride);
    const map: Record<
      string,
      {
        instructions: string | null;
        label: string | null;
        defaultModelId?: string | null;
        toolFlags?: Record<string, boolean> | null;
      }
    > = {};
    for (const row of rows) {
      map[row.agentId] = {
        instructions: row.instructions,
        label: row.label,
        defaultModelId: row.defaultModelId,
        toolFlags: row.toolFlags as Record<string, boolean> | null,
      };
    }
    return map;
  } catch (err) {
    toDatabaseError(err, "Failed to get built-in agent overrides");
  }
}

/** Cria ou atualiza override de um agente built-in (admin).
 *
 * Apenas os campos explicitamente fornecidos são actualizados na BD;
 * campos `undefined` não sobrescrevem valores existentes (update parcial seguro).
 */
export async function upsertBuiltInAgentOverride({
  agentId,
  instructions,
  label,
  defaultModelId,
  toolFlags,
}: {
  agentId: string;
  instructions?: string | null;
  label?: string | null;
  defaultModelId?: string | null;
  toolFlags?: Record<string, boolean> | null;
}) {
  try {
    // Construir o SET parcial: só actualiza os campos fornecidos.
    // Campos undefined ficam intocados na BD (sem risco de clobber).
    const partialSet: Partial<typeof builtInAgentOverride.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (instructions !== undefined) {
      partialSet.instructions = instructions;
    }
    if (label !== undefined) {
      partialSet.label = label;
    }
    if (defaultModelId !== undefined) {
      partialSet.defaultModelId = defaultModelId;
    }
    if (toolFlags !== undefined) {
      partialSet.toolFlags = toolFlags as Record<string, boolean>;
    }

    await getDb()
      .insert(builtInAgentOverride)
      .values({
        agentId,
        instructions: instructions ?? null,
        label: label ?? null,
        defaultModelId: defaultModelId ?? null,
        toolFlags: (toolFlags ?? null) as Record<string, boolean> | null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: builtInAgentOverride.agentId,
        set: partialSet,
      });
  } catch (err) {
    toDatabaseError(err, "Failed to upsert built-in agent override");
  }
}
