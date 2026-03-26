"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";
import { type RegisterActionState, register } from "../actions";

export default function Page() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<RegisterActionState, FormData>(
    register,
    { status: "idle" }
  );

  const { update: updateSession } = useSession();

  // biome-ignore lint/correctness/useExhaustiveDependencies: router and updateSession are stable refs
  useEffect(() => {
    if (state.status === "user_exists") {
      toast({ type: "error", description: "Esta conta já existe!" });
    } else if (state.status === "failed") {
      toast({ type: "error", description: "Falha ao criar a conta!" });
    } else if (state.status === "invalid_data") {
      toast({
        type: "error",
        description: "Falha ao validar o envio. Tente novamente.",
      });
    } else if (state.status === "success") {
      toast({ type: "success", description: "Conta criada com sucesso!" });
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
            Cadastrar
          </h1>
          <p className="text-assistjur-gray text-sm">
            Crie uma conta com seu e-mail e senha.
          </p>
        </div>
        <AuthForm
          action={handleSubmit}
          defaultEmail={email}
          passwordAutocomplete="new-password"
          extraFields={
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="lgpd-consent"
                name="lgpdConsent"
                required
                className="mt-1 size-4 rounded border-assistjur-purple/30 accent-assistjur-purple-dark"
              />
              <label
                htmlFor="lgpd-consent"
                className="text-assistjur-gray text-xs leading-relaxed"
              >
                Li e aceito a{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-assistjur-purple-dark underline underline-offset-2 hover:no-underline"
                >
                  Política de Privacidade
                </a>{" "}
                e os{" "}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-assistjur-purple-dark underline underline-offset-2 hover:no-underline"
                >
                  Termos de Uso
                </a>
                . Autorizo o tratamento dos meus dados conforme a LGPD (Lei
                13.709/2018).
              </label>
            </div>
          }
        >
          <SubmitButton isSuccessful={isSuccessful}>Cadastrar</SubmitButton>
          <p className="mt-5 text-center text-assistjur-gray text-sm">
            Já tem uma conta?{" "}
            <Link
              className="font-semibold text-assistjur-purple-dark underline underline-offset-2 hover:no-underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-accent focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              href="/login"
            >
              Entrar
            </Link>
            .
          </p>
          <button
            className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-xl border-2 border-assistjur-purple-dark/40 bg-transparent font-medium text-assistjur-purple-dark text-sm transition-colors hover:border-assistjur-purple-dark/60 hover:bg-assistjur-purple-dark/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-accent focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            onClick={async () => {
              await signOut({ redirect: false });
              globalThis.window.location.href =
                "/api/auth/guest?redirectUrl=/chat";
            }}
            type="button"
          >
            Continuar como visitante
          </button>
        </AuthForm>
      </div>
    </div>
  );
}
