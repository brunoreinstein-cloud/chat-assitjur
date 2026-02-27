import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { auth } from "@/app/(auth)/auth";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { convertToUIMessages, isUUID } from "@/lib/utils";

function DatabaseUnavailable() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Base de dados indisponível</h1>
      <p className="max-w-md text-muted-foreground">
        Não foi possível ligar à base de dados. Verifique se a variável{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
          POSTGRES_URL
        </code>{" "}
        está definida no{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
          .env.local
        </code>{" "}
        e se o PostgreSQL está a correr.
      </p>
      <Link
        className="text-primary underline underline-offset-4 hover:no-underline"
        href="/"
      >
        Voltar ao início
      </Link>
    </div>
  );
}

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <ChatPage params={props.params} />
    </Suspense>
  );
}

async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id === "new" || !isUUID(id)) {
    redirect("/");
  }

  let chat: Awaited<ReturnType<typeof getChatById>>;
  try {
    chat = await getChatById({ id });
  } catch (error) {
    if (error instanceof ChatbotError && error.surface === "database") {
      return <DatabaseUnavailable />;
    }
    throw error;
  }

  if (!chat) {
    redirect("/");
  }

  const session = await auth();

  if (!session) {
    redirect("/api/auth/guest");
  }

  if (chat.visibility === "private") {
    if (!session.user) {
      return notFound();
    }

    if (session.user.id !== chat.userId) {
      return notFound();
    }
  }

  let messagesFromDb: Awaited<ReturnType<typeof getMessagesByChatId>>;
  try {
    messagesFromDb = await getMessagesByChatId({ id });
  } catch (error) {
    if (error instanceof ChatbotError && error.surface === "database") {
      return <DatabaseUnavailable />;
    }
    throw error;
  }

  const uiMessages = convertToUIMessages(messagesFromDb);

  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get("chat-model");

  if (!chatModelFromCookie) {
    return (
      <>
        <Chat
          autoResume={true}
          id={chat.id}
          initialChatModel={DEFAULT_CHAT_MODEL}
          initialMessages={uiMessages}
          initialVisibilityType={chat.visibility}
          isReadonly={session?.user?.id !== chat.userId}
        />
        <DataStreamHandler />
      </>
    );
  }

  return (
    <>
      <Chat
        autoResume={true}
        id={chat.id}
        initialChatModel={chatModelFromCookie.value}
        initialMessages={uiMessages}
        initialVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
      />
      <DataStreamHandler />
    </>
  );
}
