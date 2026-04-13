import type { Document } from "@/lib/db/schema";
import { LruTtlMap } from "./lru-ttl-map";

const DEFAULT_TTL_MS = 300_000; // 5 min — advogado demora 2-5 min entre gerar e baixar
const PREVIEW_TTL_MS = 300_000;

const store = new LruTtlMap<Document[]>(500);
const docxStore = new LruTtlMap<{ buffer: Buffer; filename: string }>(100);
const previewStore = new LruTtlMap<string>(200);

function cacheKey(userId: string, documentId: string): string {
  return `doc:${userId}:${documentId}`;
}

function docxCacheKey(userId: string, documentId: string): string {
  return `docx:${userId}:${documentId}`;
}

/**
 * Cache em memória para listas de documentos (GET /api/document).
 * Chave: userId + documentId para nunca servir documento de outro utilizador.
 * TTL padrão 30s; invalidação em POST (nova versão) e DELETE (remover versões).
 * Em serverless (Vercel) o cache é por instância; para multi-instância usar Redis.
 */
export const documentCache = {
  get(userId: string, documentId: string): Document[] | undefined {
    return store.get(cacheKey(userId, documentId));
  },

  set(
    userId: string,
    documentId: string,
    value: Document[],
    ttlMs = DEFAULT_TTL_MS
  ): void {
    store.set(cacheKey(userId, documentId), value, ttlMs);
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
    return docxStore.get(docxCacheKey(userId, documentId));
  },

  set(
    userId: string,
    documentId: string,
    buffer: Buffer,
    filename: string,
    ttlMs = DEFAULT_TTL_MS
  ): void {
    docxStore.set(
      docxCacheKey(userId, documentId),
      { buffer, filename },
      ttlMs
    );
  },

  delete(userId: string, documentId: string): void {
    docxStore.delete(docxCacheKey(userId, documentId));
  },

  /**
   * Apaga todas as entradas DOCX para um documento (todas as variantes de layout).
   * Usar em POST/DELETE de documentos onde o cacheKey inclui o sufixo ":layout".
   */
  deleteById(userId: string, documentId: string): void {
    const prefix = docxCacheKey(userId, documentId);
    docxStore.deleteByPrefix(prefix);
  },
};

/**
 * Cache em memória para preview HTML (GET /api/document/preview).
 * Chave: userId + documentId + layout. TTL 60s.
 */
export const previewCache = {
  get(userId: string, cacheKeyStr: string): string | undefined {
    return previewStore.get(`preview:${userId}:${cacheKeyStr}`);
  },

  set(userId: string, cacheKeyStr: string, html: string): void {
    previewStore.set(`preview:${userId}:${cacheKeyStr}`, html, PREVIEW_TTL_MS);
  },

  delete(userId: string, documentId: string): void {
    previewStore.deleteByPrefix(`preview:${userId}:${documentId}`);
  },
};
