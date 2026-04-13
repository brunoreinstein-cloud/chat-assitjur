import type { NextAuthConfig } from "next-auth";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

const useSecureCookies = process.env.NODE_ENV === "production";

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
    newUser: "/chat",
  },
  session: {
    strategy: "jwt",
    maxAge: THIRTY_DAYS_SECONDS,
  },
  cookies: {
    sessionToken: {
      name: useSecureCookies
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  providers: [
    // added later in auth.ts since it requires bcrypt which is only compatible with Node.js
    // while this file is also used in non-Node.js environments
  ],
  callbacks: {},
} satisfies NextAuthConfig;
