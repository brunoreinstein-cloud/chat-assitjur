/**
 * Factory genérica para stores em memória de documentos gerados por agentes.
 * Evita duplicação entre revisor-content-store e master-content-store.
 */

interface DocEntry {
  title: string;
  content: string;
}

export interface DocStore {
  storeDoc: (id: string, title: string, content: string) => void;
  getDoc: (id: string) => DocEntry | undefined;
  getDocs: (
    ids: string[]
  ) => Array<{ id: string; title: string; content: string }>;
}

export function createDocStore(): DocStore {
  const map = new Map<string, DocEntry>();
  return {
    storeDoc(id, title, content) {
      map.set(id, { title, content });
    },
    getDoc(id) {
      return map.get(id);
    },
    getDocs(ids) {
      return ids.flatMap((id) => {
        const entry = map.get(id);
        return entry ? [{ id, ...entry }] : [];
      });
    },
  };
}
