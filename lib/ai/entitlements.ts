import type { UserType } from "@/app/(auth)/auth";

interface Entitlements {
  maxMessagesPerDay: number;
  /** Saldo inicial de créditos ao criar conta ou ao primeiro uso (lazy). 1 crédito = 1000 tokens. */
  initialCredits: number;
}

const isDev = process.env.NODE_ENV === "development";
const initialCreditsDefault = isDev ? 1000 : 100;

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  guest: {
    maxMessagesPerDay: 50,
    initialCredits: initialCreditsDefault,
  },
  regular: {
    maxMessagesPerDay: 150,
    initialCredits: initialCreditsDefault,
  },
};
