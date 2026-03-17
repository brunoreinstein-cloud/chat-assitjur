/**
 * Tipos para o Relatório de Análise Estruturada de processo trabalhista.
 *
 * Estrutura em 6 módulos:
 *   M1 — Identificação do Processo
 *   M2 — Dados do Contrato
 *   M3 — Mapa de Pedidos
 *   M4 — Alertas e Pontos de Atenção
 *   M5 — Documentos (checklist)
 *   M6 — Próximos Passos
 */

// ---------------------------------------------------------------------------
// Entidades base
// ---------------------------------------------------------------------------

export interface Parte {
  nome: string;
  cpfCnpj: string | null;
  /** Endereço resumido (cidade/UF). */
  localidade: string | null;
}

export interface Advogado {
  nome: string;
  oab: string | null;
  email: string | null;
}

// ---------------------------------------------------------------------------
// M1 — Identificação do Processo
// ---------------------------------------------------------------------------

export interface IdentificacaoProcesso {
  numeroProcesso: string | null;
  vara: string | null;
  comarca: string | null;
  reclamante: Parte;
  reclamada: Parte;
  advogadoReclamante: Advogado | null;
  advogadoReclamada: Advogado | null;
  /** Data de ajuizamento (ISO YYYY-MM-DD). */
  dataAjuizamento: string | null;
  /** Data/hora de audiência, se visível. */
  dataAudiencia: string | null;
}

// ---------------------------------------------------------------------------
// M2 — Dados do Contrato
// ---------------------------------------------------------------------------

export interface EventoContrato {
  /** ISO YYYY-MM-DD */
  data: string;
  descricao: string;
  /** Ex.: "fl. 5" ou "pág. 12" */
  pagReferencia: string | null;
}

export interface JornadaAlegada {
  /** Ex.: "6x1", "5x2" */
  escala: string;
  /** Horários típicos por turno. */
  horarios: string[];
  observacoes: string | null;
}

export interface DadosContrato {
  /** ISO YYYY-MM-DD */
  admissao: string | null;
  /** ISO YYYY-MM-DD */
  termino: string | null;
  modalidadeRescisao: string | null;
  /** Cargo registrado na CTPS. */
  cargoCtps: string | null;
  /** Cargo efetivamente exercido segundo a petição. */
  cargoReal: string | null;
  salarioInicial: number | null;
  salarioFinal: number | null;
  eventosCronologicos: EventoContrato[];
  jornadaAlegada: JornadaAlegada | null;
}

// ---------------------------------------------------------------------------
// M3 — Mapa de Pedidos
// ---------------------------------------------------------------------------

export type NivelRisco = "provavel" | "possivel" | "remoto";

export interface Pedido {
  /** Número sequencial do pedido (1, 2, 3…). */
  numero: number;
  /** Ex.: "Horas extras", "Adicional de insalubridade". */
  verba: string;
  /** Valor em R$ pleiteado (null se não quantificado). */
  valorPleiteado: number | null;
  /** Fundamento legal resumido. Ex.: "CLT art. 59 + Súmula 338 TST". */
  fundamentoLegal: string | null;
  /** Documentos/provas indicados. */
  provas: string[];
  /** Nível de risco para a reclamada. */
  risco: NivelRisco | null;
  observacoes: string | null;
}

// ---------------------------------------------------------------------------
// M4 — Alertas
// ---------------------------------------------------------------------------

export type TipoAlerta = "critico" | "atencao" | "informativo";

export interface Alerta {
  tipo: TipoAlerta;
  /** Módulo de origem. Ex.: "M1", "M2", "dossiê". */
  modulo: string;
  mensagem: string;
  /** Acção recomendada para o advogado. */
  acao: string | null;
}

// ---------------------------------------------------------------------------
// M5 — Documentos
// ---------------------------------------------------------------------------

export type StatusDocumento = "disponivel" | "ausente" | "parcial";

export interface DocumentoStatus {
  nome: string;
  status: StatusDocumento;
  /** Intervalo de páginas, se disponível. Ex.: "págs. 1–16". */
  paginas: string | null;
  observacoes: string | null;
}

// ---------------------------------------------------------------------------
// M6 — Próximos Passos
// ---------------------------------------------------------------------------

export type Responsavel = "advogado" | "ia" | "sistema";
export type Prioridade = "alta" | "media" | "baixa";

export interface ProximoPasso {
  descricao: string;
  responsavel: Responsavel;
  prioridade: Prioridade;
  concluido: boolean;
}

// ---------------------------------------------------------------------------
// Relatório completo
// ---------------------------------------------------------------------------

export interface RelatorioAnalise {
  /** UUID gerado pelo criador. */
  id: string;
  /** ISO timestamp de geração. */
  geradoEm: string;
  versao: "1.0";

  /** M1 */
  identificacao: IdentificacaoProcesso;
  /** M2 */
  contrato: DadosContrato;
  /** M3 — lista de pedidos */
  pedidos: Pedido[];
  /** Soma dos valorPleiteado (null se nenhum pedido tem valor). */
  valorTotalPleiteado: number | null;
  /** M4 — alertas consolidados de todos os módulos */
  alertas: Alerta[];
  /** M5 — checklist de documentos */
  documentos: DocumentoStatus[];
  /** M6 */
  proximosPassos: ProximoPasso[];
}

// ---------------------------------------------------------------------------
// Helpers de type guard
// ---------------------------------------------------------------------------

export function isRelatorioAnalise(v: unknown): v is RelatorioAnalise {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.versao === "string" &&
    typeof r.identificacao === "object" &&
    Array.isArray(r.pedidos) &&
    Array.isArray(r.alertas) &&
    Array.isArray(r.documentos) &&
    Array.isArray(r.proximosPassos)
  );
}
