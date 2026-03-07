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
/** Histórico de uso: timeout maior para reduzir "base de dados lenta" em BDs lentas mas respondíveis. */
const USAGE_TIMEOUT_MS = 18_000;

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
      BALANCE_TIMEOUT_MS
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
    await ensureStatementTimeout();
    if (isDev) {
      console.info(
        `[credits-timing] ensureStatementTimeout: ${Date.now() - t0}ms`
      );
    }

    const t1 = Date.now();
    const [balanceResult, usageResult] = await Promise.all([
      withTimeout(getCreditBalance(userId), BALANCE_TIMEOUT_MS),
      withTimeout(getRecentUsageByUserId(userId, limit), USAGE_TIMEOUT_MS),
    ]);
    if (isDev) {
      console.info(
        `[credits-timing] getCreditBalance + getRecentUsage: ${Date.now() - t1}ms (total desde início: ${Date.now() - t0}ms)`
      );
    }

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
