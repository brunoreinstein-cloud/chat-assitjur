/**
 * Map com TTL e evicção LRU. Limite máximo de entradas para evitar memory bloat
 * em serverless com muitos utilizadores distintos no mesmo processo.
 *
 * Comportamento:
 * - `get` promove a entrada (torna-a a mais recente).
 * - `set` insere/atualiza; se o limite for atingido, elimina a entrada mais antiga.
 * - Entradas expiradas são apagadas em `get` (lazy) e periodicamente em `set` (a cada 100 writes).
 */
export class LruTtlMap<V> {
  private readonly map = new Map<string, { value: V; expiresAt: number }>();
  private readonly maxSize: number;
  private writesSinceCleanup = 0;
  private static readonly CLEANUP_INTERVAL = 100;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() >= entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    // Promover: apagar e reinserir para ficar no fim (mais recente)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    // Se já existe, apagar primeiro para atualizar a posição LRU
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    this.writesSinceCleanup++;

    // Evicção LRU: eliminar entradas mais antigas se exceder o limite
    if (this.map.size > this.maxSize) {
      const first = this.map.keys().next().value;
      if (first !== undefined) {
        this.map.delete(first);
      }
    }

    // Limpeza periódica de expirados
    if (this.writesSinceCleanup >= LruTtlMap.CLEANUP_INTERVAL) {
      this.cleanup();
      this.writesSinceCleanup = 0;
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  /** Apaga todas as chaves que começam com o prefixo dado. */
  deleteByPrefix(prefix: string): void {
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) {
        this.map.delete(key);
      }
    }
  }

  get size(): number {
    return this.map.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (now >= entry.expiresAt) {
        this.map.delete(key);
      }
    }
  }
}
