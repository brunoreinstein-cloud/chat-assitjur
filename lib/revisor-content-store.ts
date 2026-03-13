/**
 * Store em memória para o conteúdo dos documentos gerados pelo revisor.
 * Evita dependência do Supabase para preview/download após o stream.
 */

interface DocEntry {
  title: string;
  content: string;
}

const store = new Map<string, DocEntry>();

export function storeRevisorDoc(
  id: string,
  title: string,
  content: string
): void {
  store.set(id, { title, content });
}

export function getRevisorDoc(id: string): DocEntry | undefined {
  return store.get(id);
}

export function getRevisorDocs(
  ids: string[]
): Array<{ id: string; title: string; content: string }> {
  return ids.flatMap((id) => {
    const entry = store.get(id);
    return entry ? [{ id, ...entry }] : [];
  });
}
