import "server-only";

import { and, asc, count, desc, eq, gt, gte, inArray, lt, type SQL } from "drizzle-orm";
import type { VisibilityType } from "@/components/visibility-selector";
import { ChatbotError } from "@/lib/errors";
import { isUUID } from "@/lib/utils";
import { type Chat, chat, message, stream, vote } from "@/lib/db/schema";
import { getDb, toDatabaseError } from "../connection";

const DEFAULT_CHAT_AGENT_ID = "assistente-geral";

export async function saveChat({
  id,
  userId,
  title,
  visibility,
  agentId = DEFAULT_CHAT_AGENT_ID,
  processoId,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
  agentId?: string;
  processoId?: string | null;
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
        processoId: processoId ?? null,
      });
  } catch (error: unknown) {
    const err = error as {
      code?: string;
      constraint?: string;
      constraint_name?: string;
    };
    if (err.code === "23505") {
      const existing = await getChatById({ id });
      if (existing?.userId === userId) {
        return existing;
      }
    }
    const fkConstraint =
      err.constraint === "Chat_userId_User_id_fk" ||
      err.constraint_name === "Chat_userId_User_id_fk";
    const isUserFk =
      err.code === "23503" &&
      (fkConstraint ||
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
  } catch (err) {
    toDatabaseError(err, "Failed to delete chat by id");
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
  } catch (err) {
    toDatabaseError(err, "Failed to delete all chats by user id");
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
    toDatabaseError(
      error,
      error instanceof Error ? error.message : String(error)
    );
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
    toDatabaseError(
      error,
      error instanceof Error ? error.message : String(error)
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
  } catch (err) {
    toDatabaseError(err, "Failed to update chat visibility by id");
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
  } catch {
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
  } catch {
    // Ignorar falha de atualização de metadado do stream
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
  } catch {
    // Ignorar falha de atualização de agentId
  }
}

export async function linkProcessoToChat({
  chatId,
  processoId,
}: {
  chatId: string;
  processoId: string | null;
}) {
  try {
    await getDb().update(chat).set({ processoId }).where(eq(chat.id, chatId));
  } catch {
    // Ignorar falha de vinculação processo↔chat
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
  } catch (err) {
    toDatabaseError(err, "Failed to get message count by user id");
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
  } catch (err) {
    toDatabaseError(err, "Failed to create stream id");
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
  } catch (err) {
    toDatabaseError(err, "Failed to get stream ids by chat id");
  }
}
