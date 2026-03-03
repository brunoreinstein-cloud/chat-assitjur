import { BotIcon, CoinsIcon } from "lucide-react";
import Link from "next/link";

const adminSections = [
  {
    href: "/admin/agents",
    title: "Agentes built-in",
    description:
      "Editar instruções e etiquetas dos agentes (Revisor de Defesas, Redator de Contestações, AssistJur).",
    icon: BotIcon,
  },
  {
    href: "/admin/credits",
    title: "Créditos",
    description:
      "Listar utilizadores com saldo e adicionar créditos a quem precisar.",
    icon: CoinsIcon,
  },
] as const;

export default function AdminIndexPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="font-semibold text-xl">Administração</h1>
        <p className="text-muted-foreground text-sm">
          Escolha a secção. Em cada uma será pedida a chave de administrador.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {adminSections.map((section) => {
          const Icon = section.icon;
          return (
            <li key={section.href}>
              <Link
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
                href={section.href}
              >
                <span className="flex items-center gap-2 font-medium">
                  <Icon aria-hidden className="size-5" />
                  {section.title}
                </span>
                <p className="text-muted-foreground text-sm">
                  {section.description}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
