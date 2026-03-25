/**
 * Store em memória para o conteúdo dos documentos gerados pelo Master agent.
 * Evita dependência do Supabase para preview/download após o stream.
 */

import { createDocStore } from "@/lib/stores/doc-store-factory";

const store = createDocStore();

export const storeMasterDoc = (
  id: string,
  title: string,
  content: string
): void => store.storeDoc(id, title, content);

export const getMasterDoc = (id: string) => store.getDoc(id);

export const getMasterDocs = (
  ids: string[]
): Array<{ id: string; title: string; content: string }> => store.getDocs(ids);
