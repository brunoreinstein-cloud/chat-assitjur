import Link from "next/link";
import type { ReactNode } from "react";

import { AssistJurLogo } from "@/components/assistjur-logo";

function BenefitCard({
  title,
  description,
  icon,
}: Readonly<{
  title: string;
  description: string;
  icon: ReactNode;
}>) {
  return (
    <article className="landing-card-hover group rounded-xl border border-assistjur-purple/30 bg-assistjur-purple-dark/40 p-5 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-assistjur-gold/40 hover:shadow-assistjur-purple-darker/50 hover:shadow-lg md:p-6">
      <div
        aria-hidden
        className="mb-3 inline-flex size-10 items-center justify-center rounded-lg bg-assistjur-gold/15 text-assistjur-gold transition-colors duration-300 group-hover:bg-assistjur-gold/25"
      >
        {icon}
      </div>
      <h3 className="font-semibold text-lg text-white">{title}</h3>
      <p className="mt-2 text-assistjur-gray-light text-sm leading-relaxed">
        {description}
      </p>
    </article>
  );
}

export default function HomePage() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,var(--assistjur-purple-dark)_0%,transparent_50%)] bg-assistjur-purple-darker pt-[env(safe-area-inset-top)]">
      <a className="skip-link" href="#main-content">
        Saltar para o conteúdo
      </a>

      <header className="border-assistjur-purple-dark/50 border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:h-14">
          <Link
            aria-label="AssistJur.IA — início"
            className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-assistjur-gold focus-visible:ring-offset-2 focus-visible:ring-offset-assistjur-purple-darker"
            href="/"
          >
            <AssistJurLogo
              className="font-bold text-[17px]"
              iconSize={28}
              variant="full"
            />
          </Link>
          <nav
            aria-label="Navegação principal"
            className="flex items-center gap-1"
          >
            <Link
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-assistjur-gold focus-visible:ring-offset-2 focus-visible:ring-offset-assistjur-purple-darker sm:min-w-0"
              href="/login"
            >
              Entrar
            </Link>
            <Link
              className="flex min-h-[44px] items-center justify-center rounded-md bg-assistjur-purple-dark px-4 py-2 font-bold text-sm text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-assistjur-gold focus-visible:ring-offset-2 focus-visible:ring-offset-assistjur-purple-darker"
              href="/register"
            >
              Cadastrar
            </Link>
          </nav>
        </div>
      </header>

      <main
        className="flex flex-1 scroll-mt-6 flex-col items-center justify-center px-4 py-12 sm:py-16 md:py-20"
        id="main-content"
        tabIndex={-1}
      >
        <div className="mx-auto max-w-2xl space-y-8 text-center">
          <p className="inline-block rounded-full bg-assistjur-gold px-4 py-2 font-bold text-assistjur-purple-darker text-xs uppercase tracking-wide">
            O Hub de IA Estratégica para Contencioso
          </p>
          <h1 className="text-balance font-bold text-4xl text-white tracking-tight md:text-5xl md:leading-[1.15]">
            <span className="text-assistjur-gold">
              Inteligência Artificial Estratégica para{" "}
            </span>
            <span className="mt-2 block">
              <AssistJurLogo
                className="font-extrabold text-3xl md:text-4xl"
                variant="text"
              />
            </span>
            <span className="mt-2 block text-white">Gestão do Contencioso</span>
          </h1>
          <p className="text-pretty text-lg text-white/95 leading-relaxed md:text-xl">
            Auditoria jurídica assistida por IA. Especializado em contencioso
            trabalhista: analise Petição Inicial e Contestação, obtenha parecer
            executivo, roteiros para advogado e preposto e prepare-se para
            audiência com mais segurança.
          </p>
          <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:justify-center sm:gap-4">
            <Link
              className="landing-cta-hover inline-flex min-h-[48px] items-center justify-center rounded-xl bg-assistjur-purple-dark px-8 py-3.5 font-bold text-base text-white shadow-black/20 shadow-lg transition-[transform,opacity,box-shadow] duration-200 hover:opacity-95 hover:shadow-black/25 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-assistjur-gold focus-visible:ring-offset-2 focus-visible:ring-offset-assistjur-purple-darker active:scale-[0.98]"
              href="/chat"
            >
              Acessar o Revisor
            </Link>
            <Link
              className="landing-cta-hover inline-flex min-h-[48px] items-center justify-center rounded-xl border-2 border-white bg-white px-8 py-3.5 font-bold text-assistjur-purple-dark text-base transition-[transform,opacity] duration-200 hover:bg-white/95 hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-assistjur-gold focus-visible:ring-offset-2 focus-visible:ring-offset-assistjur-purple-darker active:scale-[0.98]"
              href="/login"
            >
              Entrar com e-mail
            </Link>
          </div>
          <p className="text-assistjur-gray-light text-sm">
            Não tem conta?{" "}
            <Link
              className="font-medium text-assistjur-gold underline underline-offset-4 hover:no-underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-assistjur-gold focus-visible:ring-offset-2 focus-visible:ring-offset-assistjur-purple-darker"
              href="/register"
            >
              Cadastre-se gratuitamente
            </Link>{" "}
            ou acesse como visitante ao entrar no Revisor.
          </p>
        </div>

        <section
          aria-labelledby="beneficios-heading"
          className="mx-auto mt-20 grid max-w-4xl gap-6 px-4 text-left sm:grid-cols-3 sm:gap-8"
        >
          <h2 className="sr-only" id="beneficios-heading">
            Benefícios do Revisor
          </h2>
          <BenefitCard
            description="Parecer executivo: contexto, prescrição, quadro de pedidos e análise temática."
            icon={
              <svg
                aria-hidden
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <title>Documento / parecer</title>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
                <path d="M10 9H8" />
              </svg>
            }
            title="Avaliação da defesa"
          />
          <BenefitCard
            description="Roteiro para advogado e roteiro confidencial para preposto."
            icon={
              <svg
                aria-hidden
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <title>Balança / audiência</title>
                <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                <path d="M7 21h10" />
                <path d="M12 3v18" />
                <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
              </svg>
            }
            title="Roteiros de audiência"
          />
          <BenefitCard
            description="Use teses e precedentes (@bancodetese) para enriquecer a análise."
            icon={
              <svg
                aria-hidden
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <title>Base de conhecimento</title>
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <path d="M8 7h8" />
                <path d="M8 11h8" />
              </svg>
            }
            title="Base de conhecimento"
          />
        </section>
      </main>

      <footer className="mt-auto border-assistjur-purple-dark/50 border-t py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-5xl px-4 text-center text-assistjur-gray-light text-sm">
          Relatórios gerados por IA. Revisão humana necessária e obrigatória.
        </div>
      </footer>
    </div>
  );
}
