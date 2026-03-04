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

/** GET: saldo de créditos e uso recente do utilizador (transparência). Query: ?limit= (opcional, 10–50). */
export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let limit = DEFAULT_USAGE_LIMIT;
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  if (limitParam !== null && limitParam !== "") {
    const parsed = Number.parseInt(limitParam, 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= MAX_USAGE_LIMIT) {
      limit = parsed;
    }
  }

  const userId = session.user.id;
  const cached = creditsCache.get(userId, limit);
  if (cached !== undefined) {
    return Response.json(cached, {
      status: 200,
      headers: {
        "Cache-Control": `private, max-age=${CACHE_MAX_AGE_SECONDS}`,
      },
    });
  }

  const rawType = session.user.type;
  const userType: UserType =
    rawType === "guest" || rawType === "regular" ? rawType : "regular";
  const initialCredits = entitlementsByUserType[userType].initialCredits;
  const lowBalanceThreshold = Math.max(10, Math.ceil(initialCredits * 0.2));

  const BALANCE_TIMEOUT_MS = 5000;
  /** Histórico de uso: timeout maior para reduzir "base de dados lenta" em BDs lentas mas respondíveis. */
  const USAGE_TIMEOUT_MS = 18_000;

  try {
    await ensureStatementTimeout();

    const [balanceResult, usageResult] = await Promise.all([
      withTimeout(getCreditBalance(userId), BALANCE_TIMEOUT_MS),
      withTimeout(getRecentUsageByUserId(userId, limit), USAGE_TIMEOUT_MS),
    ]);

    const balanceRow = balanceResult.ok ? balanceResult.value : null;
    const balanceTimedOut = !balanceResult.ok;
    const usageTimedOut = !usageResult.ok;
    const recentUsage = usageResult.ok ? usageResult.value : [];

    let balance: number;
    let partial = balanceTimedOut || usageTimedOut;
    if (balanceTimedOut) {
      balance = initialCredits;
    } else if (balanceRow === null) {
      const createResult = await withTimeout(
        getOrCreateCreditBalance(userId, initialCredits),
        BALANCE_TIMEOUT_MS
      );
      balance = createResult.ok ? createResult.value : initialCredits;
      if (!createResult.ok) {
        partial = true;
      }
    } else {
      balance = balanceRow.balance;
    }

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

    return Response.json(body, {
      status: 200,
      headers: {
        "Cache-Control": `private, max-age=${CACHE_MAX_AGE_SECONDS}`,
      },
    });
  } catch (error) {
    if (isDatabaseConnectionError(error) || isStatementTimeoutError(error)) {
      return databaseUnavailableResponse();
    }
    return Response.json({
      balance: initialCredits,
      recentUsage: [],
      lowBalanceThreshold,
      _partial: true,
    });
  }
}
