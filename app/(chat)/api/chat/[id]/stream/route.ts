import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { auth } from "@/app/(auth)/auth";
import { ensureStatementTimeout, getChatById } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  await ensureStatementTimeout();

  const { id } = await context.params;
  const chat = await getChatById({ id });

  if (!chat) {
    return new Response(null, { status: 204 });
  }

  if (chat.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  if (!(chat.activeStreamId && process.env.REDIS_URL)) {
    return new Response(null, { status: 204 });
  }

  const streamContext = getStreamContext();
  if (!streamContext) {
    return new Response(null, { status: 204 });
  }

  const body = await streamContext.resumeExistingStream(chat.activeStreamId);
  return new Response(body, { headers: UI_MESSAGE_STREAM_HEADERS });
}
