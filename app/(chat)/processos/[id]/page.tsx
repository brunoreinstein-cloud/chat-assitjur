import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { FASE_LABEL, RISCO_LABEL } from "@/lib/constants/processo";
import {
  ensureStatementTimeout,
  getProcessoById,
  getTaskExecutionsByProcessoId,
} from "@/lib/db/queries";
import type { TaskExecution } from "@/lib/db/schema";
import { isUUID } from "@/lib/utils";

export default function ProcessoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <ProcessoPageContent params={params} />
    </Suspense>
  );
}

const TASK_LABELS: Record<string, string> = {
  "revisor-defesas": "Revisor de Defesas",
  "redator-contestacao": "Redator de Contestação",
  "assistjur-master": "AssistJur Master",
  "assistente-geral": "Assistente Geral",
};

const TIPO_LABELS: Record<string, string> = {
  pi: "Petição Inicial",
  contestacao: "Contestação",
  processo_completo: "Processo Completo",
  outro: "Documento",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  running: {
    label: "Em andamento",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  complete: {
    label: "Concluído",
    className: "bg-green-500/10 text-green-600 dark:text-green-400",
  },
  error: {
    label: "Erro",
    className: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
};

function formatDate(d: Date | string | null | undefined): string {
  if (!d) {
    return "—";
  }
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TaskRow({ task }: { task: TaskExecution }) {
  const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.running;
  const label = TASK_LABELS[task.taskId] ?? task.taskId;

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card px-3 py-2.5 dark:border-white/8 dark:bg-white/3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground text-sm dark:text-white/90">
          {label}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {formatDate(task.startedAt)}
          {task.creditsUsed ? ` · ${task.creditsUsed} créditos` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 font-medium text-[10px] ${cfg.className}`}
        >
          {cfg.label}
        </span>
        {task.chatId && (
          <Link
            className="rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 dark:border-white/10 dark:hover:bg-white/5"
            href={`/chat/${task.chatId}`}
          >
            Ver chat →
          </Link>
        )}
      </div>
    </div>
  );
}

async function ProcessoPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isUUID(id)) {
    notFound();
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await ensureStatementTimeout();

  const [proc, tasks] = await Promise.all([
    getProcessoById({ id, userId: session.user.id }),
    getTaskExecutionsByProcessoId({ processoId: id }),
  ]);

  if (!proc) {
    notFound();
  }

  const hasIntake = proc.intakeStatus === "ready" && !!proc.parsedText;
  const isProcessing = proc.intakeStatus === "processing";

  const tipoLabel = proc.tipo ? (TIPO_LABELS[proc.tipo] ?? proc.tipo) : null;
  const faseLabel = proc.fase ? (FASE_LABEL[proc.fase] ?? proc.fase) : null;
  const riscoLabel = proc.riscoGlobal
    ? (RISCO_LABEL[proc.riscoGlobal] ?? proc.riscoGlobal)
    : null;

  // Links de início de tarefa — incluem processoId na URL do chat
  const newChatBase = `/chat?processo=${id}`;
  const quickTasks = [
    {
      id: "revisor",
      label: "Revisar Defesa",
      desc: "Auditar pontos fortes e fracos da contestação",
      href: `${newChatBase}&agent=revisor-defesas`,
      icon: "🔍",
    },
    {
      id: "redator",
      label: "Redigir Contestação",
      desc: "Gerar minuta de contestação",
      href: `${newChatBase}&agent=redator-contestacao`,
      icon: "✍️",
    },
    {
      id: "master",
      label: "Análise Master",
      desc: "Relatório completo com prognóstico e estratégia",
      href: `${newChatBase}&agent=assistjur-master`,
      icon: "📊",
    },
    {
      id: "assistente",
      label: "Assistente Geral",
      desc: "Perguntas e análises livres sobre o processo",
      href: `${newChatBase}&agent=assistente-geral`,
      icon: "💬",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Link
          className="hover:text-foreground"
          href="/chat"
        >
          Chat
        </Link>
        <span>/</span>
        <span className="text-foreground">Ficha do Processo</span>
      </nav>

      {/* Cabeçalho do processo */}
      <div className="mb-6 rounded-lg border border-border/60 bg-card p-5 dark:border-white/8 dark:bg-white/3">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-semibold text-foreground text-lg dark:text-white/95">
              {proc.titulo ?? `${proc.reclamante} × ${proc.reclamada}`}
            </h1>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {proc.numeroAutos}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {tipoLabel && (
              <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground dark:border-white/10">
                {tipoLabel}
              </span>
            )}
            {hasIntake && (
              <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] text-green-600 dark:text-green-400">
                ✓ Intake completo
              </span>
            )}
            {isProcessing && (
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">
                ⏳ Processando…
              </span>
            )}
          </div>
        </div>

        {/* Metadados em grade */}
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-3">
          {proc.reclamante && (
            <>
              <dt className="text-muted-foreground">Reclamante</dt>
              <dd className="truncate text-foreground sm:col-span-2 dark:text-white/80">
                {proc.reclamante}
              </dd>
            </>
          )}
          {proc.reclamada && (
            <>
              <dt className="text-muted-foreground">Reclamada</dt>
              <dd className="truncate text-foreground sm:col-span-2 dark:text-white/80">
                {proc.reclamada}
              </dd>
            </>
          )}
          {proc.vara && (
            <>
              <dt className="text-muted-foreground">Vara</dt>
              <dd className="truncate text-foreground sm:col-span-2 dark:text-white/80">
                {proc.vara}
              </dd>
            </>
          )}
          {faseLabel && (
            <>
              <dt className="text-muted-foreground">Fase</dt>
              <dd className="text-foreground dark:text-white/80">{faseLabel}</dd>
            </>
          )}
          {riscoLabel && (
            <>
              <dt className="text-muted-foreground">Risco</dt>
              <dd className="text-foreground dark:text-white/80">{riscoLabel}</dd>
            </>
          )}
          {proc.totalPages && (
            <>
              <dt className="text-muted-foreground">Páginas</dt>
              <dd className="text-foreground dark:text-white/80">
                {proc.totalPages.toLocaleString("pt-BR")}
              </dd>
            </>
          )}
        </dl>
      </div>

      {/* Aviso: falta intake */}
      {!(hasIntake || isProcessing) && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-amber-700 text-sm dark:text-amber-400">
            <strong>PDF não indexado.</strong> Para usar o fluxo sem re-upload,
            faça o intake do documento em{" "}
            <Link
              className="underline underline-offset-2"
              href={`/chat?processo=${id}`}
            >
              um chat
            </Link>{" "}
            e envie o PDF do processo.
          </p>
        </div>
      )}

      {/* Ações rápidas */}
      <section className="mb-8">
        <h2 className="mb-3 font-semibold text-[13px] text-muted-foreground uppercase tracking-wide">
          Iniciar Tarefa
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {quickTasks.map((t) => (
            <Link
              className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card p-3.5 transition-colors hover:border-assistjur-gold/30 hover:bg-assistjur-gold/5 dark:border-white/8 dark:bg-white/3 dark:hover:border-assistjur-gold/20 dark:hover:bg-assistjur-gold/8"
              href={t.href}
              key={t.id}
            >
              <span className="text-base">{t.icon}</span>
              <span className="font-semibold text-[13px] text-foreground dark:text-white/90">
                {t.label}
              </span>
              <span className="text-[11px] text-muted-foreground leading-tight">
                {t.desc}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Histórico de tarefas */}
      <section>
        <h2 className="mb-3 font-semibold text-[13px] text-muted-foreground uppercase tracking-wide">
          Histórico de Tarefas
        </h2>
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-border/40 bg-muted/20 p-6 text-center text-muted-foreground text-sm dark:border-white/6">
            Nenhuma tarefa executada ainda. Use os atalhos acima para começar.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
