"use client";

import { BookMarkedIcon, BookOpenIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { memo } from "react";
import { useWindowSize } from "usehooks-ts";
import { CreditsBalance } from "@/components/credits-balance";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "./icons";
import { useSidebar } from "./ui/sidebar";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
  onOpenKnowledgeSidebar,
  hasAssistantMessage,
  onSaveToKnowledge,
}: Readonly<{
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  onOpenKnowledgeSidebar: () => void;
  /** Quando true, mostra botão para guardar última resposta em conhecimento */
  hasAssistantMessage?: boolean;
  onSaveToKnowledge?: () => void;
}>) {
  const router = useRouter();
  const { open } = useSidebar();
  const { width: windowWidth } = useWindowSize();

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      <SidebarToggle />

      {(!open || windowWidth < 768) && (
        <Button
          className="order-2 ml-auto h-8 px-2 md:order-1 md:ml-0 md:h-fit md:px-2"
          onClick={() => {
            router.push("/chat");
            router.refresh();
          }}
          type="button"
          variant="outline"
        >
          <PlusIcon />
          <span className="md:sr-only">Novo chat</span>
        </Button>
      )}

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          className="order-1 md:order-2"
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      {!isReadonly && hasAssistantMessage && onSaveToKnowledge && (
        <Button
          aria-label="Guardar última resposta do assistente em conhecimento"
          className="order-2 h-8 px-2 md:h-fit md:px-2"
          onClick={onSaveToKnowledge}
          title="Guardar última resposta em conhecimento (será usada como contexto noutros chats)"
          type="button"
          variant="outline"
        >
          <BookMarkedIcon size={16} />
        </Button>
      )}

      {!isReadonly && (
        <Button
          aria-label="Abrir base de conhecimento (barra lateral)"
          className="order-2 h-8 px-2 md:h-fit md:px-2"
          onClick={onOpenKnowledgeSidebar}
          title="Base de conhecimento (todos os agentes — ex.: @bancodetese)"
          type="button"
          variant="outline"
        >
          <BookOpenIcon size={16} />
        </Button>
      )}
      {!isReadonly && (
        <div aria-live="polite" className="order-2 flex items-center">
          <CreditsBalance />
        </div>
      )}
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly &&
    prevProps.hasAssistantMessage === nextProps.hasAssistantMessage
  );
});
