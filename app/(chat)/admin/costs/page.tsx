"use client";

import { useState } from "react";
import useSWR from "swr";
import type { CostRow } from "@/app/(chat)/api/admin/costs/route";

const DAYS_OPTIONS = [7, 14, 30, 90] as const;

async function fetchCosts(url: string, adminKey: string) {
  const res = await fetch(url, { headers: { "x-admin-key": adminKey } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? "Falha ao carregar dados"
    );
  }
  return res.json() as Promise<{ days: number; rows: CostRow[] }>;
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

export default function AdminCostsPage() {
  const [adminKey, setAdminKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [days, setDays] = useState<number>(30);

  const { data, error, isLoading } = useSWR(
    adminKey ? [`/api/admin/costs?days=${days}`, adminKey] : null,
    ([url, key]) => fetchCosts(url, key)
  );

  if (!adminKey) {
    return (
      <div className="flex max-w-sm flex-col gap-4 p-6">
        <h1 className="font-semibold text-xl">Dashboard de Custos LLM</h1>
        <p className="text-muted-foreground text-sm">
          Insira a chave de administrador para aceder.
        </p>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setAdminKey(keyInput);
              }
            }}
            placeholder="Chave de admin"
            type="password"
            value={keyInput}
          />
          <button
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm hover:bg-primary/90"
            onClick={() => setAdminKey(keyInput)}
            type="button"
          >
            Entrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-xl">Dashboard de Custos LLM</h1>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Período:</span>
          {DAYS_OPTIONS.map((d) => (
            <button
              className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                days === d
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background hover:bg-muted"
              }`}
              key={d}
              onClick={() => setDays(d)}
              type="button"
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <p className="text-muted-foreground text-sm">A carregar…</p>
      )}

      {error && (
        <p className="text-destructive text-sm">
          Erro: {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          {data.rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Sem dados de TaskExecution nos últimos {data.days} dias.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Agente (taskId)
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Execuções
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Créditos
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Tokens totais
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Input
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Output
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Latência média
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((row) => (
                    <tr className="hover:bg-muted/30" key={row.taskId}>
                      <td className="px-4 py-2 font-mono text-xs">
                        {row.taskId}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {fmt(row.execucoes)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {fmt(row.creditosUsados)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {fmt(row.totalTokens)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {fmt(row.inputTokens)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {fmt(row.outputTokens)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {row.latenciaMediaMs != null
                          ? `${fmt(row.latenciaMediaMs)} ms`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-border border-t bg-muted/50">
                  <tr>
                    <td className="px-4 py-2 font-medium">Total</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {fmt(data.rows.reduce((s, r) => s + r.execucoes, 0))}
                    </td>
                    <td className="px-4 py-2 text-right font-bold">
                      {fmt(data.rows.reduce((s, r) => s + r.creditosUsados, 0))}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {fmt(data.rows.reduce((s, r) => s + r.totalTokens, 0))}
                    </td>
                    <td className="px-4 py-2 text-right" />
                    <td className="px-4 py-2 text-right" />
                    <td className="px-4 py-2 text-right" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="text-muted-foreground text-xs">
            Dados dos últimos {data.days} dias • Fonte: TaskExecution.result
            (TaskTelemetry)
          </p>
        </>
      )}
    </div>
  );
}
