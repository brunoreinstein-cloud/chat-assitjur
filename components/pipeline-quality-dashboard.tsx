"use client";

import {
  AlertTriangleIcon,
  BarChart3Icon,
  CheckCircle2Icon,
  ChevronDownIcon,
  FileTextIcon,
  ShieldCheckIcon,
  XCircleIcon,
  ZapIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/** Dados enviados via dataStream "pipeline-dashboard" */
export interface PipelineDashboardData {
  validationScore: {
    completude: number;
    totalFields: number;
    filledFields: number;
    temporalErrors: string[];
    financialErrors: string[];
    classificationErrors: string[];
    audienciaErrors: string[];
    execucaoErrors: string[];
  };
  totalTokens: number;
  blocksProcessed: number;
  validationErrors: string[];
  blockSummary: Array<{
    label: string;
    pageRange: [number, number];
    fieldsExtracted: number;
    tokensUsed: number;
  }>;
}

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 80
      ? "text-green-500"
      : score >= 50
        ? "text-amber-500"
        : "text-red-500";

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg aria-hidden className="-rotate-90" height={size} width={size}>
        <title>Score de completude</title>
        <circle
          className="text-muted/30"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="currentColor"
          strokeWidth={4}
        />
        <circle
          className={cn("transition-all duration-700", color)}
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth={4}
        />
      </svg>
      <span className={cn("absolute font-bold text-sm", color)}>{score}%</span>
    </div>
  );
}

function ErrorCategory({
  errors,
  icon: Icon,
  label,
  code,
  color,
}: {
  errors: string[];
  icon: React.ComponentType<{ className?: string; size?: number }>;
  label: string;
  code: string;
  color: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (errors.length === 0) {
    return (
      <div className="flex items-center gap-2 text-green-600 text-xs dark:text-green-400">
        <CheckCircle2Icon className="size-3.5 shrink-0" />
        <span className="font-medium">{code}</span>
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-auto">OK</span>
      </div>
    );
  }

  return (
    <div>
      <button
        className={cn("flex w-full items-center gap-2 text-xs", color)}
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="font-medium">{code}</span>
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-auto flex items-center gap-1">
          {errors.length} erro{errors.length > 1 ? "s" : ""}
          <ChevronDownIcon
            className={cn(
              "size-3 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </span>
      </button>
      {expanded && (
        <ul className="mt-1 ml-5 space-y-0.5">
          {errors.map((err, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static error list
            <li className="text-[11px] text-muted-foreground" key={i}>
              {err}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PipelineQualityDashboard({
  data,
}: {
  data: PipelineDashboardData;
}) {
  const {
    validationScore: vs,
    blockSummary,
    totalTokens,
    blocksProcessed,
    validationErrors,
  } = data;

  const totalErrors = useMemo(
    () =>
      vs.temporalErrors.length +
      vs.financialErrors.length +
      vs.classificationErrors.length +
      vs.audienciaErrors.length +
      vs.execucaoErrors.length +
      validationErrors.length,
    [vs, validationErrors]
  );

  const totalFieldsExtracted = useMemo(
    () => blockSummary.reduce((sum, b) => sum + b.fieldsExtracted, 0),
    [blockSummary]
  );

  const overallLevel =
    vs.completude >= 80 && totalErrors === 0
      ? "excellent"
      : vs.completude >= 60
        ? "good"
        : "needs_review";

  const [showBlocks, setShowBlocks] = useState(false);

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 border-border/40 border-b bg-muted/30 px-4 py-2.5">
        <BarChart3Icon className="size-4 text-primary" />
        <span className="font-semibold text-sm">
          Dashboard de Qualidade — Pipeline
        </span>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 font-semibold text-[10px]",
            overallLevel === "excellent"
              ? "bg-green-500/15 text-green-700 dark:text-green-400"
              : overallLevel === "good"
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                : "bg-red-500/15 text-red-700 dark:text-red-400"
          )}
        >
          {overallLevel === "excellent"
            ? "Excelente"
            : overallLevel === "good"
              ? "Bom"
              : "Requer revisão"}
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        {/* Completude score ring */}
        <div className="flex flex-col items-center gap-1">
          <ScoreRing score={vs.completude} />
          <span className="font-medium text-[11px] text-muted-foreground">
            Completude
          </span>
          <span className="text-[10px] text-muted-foreground">
            {vs.filledFields}/{vs.totalFields} campos
          </span>
        </div>

        {/* Blocks processed */}
        <div className="flex flex-col items-center gap-1 py-2">
          <div className="flex items-center gap-1.5 font-bold text-2xl text-primary">
            <FileTextIcon className="size-5" />
            {blocksProcessed}
          </div>
          <span className="font-medium text-[11px] text-muted-foreground">
            Blocos
          </span>
          <span className="text-[10px] text-muted-foreground">
            {totalFieldsExtracted} campos extraídos
          </span>
        </div>

        {/* Errors */}
        <div className="flex flex-col items-center gap-1 py-2">
          <div
            className={cn(
              "flex items-center gap-1.5 font-bold text-2xl",
              totalErrors === 0 ? "text-green-600" : "text-amber-600"
            )}
          >
            {totalErrors === 0 ? (
              <ShieldCheckIcon className="size-5" />
            ) : (
              <AlertTriangleIcon className="size-5" />
            )}
            {totalErrors}
          </div>
          <span className="font-medium text-[11px] text-muted-foreground">
            {totalErrors === 0 ? "Sem erros" : "Erros"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            validação cruzada
          </span>
        </div>

        {/* Tokens */}
        <div className="flex flex-col items-center gap-1 py-2">
          <div className="flex items-center gap-1.5 font-bold text-2xl text-muted-foreground">
            <ZapIcon className="size-5" />
            {totalTokens >= 1000
              ? `${(totalTokens / 1000).toFixed(1)}k`
              : totalTokens}
          </div>
          <span className="font-medium text-[11px] text-muted-foreground">
            Tokens
          </span>
          <span className="text-[10px] text-muted-foreground">consumidos</span>
        </div>
      </div>

      {/* Validation categories */}
      <div className="space-y-1.5 border-border/40 border-t px-4 py-3">
        <p className="mb-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
          Validação Cruzada
        </p>
        <ErrorCategory
          code="T001"
          color="text-blue-600 dark:text-blue-400"
          errors={vs.temporalErrors}
          icon={BarChart3Icon}
          label="Temporal"
        />
        <ErrorCategory
          code="F001"
          color="text-emerald-600 dark:text-emerald-400"
          errors={vs.financialErrors}
          icon={BarChart3Icon}
          label="Financeiro"
        />
        <ErrorCategory
          code="C001"
          color="text-purple-600 dark:text-purple-400"
          errors={vs.classificationErrors}
          icon={BarChart3Icon}
          label="Classificação"
        />
        <ErrorCategory
          code="A001"
          color="text-orange-600 dark:text-orange-400"
          errors={vs.audienciaErrors}
          icon={BarChart3Icon}
          label="Audiência"
        />
        <ErrorCategory
          code="E001"
          color="text-red-600 dark:text-red-400"
          errors={vs.execucaoErrors}
          icon={BarChart3Icon}
          label="Execução"
        />
        {validationErrors.length > 0 && (
          <ErrorCategory
            code="REF"
            color="text-gray-600 dark:text-gray-400"
            errors={validationErrors}
            icon={XCircleIcon}
            label="Referências fl."
          />
        )}
      </div>

      {/* Block details (collapsible) */}
      <div className="border-border/40 border-t">
        <button
          className="flex w-full items-center gap-2 px-4 py-2.5 font-medium text-muted-foreground text-xs hover:bg-muted/30"
          onClick={() => setShowBlocks(!showBlocks)}
          type="button"
        >
          <FileTextIcon className="size-3.5" />
          Detalhe por bloco ({blockSummary.length})
          <ChevronDownIcon
            className={cn(
              "ml-auto size-3.5 transition-transform",
              showBlocks && "rotate-180"
            )}
          />
        </button>
        {showBlocks && (
          <div className="px-4 pb-3">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-1 font-medium">Bloco</th>
                  <th className="pb-1 text-center font-medium">Páginas</th>
                  <th className="pb-1 text-center font-medium">Campos</th>
                  <th className="pb-1 text-right font-medium">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {blockSummary.map((block, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static block list
                  <tr className="border-border/20 border-b" key={i}>
                    <td className="py-1 font-medium">{block.label}</td>
                    <td className="py-1 text-center text-muted-foreground">
                      {block.pageRange[0]}–{block.pageRange[1]}
                    </td>
                    <td className="py-1 text-center">
                      <span
                        className={cn(
                          "rounded px-1 py-0.5 font-medium",
                          block.fieldsExtracted >= 5
                            ? "bg-green-500/10 text-green-700 dark:text-green-400"
                            : block.fieldsExtracted >= 2
                              ? "bg-amber-500/10 text-amber-700"
                              : "bg-red-500/10 text-red-700"
                        )}
                      >
                        {block.fieldsExtracted}
                      </span>
                    </td>
                    <td className="py-1 text-right text-muted-foreground">
                      {block.tokensUsed >= 1000
                        ? `${(block.tokensUsed / 1000).toFixed(1)}k`
                        : block.tokensUsed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
