"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const adminNav = [
  { href: "/admin", label: "Início" },
  { href: "/admin/agents", label: "Agentes built-in" },
  { href: "/admin/credits", label: "Créditos" },
] as const;

function AdminNavLink({
  href,
  label,
}: Readonly<{ href: string; label: string }>) {
  const pathname = usePathname();
  const isActive =
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <Link
      className={cn(
        "rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      href={href}
    >
      {label}
    </Link>
  );
}

export function AdminNav() {
  return (
    <nav
      aria-label="Administração"
      className="flex flex-wrap items-center gap-2"
    >
      {adminNav.map((item) => (
        <AdminNavLink href={item.href} key={item.href} label={item.label} />
      ))}
    </nav>
  );
}
