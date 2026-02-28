"use client";

import Link from "next/link";
import { signInAsGuest } from "../actions";

export function GuestGate() {
	return (
		<div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4">
			<p className="text-muted-foreground text-center text-sm">
				Para usar o chat, continua como visitante ou inicia sessão.
			</p>
			<form action={signInAsGuest}>
				<button
					className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors"
					type="submit"
				>
					Continuar como visitante
				</button>
			</form>
			<Link
				className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
				href="/login"
			>
				Iniciar sessão
			</Link>
		</div>
	);
}
