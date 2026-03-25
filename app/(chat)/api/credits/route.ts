import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { creditsCache } from "@/lib/cache/credits-cache";
import {
  ensureStatementTimeout,
  getCreditBalance,
  getOrCreateCreditBalance,
  getRecentUsageByUserId,
} from "@/lib/db/queries";
import {
  ChatbotError,
  databaseUnavailableResponse,
  isDatabaseConnectionError,
  isStatementTimeoutError,
} from "@/lib/errors";

type TimeoutResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "timeout" | "error" };

function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<TimeoutResult<T>> {
  const timeout = new Promise<TimeoutResult<never>>((resolve) =>
    setTimeout(() => resolve({ ok: false, reason: "timeout" }), ms)
  );
  const wrapped = promise
    .then((value) => ({ ok: true as const, value }))
    .catch(() => ({ ok: false as const, reason: "error" as const }));
  return Promise.race([wrapped, timeout]);
}

const DEFAULT_USAGE_LIMIT = 10;
const MAX_USAGE_LIMIT = 50;
const CACHE_MAX_AGE_SECONDS = 30;
const BALANCE_TIMEOUT_MS = 5000;
/**
 * Histórico de uso: timeout para não segurar GET /api/credits quando a BD está lenta.
 * Em timeout devolve 200 com _partial (recentUsage []). 10s equilibra UX e BDs lentas.
 */
const USAGE_TIMEOUT_MS = 10_000;

/**
 * Em E2E (PLAYWRIGHT=true) usamos timeouts mais curtos para GET /api/credits responder
 * em ~6s; em caso de BD lenta devolve 200 com _partial (balance inicial, recentUsage []).
 * Evita que page.goto em testes auth exceda o timeout de navegação.
 */
const isE2E =
  process.env.PLAYWRIGHT === "true" || process.env.PLAYWRIGHT === "True";
const balanceTimeoutMs = isE2E ? 3000 : BALANCE_TIMEOUT_MS;
const usageTimeoutMs = isE2E ? 6000 : USAGE_TIMEOUT_MS;

function parseUsageLimit(searchParams: URLSearchParams): number {
  const limitParam = searchParams.get("limit");
  if (limitParam === null || limitParam === "") {
    return DEFAULT_USAGE_LIMIT;
  }
  const parsed = Number.parseInt(limitParam, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_USAGE_LIMIT) {
    return DEFAULT_USAGE_LIMIT;
  }
  return parsed;
}

function getInitialCreditsAndThreshold(user: { type?: string }): {
  initialCredits: number;
  lowBalanceThreshold: number;
} {
  const rawType = user.type;
  const userType: UserType =
    rawType === "guest" || rawType === "regular" ? rawType : "regular";
  const initialCredits = entitlementsByUserType[userType].initialCredits;
  const lowBalanceThreshold = Math.max(10, Math.ceil(initialCredits * 0.2));
  return { initialCredits, lowBalanceThreshold };
}

async function resolveBalance(
  userId: string,
  balanceResult: TimeoutResult<Awaited<ReturnType<typeof getCreditBalance>>>,
  initialCredits: number
): Promise<{ balance: number; partial: boolean }> {
  const balanceRow = balanceResult.ok ? balanceResult.value : null;
  const balanceTimedOut = !balanceResult.ok;
  if (balanceTimedOut) {
    return { balance: initialCredits, partial: true };
  }
  if (balanceRow === null) {
    const createResult = await withTimeout(
      getOrCreateCreditBalance(userId, initialCredits),
      balanceTimeoutMs
    );
    const balance = createResult.ok ? createResult.value : initialCredits;
    return { balance, partial: !createResult.ok };
  }
  return { balance: balanceRow.balance, partial: false };
}

function creditsJsonResponse(body: object) {
  return Response.json(body, {
    status: 200,
    headers: {
      "Cache-Control": `private, max-age=${CACHE_MAX_AGE_SECONDS}`,
    },
  });
}

/** GET: saldo de créditos e uso recente do utilizador (transparência). Query: ?limit= (opcional, 10–50). */
export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const limit = parseUsageLimit(new URL(request.url).searchParams);
  const userId = session.user.id;
  const cached = creditsCache.get(userId, limit);
  if (cached !== undefined) {
    return creditsJsonResponse(cached);
  }

  const { initialCredits, lowBalanceThreshold } = getInitialCreditsAndThreshold(
    session.user
  );
  const isDev = process.env.NODE_ENV === "development";
  const t0 = Date.now();

  try {
    // Correr em paralelo: antes ensureStatementTimeout bloqueava ~5s (race) e só depois
    // as queries (até ~10s), total ~15s em BD lenta; com Promise.all o teto é max(5s, 10s).
    const t1 = Date.now();
    const [, [balanceResult, usageResult]] = await Promise.all([
      ensureStatementTimeout().then(() => {
        if (isDev) {
          console.info(
            `[credits-timing] ensureStatementTimeout: ${Date.now() - t0}ms`
          );
        }
      }),
      Promise.all([
        withTimeout(getCreditBalance(userId), balanceTimeoutMs),
        withTimeout(getRecentUsageByUserId(userId, limit), usageTimeoutMs),
      ]).then((pair) => {
        if (isDev) {
          console.info(
            `[credits-timing] getCreditBalance + getRecentUsage: ${Date.now() - t1}ms (paralelo com ensureStatementTimeout; wall total: ${Date.now() - t0}ms)`
          );
        }
        return pair;
      }),
    ]);

    const usageTimedOut = !usageResult.ok;
    const recentUsage = usageResult.ok ? usageResult.value : [];
    const { balance, partial: balancePartial } = await resolveBalance(
      userId,
      balanceResult,
      initialCredits
    );
    const partial = balancePartial || usageTimedOut;

    const body = {
      balance,
      recentUsage: recentUsage.map((r) => ({
        id: r.id,
        chatId: r.chatId,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        model: r.model,
        creditsConsumed: r.creditsConsumed,
        createdAt: r.createdAt,
      })),
      lowBalanceThreshold,
      ...(partial && { _partial: true as const }),
    };

    if (!partial) {
      creditsCache.set(userId, limit, body);
    }

    return creditsJsonResponse(body);
  } catch (error) {
    if (isDatabaseConnectionError(error) || isStatementTimeoutError(error)) {
      return databaseUnavailableResponse();
    }
    return creditsJsonResponse({
      balance: initialCredits,
      recentUsage: [],
      lowBalanceThreshold,
      _partial: true,
    });
  }
}
