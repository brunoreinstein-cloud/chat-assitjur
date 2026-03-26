import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade — AssistJur",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-8 font-bold text-3xl text-foreground">
        Política de Privacidade
      </h1>

      <div className="prose prose-sm max-w-none text-muted-foreground">
        <p className="mb-4">
          <strong>Última atualização:</strong> Março de 2026
        </p>

        <h2 className="mt-8 mb-4 font-semibold text-foreground text-lg">
          1. Dados coletados
        </h2>
        <p>
          O AssistJur coleta apenas os dados estritamente necessários para o
          funcionamento do serviço: e-mail, senha (armazenada como hash
          criptográfico), conversas com os agentes de IA, documentos enviados
          para análise e dados de uso (tokens consumidos, modelos utilizados).
        </p>

        <h2 className="mt-8 mb-4 font-semibold text-foreground text-lg">
          2. Uso dos dados
        </h2>
        <p>
          Os seus dados são utilizados exclusivamente para fornecer o serviço de
          assistência jurídica por IA. Conversas e documentos NÃO são utilizados
          para treinar modelos de inteligência artificial. Utilizamos APIs de
          terceiros (Anthropic, OpenAI, Google, xAI) com políticas que excluem o
          uso dos seus dados para treino.
        </p>

        <h2 className="mt-8 mb-4 font-semibold text-foreground text-lg">
          3. Seus direitos (LGPD)
        </h2>
        <p>Conforme a Lei 13.709/2018 (LGPD), você tem direito a:</p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>
            <strong>Acesso:</strong> solicitar cópia de todos os seus dados
          </li>
          <li>
            <strong>Portabilidade:</strong> exportar seus dados em formato JSON
          </li>
          <li>
            <strong>Eliminação:</strong> solicitar a exclusão permanente da sua
            conta e todos os dados associados
          </li>
          <li>
            <strong>Correção:</strong> solicitar a correção de dados incorretos
          </li>
        </ul>
        <p className="mt-4">
          Para exercer seus direitos, acesse as configurações da sua conta ou
          entre em contato pelo e-mail indicado abaixo.
        </p>

        <h2 className="mt-8 mb-4 font-semibold text-foreground text-lg">
          4. Retenção de dados
        </h2>
        <p>
          Os dados são mantidos enquanto a conta estiver ativa. Após a exclusão
          da conta, todos os dados são removidos permanentemente em até 30 dias.
        </p>

        <h2 className="mt-8 mb-4 font-semibold text-foreground text-lg">
          5. Segurança
        </h2>
        <p>
          Utilizamos criptografia em trânsito (TLS/HTTPS), senhas armazenadas
          com hash bcrypt, isolamento de dados por utilizador e controle de
          acesso baseado em perfis (RBAC).
        </p>

        <h2 className="mt-8 mb-4 font-semibold text-foreground text-lg">
          6. Contato
        </h2>
        <p>
          Para questões sobre privacidade ou exercício dos seus direitos LGPD,
          entre em contato com o Encarregado de Proteção de Dados (DPO) pelo
          e-mail: <strong>privacidade@assistjur.com.br</strong>
        </p>
      </div>
    </div>
  );
}
