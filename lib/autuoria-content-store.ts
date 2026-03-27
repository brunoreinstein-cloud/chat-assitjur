/**
 * Store em memória para o conteúdo dos documentos gerados pelo AutuorIA.
 * Evita dependência do Supabase para preview/download após o stream.
 */

import { createDocStore } from "@/lib/stores/doc-store-factory";

const store = createDocStore();

export const storeAutuoriaDoc = (
  id: string,
  title: string,
  content: string
): void => store.storeDoc(id, title, content);

export const getAutuoriaDoc = (id: string) => store.getDoc(id);

export const getAutuoriaDocs = (
  ids: string[]
): Array<{ id: string; title: string; content: string }> => store.getDocs(ids);
