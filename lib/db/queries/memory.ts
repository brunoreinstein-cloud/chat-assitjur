import "server-only";

import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { userMemory } from "@/lib/db/schema";
import { getDb, toDatabaseError } from "../connection";

// --- UserMemory (Custom Memory Tool — Cookbook pattern) ---

/**
 * Cria ou atualiza uma memória para o utilizador (upsert por userId + key).
 * Se já existir uma memória com a mesma key, substitui o value e atualiza updatedAt.
 */
export async function saveUserMemory({
  userId,
  key,
  value,
  expiresAt,
}: {
  userId: string;
  key: string;
  value: string;
  expiresAt?: Date | null;
}) {
  try {
    // Upsert atómico: INSERT ... ON CONFLICT (userId, key) DO UPDATE.
    // Requer uniqueIndex em (userId, key) — migração 0032.
    await getDb()
      .insert(userMemory)
      .values({
        userId,
        key,
        value,
        updatedAt: new Date(),
        expiresAt: expiresAt ?? null,
      })
      .onConflictDoUpdate({
        target: [userMemory.userId, userMemory.key],
        set: { value, updatedAt: new Date(), expiresAt: expiresAt ?? null },
      });
  } catch (err) {
    toDatabaseError(err, "Failed to save user memory");
  }
}

/** Lista todas as memórias activas de um utilizador (excluindo expiradas). */
export async function listUserMemories({ userId }: { userId: string }) {
  try {
    const now = new Date();
    return await getDb()
      .select({
        id: userMemory.id,
        key: userMemory.key,
        value: userMemory.value,
        updatedAt: userMemory.updatedAt,
        expiresAt: userMemory.expiresAt,
      })
      .from(userMemory)
      .where(
        and(
          eq(userMemory.userId, userId),
          or(
            isNull(userMemory.expiresAt),
            sql`${userMemory.expiresAt} > ${now}`
          )
        )
      )
      .orderBy(asc(userMemory.updatedAt));
  } catch (err) {
    toDatabaseError(err, "Failed to list user memories");
  }
}

/** Apaga uma memória pelo userId + key. */
export async function deleteUserMemory({
  userId,
  key,
}: {
  userId: string;
  key: string;
}) {
  try {
    await getDb()
      .delete(userMemory)
      .where(and(eq(userMemory.userId, userId), eq(userMemory.key, key)));
  } catch (err) {
    toDatabaseError(err, "Failed to delete user memory");
  }
}
