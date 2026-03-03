"use client";

import type { User } from "next-auth";
import { AgentSidebar } from "@/components/agent-sidebar";
import { Sidebar } from "@/components/ui/sidebar";

interface ChatSidebarProps {
  readonly user: User | undefined;
  readonly isGuest?: boolean;
}

export function ChatSidebar({ user, isGuest }: ChatSidebarProps) {
  return (
    <Sidebar
      className="w-[260px] min-w-[260px] shrink-0 border-border border-r bg-sidebar p-0 dark:border-white/8 dark:bg-assistjur-purple-darker"
      style={
        {
          "--sidebar-width": "260px",
        } as React.CSSProperties
      }
    >
      <div className="h-full w-full overflow-hidden bg-sidebar dark:bg-assistjur-purple-darker">
        <AgentSidebar isGuest={isGuest} user={user} />
      </div>
    </Sidebar>
  );
}
