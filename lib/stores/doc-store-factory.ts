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

/**
 * Cria um store em memória com eviction FIFO quando excede maxSize.
 * Map preserva ordem de inserção — o primeiro entry é o mais antigo.
 */
export function createDocStore(maxSize = 200): DocStore {
  const map = new Map<string, DocEntry>();
  return {
    storeDoc(id, title, content) {
      // Se já existe, deletar para re-inserir no final (atualização)
      if (map.has(id)) {
        map.delete(id);
      }
      map.set(id, { title, content });
      // Evict oldest entry se exceder maxSize
      if (map.size > maxSize) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) {
          map.delete(oldest);
        }
      }
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
