import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import {
  getOrCreateCreditBalance,
  getRecentUsageByUserId,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const DEFAULT_USAGE_LIMIT = 10;
const MAX_USAGE_LIMIT = 50;

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

  const rawType = session.user.type;
  const userType: UserType =
    rawType === "guest" || rawType === "regular" ? rawType : "regular";
  const initialCredits = entitlementsByUserType[userType].initialCredits;
  const lowBalanceThreshold = Math.max(10, Math.ceil(initialCredits * 0.2));

  try {
    const balance = await getOrCreateCreditBalance(
      session.user.id,
      initialCredits
    );
    const recentUsage = await getRecentUsageByUserId(session.user.id, limit);

    return Response.json({
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
