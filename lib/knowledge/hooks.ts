"use client";

/** Custom React hooks for the knowledge sidebar. */

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Pasta selecionada: null = raiz. Estado no URL ?folder=root ou ?folder=uuid.
 * Usa history.replaceState para não provocar remount do Chat (preserva agente selecionado).
 */
export function useKnowledgeFolderFromUrl(): [
  string | null,
  (folderId: string | null) => void,
] {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawFromUrl = searchParams.get("folder");
  const fromUrl =
    rawFromUrl === "root" || rawFromUrl === "" || !rawFromUrl
      ? null
      : rawFromUrl;
  const [folderState, setFolderState] = useState<string | null | undefined>(
    undefined
  );
  const current = folderState === undefined ? fromUrl : folderState;

  useEffect(() => {
    setFolderState(undefined);
  }, []);

  const setFolder = useCallback(
    (folderId: string | null) => {
      setFolderState(folderId);
      if (globalThis.window !== undefined) {
        const params = new URLSearchParams(globalThis.window.location.search);
        params.set("knowledge", "open");
        params.set("folder", folderId ?? "root");
        globalThis.window.history.replaceState(
          null,
          "",
          `${pathname ?? "/chat"}?${params.toString()}`
        );
      }
    },
    [pathname]
  );
  return [current, setFolder];
}
