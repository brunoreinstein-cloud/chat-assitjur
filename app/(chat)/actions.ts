"use server";

import { generateText, type UIMessage } from "ai";
import { cookies } from "next/headers";
import { signIn } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/visibility-selector";
import { titlePrompt } from "@/lib/ai/prompts";
import { getTitleModel } from "@/lib/ai/providers";
import {
	deleteMessagesByChatIdAfterTimestamp,
	getMessageById,
	updateChatVisibilityById,
} from "@/lib/db/queries";
import { getTextFromMessage } from "@/lib/utils";

/** Aciona o sign-in como visitante (guest). Deve ser usado via form POST para o cookie de sessão ser definido antes do redirect. */
export async function signInAsGuest() {
	await signIn("guest", { redirect: true, redirectTo: "/chat" });
}

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
		model: getTitleModel(),
		system: titlePrompt,
		prompt,
	});
	return text
		.replace(/^[#*"\s]+/, "")
		.replace(/["]+$/, "")
		.trim();
}

export async function deleteTrailingMessages({ id }: { id: string }) {
	const [message] = await getMessageById({ id });

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
