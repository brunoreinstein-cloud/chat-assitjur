/**
 * Modo debug para o chat: ativar com DEBUG_CHAT=true ou DEBUG_CHAT=1.
 * Regista no servidor um resumo do pedido e tempos por fase para diagnosticar
 * "resposta não carrega" ou "demora muito".
 *
 * Uso: em .env.local definir DEBUG_CHAT=true e reiniciar o servidor.
 * Ver docs/CHAT-DEBUG.md.
 */

const DEBUG_ENABLED =
  process.env.DEBUG_CHAT === "true" || process.env.DEBUG_CHAT === "1";

export function isChatDebugEnabled(): boolean {
  return DEBUG_ENABLED;
}

/** Regista uma linha de debug no servidor (só quando DEBUG_CHAT está ativo). */
export function logChatDebug(
  label: string,
  data?: Record<string, unknown> | number
): void {
  if (!DEBUG_ENABLED) {
    return;
  }
  let payload: Record<string, unknown>;
  if (typeof data === "number") {
    payload = { ms: data };
  } else if (data === undefined) {
    payload = {};
  } else {
    payload = data;
  }
  console.info("[chat-debug]", label, JSON.stringify(payload));
}

/** Acumula fases para um resumo final (evita muitos logs). */
export type ChatDebugPhases = Record<string, number>;

export function createChatDebugTracker(): {
  phase: (name: string, startMs: number) => void;
  flush: (label: string) => void;
} {
  const phases: ChatDebugPhases = {};

  return {
    phase(name: string, startMs: number) {
      const now = Date.now();
      const elapsed = now - startMs;
      phases[name] = elapsed;
    },
    flush(label: string) {
      if (!DEBUG_ENABLED || Object.keys(phases).length === 0) {
        return;
      }
      const total = Object.values(phases).reduce((a, b) => a + b, 0);
      console.info("[chat-debug]", label, JSON.stringify({ ...phases, total }));
    },
  };
}
