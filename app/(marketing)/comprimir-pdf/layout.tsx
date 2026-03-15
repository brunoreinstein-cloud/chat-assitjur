import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Comprimir PDF Grátis — AssistJur.IA",
  description:
    "Comprima PDFs pesados gratuitamente. Redução de até 80% sem perda de qualidade. Renomeação automática seguindo padrões de organização jurídica.",
  openGraph: {
    title: "Comprimir PDF Grátis — AssistJur.IA",
    description:
      "Comprima PDFs pesados gratuitamente. Redução de até 80%. Ferramenta online para advogados.",
    type: "website",
  },
};

export default function ComprimirPdfLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
