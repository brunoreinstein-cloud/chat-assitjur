import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { UsoPageClient } from "./uso-page-client";

export const metadata = {
  title: "Uso e créditos",
  description: "Saldo de créditos e histórico de consumo de IA",
};

export default async function UsoPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/uso");
  }

  return (
    <main className="flex flex-1 flex-col p-4 md:p-6">
      <UsoPageClient />
    </main>
  );
}
