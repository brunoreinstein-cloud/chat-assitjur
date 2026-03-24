/**
 * Routing automático cliente → módulo(s) do AssistJur.IA Master.
 * Playbook v9.0 Sprint 3 — Gap 10.
 *
 * Quando o CNPJ da Reclamada é detectado nos documentos do processo,
 * o agente deve ativar automaticamente o(s) módulo(s) padrão daquele cliente
 * em vez de aguardar comando explícito do utilizador.
 *
 * Uso (nas instruções do Master):
 *   Detectar CNPJ → consultar esta tabela → ativar módulo padrão
 */

export interface ClienteConfig {
  /** Nome comercial do cliente para exibição */
  nome: string;
  /**
   * Lista de prefixos CNPJ (8 dígitos — raiz, ignora filial).
   * Um CNPJ pertence a este cliente se seus primeiros 8 dígitos constarem aqui.
   */
  cnpjRaizes: string[];
  /** Módulos padrão para este cliente (em ordem de prioridade) */
  modulosPadrao: ModuloId[];
  /** Módulos opcionais disponíveis para este cliente */
  modulosOpcionais?: ModuloId[];
  /** Observação para o agente (ex.: template específico, particularidades) */
  nota?: string;
}

export type ModuloId =
  | "M01"
  | "M02"
  | "M03"
  | "M04"
  | "M05"
  | "M06"
  | "M07"
  | "M08"
  | "M09"
  | "M10"
  | "M11"
  | "M12"
  | "M13"
  | "M14";

/** Dataset de clientes conhecidos — atualizar conforme novos clientes são incorporados. */
export const CLIENTES: ClienteConfig[] = [
  {
    nome: "GPA — Grupo Pão de Açúcar",
    cnpjRaizes: ["47508411", "33041260"],
    modulosPadrao: ["M05", "M09"],
    modulosOpcionais: ["M01", "M06", "M08"],
    nota:
      "M05 = Formulário OBF (Obrigação de Fazer). M06 = Ficha Apólice/Garantia GPA. " +
      "M09 = Encerramento para upload no sistema interno. M08 = Cadastro eLaw.",
  },
  {
    nome: "DPSP — Drogaria São Paulo / Raia Drogasil",
    cnpjRaizes: ["61412110", "02762115"],
    modulosPadrao: ["M04"],
    modulosOpcionais: ["M01", "M08", "M09"],
    nota:
      "M04 = Relatório DPSP (template específico com campos padronizados do cliente). " +
      "Usar template Lock para M04 — localizar template na Base de Conhecimento.",
  },
  {
    nome: "Autuori & Burmann",
    cnpjRaizes: ["04716415"],
    modulosPadrao: ["M02", "M07"],
    modulosOpcionais: ["M01", "M11"],
    nota:
      "M02 = Carta de Prognóstico Autuori (template Lock — carregar template da KB). " +
      "M07 = Auditoria Corporativa (DOCX + XLSX). M11 = Análise Estratégica TST quando recursal.",
  },
  {
    nome: "CBD — Companhia Brasileira de Distribuição",
    cnpjRaizes: ["47508411"],
    modulosPadrao: ["M01", "M09"],
    modulosOpcionais: ["M05", "M08"],
    nota: "Mesmo grupo que GPA. M01 = Relatório Processual genérico para CBD.",
  },
];

/**
 * Tenta identificar o cliente pelo CNPJ (raiz = primeiros 8 dígitos).
 * Retorna o ClienteConfig se encontrado, null se CNPJ desconhecido.
 */
export function routeClienteByCNPJ(cnpj: string): ClienteConfig | null {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length < 8) {
    return null;
  }

  const raiz = digits.slice(0, 8);
  return CLIENTES.find((c) => c.cnpjRaizes.includes(raiz)) ?? null;
}

/**
 * Formata uma sugestão de routing para incluir na resposta do agente.
 * Usado nas instruções do Master quando o CNPJ é detectado mas o módulo não foi especificado.
 */
export function formatRoutingSuggestion(cliente: ClienteConfig): string {
  const principais = cliente.modulosPadrao.join(", ");
  const opcionais = cliente.modulosOpcionais?.join(", ") ?? "—";
  return (
    `Cliente detectado: **${cliente.nome}**\n` +
    `Módulos padrão: ${principais}\n` +
    `Módulos opcionais: ${opcionais}\n` +
    (cliente.nota ? `Nota: ${cliente.nota}` : "")
  );
}
