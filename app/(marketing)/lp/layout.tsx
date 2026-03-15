import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AssistJur.IA — IA Estratégica para Contencioso Trabalhista",
  description:
    "Auditoria jurídica com inteligência artificial: analise petições, revise contestações e prepare audiências com agentes especializados em direito trabalhista.",
  openGraph: {
    title: "AssistJur.IA — IA Estratégica para Contencioso Trabalhista",
    description:
      "Auditoria jurídica com inteligência artificial: analise petições, revise contestações e prepare audiências com agentes especializados.",
    type: "website",
  },
};

export default function LpLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
