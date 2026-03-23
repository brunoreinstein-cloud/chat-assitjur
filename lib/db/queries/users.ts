import "server-only";

import { eq } from "drizzle-orm";
import { type User, user } from "@/lib/db/schema";
import { generateHashedPassword } from "@/lib/db/utils";
import { ChatbotError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";
import { getDb } from "../connection";

export async function getUser(email: string): Promise<User[]> {
  try {
    return await getDb().select().from(user).where(eq(user.email, email));
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "Unknown database error";
    throw new ChatbotError(
      "bad_request:database",
      `Failed to get user by email: ${detail}`
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await getDb()
      .insert(user)
      .values({ email, password: hashedPassword });
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "Unknown database error";
    throw new ChatbotError(
      "bad_request:database",
      `Failed to create user: ${detail}`
    );
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await getDb().insert(user).values({ email, password }).returning({
      id: user.id,
      email: user.email,
    });
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "Unknown database error";
    throw new ChatbotError(
      "bad_request:database",
      `Failed to create guest user: ${detail}`
    );
  }
}

/**
 * Garante que o utilizador existe na tabela User (para satisfazer FK ao criar chat).
 * Se não existir, insere um registo com o id e email da sessão (evita 401 "utilizador inexistente").
 */
export async function ensureUserExistsInDb(
  userId: string,
  email?: string | null
): Promise<void> {
  const existing = await getDb()
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (existing.length > 0) {
    return;
  }
  const emailValue =
    typeof email === "string" && email.trim().length > 0
      ? email.trim().slice(0, 64)
      : `user-${userId}@session`;
  try {
    await getDb()
      .insert(user)
      .values({ id: userId, email: emailValue, password: null })
      .onConflictDoNothing({ target: user.id });
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "Unknown database error";
    throw new ChatbotError(
      "bad_request:database",
      `Failed to ensure user: ${detail}`
    );
  }
}
