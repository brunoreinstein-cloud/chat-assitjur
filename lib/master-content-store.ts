/**
 * Store em memória para o conteúdo dos documentos gerados pelo Master agent.
 * Evita dependência do Supabase para preview/download após o stream.
 * Padrão idêntico ao revisor-content-store.ts.
 */

interface DocEntry {
  title: string;
  content: string;
}

const store = new Map<string, DocEntry>();

export function storeMasterDoc(
  id: string,
  title: string,
  content: string
): void {
  store.set(id, { title, content });
}

export function getMasterDoc(id: string): DocEntry | undefined {
  return store.get(id);
}

export function getMasterDocs(
  ids: string[]
): Array<{ id: string; title: string; content: string }> {
  return ids.flatMap((id) => {
    const entry = store.get(id);
    return entry ? [{ id, ...entry }] : [];
  });
}
