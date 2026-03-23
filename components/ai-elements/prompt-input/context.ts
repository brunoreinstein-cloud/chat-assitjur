"use client";

import { createContext, useContext } from "react";
import type { AttachmentsContext, PromptInputControllerProps } from "./types";

// ============================================================================
// Contexts
// ============================================================================

export const PromptInputControllerContext =
  createContext<PromptInputControllerProps | null>(null);

export const ProviderAttachmentsContext =
  createContext<AttachmentsContext | null>(null);

export const LocalAttachmentsContext = createContext<AttachmentsContext | null>(
  null
);

// ============================================================================
// Hooks
// ============================================================================

export const usePromptInputController = () => {
  const ctx = useContext(PromptInputControllerContext);
  if (!ctx) {
    throw new Error(
      "Wrap your component inside <PromptInputProvider> to use usePromptInputController()."
    );
  }
  return ctx;
};

/** Optional variant (does NOT throw). Useful for dual-mode components. */
export const useOptionalPromptInputController = () =>
  useContext(PromptInputControllerContext);

export const useProviderAttachments = () => {
  const ctx = useContext(ProviderAttachmentsContext);
  if (!ctx) {
    throw new Error(
      "Wrap your component inside <PromptInputProvider> to use useProviderAttachments()."
    );
  }
  return ctx;
};

export const useOptionalProviderAttachments = () =>
  useContext(ProviderAttachmentsContext);

export const usePromptInputAttachments = () => {
  // Dual-mode: prefer provider if present, otherwise use local
  const provider = useOptionalProviderAttachments();
  const local = useContext(LocalAttachmentsContext);
  const context = provider ?? local;
  if (!context) {
    throw new Error(
      "usePromptInputAttachments must be used within a PromptInput or PromptInputProvider"
    );
  }
  return context;
};
