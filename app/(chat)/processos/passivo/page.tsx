import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { RISCO_CLASSES, RISCO_LABEL } from "@/lib/constants/processo";
import { ensureStatementTimeout, getProcessosByUserId } from "@/lib/db/queries";
import { ExportCsvButton, ValorRange } from "./_client";

export const metadata = { title: "Painel de Passivo — AssistJur.IA" };

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface VerbaAgg {
  processoId: string;
  processoNumero: string;
  reclamante: string;
  reclamada: string;
  verba: string;
  risco: string;
  valorMin: number | null;
  valorMax: number | null;
}

interface RiscoGroup {
  risco: string;
  label: string;
  classes: string;
  processos: Set<string>;
  verbas: VerbaAgg[];
  totalMin: number;
  totalMax: number;
}

const RISCO_ORDER = ["provavel", "possivel", "remoto"] as const;

// ─── Página ───────────────────────────────────────────────────────────────────

export default function PassivoPage() {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <PassivoContent />
    </Suspense>
  );
}

async function PassivoContent() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await ensureStatementTimeout();
  const processos = await getProcessosByUserId({ userId: session.user.id });

  // ── Agregação ───────────────────────────────────────────────────────────────

  const groups: Map<string, RiscoGroup> = new Map(
    RISCO_ORDER.map((r) => [
      r,
      {
        risco: r,
        label: RISCO_LABEL[r] ?? r,
        classes: RISCO_CLASSES[r] ?? "",
        processos: new Set(),
        verbas: [],
        totalMin: 0,
        totalMax: 0,
      },
    ])
  );

  const allRows: VerbaAgg[] = [];

  for (const p of processos) {
    for (const v of p.verbas) {
      const g = groups.get(v.risco);
      if (!g) {
        continue;
      }
      const row: VerbaAgg = {
        processoId: p.id,
        processoNumero: p.numeroAutos,
        reclamante: p.reclamante,
        reclamada: p.reclamada,
        verba: v.verba,
        risco: v.risco,
        valorMin: v.valorMin ?? null,
        valorMax: v.valorMax ?? null,
      };
      g.processos.add(p.id);
      g.verbas.push(row);
      g.totalMin += v.valorMin ?? 0;
      g.totalMax += v.valorMax ?? 0;
      allRows.push(row);
    }
  }

  const totalMin = allRows.reduce((s, r) => s + (r.valorMin ?? 0), 0);
  const totalMax = allRows.reduce((s, r) => s + (r.valorMax ?? 0), 0);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">Painel de Passivo</h1>
          <p className="text-muted-foreground text-sm">
            Agregação de verbas trabalhistas por risco. {processos.length}{" "}
            processo(s) · {allRows.length} verba(s).
          </p>
        </div>
        <ExportCsvButton rows={allRows} />
      </div>

      {allRows.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/30 px-6 py-10 text-center text-muted-foreground text-sm">
          Nenhuma verba registada ainda.{" "}
          <span className="mt-1 block text-xs">
            As verbas são adicionadas pelo agente AssistJur quando analisa o
            risco de um processo.
          </span>
        </div>
      )}

      {/* Tabela de resumo */}
      {allRows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border bg-muted/50">
                <th className="px-4 py-2 font-medium">Risco</th>
                <th className="px-4 py-2 text-right font-medium">Processos</th>
                <th className="px-4 py-2 text-right font-medium">Verbas</th>
                <th className="px-4 py-2 text-right font-medium">
                  Estimativa (Mín – Máx)
                </th>
              </tr>
            </thead>
            <tbody>
              {RISCO_ORDER.map((r) => {
                const g = groups.get(r);
                if (!g || g.verbas.length === 0) {
                  return null;
                }
                return (
                  <tr className="border-border border-t" key={r}>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${g.classes}`}
                      >
                        {g.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {g.processos.size}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {g.verbas.length}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <ValorRange max={g.totalMax} min={g.totalMin} />
                    </td>
                  </tr>
                );
              })}
              {/* Linha de total */}
              <tr className="border-border border-t bg-muted/20 font-medium">
                <td className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right text-muted-foreground">
                  {processos.filter((p) => p.verbas.length > 0).length}
                </td>
                <td className="px-4 py-2 text-right text-muted-foreground">
                  {allRows.length}
                </td>
                <td className="px-4 py-2 text-right">
                  <ValorRange max={totalMax} min={totalMin} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Detalhe por grupo de risco */}
      {RISCO_ORDER.map((r) => {
        const g = groups.get(r);
        if (!g || g.verbas.length === 0) {
          return null;
        }
        return (
          <section key={r}>
            <h2 className="mb-2 font-medium text-base">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${g.classes}`}
              >
                {g.label}
              </span>
              <span className="ml-2 font-normal text-muted-foreground text-sm">
                {g.verbas.length} verba(s) em {g.processos.size} processo(s)
              </span>
            </h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-border bg-muted/50">
                    <th className="px-4 py-2 font-medium">Processo</th>
                    <th className="px-4 py-2 font-medium">Verba</th>
                    <th className="px-4 py-2 text-right font-medium">
                      Valor Mín
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      Valor Máx
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {g.verbas.map((v, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: verbas têm índice estável aqui
                    <tr className="border-border border-t" key={i}>
                      <td className="px-4 py-2">
                        <Link
                          className="font-mono text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                          href={`/processos/${v.processoId}`}
                        >
                          {v.processoNumero}
                        </Link>
                        <div className="text-[11px] text-foreground/70">
                          {v.reclamante.split(" ")[0]}{" "}
                          <span className="text-muted-foreground/60">×</span>{" "}
                          {v.reclamada.split(" ")[0]}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs">{v.verba}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground text-xs">
                        {v.valorMin !== null
                          ? v.valorMin.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground text-xs">
                        {v.valorMax !== null
                          ? v.valorMax.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
