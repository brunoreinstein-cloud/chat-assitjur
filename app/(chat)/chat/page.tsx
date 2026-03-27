import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { auth } from "@/app/(auth)/auth";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import {
  AGENT_IDS,
  DEFAULT_AGENT_ID_WHEN_EMPTY,
} from "@/lib/ai/agents-registry";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { generateUUID } from "@/lib/utils";

type PageProps = Readonly<{ searchParams: Promise<{ agent?: string }> }>;

export default function NewChatRoute({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <NewChatPage searchParams={searchParams} />
    </Suspense>
  );
}

async function NewChatPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const resolved = await searchParams;
  const agentParam = resolved?.agent;
  const initialAgentId =
    agentParam && AGENT_IDS.includes(agentParam as (typeof AGENT_IDS)[number])
      ? agentParam
      : DEFAULT_AGENT_ID_WHEN_EMPTY;

  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get("chat-model");
  const id = generateUUID();

  if (!modelIdFromCookie) {
    return (
      <>
        <Chat
          autoResume={false}
          id={id}
          initialAgentId={initialAgentId}
          initialChatModel={DEFAULT_CHAT_MODEL}
          initialMessages={[]}
          initialVisibilityType="private"
          isReadonly={false}
          key={id}
        />
        <DataStreamHandler />
      </>
    );
  }

  return (
    <>
      <Chat
        autoResume={false}
        id={id}
        initialAgentId={initialAgentId}
        initialChatModel={modelIdFromCookie.value}
        initialMessages={[]}
        initialVisibilityType="private"
        isReadonly={false}
        key={id}
      />
      <DataStreamHandler />
    </>
  );
}
