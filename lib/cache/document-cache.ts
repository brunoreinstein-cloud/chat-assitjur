import type { Document } from "@/lib/db/schema";

const DEFAULT_TTL_MS = 30_000;

interface CacheEntry {
  value: Document[];
  expiresAt: number;
}

interface DocxCacheEntry {
  buffer: Buffer;
  filename: string;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();
const docxStore = new Map<string, DocxCacheEntry>();

function cacheKey(userId: string, documentId: string): string {
  return `doc:${userId}:${documentId}`;
}

function docxCacheKey(userId: string, documentId: string): string {
  return `docx:${userId}:${documentId}`;
}

function isExpired(entry: { expiresAt: number }): boolean {
  return Date.now() >= entry.expiresAt;
}

/**
 * Cache em memória para listas de documentos (GET /api/document).
 * Chave: userId + documentId para nunca servir documento de outro utilizador.
 * TTL padrão 30s; invalidação em POST (nova versão) e DELETE (remover versões).
 * Em serverless (Vercel) o cache é por instância; para multi-instância usar Redis.
 */
export const documentCache = {
  get(userId: string, documentId: string): Document[] | undefined {
    const key = cacheKey(userId, documentId);
    const entry = store.get(key);
    if (!entry) {
      return undefined;
    }
    if (isExpired(entry)) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  },

  set(
    userId: string,
    documentId: string,
    value: Document[],
    ttlMs = DEFAULT_TTL_MS
  ): void {
    const key = cacheKey(userId, documentId);
    store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  },

  delete(userId: string, documentId: string): void {
    store.delete(cacheKey(userId, documentId));
  },
};

/**
 * Cache em memória para export DOCX (GET /api/document/export).
 * Chave: userId + documentId. TTL 30s; invalidação em POST/DELETE na rota de documentos.
 */
export const docxCache = {
  get(
    userId: string,
    documentId: string
  ): { buffer: Buffer; filename: string } | undefined {
    const key = docxCacheKey(userId, documentId);
    const entry = docxStore.get(key);
    if (!entry) {
      return undefined;
    }
    if (isExpired(entry)) {
      docxStore.delete(key);
      return undefined;
    }
    return { buffer: entry.buffer, filename: entry.filename };
  },

  set(
    userId: string,
    documentId: string,
    buffer: Buffer,
    filename: string,
    ttlMs = DEFAULT_TTL_MS
  ): void {
    docxStore.set(docxCacheKey(userId, documentId), {
      buffer,
      filename,
      expiresAt: Date.now() + ttlMs,
    });
  },

  delete(userId: string, documentId: string): void {
    docxStore.delete(docxCacheKey(userId, documentId));
  },
};
