"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VerbaRow {
  processoNumero: string;
  reclamante: string;
  reclamada: string;
  verba: string;
  risco: string;
  valorMin: number | null;
  valorMax: number | null;
}

interface PassivoClientProps {
  readonly rows: VerbaRow[];
}

/** Formata valor em R$ (ex: 12500 → "R$ 12.500,00"). */
function formatBRL(v: number | null): string {
  if (v === null) {
    return "";
  }
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ExportCsvButton({ rows }: PassivoClientProps) {
  function handleExport() {
    const header = [
      "Processo",
      "Reclamante",
      "Reclamada",
      "Verba",
      "Risco",
      "Valor Mín (R$)",
      "Valor Máx (R$)",
    ];

    const csvRows = rows.map((r) => [
      r.processoNumero,
      r.reclamante,
      r.reclamada,
      r.verba,
      r.risco,
      r.valorMin !== null ? String(r.valorMin) : "",
      r.valorMax !== null ? String(r.valorMax) : "",
    ]);

    const csv = [header, ...csvRows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")
      )
      .join("\r\n");

    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `passivo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button onClick={handleExport} size="sm" type="button" variant="outline">
      <DownloadIcon aria-hidden className="mr-1.5 h-3.5 w-3.5" />
      Exportar CSV
    </Button>
  );
}

/** Formata um intervalo de valores mínimo–máximo. */
export function ValorRange({
  min,
  max,
}: {
  readonly min: number;
  readonly max: number;
}) {
  if (min === 0 && max === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  if (min === max) {
    return <span className="text-xs">{formatBRL(min)}</span>;
  }
  return (
    <span className="text-xs">
      {formatBRL(min)}&nbsp;–&nbsp;{formatBRL(max)}
    </span>
  );
}
