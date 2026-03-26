"use client";

import { AgentCard } from "@/components/agent-card";
import { CaseCard } from "@/components/case-card";
import { FlowCard } from "@/components/flow-card";
import { PromptComposer } from "@/components/prompt-composer";
import type { SourceItem } from "@/components/source-panel";
import { SourcePanel } from "@/components/source-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const SAMPLE_SOURCES: SourceItem[] = [
  {
    id: "1",
    type: "document",
    title: "Petição Inicial — Ygor × CBD",
    page: "p. 12, §3",
    confidence: "source-document",
    excerpt:
      "O reclamante alega que trabalhou em regime de horas extras sem o pagamento correspondente, conforme demonstrado pelos cartões de ponto juntados.",
  },
  {
    id: "2",
    type: "jurisprudencia",
    title: "TST — RR-1234/2023",
    page: "p. 3",
    confidence: "source-suggested",
    excerpt:
      "A Corte entende que o ônus da prova recai sobre o empregador quando há indícios de supressão de horas extras.",
  },
  {
    id: "3",
    type: "legislacao",
    title: "CLT Art. 74 §2º",
    confidence: "source-verified",
    excerpt:
      "Para os estabelecimentos de mais de dez trabalhadores será obrigatória a anotação da hora de entrada e de saída.",
  },
  {
    id: "4",
    type: "document",
    title: "Atestado Médico — fev/2024",
    confidence: "source-review",
    excerpt:
      "Documento sem autenticação. Requer verificação da assinatura do médico responsável.",
  },
];

export default function DesignShowcasePage() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-6xl space-y-12">
        <div>
          <h1 className="font-bold text-3xl text-foreground">
            Design System v3.0 — Showcase
          </h1>
          <p className="mt-1 text-muted-foreground">
            Plataforma de trabalho jurídico
          </p>
        </div>

        {/* Badges */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg">Badges</h2>
          <div className="flex flex-wrap gap-2">
            <Badge variant="default">Default</Badge>
            <Badge variant="secondary">Secundário</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="success">Concluído</Badge>
            <Badge variant="warning">Atenção</Badge>
            <Badge variant="error">Erro</Badge>
            <Badge variant="workflow-draft">Rascunho</Badge>
            <Badge variant="workflow-active">Ativo</Badge>
            <Badge variant="workflow-review">Em revisão</Badge>
            <Badge variant="workflow-done">Concluído</Badge>
            <Badge variant="workflow-blocked">Bloqueado</Badge>
            <Badge variant="source-document">Fonte</Badge>
            <Badge variant="source-suggested">Sugestão</Badge>
            <Badge variant="source-review">Revisão necessária</Badge>
            <Badge variant="source-verified">Verificado</Badge>
          </div>
        </section>

        {/* Buttons */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg">Buttons</h2>
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive">Destrutivo</Button>
          </div>
        </section>

        {/* CaseCards */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg">CaseCard</h2>
          <div className="flex flex-wrap gap-4">
            <CaseCard
              court="2ª Vara do Trabalho de SP"
              parties="Ygor Santos vs CBD Indústria Ltda"
              processNumber="0001234-56.2024.5.02.0001"
              status="ativo"
              title="Ygor Santos × CBD Indústria"
              updatedAt="há 2 horas"
            />
            <CaseCard
              court="15ª Vara do Trabalho"
              parties="Maria Oliveira vs TechCorp S.A."
              processNumber="0009876-12.2023.5.02.0015"
              status="revisao"
              title="Maria Oliveira × TechCorp"
              updatedAt="há 3 dias"
            />
            <CaseCard
              parties="João Pereira vs Empresa ABC"
              processNumber="0005555-00.2022.5.02.0008"
              status="concluido"
              title="João Pereira × Empresa ABC"
              updatedAt="há 1 mês"
            />
          </div>
        </section>

        {/* FlowCards */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg">FlowCard</h2>
          <div className="flex flex-wrap gap-4">
            <FlowCard
              area="Trabalhista"
              ctaLabel="Iniciar revisão"
              description="Auditoria completa da contestação: estrutura, teses defensivas e cobertura dos pedidos."
              inputs={["petição inicial", "contestação"]}
              output="relatório de revisão"
              title="Revisar defesa"
            />
            <FlowCard
              area="Trabalhista"
              ctaLabel="Redigir contestação"
              description="Redação assistida de contestação trabalhista com base na petição inicial."
              inputs={["petição inicial"]}
              output="minuta de contestação"
              title="Redigir contestação"
            />
            <FlowCard
              area="Trabalhista"
              ctaLabel="Avaliar risco"
              description="Mapeamento de pedidos, probabilidade de êxito e provisão recomendada."
              inputs={["petição inicial", "contestação"]}
              output="carta de prognóstico"
              title="Avaliar risco processual"
            />
          </div>
        </section>

        {/* AgentCards */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg">AgentCard</h2>
          <div className="flex flex-wrap gap-4">
            <AgentCard
              capabilities={["Revisão", "Auditoria", "Análise"]}
              description="Audita contestações e identifica pontos fracos da defesa trabalhista."
              name="Revisor de Defesas"
            />
            <AgentCard
              capabilities={["Redação", "Jurisprudência"]}
              description="Redige contestações trabalhistas completas a partir da petição inicial."
              isActive
              name="Redator de Contestações"
            />
            <AgentCard
              capabilities={["Relatório", "DOCX", "XLSX", "Análise"]}
              description="Geração de relatórios jurídicos avançados com 14 módulos especializados."
              name="AssistJur Master"
            />
          </div>
        </section>

        {/* PromptComposer */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg">
            PromptComposer
          </h2>
          <div className="max-w-2xl">
            <PromptComposer
              agentName="Revisor de Defesas"
              caseName="Ygor × CBD"
              docSummary="2 PDFs · 48 páginas"
              onChange={() => {
                /* noop for demo */
              }}
              onSubmit={() => {
                /* noop for demo */
              }}
              suggestions={[
                {
                  label: "Revisar defesa anexada",
                  text: "Quero revisar a defesa que vou anexar agora.",
                },
                {
                  label: "Auditar contestação",
                  text: "Auditar minha contestação: segue em anexo.",
                },
                {
                  label: "Teses defensivas",
                  text: "Quais as principais teses defensivas para horas extras?",
                },
              ]}
              value=""
            />
          </div>
        </section>

        {/* SourcePanel */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg">SourcePanel</h2>
          <div className="flex h-[500px] w-fit overflow-hidden rounded-lg border">
            <SourcePanel sources={SAMPLE_SOURCES} />
          </div>
        </section>
      </div>
    </div>
  );
}
