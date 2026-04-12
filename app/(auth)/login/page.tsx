"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Suspense, useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";
import {
  type GuestLoginActionState,
  guestLogin,
  type LoginActionState,
  login,
} from "../actions";

const RATE_LIMIT_MSG =
  "Muitas tentativas. Aguarde 15 minutos e tente novamente.";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<LoginActionState, FormData>(
    login,
    { status: "idle" }
  );

  const [guestState, guestFormAction] = useActionState<
    GuestLoginActionState,
    FormData
  >(guestLogin, { status: "idle" });

  const { update: updateSession } = useSession();

  useEffect(() => {
    if (guestState.status === "failed") {
      toast({
        type: "error",
        description:
          "Não foi possível iniciar como visitante. Tente de novo ou use uma conta.",
      });
    } else if (guestState.status === "rate_limited") {
      toast({ type: "error", description: RATE_LIMIT_MSG });
    }
  }, [guestState.status]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: router, updateSession e searchParams são refs estáveis
  useEffect(() => {
    if (state.status === "failed") {
      toast({
        type: "error",
        description:
          "Credenciais inválidas. Se ainda não tem conta, cadastre-se primeiro.",
      });
    } else if (state.status === "invalid_data") {
      toast({
        type: "error",
        description: "Falha ao validar o envio. Tente novamente.",
      });
    } else if (state.status === "rate_limited") {
      toast({ type: "error", description: RATE_LIMIT_MSG });
    } else if (state.status === "success") {
      setIsSuccessful(true);
      updateSession();
      router.refresh();
      // Redirecionar para a página que o utilizador tentou aceder antes do login;
      // validar que é um caminho relativo para prevenir open redirect.
      const raw = searchParams.get("callbackUrl") ?? "";
      const destination = raw.startsWith("/") ? raw : "/chat";
      router.push(destination);
    }
  }, [state.status]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    formAction(formData);
  };

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-assistjur-purple/20 bg-white/95 px-4 py-8 shadow-black/10 shadow-xl sm:px-10 sm:py-10">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <h1 className="font-bold text-2xl text-assistjur-purple-darker">
            Entrar
          </h1>
          <p className="text-assistjur-gray text-sm">
            Use seu e-mail e senha. Primeira vez? Cadastre-se abaixo.
          </p>
        </div>
        <AuthForm action={handleSubmit} defaultEmail={email}>
          <SubmitButton isSuccessful={isSuccessful}>Entrar</SubmitButton>
        </AuthForm>
        <form action={guestFormAction} className="mt-4">
          <button
            className="w-full rounded-lg border border-assistjur-purple/30 bg-white px-4 py-2.5 font-medium text-assistjur-purple-dark text-sm transition hover:bg-assistjur-purple/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-accent focus-visible:ring-offset-2"
            type="submit"
          >
            Continuar como visitante
          </button>
        </form>
        <p className="mt-5 text-center text-assistjur-gray text-sm">
          Não tem uma conta?{" "}
          <Link
            className="font-semibold text-assistjur-purple-dark underline underline-offset-2 hover:no-underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-accent focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            href="/register"
          >
            Cadastre-se
          </Link>{" "}
          gratuitamente.
        </p>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
