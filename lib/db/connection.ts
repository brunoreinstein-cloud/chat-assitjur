import "server-only";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  ChatbotError,
  isDatabaseConnectionError,
  isStatementTimeoutError,
} from "../errors";

/** Converte erro de BD em ChatbotError; reconhece statement timeout (57014) para mensagem clara. */
export function toDatabaseError(
  error: unknown,
  fallbackMessage: string
): never {
  if (isStatementTimeoutError(error)) {
    throw new ChatbotError(
      "bad_request:database",
      "Query exceeded time limit (statement timeout)."
    );
  }
  throw new ChatbotError("bad_request:database", fallbackMessage);
}

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

let dbInstance: ReturnType<typeof drizzle> | null = null;
let clientInstance: ReturnType<typeof postgres> | null = null;

/**
 * Opções de conexão: schema. Não usar com pooler Supabase (porta 6543) — não suporta
 * o parâmetro "options" (erro "unsupported startup parameter: options").
 */
export const CONNECTION_OPTS = "options=-c%20search_path%3Dpublic";

/** True se a URL for o pooler Supabase (Supavisor), que não aceita "options". */
export function isSupabasePoolerUrl(url: string): boolean {
  return /:6543\//.test(url) || url.includes("pooler.supabase.com");
}

/** True se a URL for Supabase (recomenda-se sslmode=require). */
export function isSupabaseUrl(url: string): boolean {
  return url.includes("supabase.co") || url.includes("pooler.supabase.com");
}

/**
 * Conexão Postgres (singleton por processo). Em serverless (Vercel) cada invocação
 * pode ser um processo novo, daí a importância de:
 * - POSTGRES_URL com pooler: Supabase porta 6543 (Transaction), Neon endpoint pooled.
 *   Ver .env.example e docs/DB-TIMEOUT-TROUBLESHOOTING.md.
 * - Aquecimento: o componente DbWarmup chama GET /api/health/db ao carregar o chat,
 *   para que o primeiro GET /api/credits ou POST /api/chat não pague o cold start.
 * connect_timeout: 10 — se o cold start do fornecedor for >10s, a primeira ligação
 * pode falhar; reenviar ou usar DbWarmup reduz o problema.
 */
export function getDb() {
  let url = process.env.POSTGRES_URL;
  if (!url) {
    throw new ChatbotError(
      "bad_request:api",
      "POSTGRES_URL is not set. Add it to .env.local (see .env.example)."
    );
  }
  if (!dbInstance) {
    if (process.env.NODE_ENV === "development") {
      const safeUrl = url.replace(/:\/\/[^:]+:[^@]+@/, "://***:***@");
      console.warn("[db] connecting:", safeUrl);
    }
    if (!(url.includes("search_path") || isSupabasePoolerUrl(url))) {
      url = url.includes("?")
        ? `${url}&${CONNECTION_OPTS}`
        : `${url}?${CONNECTION_OPTS}`;
    }
    // Supabase recomenda SSL; evita 503 por falha de handshake em alguns ambientes.
    if (isSupabaseUrl(url) && !url.includes("sslmode=")) {
      url = url.includes("?")
        ? `${url}&sslmode=require`
        : `${url}?sslmode=require`;
    }
    /**
     * Em dev usa-se 5 conexões para reduzir contenção: o processo único serve
     * chat pipeline (7 queries paralelas), sidebar (credits, history, processos),
     * e warmup. 3 conexões causava filas de ~30s com BD remota (Supabase US East).
     * Em produção usa-se 3 — cada serverless invocation é isolada.
     */
    const maxConnections = process.env.NODE_ENV === "production" ? 3 : 5;
    const connectTimeout = process.env.NODE_ENV === "production" ? 25 : 10;
    const postgresOptions: Parameters<typeof postgres>[1] = {
      max: maxConnections,
      connect_timeout: connectTimeout,
      /**
       * idle_timeout: tempo (s) antes de fechar uma conexão ociosa.
       * Supabase pooler (porta 6543) fecha conexões ociosas após ~5min server-side;
       * 20s client-side evita reutilizar conexões "mortas" que resultam em ECONNRESET.
       */
      idle_timeout: 20,
      /**
       * max_lifetime: tempo máximo (s) de vida de uma conexão.
       * Evita acumular conexões com estado de sessão corrompido (ex.: SET statement_timeout
       * perdido pelo pooler em transaction mode). 5min (300s) é conservador.
       */
      max_lifetime: 300,
    };
    if (isSupabaseUrl(url)) {
      // O Supabase Supavisor (pooler porta 6543) usa certificados que o Node rejeita com ssl:true.
      // rejectUnauthorized:false garante ligação com SSL sem falhar na cadeia de certificados.
      postgresOptions.ssl = { rejectUnauthorized: false };
    }
    clientInstance = postgres(url, postgresOptions);
    dbInstance = drizzle(clientInstance);
  }
  return dbInstance;
}

/**
 * Timeout do race do SET statement_timeout.
 * Reduzido de 5s para 2s: se o SET demora >2s, a conexão está com problemas
 * e é melhor prosseguir sem timeout do que bloquear 5s.
 * O max_lifetime (300s) garante que conexões "sem SET" são recicladas.
 */
export const STATEMENT_TIMEOUT_MS = 2000;

/**
 * Cache para evitar SET redundante em cada request.
 * Após SET bem sucedido, assume-se válido por CACHE_DURATION_MS.
 * Em transaction mode (porta 6543), o SET é descartado pelo pooler entre transações,
 * mas na prática a maioria das queries completam em <120s de qualquer forma.
 * O benefício (eliminar ~2s de latência por request) supera o risco marginal.
 */
let lastStatementTimeoutSet = 0;
const CACHE_DURATION_MS = 30_000; // 30s — re-SET a cada 30s

/**
 * Garante que a sessão Postgres tem statement_timeout = 2min.
 * Chamar no início de rotas/páginas que usam a BD (ex.: /api/chat, /api/history, /chat/[id]).
 * Usa cache para evitar SET redundante: se já foi feito nos últimos 30s, retorna imediatamente.
 * Se o SET falhar ou demorar mais de 2s, continua sem travar.
 */
export async function ensureStatementTimeout(): Promise<void> {
  // Cache hit: SET já foi feito recentemente, skip
  if (Date.now() - lastStatementTimeoutSet < CACHE_DURATION_MS) {
    return;
  }

  const setPromise = getDb()
    .execute(sql`SET statement_timeout = '120s'`)
    .then(() => {
      lastStatementTimeoutSet = Date.now();
    })
    .catch((err: unknown) => {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code: string }).code
          : undefined;
      if (code === "57014") {
        return;
      }
      throw err;
    });
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => resolve(), STATEMENT_TIMEOUT_MS);
  });
  try {
    await Promise.race([setPromise, timeoutPromise]);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code: string }).code
        : undefined;
    if (code === "57014") {
      return;
    }
    throw err;
  }
}

/**
 * Retry com backoff exponencial para erros transientes de conexão (ECONNREFUSED,
 * ECONNRESET, ETIMEDOUT, etc.). NÃO retenta statement_timeout nem erros de lógica.
 *
 * @param fn       Função async a executar (ex.: query Drizzle).
 * @param retries  Número máximo de retentativas (default: 2 → até 3 tentativas no total).
 * @param baseMs   Delay base em ms (default: 200). Dobra a cada retry (200, 400).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  baseMs = 200
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Só retenta erros transientes de conexão; statement_timeout e erros de
      // lógica (FK, unique, etc.) propagam imediatamente.
      if (!isDatabaseConnectionError(err) || attempt === retries) {
        throw err;
      }
      const delay = baseMs * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * Timeout por query (Promise.race). Protecção real contra queries suspensas,
 * independente de SET statement_timeout (que não funciona em Supabase transaction mode).
 *
 * Quando o timeout dispara, a query continua no server Postgres até statement_timeout
 * ou max_lifetime reciclar a conexão — mas a resposta HTTP retorna imediatamente.
 *
 * @param fn        Função async (query Drizzle).
 * @param timeoutMs Timeout em ms (default: 15s — abaixo do maxDuration 30s da Vercel).
 * @param label     Label para a mensagem de erro (ex.: nome da query).
 */
export async function withQueryTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs = 15_000,
  label = "query"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new ChatbotError(
        "bad_request:database",
        `Query timeout: ${label} excedeu ${timeoutMs}ms`
      );
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ping da BD (SELECT 1). Usado por GET /api/health/db para validar a mesma
 * conexão/processo que o chat usa. Não exige auth.
 */
export async function pingDatabase(): Promise<
  | { ok: true; latencyMs: number }
  | { ok: false; error: string; latencyMs: number }
> {
  const start = Date.now();
  try {
    await getDb().execute(sql`SELECT 1`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, latencyMs: Date.now() - start };
  }
}
