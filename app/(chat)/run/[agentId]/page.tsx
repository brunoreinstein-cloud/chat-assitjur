import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { auth } from "@/app/(auth)/auth";
import { AgentRunner } from "@/components/agent-runner";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { AGENT_IDS, getAgentConfig } from "@/lib/ai/agents-registry-metadata";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";

type PageProps = Readonly<{ params: Promise<{ agentId: string }> }>;

export default function RunAgentRoute({ params }: PageProps) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <RunAgentPage params={params} />
    </Suspense>
  );
}

async function RunAgentPage({ params }: PageProps) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const { agentId } = await params;

  // Validate agentId is a valid built-in agent with runner support
  if (!AGENT_IDS.includes(agentId as (typeof AGENT_IDS)[number])) {
    redirect("/run");
  }

  const agentMeta = getAgentConfig(agentId);
  if (!agentMeta.supportsRunnerMode) {
    redirect("/run");
  }

  const cookieStore = await cookies();
  const modelCookie = cookieStore.get("chat-model");
  const initialModel = modelCookie?.value ?? DEFAULT_CHAT_MODEL;

  return (
    <>
      <AgentRunner
        agentDescription={agentMeta.description ?? ""}
        agentId={agentId}
        agentLabel={agentMeta.label}
        allowedModelIds={agentMeta.allowedModelIds}
        initialModel={initialModel}
        minDocuments={agentMeta.minDocuments}
        requiredDocumentTypes={agentMeta.requiredDocumentTypes ?? []}
      />
      <DataStreamHandler />
    </>
  );
}
