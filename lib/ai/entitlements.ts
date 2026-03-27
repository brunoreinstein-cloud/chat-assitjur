import type { UserType } from "@/app/(auth)/auth";

interface Entitlements {
  maxMessagesPerDay: number;
  /** Saldo inicial de créditos ao criar conta ou ao primeiro uso (lazy). 1 crédito = 1000 tokens. */
  initialCredits: number;
}

const isDev = process.env.NODE_ENV === "development";
const initialCreditsDefault = isDev ? 1000 : 100;

const regularEntitlements: Entitlements = {
  maxMessagesPerDay: 150,
  initialCredits: initialCreditsDefault,
};

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  regular: regularEntitlements,
};

/**
 * Devolve os entitlements para um userType, com fallback para "regular"
 * quando o tipo é undefined/null (utilizadores criados antes do campo existir).
 */
export function getEntitlements(
  userType: UserType | undefined | null
): Entitlements {
  if (userType && userType in entitlementsByUserType) {
    return entitlementsByUserType[userType];
  }
  return regularEntitlements;
}
