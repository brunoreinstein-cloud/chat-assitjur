import type { UserType } from "@/app/(auth)/auth";

interface Entitlements {
  maxMessagesPerDay: number;
}

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  /*
   * For users without an account
   */
  guest: {
    maxMessagesPerDay: 50,
  },

  /*
   * For users with an account
   */
  regular: {
    maxMessagesPerDay: 150,
  },

  /*
   * TODO: For users with an account and a paid membership
   */
};
