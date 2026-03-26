"use client";

import { AgentCard } from "@/components/agent-card";
import { CaseCard } from "@/components/case-card";
import { FlowCard } from "@/components/flow-card";
import { PromptComposer } from "@/components/prompt-composer";
import { SourcePanel } from "@/components/source-panel";
import type { SourceItem } from "@/components/source-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const SAMPLE_SOURCES: SourceItem[] = [
  {
    id: "1",
    type: "document",
    title: "Petição Inicial — Ygor × CBD",
    page: "p. 12, §3",
    confidence: "source",
    excerpt: "O reclamante alega que trabalhou em regime de horas extras sem o pagamento correspondente, conforme demonstrado pelos cartões de ponto juntados.",
  },
  {
    id: "2",
    type: "jurisprudencia",
    title: "TST — RR-1234/2023",
    page: "p. 3",
    confidence: "inference",
    excerpt: "A Corte entende que o ônus da prova recai sobre o empregador quando há indícios de supressão de horas extras.",
  },
  {
    id: "3",
    type: "legislacao",
    title: "CLT Art. 74 §2º",
    confidence: "verified",
    excerpt: "Para os estabelecimentos de mais de dez trabalhadores será obrigatória a anotação da hora de entrada e de saída.",
  },
  {
    id: "4",
    type: "document",
    title: "Atestado Médico — fev/2024",
    confidence: "needs-review",
    excerpt: "Documento sem autenticação. Requer verificação da assinatura do médico responsável.",
  },
];

export default function DesignShowcasePage() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-6xl space-y-12">
        <div>
          <h1 className="font-bold text-foreground text-3xl">Design System — Showcase</h1>
          <p className="mt-1 text-muted-foreground">Componentes compostos v2.0</p>
        </div>

        {/* Badges */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg">Badges</h2>
          <div className="flex flex-wrap gap-2">
            <Badge variant="default">Default</Badge>
            <Badge variant="brand">Trabalhista</Badge>
            <Badge variant="gold">Premium</Badge>
            <Badge variant="success">Concluído</Badge>
            <Badge variant="warning">Atenção</Badge>
            <Badge variant="error">Erro</Badge>
            <Badge variant="workflow-draft">Rascunho</Badge>
            <Badge variant="workflow-active">Ativo</Badge>
            <Badge variant="workflow-review">Em revisão</Badge>
            <Badge variant="workflow-done">Concluído</Badge>
            <Badge variant="workflow-blocked">Bloqueado</Badge>
            <Badge variant="source">Fonte</Badge>
            <Badge variant="inference">Inferência</Badge>
            <Badge variant="needs-review">Revisar</Badge>
            <Badge variant="verified">Verificado</Badge>
          </div>
        </section>

        {/* Buttons */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg">Buttons</h2>
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="outline-brand">Outline Brand</Button>
            <Button variant="gold">Gold CTA</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destrutivo</Button>
          </div>
        </section>

        {/* CaseCards */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg">CaseCard</h2>
          <div className="flex flex-wrap gap-4">
            <CaseCard
              title="Ygor Santos × CBD Indústria"
              processNumber="0001234-56.2024.5.02.0001"
              status="ativo"
              court="2ª Vara do Trabalho de SP"
              parties="Ygor Santos vs CBD Indústria Ltda"
              updatedAt="há 2 horas"
              progress={65}
            />
            <CaseCard
              title="Maria Oliveira × TechCorp"
              processNumber="0009876-12.2023.5.02.0015"
              status="revisao"
              court="15ª Vara do Trabalho"
              parties="Maria Oliveira vs TechCorp S.A."
              updatedAt="há 3 dias"
              progress={40}
            />
            <CaseCard
              title="João Pereira × Empresa ABC"
              processNumber="0005555-00.2022.5.02.0008"
              status="concluido"
              parties="João Pereira vs Empresa ABC"
              updatedAt="há 1 mês"
              progress={100}
            />
          </div>
        </section>

        {/* FlowCards */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg">FlowCard</h2>
          <div className="flex flex-wrap gap-4">
            <FlowCard
              icon="🔍"
              title="Revisar defesa"
              description="Auditoria completa da contestação: estrutura, teses defensivas e cobertura dos pedidos."
              inputs={["petição inicial", "contestação"]}
              output="relatório de revisão"
              estimate="~3 min"
              area="Trabalhista"
              ctaLabel="Iniciar revisão"
            />
            <FlowCard
              icon="✍️"
              title="Gerar contestação"
              description="Redação assistida de contestação trabalhista com base na petição inicial."
              inputs={["petição inicial"]}
              output="minuta de contestação"
              estimate="~5 min"
              area="Trabalhista"
              ctaLabel="Gerar contestação"
            />
            <FlowCard
              icon="📊"
              title="Avaliar risco processual"
              description="Mapeamento de pedidos, probabilidade de êxito e provisão recomendada."
              inputs={["petição inicial", "contestação"]}
              output="carta de prognóstico"
              estimate="~4 min"
              area="Trabalhista"
              ctaLabel="Avaliar risco"
            />
          </div>
        </section>

        {/* AgentCards */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg">AgentCard</h2>
          <div className="flex flex-wrap gap-4">
            <AgentCard
              avatar="🔍"
              name="Revisor de Defesas"
              role="Audita contestações e identifica pontos fracos da defesa trabalhista."
              capabilities={["Revisão", "Auditoria", "Análise"]}
            />
            <AgentCard
              avatar="✍️"
              name="Redator de Contestações"
              role="Redige contestações trabalhistas completas a partir da petição inicial."
              capabilities={["Redação", "Jurisprudência"]}
              isActive
            />
            <AgentCard
              avatar="⚡"
              name="AssistJur Master"
              role="Geração de relatórios jurídicos avançados com 14 módulos especializados."
              capabilities={["Relatório", "DOCX", "XLSX", "Análise"]}
            />
          </div>
        </section>

        {/* PromptComposer */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg">PromptComposer</h2>
          <div className="max-w-2xl">
            <PromptComposer
              value=""
              onChange={() => {}}
              onSubmit={() => {}}
              caseName="Ygor × CBD"
              agentName="Revisor de Defesas"
              docSummary="2 PDFs · 48 páginas"
              suggestions={[
                { label: "📎 Revisar defesa anexada", text: "Quero revisar a defesa que vou anexar agora." },
                { label: "🔍 Auditar contestação", text: "Auditar minha contestação: segue em anexo." },
                { label: "⚡ Teses defensivas", text: "Quais as principais teses defensivas para horas extras?" },
              ]}
            />
          </div>
        </section>

        {/* SourcePanel */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg">SourcePanel</h2>
          <div className="flex h-[500px] rounded-lg border overflow-hidden w-fit">
            <SourcePanel sources={SAMPLE_SOURCES} />
          </div>
        </section>
      </div>
    </div>
  );
}
