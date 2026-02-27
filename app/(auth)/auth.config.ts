import type { NextAuthConfig } from "next-auth";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export const authConfig = {
  pages: {
    signIn: "/login",
    newUser: "/chat",
  },
  session: {
    maxAge: THIRTY_DAYS_SECONDS,
  },
  providers: [
    // added later in auth.ts since it requires bcrypt which is only compatible with Node.js
    // while this file is also used in non-Node.js environments
  ],
  callbacks: {},
} satisfies NextAuthConfig;
