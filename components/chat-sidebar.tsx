"use client";

import type { User } from "next-auth";
import { AgentSidebar } from "@/components/agent-sidebar";
import { Sidebar } from "@/components/ui/sidebar";

interface ChatSidebarProps {
  readonly user: User | undefined;
}

export function ChatSidebar({ user }: ChatSidebarProps) {
  return (
    <Sidebar
      className="w-[260px] min-w-[260px] shrink-0 border-border border-r bg-sidebar p-0"
      style={
        {
          "--sidebar-width": "260px",
        } as React.CSSProperties
      }
    >
      <div className="h-full w-full overflow-hidden bg-sidebar">
        <AgentSidebar user={user} />
      </div>
    </Sidebar>
  );
}
