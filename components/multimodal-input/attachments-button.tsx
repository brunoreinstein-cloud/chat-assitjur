"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { memo, useCallback } from "react";
import { PaperclipIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/types";

function PureAttachmentsButton({
  fileInputRef,
  status,
  selectedModelId,
}: Readonly<{
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
}>) {
  const isReasoningModel =
    selectedModelId.includes("reasoning") || selectedModelId.includes("think");
  const disabled = status !== "ready" || isReasoningModel;

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, [fileInputRef]);

  return (
    <Button
      aria-label="Anexar documentos (imagens, PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, ODT)"
      className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
      data-testid="attachments-button"
      disabled={disabled}
      onClick={openFileDialog}
      title="Anexar documentos (imagens, PDF, DOC, DOCX, Excel, CSV, TXT, ODT)"
      type="button"
      variant="ghost"
    >
      <PaperclipIcon size={14} />
    </Button>
  );
}

export const AttachmentsButton = memo(PureAttachmentsButton);
