import Link from "next/link";

export function GuestBanner() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-border/40 bg-muted/50 px-4 py-2 text-center text-muted-foreground text-sm">
      <span>
        Está a usar como visitante. Ao sair (reiniciar ou entrar na conta), o
        histórico é apagado.
      </span>
      <Link
        className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
        href="/register"
      >
        Crie uma conta
      </Link>
      <span>para guardar o histórico.</span>
    </div>
  );
}
