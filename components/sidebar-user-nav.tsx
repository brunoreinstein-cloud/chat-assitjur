"use client";

import { ChevronUp, CoinsIcon, HelpCircleIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { guestRegex } from "@/lib/constants";

interface SidebarUserNavProps {
  readonly user: User;
  /** Passado pelo layout (server); evita GET /api/auth/session no cliente. */
  readonly isGuest?: boolean;
}

export function SidebarUserNav({
  user,
  isGuest: isGuestProp,
}: Readonly<SidebarUserNavProps>) {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isGuest = isGuestProp ?? guestRegex.test(user?.email ?? "");

  let themeToggleLabel = "Alternar tema";
  if (mounted) {
    themeToggleLabel =
      resolvedTheme === "light"
        ? "Alternar modo escuro"
        : "Alternar modo claro";
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="h-10 bg-background data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              data-testid="user-nav-button"
            >
              <Image
                alt={user.email ?? "Avatar do usuário"}
                className="rounded-full"
                height={24}
                src={`https://avatar.vercel.sh/${user.email}`}
                width={24}
              />
              <span className="truncate" data-testid="user-email">
                {isGuest ? "Visitante" : user?.email}
              </span>
              <ChevronUp className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-popper-anchor-width)"
            data-testid="user-nav-menu"
            side="top"
          >
            <DropdownMenuItem
              className="cursor-pointer"
              data-testid="user-nav-item-theme"
              onSelect={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {themeToggleLabel}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild data-testid="user-nav-item-ajuda">
              <Link
                className="flex cursor-pointer items-center gap-2"
                href="/ajuda"
              >
                <HelpCircleIcon aria-hidden className="size-4" />
                Ajuda
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild data-testid="user-nav-item-uso">
              <Link
                className="flex cursor-pointer items-center gap-2"
                href="/uso"
              >
                <CoinsIcon aria-hidden className="size-4" />
                Uso e créditos
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isGuest ? (
              <>
                <DropdownMenuItem
                  asChild
                  data-testid="user-nav-item-guest-restart"
                >
                  <button
                    className="w-full cursor-pointer"
                    onClick={async () => {
                      const { deleteAllMyChats } = await import(
                        "@/app/(chat)/actions"
                      );
                      await deleteAllMyChats();
                      await signOut({ redirect: false });
                      globalThis.window.location.href =
                        "/api/auth/guest?redirectUrl=/chat";
                    }}
                    type="button"
                  >
                    Reiniciar como visitante
                  </button>
                </DropdownMenuItem>
                <DropdownMenuItem asChild data-testid="user-nav-item-auth">
                  <button
                    className="w-full cursor-pointer"
                    onClick={async () => {
                      const { deleteAllMyChats } = await import(
                        "@/app/(chat)/actions"
                      );
                      await deleteAllMyChats();
                      router.push("/login");
                    }}
                    type="button"
                  >
                    Entrar na sua conta
                  </button>
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem asChild data-testid="user-nav-item-auth">
                <button
                  className="w-full cursor-pointer"
                  onClick={() => {
                    signOut({ redirectTo: "/" });
                  }}
                  type="button"
                >
                  Sair
                </button>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
