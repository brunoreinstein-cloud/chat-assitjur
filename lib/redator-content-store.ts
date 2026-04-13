/**
 * Store em memória para o conteúdo dos documentos gerados pelo Redator.
 * Evita dependência do Supabase para preview/download após o stream.
 */

import { createDocStore } from "@/lib/stores/doc-store-factory";

const store = createDocStore();

export const storeRedatorDoc = (
  id: string,
  title: string,
  content: string
): void => store.storeDoc(id, title, content);

export const getRedatorDoc = (id: string) => store.getDoc(id);

export const getRedatorDocs = (
  ids: string[]
): Array<{ id: string; title: string; content: string }> => store.getDocs(ids);
