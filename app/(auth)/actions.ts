"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createUser, getUser } from "@/lib/db/queries";

import { signIn } from "./auth";

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
    .regex(/[0-9]/, "Deve conter pelo menos um número"),
});

export interface LoginActionState {
  status: "idle" | "in_progress" | "success" | "failed" | "invalid_data";
}

export interface GuestLoginActionState {
  status: "idle" | "failed";
}

/** Inicia sessão como visitante (utilizador `guest-*@guest.local` na BD). */
export async function guestLogin(
  _prev: GuestLoginActionState,
  _formData: FormData
): Promise<GuestLoginActionState> {
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
    | "invalid_data";
}

export const register = async (
  _: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> => {
  try {
    const validatedData = registerFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

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

    const err = error as { code?: string } | undefined;
    if (err?.code === "23505") {
      return { status: "user_exists" } as RegisterActionState;
    }

    return { status: "failed" };
  }
};
