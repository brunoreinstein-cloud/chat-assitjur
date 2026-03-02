import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ArtifactKind } from "@/components/artifact";
import type { VisibilityType } from "@/components/visibility-selector";
import { ChatbotError } from "../errors";
import { generateUUID, isUUID } from "../utils";
import {
  builtInAgentOverride,
  type Chat,
  chat,
  customAgent,
  type DBMessage,
  document,
  knowledgeChunk,
  knowledgeDocument,
  knowledgeFolder,
  llmUsageRecord,
  message,
  type Suggestion,
  stream,
  suggestion,
  type User,
  user,
  userCreditBalance,
  userFile,
  vote,
} from "./schema";
import { generateHashedPassword } from "./utils";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

let dbInstance: ReturnType<typeof drizzle> | null = null;
let clientInstance: ReturnType<typeof postgres> | null = null;

const PUBLIC_SCHEMA_OPT = "options=-c%20search_path%3Dpublic";

function getDb() {
  let url = process.env.POSTGRES_URL;
  if (!url) {
    throw new ChatbotError(
      "bad_request:api",
      "POSTGRES_URL is not set. Add it to .env.local (see .env.example)."
    );
  }
  if (!dbInstance) {
    if (!url.includes("search_path")) {
      url = url.includes("?")
        ? `${url}&${PUBLIC_SCHEMA_OPT}`
        : `${url}?${PUBLIC_SCHEMA_OPT}`;
    }
    clientInstance = postgres(url, {
      max: 1,
      connect_timeout: 10,
    });
    dbInstance = drizzle(clientInstance);
  }
  return dbInstance;
}

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

const DEFAULT_CHAT_AGENT_ID = "revisor-defesas";

export async function saveChat({
  id,
  userId,
  title,
  visibility,
  agentId = DEFAULT_CHAT_AGENT_ID,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
  agentId?: string;
}) {
  try {
    return await getDb()
      .insert(chat)
      .values({
        id,
        createdAt: new Date(),
        userId,
        title,
        visibility,
        agentId: agentId ?? DEFAULT_CHAT_AGENT_ID,
      });
  } catch (error: unknown) {
    const err = error as { code?: string; constraint_name?: string };
    if (err.code === "23505") {
      const existing = await getChatById({ id });
      if (existing?.userId === userId) {
        return existing;
      }
    }
    const isUserFk =
      err.code === "23503" &&
      (err.constraint_name === "Chat_userId_User_id_fk" ||
        (error instanceof Error &&
          error.message.includes("Chat_userId_User_id_fk")));
    if (isUserFk) {
      throw new ChatbotError(
        "unauthorized:auth",
        "A tua sessão já não é válida (utilizador inexistente na base de dados). Inicia sessão novamente."
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    const isDev = process.env.NODE_ENV === "development";
    if (isDev) {
      console.error("[saveChat] Erro na base de dados:", error);
    }
    throw new ChatbotError(
      "bad_request:database",
      isDev ? `Failed to save chat: ${detail}` : "Failed to save chat"
    );
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await getDb().delete(vote).where(eq(vote.chatId, id));
    await getDb().delete(message).where(eq(message.chatId, id));
    await getDb().delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await getDb()
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const userChats = await getDb()
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.userId, userId));

    if (userChats.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIds = userChats.map((c) => c.id);

    await getDb().delete(vote).where(inArray(vote.chatId, chatIds));
    await getDb().delete(message).where(inArray(message.chatId, chatIds));
    await getDb().delete(stream).where(inArray(stream.chatId, chatIds));

    const deletedChats = await getDb()
      .delete(chat)
      .where(eq(chat.userId, userId))
      .returning();

    return { deletedCount: deletedChats.length };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<unknown>) =>
      getDb()
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id)
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Chat[] = [];

    if (startingAfter) {
      const [selectedChat] = await getDb()
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await getDb()
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
    const cause = error instanceof Error ? error.message : String(error);
    throw new ChatbotError("bad_request:database", cause);
  }
}

export async function getChatById({ id }: { id: string }) {
  if (!isUUID(id)) {
    return null;
  }

  try {
    const [selectedChat] = await getDb()
      .select()
      .from(chat)
      .where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new ChatbotError("bad_request:database", cause);
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    return await getDb().insert(message).values(messages);
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save messages");
  }
}

export async function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  try {
    return await getDb()
      .update(message)
      .set({ parts })
      .where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to update message");
  }
}

/**
 * Mensagens do chat por ordem cronológica.
 * Se limit for definido, devolve apenas as últimas N mensagens (reduz carga e contexto).
 */
export async function getMessagesByChatId({
  id,
  limit,
}: {
  id: string;
  limit?: number;
}) {
  try {
    const base = getDb().select().from(message).where(eq(message.chatId, id));

    if (limit !== undefined && limit > 0) {
      const rows = await base.orderBy(desc(message.createdAt)).limit(limit);
      return rows.reverse();
    }
    return await base.orderBy(asc(message.createdAt));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const [existingVote] = await getDb()
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await getDb()
        .update(vote)
        .set({ isUpvoted: type === "up" })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await getDb()
      .insert(vote)
      .values({
        chatId,
        messageId,
        isUpvoted: type === "up",
      });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await getDb().select().from(vote).where(eq(vote.chatId, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await getDb()
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save document");
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await getDb()
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await getDb()
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await getDb()
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp)
        )
      );

    return await getDb()
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    return await getDb().insert(suggestion).values(suggestions);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await getDb()
      .select()
      .from(suggestion)
      .where(eq(suggestion.documentId, documentId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await getDb().select().from(message).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await getDb()
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
      );

    const messageIds = messagesToDelete.map(
      (currentMessage) => currentMessage.id
    );

    if (messageIds.length > 0) {
      await getDb()
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
        );

      return await getDb()
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds))
        );
    }
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    return await getDb()
      .update(chat)
      .set({ visibility })
      .where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    return await getDb().update(chat).set({ title }).where(eq(chat.id, chatId));
  } catch (error) {
    console.warn("Failed to update title for chat", chatId, error);
    return;
  }
}

export async function updateChatActiveStreamId({
  chatId,
  activeStreamId,
}: {
  chatId: string;
  activeStreamId: string | null;
}) {
  try {
    await getDb()
      .update(chat)
      .set({ activeStreamId })
      .where(eq(chat.id, chatId));
  } catch (error) {
    console.warn("Failed to update activeStreamId for chat", chatId, error);
  }
}

export async function updateChatAgentId({
  chatId,
  agentId,
}: {
  chatId: string;
  agentId: string;
}) {
  try {
    await getDb().update(chat).set({ agentId }).where(eq(chat.id, chatId));
  } catch (error) {
    console.warn("Failed to update agentId for chat", chatId, error);
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await getDb()
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await getDb()
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await getDb()
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}

export async function createKnowledgeDocument({
  userId,
  folderId,
  title,
  content,
  id,
}: {
  userId: string;
  folderId?: string | null;
  title: string;
  content: string;
  /** ID fixo (ex.: documento sistema do Redator); omitir para gerar aleatório. */
  id?: string;
}) {
  try {
    const [created] = await getDb()
      .insert(knowledgeDocument)
      .values({
        ...(id ? { id } : {}),
        userId,
        folderId: folderId ?? null,
        title,
        content,
      })
      .returning();
    return created;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create knowledge document"
    );
  }
}

export async function getKnowledgeDocumentsByUserId({
  userId,
  folderId,
}: {
  userId: string;
  /** Se definido, filtra documentos desta pasta (null = raiz). */
  folderId?: string | null;
}) {
  try {
    const conditions = [eq(knowledgeDocument.userId, userId)];
    if (folderId !== undefined) {
      if (folderId === null) {
        conditions.push(isNull(knowledgeDocument.folderId));
      } else {
        conditions.push(eq(knowledgeDocument.folderId, folderId));
      }
    }
    return await getDb()
      .select()
      .from(knowledgeDocument)
      .where(and(...conditions))
      .orderBy(desc(knowledgeDocument.createdAt));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get knowledge documents by user id"
    );
  }
}

export async function getKnowledgeDocumentsRecentByUserId({
  userId,
  limit = 8,
}: {
  userId: string;
  limit?: number;
}) {
  try {
    return await getDb()
      .select()
      .from(knowledgeDocument)
      .where(eq(knowledgeDocument.userId, userId))
      .orderBy(desc(knowledgeDocument.createdAt))
      .limit(Math.min(Math.max(1, limit), 50));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get recent knowledge documents"
    );
  }
}

export async function getKnowledgeDocumentById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [doc] = await getDb()
      .select()
      .from(knowledgeDocument)
      .where(
        and(eq(knowledgeDocument.id, id), eq(knowledgeDocument.userId, userId))
      );
    return doc ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get knowledge document by id"
    );
  }
}

export async function getKnowledgeDocumentsByIds({
  ids,
  userId,
  allowedUserIds,
}: {
  ids: string[];
  userId: string;
  /** Quando definido, permite incluir documentos destes userIds (ex.: documento sistema do Redator). */
  allowedUserIds?: string[];
}) {
  if (ids.length === 0) {
    return [];
  }
  try {
    const userIdCondition = allowedUserIds?.length
      ? or(
          eq(knowledgeDocument.userId, userId),
          inArray(knowledgeDocument.userId, allowedUserIds)
        )
      : eq(knowledgeDocument.userId, userId);
    return await getDb()
      .select()
      .from(knowledgeDocument)
      .where(and(inArray(knowledgeDocument.id, ids), userIdCondition))
      .orderBy(asc(knowledgeDocument.title));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get knowledge documents by ids"
    );
  }
}

export async function updateKnowledgeDocumentById({
  id,
  userId,
  folderId,
  title,
  content,
}: {
  id: string;
  userId: string;
  folderId?: string | null;
  title?: string;
  content?: string;
}) {
  try {
    const updates: Partial<{
      folderId: string | null;
      title: string;
      content: string;
    }> = {};
    if (folderId !== undefined) {
      updates.folderId = folderId ?? null;
    }
    if (title !== undefined) {
      updates.title = title;
    }
    if (content !== undefined) {
      updates.content = content;
    }
    if (Object.keys(updates).length === 0) {
      return (await getKnowledgeDocumentById({ id, userId })) ?? null;
    }
    const [updated] = await getDb()
      .update(knowledgeDocument)
      .set(updates)
      .where(
        and(eq(knowledgeDocument.id, id), eq(knowledgeDocument.userId, userId))
      )
      .returning();
    return updated ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update knowledge document"
    );
  }
}

export async function deleteKnowledgeDocumentById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [deleted] = await getDb()
      .delete(knowledgeDocument)
      .where(
        and(eq(knowledgeDocument.id, id), eq(knowledgeDocument.userId, userId))
      )
      .returning();
    return deleted ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete knowledge document"
    );
  }
}

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
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create user file"
    );
  }
}

export async function getUserFilesByUserId({ userId }: { userId: string }) {
  try {
    return await getDb()
      .select()
      .from(userFile)
      .where(eq(userFile.userId, userId))
      .orderBy(desc(userFile.createdAt));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get user files");
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
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get user file");
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
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get user files by ids"
    );
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
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete user file"
    );
  }
}

export async function getKnowledgeFoldersByUserId({
  userId,
}: {
  userId: string;
}) {
  try {
    return await getDb()
      .select()
      .from(knowledgeFolder)
      .where(eq(knowledgeFolder.userId, userId))
      .orderBy(asc(knowledgeFolder.name));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get knowledge folders by user id"
    );
  }
}

export async function createKnowledgeFolder({
  userId,
  parentId,
  name,
}: {
  userId: string;
  parentId?: string | null;
  name: string;
}) {
  try {
    const [created] = await getDb()
      .insert(knowledgeFolder)
      .values({ userId, parentId: parentId ?? null, name })
      .returning();
    return created;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create knowledge folder"
    );
  }
}

export async function updateKnowledgeFolderById({
  id,
  userId,
  parentId,
  name,
}: {
  id: string;
  userId: string;
  parentId?: string | null;
  name?: string;
}) {
  try {
    const updates: Partial<{
      parentId: string | null;
      name: string;
    }> = {};
    if (parentId !== undefined) {
      updates.parentId = parentId ?? null;
    }
    if (name !== undefined) {
      updates.name = name;
    }
    if (Object.keys(updates).length === 0) {
      const [folder] = await getDb()
        .select()
        .from(knowledgeFolder)
        .where(
          and(eq(knowledgeFolder.id, id), eq(knowledgeFolder.userId, userId))
        );
      return folder ?? null;
    }
    const [updated] = await getDb()
      .update(knowledgeFolder)
      .set(updates)
      .where(
        and(eq(knowledgeFolder.id, id), eq(knowledgeFolder.userId, userId))
      )
      .returning();
    return updated ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update knowledge folder"
    );
  }
}

export async function deleteKnowledgeFolderById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    await getDb()
      .update(knowledgeDocument)
      .set({ folderId: null })
      .where(eq(knowledgeDocument.folderId, id));
    await getDb()
      .update(knowledgeFolder)
      .set({ parentId: null })
      .where(eq(knowledgeFolder.parentId, id));
    const [deleted] = await getDb()
      .delete(knowledgeFolder)
      .where(
        and(eq(knowledgeFolder.id, id), eq(knowledgeFolder.userId, userId))
      )
      .returning();
    return deleted ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete knowledge folder"
    );
  }
}

export interface KnowledgeChunkRow {
  id: string;
  text: string;
  knowledgeDocumentId: string;
  title: string;
}

/**
 * Insere chunks com embeddings na tabela KnowledgeChunk.
 * Usado após criar/atualizar um KnowledgeDocument para RAG.
 */
export async function insertKnowledgeChunks({
  knowledgeDocumentId,
  chunksWithEmbeddings,
}: {
  knowledgeDocumentId: string;
  chunksWithEmbeddings: { text: string; embedding: number[] }[];
}) {
  if (chunksWithEmbeddings.length === 0) {
    return;
  }
  await getDb()
    .insert(knowledgeChunk)
    .values(
      chunksWithEmbeddings.map((c, i) => ({
        knowledgeDocumentId,
        chunkIndex: i,
        text: c.text,
        embedding: c.embedding,
      }))
    );
}

/**
 * Remove todos os chunks de um documento (ex.: antes de reindexar).
 */
export async function deleteChunksByKnowledgeDocumentId(
  knowledgeDocumentId: string
) {
  await getDb()
    .delete(knowledgeChunk)
    .where(eq(knowledgeChunk.knowledgeDocumentId, knowledgeDocumentId));
}

/**
 * Busca os chunks mais relevantes para o embedding da pergunta (cosine similarity).
 * Considera documentos do userId; se allowedUserIds for passado, inclui também documentos desses utilizadores (ex.: doc. sistema).
 */
export async function getRelevantChunks({
  userId,
  documentIds,
  queryEmbedding,
  limit = 12,
  allowedUserIds,
}: {
  userId: string;
  documentIds: string[];
  queryEmbedding: number[];
  limit?: number;
  /** Quando definido, inclui chunks de documentos destes userIds (ex.: Redator banco padrão). */
  allowedUserIds?: string[];
}): Promise<KnowledgeChunkRow[]> {
  if (documentIds.length === 0 || queryEmbedding.length === 0) {
    return [];
  }
  const embeddingStr = `[${queryEmbedding.join(",")}]`;
  const vectorLiteral = `'${embeddingStr.replaceAll("'", "''")}'::vector`;
  const userIdCondition = allowedUserIds?.length
    ? or(
        eq(knowledgeDocument.userId, userId),
        inArray(knowledgeDocument.userId, allowedUserIds)
      )
    : eq(knowledgeDocument.userId, userId);
  const rows = await getDb()
    .select({
      id: knowledgeChunk.id,
      text: knowledgeChunk.text,
      knowledgeDocumentId: knowledgeChunk.knowledgeDocumentId,
      title: knowledgeDocument.title,
    })
    .from(knowledgeChunk)
    .innerJoin(
      knowledgeDocument,
      eq(knowledgeChunk.knowledgeDocumentId, knowledgeDocument.id)
    )
    .where(
      and(
        userIdCondition,
        inArray(knowledgeDocument.id, documentIds),
        sql`${knowledgeChunk.embedding} IS NOT NULL`
      )
    )
    .orderBy(sql`${knowledgeChunk.embedding} <=> ${sql.raw(vectorLiteral)}`)
    .limit(limit);
  return rows as KnowledgeChunkRow[];
}

// --- CustomAgent (agentes personalizados do utilizador) ---

export async function getCustomAgentsByUserId(userId: string) {
  try {
    return await getDb()
      .select()
      .from(customAgent)
      .where(eq(customAgent.userId, userId))
      .orderBy(asc(customAgent.name));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get custom agents by user id"
    );
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
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get custom agent by id"
    );
  }
}

export async function createCustomAgent({
  userId,
  name,
  instructions,
  baseAgentId,
}: {
  userId: string;
  name: string;
  instructions: string;
  baseAgentId?: string | null;
}) {
  try {
    const [created] = await getDb()
      .insert(customAgent)
      .values({
        userId,
        name,
        instructions,
        baseAgentId: baseAgentId ?? null,
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
}: {
  id: string;
  userId: string;
  name?: string;
  instructions?: string;
  baseAgentId?: string | null;
}) {
  try {
    const updates: {
      name?: string;
      instructions?: string;
      baseAgentId?: string | null;
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
    if (Object.keys(updates).length === 0) {
      return (await getCustomAgentById({ id, userId })) ?? null;
    }
    const [updated] = await getDb()
      .update(customAgent)
      .set(updates)
      .where(and(eq(customAgent.id, id), eq(customAgent.userId, userId)))
      .returning();
    return updated ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update custom agent"
    );
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
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete custom agent"
    );
  }
}

// --- Built-in agent overrides (admin painel) ---

/** Devolve todos os overrides de agentes built-in (por agentId). */
export async function getBuiltInAgentOverrides(): Promise<
  Record<string, { instructions: string | null; label: string | null }>
> {
  try {
    const rows = await getDb()
      .select({
        agentId: builtInAgentOverride.agentId,
        instructions: builtInAgentOverride.instructions,
        label: builtInAgentOverride.label,
      })
      .from(builtInAgentOverride);
    const map: Record<
      string,
      { instructions: string | null; label: string | null }
    > = {};
    for (const row of rows) {
      map[row.agentId] = {
        instructions: row.instructions,
        label: row.label,
      };
    }
    return map;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get built-in agent overrides"
    );
  }
}

/** Cria ou atualiza override de um agente built-in (admin). */
export async function upsertBuiltInAgentOverride({
  agentId,
  instructions,
  label,
}: {
  agentId: string;
  instructions?: string | null;
  label?: string | null;
}) {
  try {
    await getDb()
      .insert(builtInAgentOverride)
      .values({
        agentId,
        instructions: instructions ?? null,
        label: label ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: builtInAgentOverride.agentId,
        set: {
          instructions: instructions ?? null,
          label: label ?? null,
          updatedAt: new Date(),
        },
      });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to upsert built-in agent override"
    );
  }
}

// --- Créditos por consumo de LLM (docs/SPEC-CREDITOS-LLM.md) ---

export async function getCreditBalance(userId: string) {
  try {
    const [row] = await getDb()
      .select()
      .from(userCreditBalance)
      .where(eq(userCreditBalance.userId, userId))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get credit balance"
    );
  }
}

/** Devolve o saldo atual; se não existir linha, cria com initialBalance e devolve esse valor. */
export async function getOrCreateCreditBalance(
  userId: string,
  initialBalance: number
) {
  const existing = await getCreditBalance(userId);
  if (existing) {
    return existing.balance;
  }
  try {
    await getDb().insert(userCreditBalance).values({
      userId,
      balance: initialBalance,
      updatedAt: new Date(),
    });
    return initialBalance;
  } catch (err) {
    const code = err as { code?: string };
    if (code?.code === "23505") {
      const row = await getCreditBalance(userId);
      return row?.balance ?? initialBalance;
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create credit balance"
    );
  }
}

export async function deductCreditsAndRecordUsage({
  userId,
  chatId,
  promptTokens,
  completionTokens,
  model,
  creditsConsumed,
}: {
  userId: string;
  chatId: string | null;
  promptTokens: number;
  completionTokens: number;
  model: string | null;
  creditsConsumed: number;
}) {
  try {
    await getDb().insert(llmUsageRecord).values({
      userId,
      chatId,
      promptTokens,
      completionTokens,
      model,
      creditsConsumed,
    });
    const [row] = await getDb()
      .select({ balance: userCreditBalance.balance })
      .from(userCreditBalance)
      .where(eq(userCreditBalance.userId, userId))
      .limit(1);
    if (row) {
      await getDb()
        .update(userCreditBalance)
        .set({
          balance: Math.max(0, row.balance - creditsConsumed),
          updatedAt: new Date(),
        })
        .where(eq(userCreditBalance.userId, userId));
    }
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to deduct credits or record usage"
    );
  }
}

export async function addCreditsToUser({
  userId,
  delta,
}: {
  userId: string;
  delta: number;
}) {
  if (delta <= 0) {
    return;
  }
  try {
    const [row] = await getDb()
      .select()
      .from(userCreditBalance)
      .where(eq(userCreditBalance.userId, userId))
      .limit(1);
    if (row) {
      await getDb()
        .update(userCreditBalance)
        .set({
          balance: sql`${userCreditBalance.balance} + ${delta}`,
          updatedAt: new Date(),
        })
        .where(eq(userCreditBalance.userId, userId));
    } else {
      await getDb().insert(userCreditBalance).values({
        userId,
        balance: delta,
        updatedAt: new Date(),
      });
    }
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to add credits");
  }
}

const RECENT_USAGE_LIMIT = 50;

export async function getRecentUsageByUserId(userId: string, limit = 10) {
  try {
    return await getDb()
      .select({
        id: llmUsageRecord.id,
        chatId: llmUsageRecord.chatId,
        promptTokens: llmUsageRecord.promptTokens,
        completionTokens: llmUsageRecord.completionTokens,
        model: llmUsageRecord.model,
        creditsConsumed: llmUsageRecord.creditsConsumed,
        createdAt: llmUsageRecord.createdAt,
      })
      .from(llmUsageRecord)
      .where(eq(llmUsageRecord.userId, userId))
      .orderBy(desc(llmUsageRecord.createdAt))
      .limit(Math.min(limit, RECENT_USAGE_LIMIT));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get recent usage"
    );
  }
}

/** Lista todos os utilizadores com saldo de créditos (para admin). */
export async function getUsersWithCreditBalances() {
  try {
    const rows = await getDb()
      .select({
        userId: user.id,
        email: user.email,
        balance: userCreditBalance.balance,
        updatedAt: userCreditBalance.updatedAt,
      })
      .from(user)
      .leftJoin(userCreditBalance, eq(user.id, userCreditBalance.userId));
    return rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      balance: r.balance ?? 0,
      updatedAt: r.updatedAt,
    }));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to list users with credits"
    );
  }
}
