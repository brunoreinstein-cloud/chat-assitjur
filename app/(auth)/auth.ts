import { compare } from "bcrypt-ts";
import NextAuth, { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { DUMMY_PASSWORD } from "@/lib/constants";
import { createGuestUser, getUser } from "@/lib/db/queries";
import { authConfig } from "./auth.config";

export type UserType = "regular" | "guest";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
      /** Perfil RBAC; null = utilizador sem role atribuído. */
      role: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    email?: string | null;
    type: UserType;
    /** Perfil RBAC lido da BD no momento do login. */
    role?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
    role: string | null;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  logger: {
    error(code: unknown, ...message: unknown[]) {
      const err = code as { type?: string; code?: string } | null;
      const firstMsg = message[0] as { type?: string } | null;
      const isCredentialsSignin =
        err?.type === "CredentialsSignin" ||
        err?.code === "credentials" ||
        firstMsg?.type === "CredentialsSignin";
      if (isCredentialsSignin) {
        return;
      }
      console.error("[auth][error]", code, ...message);
    },
    warn(code, ...message) {
      console.warn("[auth][warn]", code, ...message);
    },
    debug(code, ...message) {
      console.debug("[auth][debug]", code, ...message);
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        guest: { label: "Guest", type: "text" },
      },
      async authorize(credentials) {
        if (credentials?.guest === "true") {
          try {
            const guest = await createGuestUser();
            return {
              id: guest.id,
              email: guest.email,
              type: "guest",
              role: guest.role ?? null,
            };
          } catch (err) {
            if (process.env.NODE_ENV === "development") {
              console.error("[auth] authorize (guest) failed:", err);
            }
            return null;
          }
        }

        const emailRaw = credentials?.email;
        const password = credentials?.password;
        const email =
          typeof emailRaw === "string" && emailRaw.length > 0 ? emailRaw : null;

        if (!email || typeof password !== "string") {
          return null;
        }
        try {
          const users = await getUser(email);

          if (users.length === 0) {
            await compare(password, DUMMY_PASSWORD);
            return null;
          }

          const [user] = users;

          if (!user.password) {
            await compare(password, DUMMY_PASSWORD);
            return null;
          }

          const passwordsMatch = await compare(password, user.password);

          if (!passwordsMatch) {
            return null;
          }

          return { ...user, type: "regular", role: user.role ?? null };
        } catch (err) {
          if (process.env.NODE_ENV === "development") {
            console.error("[auth] authorize (credentials) failed:", err);
          }
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.type = user.type;
        token.role = user.role ?? null;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.type = token.type;
        session.user.role = token.role ?? null;
      }

      return session;
    },
  },
});
