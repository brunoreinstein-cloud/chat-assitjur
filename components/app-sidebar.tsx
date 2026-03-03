"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "next-auth";
import { useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { deleteAllMyChats } from "@/app/(chat)/actions";
import { ChevronDownIcon, PlusIcon, TrashIcon } from "@/components/icons";
import {
  getChatHistoryPaginationKey,
  SidebarHistory,
} from "@/components/sidebar-history";
import { SidebarUserNav } from "@/components/sidebar-user-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  AGENT_IDS,
  type AgentId,
  DEFAULT_AGENT_ID_WHEN_EMPTY,
  getAgentConfig,
} from "@/lib/ai/agents-registry-metadata";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function AppSidebar({
  user,
  isGuest = false,
}: {
  user: User | undefined;
  isGuest?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setOpenMobile } = useSidebar();
  const { mutate } = useSWRConfig();
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [searchChats, setSearchChats] = useState("");

  const isNewChat = pathname === "/chat";
  const agentFromUrl = searchParams.get("agent");
  const sidebarAgentId =
    isNewChat && agentFromUrl && AGENT_IDS.includes(agentFromUrl as AgentId)
      ? (agentFromUrl as AgentId)
      : isNewChat
        ? DEFAULT_AGENT_ID_WHEN_EMPTY
        : AGENT_IDS[0];

  const handleAgentChange = (value: string) => {
    setOpenMobile(false);
    if (value && value !== "none") {
      router.push(`/chat?agent=${encodeURIComponent(value)}`);
    } else {
      router.push("/chat");
    }
    router.refresh();
  };

  const handleDeleteAll = () => {
    const deletePromise = deleteAllMyChats();

    toast.promise(deletePromise, {
      loading: "Excluindo todos os chats...",
      success: (result) => {
        if (!result.success) {
          throw new Error(result.error);
        }
        mutate(unstable_serialize(getChatHistoryPaginationKey));
        setShowDeleteAllDialog(false);
        router.replace("/chat");
        router.refresh();
        return "Todos os chats foram excluídos";
      },
      error: "Falha ao excluir todos os chats",
    });
  };

  return (
    <>
      <Sidebar className="group-data-[side=left]:border-r-0">
        <SidebarHeader>
          <SidebarMenu>
            <div className="flex flex-col gap-2 px-2">
              <Select
                onValueChange={handleAgentChange}
                value={sidebarAgentId || "none"}
              >
                <SelectTrigger
                  aria-label="Selecionar agente"
                  className="h-9 w-full justify-between border-border/60 bg-muted/30 font-medium"
                >
                  <SelectValue placeholder="Selecionar agente…" />
                  <span aria-hidden className="inline-block size-4 opacity-70">
                    <ChevronDownIcon size={16} />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecionar agente</SelectItem>
                  {AGENT_IDS.map((id) => {
                    const config = getAgentConfig(id);
                    return (
                      <SelectItem key={id} value={id}>
                        {config.label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <div className="flex flex-row items-center gap-1">
                <Button
                  className="h-9 flex-1 gap-2"
                  onClick={() => {
                    setOpenMobile(false);
                    router.push("/chat");
                    router.refresh();
                  }}
                  size="sm"
                  type="button"
                >
                  <PlusIcon />
                  <span>Novo chat</span>
                </Button>
                {user && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        className="h-9 px-2"
                        onClick={() => setShowDeleteAllDialog(true)}
                        type="button"
                        variant="outline"
                      >
                        <TrashIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent align="end" className="hidden md:block">
                      Excluir todos os chats
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <Input
                aria-label="Pesquisar conversas"
                className="h-8 bg-muted/30 text-sm"
                onChange={(e) => setSearchChats(e.target.value)}
                placeholder="Pesquisar conversas…"
                value={searchChats}
              />
            </div>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarHistory searchQuery={searchChats.trim()} user={user} />
        </SidebarContent>
        <SidebarFooter>
          <div className="border-border/60 border-t px-3 py-2">
            <Link
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
              href="/admin"
            >
              Administração
            </Link>
          </div>
          {isGuest && (
            <div className="border-border/60 border-t px-3 py-2">
              <p className="text-muted-foreground text-xs">
                Está a usar como visitante. Ao sair, o histórico é apagado.{" "}
                <Link
                  className="font-medium text-foreground underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  href="/register"
                >
                  Crie uma conta
                </Link>{" "}
                para guardar.
              </p>
            </div>
          )}
          {user && <SidebarUserNav user={user} />}
        </SidebarFooter>
      </Sidebar>

      <AlertDialog
        onOpenChange={setShowDeleteAllDialog}
        open={showDeleteAllDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir todos os chats?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os seus chats serão
              excluídos permanentemente dos nossos servidores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAll}>
              Excluir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
