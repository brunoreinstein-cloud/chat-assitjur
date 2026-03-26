import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { avancaFaseAction } from "@/app/(chat)/processos/actions";
import {
  FASE_LABEL,
  FASE_ORDER,
  nextFase,
  RISCO_CLASSES,
  RISCO_LABEL,
} from "@/lib/constants/processo";
import {
  ensureStatementTimeout,
  getPecasByProcessoId,
  getProcessoById,
  getTaskExecutionsByProcessoId,
} from "@/lib/db/queries";
import type { Peca, TaskExecution } from "@/lib/db/schema";
import { can } from "@/lib/rbac/roles";
import { isUUID } from "@/lib/utils";
import { AvancaFaseButton } from "./avanca-fase-button";
import { PecaStatusBadge, PecaStatusButton } from "./peca-status-button";

interface TaskTelemetry {
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  stepsCount?: number;
  toolsUsed?: string[];
  finishReason?: string;
  modelId?: string;
}

interface IntakeMetadata {
  numeroPedidos?: number;
  reclamante?: string;
  reclamada?: string;
  pedidos?: string[];
  teses?: string[];
  valorCausa?: string;
}

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

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
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
  const telemetry = task.result as TaskTelemetry | null;

  return (
    <div className="rounded-md border border-border/60 bg-card px-3 py-2.5 dark:border-white/8 dark:bg-white/3">
      <div className="flex items-center justify-between gap-3">
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
      {telemetry && task.status === "complete" && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 border-border/40 border-t pt-2 text-[10px] text-muted-foreground dark:border-white/6">
          {telemetry.latencyMs != null && (
            <span>{(telemetry.latencyMs / 1000).toFixed(1)}s</span>
          )}
          {telemetry.totalTokens != null && (
            <span>{telemetry.totalTokens.toLocaleString("pt-BR")} tokens</span>
          )}
          {telemetry.stepsCount != null && (
            <span>
              {telemetry.stepsCount} step{telemetry.stepsCount !== 1 ? "s" : ""}
            </span>
          )}
          {telemetry.modelId && (
            <span className="font-mono">
              {telemetry.modelId.replace("claude-", "")}
            </span>
          )}
          {telemetry.toolsUsed && telemetry.toolsUsed.length > 0 && (
            <span>{telemetry.toolsUsed.join(", ")}</span>
          )}
        </div>
      )}
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

  const [proc, tasks, pecas] = await Promise.all([
    getProcessoById({ id, userId: session.user.id }),
    getTaskExecutionsByProcessoId({ processoId: id }),
    getPecasByProcessoId({ processoId: id }),
  ]);
  const canApprove = can(session.user.role ?? null, "peca:approve");

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
  const faseAtualIdx = proc.fase
    ? (FASE_ORDER as readonly string[]).indexOf(proc.fase)
    : -1;
  const proxFase = nextFase(proc.fase);

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
        <Link className="hover:text-foreground" href="/chat">
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
              <dd className="text-foreground dark:text-white/80">
                {faseLabel}
              </dd>
            </>
          )}
          {proc.faseProcessual && (
            <>
              <dt className="text-muted-foreground">Fase processual</dt>
              <dd className="text-foreground dark:text-white/80">
                {proc.faseProcessual}
              </dd>
            </>
          )}
          {riscoLabel && (
            <>
              <dt className="text-muted-foreground">Risco</dt>
              <dd className="text-foreground dark:text-white/80">
                {riscoLabel}
              </dd>
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

      {/* Pipeline de fases */}
      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-[13px] text-muted-foreground uppercase tracking-wide">
            Pipeline
          </h2>
          {proxFase && (
            <form
              action={
                avancaFaseAction.bind(null, id) as unknown as (
                  formData: FormData
                ) => Promise<void>
              }
            >
              <AvancaFaseButton
                label={`Avançar → ${FASE_LABEL[proxFase] ?? proxFase}`}
              />
            </form>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FASE_ORDER.map((f, idx) => {
            const isAtual = proc.fase === f;
            const isFutura = faseAtualIdx === -1 || faseAtualIdx < idx;
            const isPast = !(isAtual || isFutura);
            return (
              <span
                className={[
                  "rounded-full border px-2.5 py-0.5 font-medium text-[11px]",
                  isAtual
                    ? "border-gold-accent/50 bg-gold-accent/10 text-gold-accent"
                    : isFutura
                      ? "border-border/40 bg-transparent text-muted-foreground/50 dark:border-white/8"
                      : "border-green-500/30 bg-green-500/8 text-green-600 dark:text-green-400",
                ].join(" ")}
                key={f}
              >
                {isPast && "✓ "}
                {FASE_LABEL[f] ?? f}
              </span>
            );
          })}
        </div>
      </section>

      {/* Metadados do intake */}
      {hasIntake &&
        (() => {
          const meta = proc.intakeMetadata as IntakeMetadata | null;
          const pedidos = meta?.pedidos ?? [];
          const teses = meta?.teses ?? [];
          const valorCausa = meta?.valorCausa;
          if (!(pedidos.length || teses.length || valorCausa)) {
            return null;
          }
          return (
            <section className="mb-6">
              <h2 className="mb-3 font-semibold text-[13px] text-muted-foreground uppercase tracking-wide">
                Extração do Documento
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {pedidos.length > 0 && (
                  <div className="rounded-lg border border-border/60 bg-card p-3.5 dark:border-white/8 dark:bg-white/3">
                    <p className="mb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                      Pedidos ({pedidos.length})
                    </p>
                    <ul className="flex flex-col gap-1">
                      {pedidos.map((p) => (
                        <li
                          className="text-[12px] text-foreground/80 dark:text-white/70"
                          key={p}
                        >
                          · {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(teses.length > 0 || valorCausa) && (
                  <div className="flex flex-col gap-3">
                    {teses.length > 0 && (
                      <div className="rounded-lg border border-border/60 bg-card p-3.5 dark:border-white/8 dark:bg-white/3">
                        <p className="mb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                          Teses ({teses.length})
                        </p>
                        <ul className="flex flex-col gap-1">
                          {teses.map((t) => (
                            <li
                              className="text-[12px] text-foreground/80 dark:text-white/70"
                              key={t}
                            >
                              · {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {valorCausa && (
                      <div className="rounded-lg border border-border/60 bg-card p-3.5 dark:border-white/8 dark:bg-white/3">
                        <p className="mb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                          Valor da Causa
                        </p>
                        <p className="font-mono text-foreground text-sm dark:text-white/90">
                          {valorCausa}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        })()}

      {/* Ações rápidas */}
      <section className="mb-8">
        <h2 className="mb-3 font-semibold text-[13px] text-muted-foreground uppercase tracking-wide">
          Iniciar Tarefa
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {quickTasks.map((t) => (
            <Link
              className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card p-3.5 transition-colors hover:border-gold-accent/30 hover:bg-gold-accent/5 dark:border-white/8 dark:bg-white/3 dark:hover:border-gold-accent/20 dark:hover:bg-gold-accent/8"
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

      {/* Painel de Risco por Verba */}
      {proc.verbas.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-semibold text-[13px] text-muted-foreground uppercase tracking-wide">
            Risco por Verba
          </h2>
          <div className="overflow-hidden rounded-lg border border-border/60 bg-card dark:border-white/8 dark:bg-white/3">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-border/60 border-b dark:border-white/8">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Verba
                  </th>
                  <th className="w-24 px-3 py-2 text-center font-medium text-muted-foreground">
                    Risco
                  </th>
                  <th className="hidden w-40 px-3 py-2 text-right font-medium text-muted-foreground sm:table-cell">
                    Intervalo (R$)
                  </th>
                </tr>
              </thead>
              <tbody>
                {proc.verbas.map((v) => (
                  <tr
                    className="border-border/40 border-b last:border-0 dark:border-white/6"
                    key={v.id}
                  >
                    <td className="px-3 py-2 text-foreground dark:text-white/80">
                      {v.verba}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`rounded-full border px-2 py-0.5 font-medium text-[10px] ${RISCO_CLASSES[v.risco] ?? ""}`}
                      >
                        {RISCO_LABEL[v.risco] ?? v.risco}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2 text-right text-muted-foreground sm:table-cell">
                      {v.valorMin != null || v.valorMax != null
                        ? [
                            v.valorMin != null
                              ? v.valorMin.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                  maximumFractionDigits: 0,
                                })
                              : "—",
                            "–",
                            v.valorMax != null
                              ? v.valorMax.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                  maximumFractionDigits: 0,
                                })
                              : "—",
                          ].join(" ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Peças Processuais */}
      {pecas.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-semibold text-[13px] text-muted-foreground uppercase tracking-wide">
            Peças Processuais
          </h2>
          <div className="flex flex-col gap-2">
            {pecas.map((p: Peca) => (
              <div
                className="rounded-md border border-border/60 bg-card px-3 py-2.5 dark:border-white/8 dark:bg-white/3"
                key={p.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground text-sm dark:text-white/90">
                      {p.titulo}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.tipo !== "outro" ? p.tipo : "Peça"} ·{" "}
                      {formatDate(p.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <PecaStatusBadge status={p.status} />
                    {p.blobUrl && (
                      <a
                        className="rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 dark:border-white/10 dark:hover:bg-white/5"
                        href={p.blobUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        DOCX ↓
                      </a>
                    )}
                    <PecaStatusButton
                      canApprove={canApprove}
                      pecaId={p.id}
                      processoId={id}
                      status={p.status}
                    />
                    {p.chatId && (
                      <Link
                        className="rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 dark:border-white/10 dark:hover:bg-white/5"
                        href={`/chat/${p.chatId}`}
                      >
                        Ver chat →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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
