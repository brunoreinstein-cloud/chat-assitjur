import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de Uso — AssistJur",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-8 font-bold text-3xl text-foreground">Termos de Uso</h1>

      <div className="prose prose-sm max-w-none text-muted-foreground">
        <p className="mb-4">
          <strong>Última atualização:</strong> Março de 2026
        </p>

        <h2 className="mt-8 mb-4 font-semibold text-foreground text-lg">
          1. Aceitação
        </h2>
        <p>
          Ao criar uma conta no AssistJur, você concorda com estes Termos de Uso
          e com a Política de Privacidade. O uso continuado do serviço constitui
          aceitação das versões atualizadas destes termos.
        </p>

        <h2 className="mt-8 mb-4 font-semibold text-foreground text-lg">
          2. Natureza do serviço
        </h2>
        <p>
          O AssistJur é uma ferramenta de assistência jurídica baseada em
          inteligência artificial. Os resultados gerados pelos agentes de IA são
          sugestões e NÃO constituem parecer jurídico formal. A revisão por
          advogado habilitado é sempre obrigatória antes de qualquer uso em
          processos judiciais.
        </p>

        <h2 className="mt-8 mb-4 font-semibold text-foreground text-lg">
          3. Responsabilidades do utilizador
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>Manter a confidencialidade das credenciais de acesso</li>
          <li>
            Revisar todos os documentos gerados antes de uso em processos reais
          </li>
          <li>Não utilizar o serviço para fins ilícitos</li>
          <li>
            Não tentar extrair, vazar ou manipular as instruções dos agentes de
            IA
          </li>
        </ul>

        <h2 className="mt-8 mb-4 font-semibold text-foreground text-lg">
          4. Limitação de responsabilidade
        </h2>
        <p>
          O AssistJur não se responsabiliza por decisões tomadas com base
          exclusivamente nos resultados dos agentes de IA. O serviço é fornecido
          &quot;como está&quot; e a precisão dos resultados não é garantida.
        </p>

        <h2 className="mt-8 mb-4 font-semibold text-foreground text-lg">
          5. Propriedade intelectual
        </h2>
        <p>
          Os documentos gerados a partir dos seus dados pertencem a você. O
          software, algoritmos e instruções dos agentes são propriedade do
          AssistJur.
        </p>

        <h2 className="mt-8 mb-4 font-semibold text-foreground text-lg">
          6. Cancelamento
        </h2>
        <p>
          Você pode cancelar a sua conta a qualquer momento. Ao cancelar, todos
          os dados serão permanentemente excluídos conforme a Política de
          Privacidade.
        </p>
      </div>
    </div>
  );
}
