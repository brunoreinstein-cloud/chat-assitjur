/**
 * Contrato tipado para os eventos de streaming de documentos.
 * Cada agente usa um prefixo exclusivo para evitar colisões com o artifact panel.
 *
 * Prefixos:
 * - rdoc     → Revisor de Defesas / Avaliador de Contestação
 * - mdoc     → Master agent
 * - autuoria → AutuorIA
 * - redator  → Redator de Contestações
 */

/** Prefixos de streaming usados pelas document tools. */
export type DocStreamPrefix = "rdoc" | "mdoc" | "autuoria" | "redator";

/** Eventos de ciclo de vida por prefixo (Start → Id → Title → Kind → Clear → Delta → Finish → Done). */
export type DocStreamLifecycleEvent<P extends string> =
  | `data-${P}Start`
  | `data-${P}Id`
  | `data-${P}Title`
  | `data-${P}Kind`
  | `data-${P}Clear`
  | `data-${P}Delta`
  | `data-${P}Finish`
  | `data-${P}Done`;

/** Eventos de progresso (nomes específicos por agente, não seguem o padrão do prefixo). */
export type DocStreamProgressEvent =
  | "data-revisorProgress"
  | "data-masterProgress"
  | "data-masterTitle"
  | "data-autuoriaProgress"
  | "data-redatorProgress"
  | "data-generationStatus";

/** Todos os tipos válidos de eventos de streaming de documentos. */
export type DocumentStreamEventType =
  | DocStreamLifecycleEvent<"rdoc">
  | DocStreamLifecycleEvent<"mdoc">
  | DocStreamLifecycleEvent<"autuoria">
  | DocStreamLifecycleEvent<"redator">
  | DocStreamProgressEvent;

/** Constrói o tipo de evento a partir do prefixo + sufixo. */
export function docEvent<P extends DocStreamPrefix>(
  prefix: P,
  suffix: string
): `data-${P}${string}` {
  return `data-${prefix}${suffix}` as `data-${P}${string}`;
}

/** Tamanho do chunk para streaming de conteúdo (chars). */
export const DOC_STREAM_CHUNK_SIZE = 400;
