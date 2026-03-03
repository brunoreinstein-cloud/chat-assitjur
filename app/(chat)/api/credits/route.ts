import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { creditsCache } from "@/lib/cache/credits-cache";
import {
  getCreditBalance,
  getOrCreateCreditBalance,
  getRecentUsageByUserId,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

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

  try {
    const [balanceRow, recentUsage] = await Promise.all([
      getCreditBalance(userId),
      getRecentUsageByUserId(userId, limit),
    ]);

    const balance =
      balanceRow === null
        ? await getOrCreateCreditBalance(userId, initialCredits)
        : balanceRow.balance;

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
    };

    creditsCache.set(userId, limit, body);

    return Response.json(body, {
      status: 200,
      headers: {
        "Cache-Control": `private, max-age=${CACHE_MAX_AGE_SECONDS}`,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[api/credits] GET failed:", error);
    }
    return Response.json({
      balance: initialCredits,
      recentUsage: [],
      lowBalanceThreshold,
    });
  }
}
