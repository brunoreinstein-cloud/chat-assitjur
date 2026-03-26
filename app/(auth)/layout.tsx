import Link from "next/link";

import { AssistJurLogo } from "@/components/assistjur-logo";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,var(--assistjur-purple-dark)_0%,transparent_50%)] bg-assistjur-purple-darker pt-[env(safe-area-inset-top)]">
      <a className="skip-link" href="#auth-main">
        Saltar para o conteúdo
      </a>
      <header className="border-assistjur-purple-dark/50 border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-center px-4">
          <Link
            aria-label="AssistJur.IA — voltar ao início"
            className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-accent focus-visible:ring-offset-2 focus-visible:ring-offset-assistjur-purple-darker"
            href="/"
          >
            <AssistJurLogo
              className="font-bold text-[17px]"
              iconSize={28}
              variant="full"
            />
          </Link>
        </div>
      </header>
      <main
        className="flex flex-1 scroll-mt-6 flex-col items-center justify-center px-4 py-8 sm:py-12"
        id="auth-main"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
