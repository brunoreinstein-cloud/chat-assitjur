import { cookies } from "next/headers";
import Script from "next/script";
import { Suspense } from "react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { PageLoading } from "@/components/page-loading";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "../(auth)/auth";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
        strategy="beforeInteractive"
      />
      <DataStreamProvider>
        <Suspense fallback={<PageLoading />}>
          <SidebarWrapper>{children}</SidebarWrapper>
        </Suspense>
      </DataStreamProvider>
    </>
  );
}

async function SidebarWrapper({ children }: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

  const isGuest = session?.user?.type === "guest";

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <ChatSidebar isGuest={isGuest} user={session?.user} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
