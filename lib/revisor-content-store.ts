/**
 * Store em memória para o conteúdo dos documentos gerados pelo revisor.
 * Evita dependência do Supabase para preview/download após o stream.
 */

import { createDocStore } from "@/lib/stores/doc-store-factory";

const store = createDocStore();

export const storeRevisorDoc = (
  id: string,
  title: string,
  content: string
): void => store.storeDoc(id, title, content);

export const getRevisorDoc = (id: string) => store.getDoc(id);

export const getRevisorDocs = (
  ids: string[]
): Array<{ id: string; title: string; content: string }> => store.getDocs(ids);
