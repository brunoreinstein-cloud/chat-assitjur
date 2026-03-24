import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import {
  FASE_LABEL,
  RISCO_CLASSES,
  RISCO_DOT,
  RISCO_LABEL,
} from "@/lib/constants/processo";
import { ensureStatementTimeout, getProcessosByUserId } from "@/lib/db/queries";

export const metadata = { title: "Processos — AssistJur.IA" };

export default function ProcessosPage() {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <ProcessosContent />
    </Suspense>
  );
}

async function ProcessosContent() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await ensureStatementTimeout();
  const processos = await getProcessosByUserId({ userId: session.user.id });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Cabeçalho */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-xl">Processos</h1>
          <p className="text-muted-foreground text-sm">
            {processos.length} processo(s) registado(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            className="rounded-md border border-border px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
            href="/processos/passivo"
          >
            Painel de passivo
          </Link>
          <Link
            className="rounded-md bg-foreground px-3 py-1.5 text-background text-sm transition-opacity hover:opacity-80"
            href="/chat"
          >
            + Novo processo
          </Link>
        </div>
      </div>

      {processos.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 px-6 py-12 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhum processo ainda.
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Crie um processo a partir do chat clicando em &ldquo;Vincular
            processo&rdquo; no topbar.
          </p>
          <Link
            className="mt-4 inline-block rounded-md bg-foreground px-4 py-2 text-background text-sm transition-opacity hover:opacity-80"
            href="/chat"
          >
            Ir para o chat
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border border-b bg-muted/50">
                <th className="px-4 py-2.5 font-medium">Processo</th>
                <th className="px-4 py-2.5 font-medium">Partes</th>
                <th className="px-4 py-2.5 text-center font-medium">Fase</th>
                <th className="px-4 py-2.5 text-center font-medium">Risco</th>
                <th className="px-4 py-2.5 text-center font-medium">Verbas</th>
                <th className="px-4 py-2.5 text-center font-medium">Intake</th>
              </tr>
            </thead>
            <tbody>
              {processos.map((p) => (
                <tr
                  className="border-border border-b transition-colors last:border-0 hover:bg-muted/20"
                  key={p.id}
                >
                  <td className="px-4 py-3">
                    <Link
                      className="group flex flex-col gap-0.5"
                      href={`/processos/${p.id}`}
                    >
                      <span className="font-mono text-[11px] text-muted-foreground group-hover:text-foreground">
                        {p.numeroAutos}
                      </span>
                      {p.titulo && (
                        <span className="text-[12px] text-foreground/70">
                          {p.titulo}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5 text-xs">
                      <span className="text-foreground">
                        {p.reclamante.split(" ").slice(0, 2).join(" ")}
                      </span>
                      <span className="text-muted-foreground">
                        × {p.reclamada.split(" ").slice(0, 2).join(" ")}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.fase ? (
                      <span className="text-muted-foreground text-xs">
                        {FASE_LABEL[p.fase] ?? p.fase}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.riscoGlobal ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-[10px] ${RISCO_CLASSES[p.riscoGlobal] ?? ""}`}
                      >
                        <span
                          aria-hidden
                          className={`h-1.5 w-1.5 rounded-full ${RISCO_DOT[p.riscoGlobal] ?? "bg-muted-foreground/40"}`}
                        />
                        {RISCO_LABEL[p.riscoGlobal] ?? p.riscoGlobal}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground text-xs">
                    {p.verbas.length > 0 ? p.verbas.length : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.intakeStatus === "ready" ? (
                      <span className="text-[10px] text-green-600 dark:text-green-400">
                        ✓
                      </span>
                    ) : p.intakeStatus === "processing" ? (
                      <span className="text-[10px] text-blue-500">⏳</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
