import "server-only";

import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { type DBMessage, message, vote } from "@/lib/db/schema";
import { getDb, toDatabaseError } from "../connection";

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    return await getDb().insert(message).values(messages);
  } catch (err) {
    toDatabaseError(err, "Failed to save messages");
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
  } catch (err) {
    toDatabaseError(err, "Failed to update message");
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
  } catch (err) {
    toDatabaseError(err, "Failed to get messages by chat id");
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
  } catch (err) {
    toDatabaseError(err, "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await getDb().select().from(vote).where(eq(vote.chatId, id));
  } catch (err) {
    toDatabaseError(err, "Failed to get votes by chat id");
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await getDb().select().from(message).where(eq(message.id, id));
  } catch (err) {
    toDatabaseError(err, "Failed to get message by id");
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
  } catch (err) {
    toDatabaseError(
      err,
      "Failed to delete messages by chat id after timestamp"
    );
  }
}
