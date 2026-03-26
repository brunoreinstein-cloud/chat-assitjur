"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";
import { AssistJurLogo } from "@/components/assistjur-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ——— Tipos ——————————————————————————————————————————————————————————

export interface AppShellProps {
  /** Conteúdo da sidebar (itens de navegação, lista de casos, etc.) */
  sidebarContent: React.ReactNode;
  /** Conteúdo principal */
  children: React.ReactNode;
  /** Ações do lado direito da topbar */
  topbarRight?: React.ReactNode;
  /** Ações do lado esquerdo da topbar (ao lado do toggle) */
  topbarLeft?: React.ReactNode;
  /** Sidebar começa colapsada */
  defaultCollapsed?: boolean;
  className?: string;
}

// ——— Componente ——————————————————————————————————————————————————————

export function AppShell({
  sidebarContent,
  children,
  topbarRight,
  topbarLeft,
  defaultCollapsed = false,
  className,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className={cn("flex min-h-screen min-w-[1024px] flex-col", className)}>
      {/* Topbar Global — h-12, z-30 */}
      <header
        className={cn(
          "sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3",
          "border-b bg-background/95 backdrop-blur-sm",
          "px-4"
        )}
      >
        {/* Toggle sidebar */}
        <Button
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          onClick={() => {
            setCollapsed((v) => !v);
            setMobileOpen(false);
          }}
          size="icon-sm"
          variant="ghost"
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Logo */}
        <AssistJurLogo className="font-semibold text-sm" iconSize={20} />

        {topbarLeft && (
          <div className="flex items-center gap-2">{topbarLeft}</div>
        )}

        <div className="flex-1" />

        {topbarRight && (
          <div className="flex items-center gap-2">{topbarRight}</div>
        )}
      </header>

      {/* Layout abaixo do topbar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Desktop */}
        <aside
          className={cn(
            "relative z-10 flex shrink-0 flex-col border-r bg-sidebar",
            "transition-[width] duration-200 ease-in-out",
            "hidden md:flex",
            collapsed ? "w-14" : "w-60"
          )}
        >
          <div
            className={cn(
              "flex flex-1 flex-col overflow-y-auto overflow-x-hidden",
              collapsed ? "items-center" : ""
            )}
          >
            {sidebarContent}
          </div>
        </aside>

        {/* Sidebar Mobile Overlay */}
        {mobileOpen && (
          <>
            <div
              aria-hidden
              className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <aside
              className={cn(
                "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r bg-sidebar",
                "md:hidden"
              )}
            >
              <div className="flex items-center justify-between border-b px-4 py-3">
                <AssistJurLogo
                  className="font-semibold text-sm"
                  iconSize={18}
                />
                <Button
                  aria-label="Fechar sidebar"
                  onClick={() => setMobileOpen(false)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-1 flex-col overflow-y-auto">
                {sidebarContent}
              </div>
            </aside>
          </>
        )}

        {/* Mobile topbar toggle */}
        <Button
          aria-label="Abrir sidebar"
          className="fixed bottom-4 left-4 z-30 shadow-md md:hidden"
          onClick={() => setMobileOpen(true)}
          size="icon-sm"
          variant="ghost"
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Main Content */}
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

// ——— Split View — workspace do caso ——————————————————————————————————

export interface SplitViewProps {
  /** Painel esquerdo (chat / fluxo) */
  left: React.ReactNode;
  /** Painel direito (artefato / editor) */
  right?: React.ReactNode;
  /** Proporção: "chat" | "split" | "artifact" | "artifact-full" | "chat-full" */
  layout?: "chat" | "split" | "artifact" | "artifact-full" | "chat-full";
  className?: string;
}

const LAYOUT_CLASSES: Record<
  NonNullable<SplitViewProps["layout"]>,
  { left: string; right: string }
> = {
  chat: { left: "w-[60%]", right: "w-[40%]" },
  split: { left: "w-1/2", right: "w-1/2" },
  artifact: { left: "w-[35%]", right: "w-[65%]" },
  "artifact-full": { left: "hidden", right: "flex-1" },
  "chat-full": { left: "flex-1", right: "hidden" },
};

export function SplitView({
  left,
  right,
  layout = "chat",
  className,
}: SplitViewProps) {
  const classes = LAYOUT_CLASSES[layout];

  return (
    <div className={cn("flex flex-1 overflow-hidden", className)}>
      <div
        className={cn(
          "flex flex-col overflow-hidden border-r",
          classes.left,
          "transition-[width] duration-200"
        )}
      >
        {left}
      </div>
      {right && (
        <div
          className={cn(
            "flex flex-col overflow-hidden",
            classes.right,
            "transition-[width] duration-200"
          )}
        >
          {right}
        </div>
      )}
    </div>
  );
}
