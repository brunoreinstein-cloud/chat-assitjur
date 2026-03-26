"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { AssistJurLogo } from "@/components/assistjur-logo";
import { type LeadActionResult, submitLead } from "./actions";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeading({
  id,
  badge,
  title,
  subtitle,
}: Readonly<{
  id?: string;
  badge?: string;
  title: string;
  subtitle?: string;
}>) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {badge && (
        <p className="mb-4 inline-block rounded-full bg-gold-accent/15 px-4 py-1.5 font-semibold text-gold-accent text-xs uppercase tracking-wide">
          {badge}
        </p>
      )}
      <h2
        className="font-bold text-3xl text-white tracking-tight md:text-4xl"
        id={id}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-pretty text-assistjur-gray-light text-lg leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: Readonly<{
  icon: ReactNode;
  title: string;
  description: string;
}>) {
  return (
    <article className="landing-card-hover group rounded-xl border border-assistjur-purple/30 bg-assistjur-purple-dark/40 p-5 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-gold-accent/40 hover:shadow-assistjur-purple-darker/50 hover:shadow-lg md:p-6">
      <div
        aria-hidden
        className="mb-3 inline-flex size-10 items-center justify-center rounded-lg bg-gold-accent/15 text-gold-accent transition-colors duration-300 group-hover:bg-gold-accent/25"
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

function StepCard({
  number,
  title,
  description,
}: Readonly<{
  number: number;
  title: string;
  description: string;
}>) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-gold-accent font-bold text-2xl text-assistjur-purple-darker">
        {number}
      </div>
      <h3 className="font-semibold text-lg text-white">{title}</h3>
      <p className="mt-2 text-assistjur-gray-light text-sm leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function PricingCard({
  name,
  price,
  period,
  features,
  popular,
}: Readonly<{
  name: string;
  price: string;
  period?: string;
  features: string[];
  popular?: boolean;
}>) {
  return (
    <article
      className={`relative flex flex-col rounded-xl border p-6 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg md:p-8 ${
        popular
          ? "border-gold-accent/60 bg-assistjur-purple-dark/60 shadow-gold-accent/10 shadow-xl"
          : "border-assistjur-purple/30 bg-assistjur-purple-dark/40"
      }`}
    >
      {popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold-accent px-4 py-1 font-bold text-assistjur-purple-darker text-xs uppercase tracking-wide">
          Mais popular
        </span>
      )}
      <h3 className="font-bold text-white text-xl">{name}</h3>
      <div className="mt-4">
        <span className="font-bold text-4xl text-white">{price}</span>
        {period && (
          <span className="ml-1 text-assistjur-gray-light text-sm">
            /{period}
          </span>
        )}
      </div>
      <ul className="mt-6 flex-1 space-y-3">
        {features.map((f) => (
          <li
            className="flex items-start gap-2 text-assistjur-gray-light text-sm"
            key={f}
          >
            <svg
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-gold-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <title>Incluído</title>
              <path
                d="M5 13l4 4L19 7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {f}
          </li>
        ))}
      </ul>
      <a
        className={`mt-8 inline-flex min-h-[44px] items-center justify-center rounded-lg px-6 py-3 font-bold text-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-accent focus-visible:ring-offset-2 focus-visible:ring-offset-assistjur-purple-darker ${
          popular
            ? "bg-gold-accent text-assistjur-purple-darker"
            : "bg-assistjur-purple-dark text-white"
        }`}
        href="#formulario"
      >
        Quero testar
      </a>
    </article>
  );
}

// ─── Lead Form ───────────────────────────────────────────────────────────────

function LeadForm() {
  const [state, formAction, isPending] = useActionState<
    LeadActionResult,
    FormData
  >(submitLead, { success: false });
  const formRef = useRef<HTMLFormElement>(null);
  const prevSuccess = useRef(false);

  useEffect(() => {
    if (state.success && !prevSuccess.current) {
      toast.success("Pronto! Entraremos em contato em breve.");
      formRef.current?.reset();
    }
    if (state.error) {
      toast.error(state.error);
    }
    prevSuccess.current = state.success;
  }, [state]);

  return (
    <form
      action={formAction}
      className="mx-auto mt-8 max-w-md space-y-4"
      ref={formRef}
    >
      <div>
        <label
          className="mb-1 block font-medium text-sm text-white"
          htmlFor="lead-name"
        >
          Nome completo
        </label>
        <input
          autoComplete="name"
          className="w-full rounded-lg border border-assistjur-purple/40 bg-assistjur-purple-darker/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-gold-accent focus:outline-none focus:ring-1 focus:ring-gold-accent"
          id="lead-name"
          name="name"
          placeholder="Dr(a). Maria Silva"
          required
          type="text"
        />
      </div>

      <div>
        <label
          className="mb-1 block font-medium text-sm text-white"
          htmlFor="lead-email"
        >
          Email profissional
        </label>
        <input
          autoComplete="email"
          className="w-full rounded-lg border border-assistjur-purple/40 bg-assistjur-purple-darker/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-gold-accent focus:outline-none focus:ring-1 focus:ring-gold-accent"
          id="lead-email"
          name="email"
          placeholder="maria@escritorio.adv.br"
          required
          type="email"
        />
      </div>

      <div>
        <label
          className="mb-1 block font-medium text-sm text-white"
          htmlFor="lead-phone"
        >
          Telefone / WhatsApp <span className="text-white/50">(opcional)</span>
        </label>
        <input
          autoComplete="tel"
          className="w-full rounded-lg border border-assistjur-purple/40 bg-assistjur-purple-darker/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-gold-accent focus:outline-none focus:ring-1 focus:ring-gold-accent"
          id="lead-phone"
          name="phone"
          placeholder="(11) 99999-0000"
          type="tel"
        />
      </div>

      <div>
        <label
          className="mb-1 block font-medium text-sm text-white"
          htmlFor="lead-area"
        >
          Área de atuação <span className="text-white/50">(opcional)</span>
        </label>
        <select
          className="w-full rounded-lg border border-assistjur-purple/40 bg-assistjur-purple-darker/80 px-4 py-3 text-sm text-white focus:border-gold-accent focus:outline-none focus:ring-1 focus:ring-gold-accent"
          id="lead-area"
          name="area"
        >
          <option value="">Selecione</option>
          <option value="trabalhista">Trabalhista</option>
          <option value="civil">Civil</option>
          <option value="previdenciario">Previdenciário</option>
          <option value="tributario">Tributário</option>
          <option value="empresarial">Empresarial</option>
          <option value="outro">Outro</option>
        </select>
      </div>

      <button
        className="landing-cta-hover w-full rounded-lg bg-gold-accent px-6 py-3.5 font-bold text-assistjur-purple-darker text-base transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-accent focus-visible:ring-offset-2 focus-visible:ring-offset-assistjur-purple-darker disabled:opacity-50"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Enviando..." : "Quero testar grátis"}
      </button>

      <p className="text-center text-white/40 text-xs">
        Ao enviar, você concorda com nossa{" "}
        <Link className="underline hover:text-white/60" href="/privacy">
          Política de Privacidade
        </Link>
        .
      </p>
    </form>
  );
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function IconDocument() {
  return (
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
      <title>Documento</title>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

function IconCompress() {
  return (
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
      <title>Compressão</title>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

function IconAgents() {
  return (
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
      <title>Agentes</title>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconKnowledge() {
  return (
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
      <title>Conhecimento</title>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
    </svg>
  );
}

function IconProcess() {
  return (
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
      <title>Processo</title>
      <rect height="18" rx="2" ry="2" width="18" x="3" y="3" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,var(--assistjur-purple-dark)_0%,transparent_50%)] bg-assistjur-purple-darker pt-[env(safe-area-inset-top)]">
      <a className="skip-link" href="#main-content">
        Saltar para o conteúdo
      </a>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="border-assistjur-purple-dark/50 border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:h-14">
          <Link
            aria-label="AssistJur.IA — início"
            className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-accent focus-visible:ring-offset-2 focus-visible:ring-offset-assistjur-purple-darker"
            href="/"
          >
            <AssistJurLogo
              className="font-bold text-[17px]"
              iconSize={28}
              variant="full"
            />
          </Link>
          <nav aria-label="Navegação" className="flex items-center gap-1">
            <Link
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-accent"
              href="/login"
            >
              Entrar
            </Link>
            <a
              className="flex min-h-[44px] items-center justify-center rounded-md bg-gold-accent px-4 py-2 font-bold text-assistjur-purple-darker text-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-accent"
              href="#formulario"
            >
              Testar grátis
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1" id="main-content" tabIndex={-1}>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="flex flex-col items-center justify-center px-4 py-16 text-center sm:py-20 md:py-28">
          <div className="mx-auto max-w-3xl space-y-6">
            <p className="inline-block rounded-full bg-gold-accent px-4 py-2 font-bold text-assistjur-purple-darker text-xs uppercase tracking-wide">
              IA Estratégica para Advogados
            </p>
            <h1 className="text-balance font-bold text-4xl text-white tracking-tight md:text-5xl md:leading-[1.15]">
              Analise petições e prepare audiências{" "}
              <span className="text-gold-accent">em minutos, não horas</span>
            </h1>
            <p className="mx-auto max-w-xl text-pretty text-lg text-white/90 leading-relaxed md:text-xl">
              Agentes de IA especializados em contencioso trabalhista
              brasileiro. Upload de PDFs, análise automática, parecer executivo
              e roteiros de audiência.
            </p>
            <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:justify-center">
              <a
                className="landing-cta-hover inline-flex min-h-[48px] items-center justify-center rounded-xl bg-gold-accent px-8 py-3.5 font-bold text-assistjur-purple-darker text-base shadow-black/20 shadow-lg transition-[transform,opacity,box-shadow] duration-200 hover:opacity-95 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-accent active:scale-[0.98]"
                href="#formulario"
              >
                Começar agora — grátis
              </a>
              <a
                className="landing-cta-hover inline-flex min-h-[48px] items-center justify-center rounded-xl border-2 border-white/30 px-8 py-3.5 font-bold text-base text-white transition-[transform,opacity] duration-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-accent active:scale-[0.98]"
                href="#funcionalidades"
              >
                Ver funcionalidades
              </a>
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section
          aria-labelledby="funcionalidades-heading"
          className="px-4 py-16 md:py-20"
          id="funcionalidades"
        >
          <SectionHeading
            badge="Funcionalidades"
            id="funcionalidades-heading"
            subtitle="Tudo que você precisa para otimizar a gestão do contencioso trabalhista com inteligência artificial."
            title="Sua advocacia potencializada por IA"
          />
          <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              description="Revisão de Petição Inicial e Contestação com parecer executivo, quadro de pedidos e análise de risco."
              icon={<IconDocument />}
              title="Análise de Petições"
            />
            <FeatureCard
              description="PDFs pesados são comprimidos automaticamente no upload. Redução de até 80% sem perda de qualidade."
              icon={<IconCompress />}
              title="Compressão de PDFs"
            />
            <FeatureCard
              description="4 agentes especializados: Assistente Geral, Revisor de Defesas, Redator de Contestação e AssistJur Master."
              icon={<IconAgents />}
              title="Agentes Especializados"
            />
            <FeatureCard
              description="Upload de documentos, jurisprudência e teses para enriquecer as respostas dos agentes com contexto real."
              icon={<IconKnowledge />}
              title="Base de Conhecimento"
            />
            <FeatureCard
              description="Vincule processos ao chat para que a IA receba automaticamente número, partes, risco, verbas e prazos."
              icon={<IconProcess />}
              title="Processos Vinculados"
            />
            <FeatureCard
              description="Roteiro detalhado para advogado e preposto com pontos de atenção, perguntas-chave e estratégia."
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
                  <title>Audiência</title>
                  <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                  <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                  <path d="M7 21h10" />
                  <path d="M12 3v18" />
                  <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
                </svg>
              }
              title="Roteiros de Audiência"
            />
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section
          aria-labelledby="como-funciona-heading"
          className="bg-assistjur-purple-darker/60 px-4 py-16 md:py-20"
        >
          <SectionHeading
            badge="Como funciona"
            id="como-funciona-heading"
            title="3 passos para começar"
          />
          <div className="mx-auto mt-12 grid max-w-3xl gap-10 sm:grid-cols-3">
            <StepCard
              description="Arraste PDFs de petições, contestações ou qualquer documento jurídico. A IA extrai e comprime automaticamente."
              number={1}
              title="Upload dos documentos"
            />
            <StepCard
              description="Escolha o agente ideal: revisão de defesa, redação de contestação, ou análise geral."
              number={2}
              title="Selecione o agente"
            />
            <StepCard
              description="Receba parecer executivo, análise de risco, quadro de pedidos e roteiros de audiência."
              number={3}
              title="Análise em minutos"
            />
          </div>
        </section>

        {/* ── Pricing ──────────────────────────────────────────────────── */}
        <section
          aria-labelledby="planos-heading"
          className="px-4 py-16 md:py-20"
          id="planos"
        >
          <SectionHeading
            badge="Planos"
            id="planos-heading"
            subtitle="Comece grátis. Escale quando precisar."
            title="Escolha o plano ideal"
          />
          <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-3">
            <PricingCard
              features={[
                "20 mensagens/mês",
                "1 agente (Assistente Geral)",
                "Upload até 5 MB por arquivo",
                "Extração de texto de PDFs",
              ]}
              name="Grátis"
              price="R$ 0"
            />
            <PricingCard
              features={[
                "Mensagens ilimitadas",
                "Todos os 4 agentes",
                "Base de conhecimento",
                "Processos vinculados",
                "Compressão automática de PDFs",
                "Suporte por email",
              ]}
              name="Pro"
              period="mês"
              popular
              price="R$ 97"
            />
            <PricingCard
              features={[
                "Tudo do Pro",
                "API de integração",
                "Suporte prioritário",
                "SLA de disponibilidade",
                "Onboarding personalizado",
              ]}
              name="Enterprise"
              period="mês"
              price="Sob consulta"
            />
          </div>
        </section>

        {/* ── Lead form ────────────────────────────────────────────────── */}
        <section
          aria-labelledby="formulario-heading"
          className="bg-assistjur-purple-darker/60 px-4 py-16 md:py-20"
          id="formulario"
        >
          <SectionHeading
            badge="Teste grátis"
            id="formulario-heading"
            subtitle="Preencha o formulário e receba acesso à plataforma."
            title="Comece sua avaliação gratuita"
          />
          <LeadForm />
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-assistjur-purple-dark/50 border-t py-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 text-center text-assistjur-gray-light text-sm">
          <AssistJurLogo className="text-sm" iconSize={20} variant="full" />
          <nav aria-label="Rodapé" className="flex gap-6">
            <Link className="hover:text-white" href="/login">
              Entrar
            </Link>
            <Link className="hover:text-white" href="/register">
              Cadastrar
            </Link>
            <Link className="hover:text-white" href="/privacy">
              Privacidade
            </Link>
          </nav>
          <p className="text-white/30 text-xs">
            Relatórios gerados por IA. Revisão humana necessária e obrigatória.
          </p>
        </div>
      </footer>
    </div>
  );
}
