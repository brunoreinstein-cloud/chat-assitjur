/**
 * Utilitários de concorrência e cancelamento para o pipeline multi-chamadas.
 */

// ---------------------------------------------------------------------------
// Helpers de cancelamento
// ---------------------------------------------------------------------------

/**
 * Combina um AbortSignal de timeout com um sinal externo opcional.
 * Quando o stream principal é cancelado (utilizador fecha o browser ou maxDuration
 * é atingido), o pipeline para imediatamente em vez de esperar cada timeout
 * individual (até 45s por bloco).
 *
 * AbortSignal.any() disponível desde Node.js 20 / Chrome 116 (Vercel ≥ Node 20 ✓).
 */
export function makeAbortSignal(
  timeoutMs: number,
  outer?: AbortSignal
): AbortSignal {
  const ts = AbortSignal.timeout(timeoutMs);
  return outer ? AbortSignal.any([ts, outer]) : ts;
}

// ---------------------------------------------------------------------------
// Semáforo de concorrência (sem dependência externa)
// ---------------------------------------------------------------------------

/**
 * Cria um semáforo que limita o número de Promises em execução simultânea.
 * Uso:
 *   const sem = createSemaphore(3);
 *   await Promise.all(items.map(item => sem(() => processItem(item))));
 */
export function createSemaphore(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function release() {
    active--;
    const next = queue.shift();
    if (next) {
      active++;
      next();
    }
  }

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      function attempt() {
        fn().then(resolve, reject).finally(release);
      }
      if (active < concurrency) {
        active++;
        attempt();
      } else {
        queue.push(attempt);
      }
    });
  };
}
