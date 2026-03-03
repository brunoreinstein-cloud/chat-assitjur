import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AGENT_IDS, getAgentConfig } from "@/lib/ai/agents-registry-metadata";

export const metadata: Metadata = {
  title: "Ajuda",
  description:
    "Guia do AssistJur: agentes, base de conhecimento, créditos, ficheiros e funcionalidades.",
};

export default function AjudaPage() {
  return (
    <main className="flex flex-1 flex-col p-4 md:p-6">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header>
          <h1 className="font-semibold text-2xl text-foreground tracking-tight">
            Ajuda
          </h1>
          <p className="mt-1 text-muted-foreground">
            Visão geral do projeto e das funcionalidades atuais do AssistJur.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>O que é o AssistJur?</CardTitle>
            <CardDescription>
              Plataforma de agentes de IA para contencioso trabalhista
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground text-sm">
            <p>
              O AssistJur é uma aplicação de chat com agentes de IA
              especializados em{" "}
              <strong className="text-foreground">
                contencioso trabalhista
              </strong>
              . Pode conversar em tempo real (streaming), guardar histórico de
              conversas, usar uma base de conhecimento (teses, precedentes) e
              anexar ficheiros às mensagens.
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <strong className="text-foreground">Chat com LLM</strong> —
                streaming, histórico, múltiplos agentes.
              </li>
              <li>
                <strong className="text-foreground">
                  Base de conhecimento
                </strong>{" "}
                — documentos seus injetados no contexto do chat (até 50 por
                conversa).
              </li>
              <li>
                <strong className="text-foreground">Ferramentas</strong> —
                clima, criar/atualizar documento, sugestões.
              </li>
              <li>
                <strong className="text-foreground">Autenticação</strong> —
                conta ou modo visitante (sem conta; histórico não é guardado).
              </li>
              <li>
                <strong className="text-foreground">Upload de ficheiros</strong>{" "}
                — PDF e outros formatos no chat.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agentes disponíveis</CardTitle>
            <CardDescription>
              Escolha o agente no início da conversa ou na barra lateral
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4 text-sm">
              {AGENT_IDS.map((id) => {
                const config = getAgentConfig(id);
                return (
                  <li
                    className="border-border border-b pb-4 last:border-0 last:pb-0"
                    key={id}
                  >
                    <span className="font-semibold text-foreground">
                      {config.label}
                    </span>
                    {config.description && (
                      <p className="mt-1 text-muted-foreground">
                        {config.description}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-muted-foreground text-xs">
              Pode ainda enviar{" "}
              <strong className="text-foreground">instruções do agente</strong>{" "}
              por conversa (campo opcional na área de mensagem) para orientar
              tom, formato ou foco. O Redator de Contestações pode usar o modo{" "}
              <strong className="text-foreground">@bancodetese</strong> com
              documentos da base de conhecimento.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Base de conhecimento</CardTitle>
            <CardDescription>
              Documentos que o agente usa como contexto
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-muted-foreground text-sm">
            <p>
              A base de conhecimento guarda os seus documentos (teses,
              precedentes, cláusulas-modelo, jurisprudência). Pode criar e
              editar documentos e, em cada chat, escolher até 50 documentos para
              serem incluídos no contexto do agente.
            </p>
            <p>
              <strong className="text-foreground">Como usar:</strong> no header
              do chat, abra &quot;Base de conhecimento&quot; e selecione os
              documentos que quer usar na conversa. No Redator de Contestações
              pode referir teses com{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                @bancodetese
              </code>
              .
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Créditos e uso</CardTitle>
            <CardDescription>Saldo de créditos e consumo de IA</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-muted-foreground text-sm">
            <p>
              Cada utilizador tem um saldo de{" "}
              <strong className="text-foreground">créditos</strong>. As
              respostas do chat consomem créditos em função dos tokens
              utilizados. O saldo aparece na barra lateral; pode ver o histórico
              de consumo em detalhe na página de uso.
            </p>
            <p>
              <Link
                className="font-medium text-primary underline-offset-4 hover:underline"
                href="/uso"
              >
                Ver página Uso e créditos →
              </Link>{" "}
              (requer início de sessão).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ficheiros e PDF no chat</CardTitle>
            <CardDescription>Anexar documentos às mensagens</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-muted-foreground text-sm">
            <p>
              Pode anexar ficheiros (incluindo PDF) às mensagens. O conteúdo é
              extraído no servidor e enviado ao modelo como parte do contexto.
              Formatos suportados dependem da configuração (ex.: PDF, imagens).
              Os ficheiros são guardados em Vercel Blob ou Supabase Storage.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Modo visitante</CardTitle>
            <CardDescription>Usar o chat sem criar conta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-muted-foreground text-sm">
            <p>
              Pode usar o chat como{" "}
              <strong className="text-foreground">visitante (guest)</strong>. O
              histórico e as conversas não são guardados de forma permanente; ao
              sair, perde o acesso a esse histórico. Para guardar conversas e
              usar a base de conhecimento de forma persistente, crie uma conta.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Administração</CardTitle>
            <CardDescription>
              Agentes built-in e créditos (acesso restrito)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-muted-foreground text-sm">
            <p>
              A rota{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                /admin/agents
              </code>{" "}
              permite listar e editar as instruções e etiquetas dos agentes
              built-in. O painel de créditos permite gerir saldos dos
              utilizadores. O acesso é protegido por uma chave de administrador,
              configurável no servidor (variável ADMIN_CREDITS_SECRET).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documentação técnica</CardTitle>
            <CardDescription>
              Para desenvolvedores e agentes de IA
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-muted-foreground text-sm">
            <ul className="space-y-1">
              <li>
                <strong className="text-foreground">README</strong> — visão
                geral, stack, comandos e links no repositório.
              </li>
              <li>
                <strong className="text-foreground">AGENTS.md</strong> — guia
                para agentes de IA: estrutura, regras, variáveis de ambiente,
                base de conhecimento, painel admin.
              </li>
              <li>
                <strong className="text-foreground">docs/</strong> —
                documentação do Revisor de Defesas, Redator de Contestações,
                créditos LLM, AI Drive Jurídico, PDFs, otimização de tokens,
                etc.
              </li>
            </ul>
            <p className="pt-2">
              Estes recursos estão no repositório do projeto; não são servidos
              pela aplicação em produção.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
