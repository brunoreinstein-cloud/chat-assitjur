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
	lt,
	type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ArtifactKind } from "@/components/artifact";
import type { VisibilityType } from "@/components/visibility-selector";
import { ChatbotError } from "../errors";
import { generateUUID, isUUID } from "../utils";
import {
	type Chat,
	chat,
	type DBMessage,
	document,
	knowledgeDocument,
	message,
	type Suggestion,
	stream,
	suggestion,
	type User,
	user,
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
			"POSTGRES_URL is not set. Add it to .env.local (see .env.example).",
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
			`Failed to get user by email: ${detail}`,
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
			`Failed to create user: ${detail}`,
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
			`Failed to create guest user: ${detail}`,
		);
	}
}

export async function saveChat({
	id,
	userId,
	title,
	visibility,
}: {
	id: string;
	userId: string;
	title: string;
	visibility: VisibilityType;
}) {
	try {
		return await getDb().insert(chat).values({
			id,
			createdAt: new Date(),
			userId,
			title,
			visibility,
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
				"A tua sessão já não é válida (utilizador inexistente na base de dados). Inicia sessão novamente.",
			);
		}
		const detail = error instanceof Error ? error.message : String(error);
		const isDev = process.env.NODE_ENV === "development";
		if (isDev) {
			console.error("[saveChat] Erro na base de dados:", error);
		}
		throw new ChatbotError(
			"bad_request:database",
			isDev ? `Failed to save chat: ${detail}` : "Failed to save chat",
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
			"Failed to delete chat by id",
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
			"Failed to delete all chats by user id",
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
						: eq(chat.userId, id),
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
					`Chat with id ${startingAfter} not found`,
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
					`Chat with id ${endingBefore} not found`,
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
			"Failed to get messages by chat id",
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
			"Failed to get votes by chat id",
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
			"Failed to get documents by id",
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
			"Failed to get document by id",
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
					gt(suggestion.documentCreatedAt, timestamp),
				),
			);

		return await getDb()
			.delete(document)
			.where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
			.returning();
	} catch (_error) {
		throw new ChatbotError(
			"bad_request:database",
			"Failed to delete documents by id after timestamp",
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
			"Failed to save suggestions",
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
			"Failed to get suggestions by document id",
		);
	}
}

export async function getMessageById({ id }: { id: string }) {
	try {
		return await getDb().select().from(message).where(eq(message.id, id));
	} catch (_error) {
		throw new ChatbotError(
			"bad_request:database",
			"Failed to get message by id",
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
				and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
			);

		const messageIds = messagesToDelete.map(
			(currentMessage) => currentMessage.id,
		);

		if (messageIds.length > 0) {
			await getDb()
				.delete(vote)
				.where(
					and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
				);

			return await getDb()
				.delete(message)
				.where(
					and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
				);
		}
	} catch (_error) {
		throw new ChatbotError(
			"bad_request:database",
			"Failed to delete messages by chat id after timestamp",
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
			"Failed to update chat visibility by id",
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

export async function getMessageCountByUserId({
	id,
	differenceInHours,
}: {
	id: string;
	differenceInHours: number;
}) {
	try {
		const twentyFourHoursAgo = new Date(
			Date.now() - differenceInHours * 60 * 60 * 1000,
		);

		const [stats] = await getDb()
			.select({ count: count(message.id) })
			.from(message)
			.innerJoin(chat, eq(message.chatId, chat.id))
			.where(
				and(
					eq(chat.userId, id),
					gte(message.createdAt, twentyFourHoursAgo),
					eq(message.role, "user"),
				),
			)
			.execute();

		return stats?.count ?? 0;
	} catch (_error) {
		throw new ChatbotError(
			"bad_request:database",
			"Failed to get message count by user id",
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
			"Failed to create stream id",
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
			"Failed to get stream ids by chat id",
		);
	}
}

export async function createKnowledgeDocument({
	userId,
	title,
	content,
}: {
	userId: string;
	title: string;
	content: string;
}) {
	try {
		const [created] = await getDb()
			.insert(knowledgeDocument)
			.values({ userId, title, content })
			.returning();
		return created;
	} catch (_error) {
		throw new ChatbotError(
			"bad_request:database",
			"Failed to create knowledge document",
		);
	}
}

export async function getKnowledgeDocumentsByUserId({
	userId,
}: {
	userId: string;
}) {
	try {
		return await getDb()
			.select()
			.from(knowledgeDocument)
			.where(eq(knowledgeDocument.userId, userId))
			.orderBy(desc(knowledgeDocument.createdAt));
	} catch (_error) {
		throw new ChatbotError(
			"bad_request:database",
			"Failed to get knowledge documents by user id",
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
				and(eq(knowledgeDocument.id, id), eq(knowledgeDocument.userId, userId)),
			);
		return doc ?? null;
	} catch (_error) {
		throw new ChatbotError(
			"bad_request:database",
			"Failed to get knowledge document by id",
		);
	}
}

export async function getKnowledgeDocumentsByIds({
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
			.from(knowledgeDocument)
			.where(
				and(
					inArray(knowledgeDocument.id, ids),
					eq(knowledgeDocument.userId, userId),
				),
			)
			.orderBy(asc(knowledgeDocument.title));
	} catch (_error) {
		throw new ChatbotError(
			"bad_request:database",
			"Failed to get knowledge documents by ids",
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
				and(eq(knowledgeDocument.id, id), eq(knowledgeDocument.userId, userId)),
			)
			.returning();
		return deleted ?? null;
	} catch (_error) {
		throw new ChatbotError(
			"bad_request:database",
			"Failed to delete knowledge document",
		);
	}
}
