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
     * Em dev usa-se 3 conexões para reduzir contenção entre chat, credits e health
     * (mesmo processo). Em produção usa-se 3 também — com pooler Supabase (porta 6543,
     * transaction mode) cada invocação serverless pode ter pedidos concorrentes
     * (ex.: Promise.all de ensureStatementTimeout + queries); max:1 forçava fila.
     */
    const maxConnections = 3;
    const connectTimeout = process.env.NODE_ENV === "production" ? 25 : 10;
    const postgresOptions: Parameters<typeof postgres>[1] = {
      max: maxConnections,
      connect_timeout: connectTimeout,
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

export const STATEMENT_TIMEOUT_MS = 5000;

/**
 * Garante que a sessão Postgres tem statement_timeout = 2min.
 * Chamar no início de rotas/páginas que usam a BD (ex.: /api/chat, /api/history, /chat/[id]).
 * Supabase ignora options na connection string; SET na sessão funciona em port 5432 (session mode).
 * Executado em cada chamada para que conexões recém-criadas (após idle/erro) também recebam o timeout.
 * Se o SET falhar ou demorar mais de 5s (ex.: pooler que não suporta SET), continua sem travar.
 */
export async function ensureStatementTimeout(): Promise<void> {
  const setPromise = getDb()
    .execute(sql`SET statement_timeout = '120s'`)
    .then(() => {
      /* SET applied */
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
