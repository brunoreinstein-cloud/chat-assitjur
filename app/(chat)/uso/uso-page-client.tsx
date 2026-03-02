"use client";

import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { AlertCircleIcon, CoinsIcon, MessageSquareIcon } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetcher } from "@/lib/utils";

const USAGE_LIMIT = 50;

interface UsageItem {
  id: string;
  chatId: string | null;
  promptTokens: number;
  completionTokens: number;
  model: string | null;
  creditsConsumed: number;
  createdAt: string;
}

interface CreditsResponse {
  balance: number;
  recentUsage: UsageItem[];
  lowBalanceThreshold: number;
}

function UsageRow({ item }: Readonly<{ item: UsageItem }>) {
  const totalTokens = item.promptTokens + item.completionTokens;
  const date = new Date(item.createdAt);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-border border-b py-3 last:border-0">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="text-muted-foreground text-sm tabular-nums">
          {format(date, "dd/MM/yyyy HH:mm", { locale: pt })}
        </span>
        {item.chatId ? (
          <Link
            className="inline-flex items-center gap-1.5 truncate font-medium text-primary underline-offset-4 hover:underline"
            href={`/chat/${item.chatId}`}
          >
            <MessageSquareIcon aria-hidden className="size-4 shrink-0" />
            Ver conversa
          </Link>
        ) : (
          <span className="text-muted-foreground text-sm">Chat</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4 text-sm">
        <span className="text-muted-foreground tabular-nums">
          {totalTokens.toLocaleString("pt-PT")} tokens
        </span>
        <span className="font-medium tabular-nums">
          −{item.creditsConsumed} créditos
        </span>
      </div>
    </div>
  );
}

export function UsoPageClient() {
  const { data, error, isLoading } = useSWR<CreditsResponse>(
    `/api/credits?limit=${USAGE_LIMIT}`,
    fetcher,
    {
      revalidateOnFocus: true,
    }
  );

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon className="size-4" />
        <AlertTitle>Erro ao carregar</AlertTitle>
        <AlertDescription>
          Não foi possível obter o saldo e o histórico. Tente novamente.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Uso e créditos
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Saldo de créditos por consumo de IA e histórico das últimas
          utilizações.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 font-medium text-lg">
            <CoinsIcon aria-hidden className="size-5" />
            Saldo atual
          </CardTitle>
          <CardDescription>
            1 crédito ≈ 1000 tokens (entrada + saída). Sem créditos não pode
            enviar mensagens no chat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-16 items-center gap-2">
              <span className="size-5 animate-pulse rounded bg-muted" />
              <span className="text-muted-foreground text-sm">A carregar…</span>
            </div>
          ) : data ? (
            <div className="flex flex-wrap items-baseline gap-2">
              <span
                className={
                  data.balance < data.lowBalanceThreshold
                    ? "font-semibold text-3xl text-amber-600 tabular-nums dark:text-amber-400"
                    : "font-semibold text-3xl tabular-nums"
                }
              >
                {data.balance}
              </span>
              <span className="text-muted-foreground text-sm">
                créditos disponíveis
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {data && data.balance < data.lowBalanceThreshold && (
        <Alert className="border-amber-500/50 bg-amber-500/10 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
          <AlertCircleIcon className="size-4" />
          <AlertTitle>Saldo baixo</AlertTitle>
          <AlertDescription>
            Está a ficar com poucos créditos. Contacte o administrador para
            recarregar e continuar a usar o chat.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-medium text-lg">
            Histórico de uso
          </CardTitle>
          <CardDescription>
            Últimas {USAGE_LIMIT} utilizações do chat (por pedido de resposta da
            IA).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">
              A carregar histórico…
            </div>
          )}
          {!isLoading && data?.recentUsage && data.recentUsage.length > 0 && (
            <ScrollArea className="h-[min(50vh,24rem)] pr-4">
              <div className="divide-y-0">
                {data.recentUsage.map((item) => (
                  <UsageRow item={item} key={item.id} />
                ))}
              </div>
            </ScrollArea>
          )}
          {!isLoading &&
            data &&
            (!data.recentUsage || data.recentUsage.length === 0) && (
              <p className="py-8 text-center text-muted-foreground text-sm">
                Ainda não há registos de uso. O consumo será listado aqui após
                enviar mensagens no chat.
              </p>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
