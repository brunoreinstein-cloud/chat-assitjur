import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { userFile } from "@/lib/db/schema";
import { getDb, toDatabaseError } from "../connection";

export async function createUserFile({
  userId,
  pathname,
  url,
  filename,
  contentType,
  extractedTextCache,
}: {
  userId: string;
  pathname: string;
  url: string;
  filename: string;
  contentType: string;
  extractedTextCache?: string | null;
}) {
  try {
    const [created] = await getDb()
      .insert(userFile)
      .values({
        userId,
        pathname,
        url,
        filename,
        contentType,
        extractedTextCache: extractedTextCache ?? null,
      })
      .returning();
    return created;
  } catch (err) {
    toDatabaseError(err, "Failed to create user file");
  }
}

export async function getUserFilesByUserId({ userId }: { userId: string }) {
  try {
    return await getDb()
      .select()
      .from(userFile)
      .where(eq(userFile.userId, userId))
      .orderBy(desc(userFile.createdAt));
  } catch (err) {
    toDatabaseError(err, "Failed to get user files");
  }
}

export async function getUserFileById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await getDb()
      .select()
      .from(userFile)
      .where(and(eq(userFile.id, id), eq(userFile.userId, userId)));
    return row ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to get user file");
  }
}

export async function getUserFilesByIds({
  ids,
  userId,
}: {
  ids: string[];
  userId: string;
}) {
  if (ids.length === 0) {
    return [];
  }
  try {
    return await getDb()
      .select()
      .from(userFile)
      .where(and(eq(userFile.userId, userId), inArray(userFile.id, ids)));
  } catch (err) {
    toDatabaseError(err, "Failed to get user files by ids");
  }
}

export async function deleteUserFileById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [deleted] = await getDb()
      .delete(userFile)
      .where(and(eq(userFile.id, id), eq(userFile.userId, userId)))
      .returning();
    return deleted ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to delete user file");
  }
}

/** Salva o resumo estruturado extraído por IA (PI/Contestação) no ficheiro do utilizador. */
export async function updateUserFileStructuredSummary({
  id,
  structuredSummary,
}: {
  id: string;
  structuredSummary: string;
}): Promise<void> {
  await getDb()
    .update(userFile)
    .set({ structuredSummary })
    .where(eq(userFile.id, id));
}
