"use client";

import Link from "next/link";
import { signInAsGuest } from "../actions";

export function GuestGate() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4">
      <p className="text-center text-muted-foreground text-sm">
        Para usar o chat, continua como visitante ou inicia sessão.
      </p>
      <form action={signInAsGuest}>
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90"
          type="submit"
        >
          Continuar como visitante
        </button>
      </form>
      <Link
        className="text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
        href="/login"
      >
        Iniciar sessão
      </Link>
    </div>
  );
}
