"use server";

import { generateText, type UIMessage } from "ai";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { VisibilityType } from "@/components/visibility-selector";
import { titlePrompt } from "@/lib/ai/prompts";
import { getTitleModel } from "@/lib/ai/providers";
import { withLlmCache } from "@/lib/cache/llm-response-cache";
import {
  deleteAllChatsByUserId,
  deleteChatById,
  deleteMessagesByChatIdAfterTimestamp,
  ensureStatementTimeout,
  getChatById,
  getMessageById,
  updateChatVisibilityById,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { getTextFromMessage } from "@/lib/utils";

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set("chat-model", model);
}

/** Máximo de caracteres da primeira mensagem usados para gerar o título (reduz custo de tokens). */
const MAX_TITLE_PROMPT_CHARS = 500;

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  const fullText = getTextFromMessage(message);
  const prompt =
    fullText.length > MAX_TITLE_PROMPT_CHARS
      ? `${fullText.slice(0, MAX_TITLE_PROMPT_CHARS)}...`
      : fullText;
  const { text } = await generateText({
    // Cached: mesmo prompt de primeira mensagem → mesmo título (TTL 24h)
    model: withLlmCache(getTitleModel(), "title", 86_400),
    system: titlePrompt,
    prompt,
  });
  return text
    .replace(/^[#*"\s]+/, "")
    .replace(/["]+$/, "")
    .trim();
}

/** Remove mensagens do chat posteriores à mensagem com o id dado. Se a mensagem não existir, não faz nada (idempotente). */
export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });
  if (!message) {
    return;
  }
  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await updateChatVisibilityById({ chatId, visibility });
}

export type DeleteChatResult =
  | { success: true; deleted: { id: string } }
  | { success: false; error: string };

/** Apaga um chat do utilizador atual. Falha se o chat não existir ou não pertencer à sessão. */
export async function deleteChat(id: string): Promise<DeleteChatResult> {
  try {
    const { auth } = await import("@/app/(auth)/auth");
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "unauthorized" };
    }
    await ensureStatementTimeout();
    const chat = await getChatById({ id });
    if (!chat) {
      return { success: false, error: "not_found" };
    }
    if (chat.userId !== session.user.id) {
      return { success: false, error: "forbidden" };
    }
    const deleted = await deleteChatById({ id });
    revalidatePath("/chat");
    revalidatePath("/");
    return { success: true, deleted: { id: deleted?.id ?? id } };
  } catch (error) {
    if (error instanceof ChatbotError) {
      return { success: false, error: error.type ?? "error" };
    }
    return { success: false, error: "error" };
  }
}

export type DeleteAllChatsResult =
  | { success: true; deletedCount: number }
  | { success: false; error: string };

/** Apaga todos os chats do utilizador atual (histórico). */
export async function deleteAllMyChats(): Promise<DeleteAllChatsResult> {
  try {
    const { auth } = await import("@/app/(auth)/auth");
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "unauthorized" };
    }
    const result = await deleteAllChatsByUserId({ userId: session.user.id });
    revalidatePath("/chat");
    revalidatePath("/");
    return { success: true, deletedCount: result.deletedCount };
  } catch (error) {
    if (error instanceof ChatbotError) {
      return { success: false, error: error.type ?? "error" };
    }
    return { success: false, error: "error" };
  }
}
