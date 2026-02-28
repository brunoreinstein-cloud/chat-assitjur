import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-border/40 border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="font-semibold text-foreground text-lg">
            Revisor de Defesas Trabalhistas
          </span>
          <nav className="flex items-center gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">Cadastrar</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="mx-auto max-w-2xl space-y-8 text-center">
          <h1 className="font-bold text-3xl text-foreground tracking-tight md:text-4xl">
            Auditoria jurídica assistida por IA
          </h1>
          <p className="text-lg text-muted-foreground md:text-xl">
            Especializado em contencioso trabalhista: analise Petição Inicial e
            Contestação, obtenha parecer executivo, roteiros para advogado e
            preposto e prepare-se para audiência com mais segurança.
          </p>
          <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg">
              <Link href="/chat">Acessar o Revisor</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Entrar com e-mail</Link>
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            Não tem conta?{" "}
            <Link
              className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
              href="/register"
            >
              Cadastre-se gratuitamente
            </Link>{" "}
            ou acesse como visitante ao entrar no Revisor.
          </p>
        </div>

        <section className="mx-auto mt-16 grid max-w-4xl gap-6 text-left sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
            <h2 className="font-semibold text-foreground">
              Avaliação da defesa
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Parecer executivo: contexto, prescrição, quadro de pedidos e
              análise temática.
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
            <h2 className="font-semibold text-foreground">
              Roteiros de audiência
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Roteiro para advogado e roteiro confidencial para preposto.
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
            <h2 className="font-semibold text-foreground">
              Base de conhecimento
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Use teses e precedentes (@bancodetese) para enriquecer a análise.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-border/40 border-t py-4">
        <div className="mx-auto max-w-5xl px-4 text-center text-muted-foreground text-sm">
          Relatórios gerados por IA. Revisão humana necessária e obrigatória.
        </div>
      </footer>
    </div>
  );
}
