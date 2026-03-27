import "server-only";

import { asc, eq, inArray, like, not } from "drizzle-orm";
import {
  chat,
  customAgent,
  knowledgeDocument,
  knowledgeFolder,
  llmUsageRecord,
  message,
  processo,
  stream,
  type User,
  user,
  userCreditBalance,
  userFile,
  userMemory,
  vote,
} from "@/lib/db/schema";
import { generateHashedPassword } from "@/lib/db/utils";
import { ChatbotError } from "@/lib/errors";
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

export interface UserAdminRow {
  id: string;
  email: string | null;
  role: string | null;
}

/** Lista todos os utilizadores não-guest com email e role (para o painel admin). */
export async function listUsersForAdmin(): Promise<UserAdminRow[]> {
  try {
    return await getDb()
      .select({ id: user.id, email: user.email, role: user.role })
      .from(user)
      .where(not(like(user.email, "guest-%")))
      .orderBy(asc(user.email));
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "Unknown database error";
    throw new ChatbotError(
      "bad_request:database",
      `Failed to list users: ${detail}`
    );
  }
}

/** Atualiza o role de um utilizador (admin). */
export async function updateUserRole(
  userId: string,
  role: string | null
): Promise<void> {
  try {
    await getDb().update(user).set({ role }).where(eq(user.id, userId));
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "Unknown database error";
    throw new ChatbotError(
      "bad_request:database",
      `Failed to update user role: ${detail}`
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

/**
 * Exporta todos os dados do utilizador para cumprimento LGPD (direito de portabilidade).
 * Retorna um objeto com todos os registos associados ao userId.
 */
export async function exportUserData(userId: string) {
  const db = getDb();

  const [userData] = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, userId));

  if (!userData) {
    throw new ChatbotError("not_found:database", "Utilizador não encontrado.");
  }

  const userChats = await db.select().from(chat).where(eq(chat.userId, userId));

  const chatIds = userChats.map((c) => c.id);

  const [
    userMessages,
    userProcessos,
    userKnowledgeDocs,
    userFiles,
    userMemories,
    userCredits,
    userAgents,
    usageRecords,
  ] = await Promise.all([
    chatIds.length > 0
      ? db.select().from(message).where(inArray(message.chatId, chatIds))
      : Promise.resolve([]),
    db.select().from(processo).where(eq(processo.userId, userId)),
    db
      .select()
      .from(knowledgeDocument)
      .where(eq(knowledgeDocument.userId, userId)),
    db.select().from(userFile).where(eq(userFile.userId, userId)),
    db.select().from(userMemory).where(eq(userMemory.userId, userId)),
    db
      .select()
      .from(userCreditBalance)
      .where(eq(userCreditBalance.userId, userId)),
    db.select().from(customAgent).where(eq(customAgent.userId, userId)),
    db.select().from(llmUsageRecord).where(eq(llmUsageRecord.userId, userId)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    user: userData,
    chats: userChats,
    messages: userMessages,
    processos: userProcessos,
    knowledgeDocuments: userKnowledgeDocs,
    files: userFiles,
    memories: userMemories,
    creditBalance: userCredits,
    customAgents: userAgents,
    usageRecords,
  };
}

/**
 * Apaga permanentemente o utilizador e TODOS os seus dados (cascade).
 * As tabelas com `onDelete: "cascade"` apagam automaticamente.
 * Para tabelas filho sem cascade direto (Message, Vote, Stream), apagamos manualmente.
 */
export async function deleteUser(
  userId: string
): Promise<{ deleted: boolean }> {
  const db = getDb();

  // Obter chatIds do utilizador para apagar mensagens/votes/streams
  const userChats = await db
    .select({ id: chat.id })
    .from(chat)
    .where(eq(chat.userId, userId));

  const chatIds = userChats.map((c) => c.id);

  // Apagar dados filho que não têm cascade automático
  if (chatIds.length > 0) {
    await Promise.all([
      db.delete(vote).where(inArray(vote.chatId, chatIds)),
      db.delete(message).where(inArray(message.chatId, chatIds)),
      db.delete(stream).where(inArray(stream.chatId, chatIds)),
    ]);
  }

  // Apagar folders de knowledge (self-referencing FK, precisa de cascade manual)
  await db.delete(knowledgeFolder).where(eq(knowledgeFolder.userId, userId));

  // Apagar o utilizador — cascade apaga Chat, Processo, KnowledgeDocument,
  // UserFile, CustomAgent, UserMemory, UserCreditBalance, LlmUsageRecord, Peca
  const [deleted] = await db
    .delete(user)
    .where(eq(user.id, userId))
    .returning({ id: user.id });

  return { deleted: !!deleted };
}
