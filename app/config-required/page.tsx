import Link from "next/link";

export default function ConfigRequiredPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">
          Configuração em falta na Vercel
        </h1>
        <p className="text-muted-foreground text-sm">
          Para esta aplicação funcionar em produção, defina as variáveis de
          ambiente no projeto Vercel:
        </p>
        <ul className="text-muted-foreground list-inside list-disc text-left text-sm">
          <li>
            <strong>POSTGRES_URL</strong> – URL de conexão ao Postgres (ex.:
            Supabase, use a connection string do pooler, porta 6543)
          </li>
          <li>
            <strong>AUTH_SECRET</strong> – Segredo para sessões (ex.:{" "}
            <code className="rounded bg-muted px-1">
              openssl rand -base64 32
            </code>
            )
          </li>
        </ul>
        <p className="text-muted-foreground text-sm">
          Vercel → Projeto → Settings → Environment Variables → adicione para
          Production (e Preview se quiser).
        </p>
      </div>
      <Link
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-90"
        href="/"
      >
        Tentar novamente
      </Link>
    </div>
  );
}
