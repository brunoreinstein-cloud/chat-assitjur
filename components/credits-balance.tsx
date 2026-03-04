"use client";

import { CoinsIcon } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CreditsResponse } from "@/lib/types";
import { fetcher } from "@/lib/utils";

export function CreditsBalance() {
  const { data, error } = useSWR<CreditsResponse>("/api/credits", fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  if (error) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <output
              aria-label="Saldo temporariamente indisponível"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 text-muted-foreground text-sm"
            >
              <CoinsIcon aria-hidden className="size-4 shrink-0" />
              <span>—</span>
            </output>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-sm">
              Não foi possível carregar o saldo. Tente novamente ou veja a
              página Uso e créditos.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (data === undefined) {
    return (
      <span
        aria-hidden
        className="inline-flex h-8 items-center gap-1 rounded-md border border-transparent px-2 text-muted-foreground"
      >
        <span className="size-4 animate-pulse rounded bg-muted" />
        <span className="text-sm">—</span>
      </span>
    );
  }

  const isLow = data.balance < data.lowBalanceThreshold;
  const lastUse = data.recentUsage.length > 0 ? data.recentUsage[0] : null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            aria-label={`Saldo: ${data.balance} créditos. Ver histórico de uso`}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-sm transition-colors hover:opacity-90 ${
              isLow
                ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "border-border bg-muted/50 text-foreground"
            }`}
            href="/uso"
          >
            <CoinsIcon
              aria-hidden
              className="size-4 shrink-0"
              strokeWidth={1.5}
            />
            <span>{data.balance} créditos</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs" side="bottom">
          <p className="font-medium">Créditos por consumo de IA</p>
          <p className="text-muted-foreground text-xs">
            1 crédito ≈ 1000 tokens (entrada + saída). Sem créditos não pode
            enviar mensagens. Clique para ver histórico.
          </p>
          {lastUse && (
            <p className="mt-1 text-xs">
              Último uso: −{lastUse.creditsConsumed} créditos (
              {lastUse.promptTokens + lastUse.completionTokens} tokens)
            </p>
          )}
          {isLow && (
            <p className="mt-1 text-amber-600 text-xs dark:text-amber-400">
              Saldo baixo. Contacte o administrador para recarregar.
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Chame após enviar uma mensagem para atualizar o saldo exibido. */
export function useCreditsMutate() {
  const { mutate } = useSWR<CreditsResponse>("/api/credits", fetcher);
  return () => {
    mutate();
  };
}
