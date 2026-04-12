"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checkRateLimit } from "@/lib/cache/rate-limit";
import { createUser, getUser } from "@/lib/db/queries";

import { signIn } from "./auth";

/** Janela de 15 minutos para tentativas de autenticação. */
const AUTH_WINDOW_SECONDS = 900;
/** Máximo de tentativas de login por IP por janela. */
const LOGIN_MAX_ATTEMPTS_IP = 20;
/** Máximo de tentativas de login por email por janela (protege contas individuais). */
const LOGIN_MAX_ATTEMPTS_EMAIL = 10;
/** Máximo de registos por IP por janela (previne criação massiva de contas). */
const REGISTER_MAX_ATTEMPTS_IP = 10;
/** Máximo de guests por IP por janela. */
const GUEST_MAX_ATTEMPTS_IP = 30;

const loginFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerFormSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .regex(/[A-Z]/, "Deve conter pelo menos uma letra maiúscula")
    .regex(/\d/, "Deve conter pelo menos um número"),
  lgpdConsent: z
    .string()
    .refine((v) => v === "on", "Consentimento LGPD é obrigatório"),
});

/** Extrai o IP do cliente a partir dos headers do request. */
async function getClientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

export interface LoginActionState {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "invalid_data"
    | "rate_limited";
}

export interface GuestLoginActionState {
  status: "idle" | "failed" | "rate_limited";
}

/** Inicia sessão como visitante (utilizador `guest-*@guest.local` na BD). */
export async function guestLogin(
  _prev: GuestLoginActionState,
  _formData: FormData
): Promise<GuestLoginActionState> {
  const ip = await getClientIp();
  const rl = await checkRateLimit(
    `auth:guest:${ip}`,
    GUEST_MAX_ATTEMPTS_IP,
    AUTH_WINDOW_SECONDS
  );
  if (!rl.allowed) {
    return { status: "rate_limited" };
  }

  const result = await signIn("credentials", {
    guest: "true",
    redirect: false,
  });
  const failed =
    result &&
    typeof result === "object" &&
    "error" in result &&
    Boolean((result as { error?: string }).error);
  if (failed) {
    return { status: "failed" };
  }
  redirect("/chat");
}

export const login = async (
  _: LoginActionState,
  formData: FormData
): Promise<LoginActionState> => {
  try {
    const validatedData = loginFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const ip = await getClientIp();

    // Verificar limite por IP e por email em paralelo
    const [ipLimit, emailLimit] = await Promise.all([
      checkRateLimit(
        `auth:login:ip:${ip}`,
        LOGIN_MAX_ATTEMPTS_IP,
        AUTH_WINDOW_SECONDS
      ),
      checkRateLimit(
        `auth:login:email:${validatedData.email.toLowerCase()}`,
        LOGIN_MAX_ATTEMPTS_EMAIL,
        AUTH_WINDOW_SECONDS
      ),
    ]);

    if (!(ipLimit.allowed && emailLimit.allowed)) {
      return { status: "rate_limited" };
    }

    await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "failed" };
  }
};

export interface RegisterActionState {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "user_exists"
    | "invalid_data"
    | "rate_limited";
}

export const register = async (
  _: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> => {
  try {
    const validatedData = registerFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
      lgpdConsent: formData.get("lgpdConsent"),
    });

    const ip = await getClientIp();
    const rl = await checkRateLimit(
      `auth:register:${ip}`,
      REGISTER_MAX_ATTEMPTS_IP,
      AUTH_WINDOW_SECONDS
    );
    if (!rl.allowed) {
      return { status: "rate_limited" };
    }

    const [user] = await getUser(validatedData.email);

    if (user) {
      return { status: "user_exists" } as RegisterActionState;
    }
    await createUser(validatedData.email, validatedData.password);

    const signInResult = await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    // Auth.js v5 com redirect: false pode retornar undefined, { ok: true }, ou a URL de redirect (string) em sucesso
    const ok =
      signInResult === undefined ||
      (typeof signInResult === "string" && signInResult.length > 0) ||
      (typeof signInResult === "object" &&
        signInResult !== null &&
        "ok" in signInResult &&
        (signInResult as { ok?: boolean }).ok !== false);
    if (!ok) {
      if (process.env.NODE_ENV === "development") {
        console.error("[register] signIn retornou falha:", signInResult);
      }
      return { status: "failed" } as RegisterActionState;
    }

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    if (process.env.NODE_ENV === "development") {
      console.error("[register] erro ao criar conta:", error);
    }

    const cause =
      error instanceof Error ? (error.cause as { code?: string }) : undefined;
    if (
      cause?.code === "23505" ||
      (error instanceof Error && error.message.includes("duplicate"))
    ) {
      return { status: "user_exists" } as RegisterActionState;
    }

    return { status: "failed" };
  }
};
