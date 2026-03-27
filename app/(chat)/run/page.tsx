import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { AGENT_IDS, getAgentConfig } from "@/lib/ai/agents-registry-metadata";

export default function RunLandingRoute() {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <RunLandingPage />
    </Suspense>
  );
}

const AGENT_EMOJIS: Record<string, string> = {
  "revisor-defesas": "🔍",
  "assistjur-master": "⚡",
  "autuoria-revisor": "🔎",
};

async function RunLandingPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const runnerAgents = AGENT_IDS.map((id) => getAgentConfig(id)).filter(
    (a) => a.supportsRunnerMode
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <h1 className="font-semibold text-[28px] tracking-tight">
          Executar Agente
        </h1>
        <p className="mt-2 text-muted-foreground">
          Selecione um agente para executar em modo direto: upload, validar e
          executar.
        </p>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {runnerAgents.map((agent) => (
          <Link
            className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-5 transition-all hover:-translate-y-px hover:border-primary/30 hover:shadow-md"
            href={`/run/${agent.id}`}
            key={agent.id}
          >
            <div className="flex items-center gap-2">
              <span className="text-2xl">{AGENT_EMOJIS[agent.id] ?? "🤖"}</span>
              <span className="font-medium">{agent.label}</span>
            </div>
            <p className="text-muted-foreground text-sm">{agent.description}</p>
            <span className="mt-auto font-medium text-primary text-xs opacity-0 transition-opacity group-hover:opacity-100">
              Executar →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
