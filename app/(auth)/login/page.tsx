"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";
import {
  type GuestLoginActionState,
  guestLogin,
  type LoginActionState,
  login,
} from "../actions";

export default function Page() {
  const router = useRouter();
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
    }
  }, [guestState.status]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: router and updateSession are stable refs
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
    } else if (state.status === "success") {
      setIsSuccessful(true);
      updateSession();
      router.refresh();
      router.push("/chat");
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
