/** Shared TypeScript interfaces and types for the knowledge sidebar. */

export interface KnowledgeDoc {
  id: string;
  title: string;
  folderId?: string | null;
  createdAt?: string;
  /** pending = só guardado; indexed = chunks disponíveis; failed = erro ao vetorizar. */
  indexingStatus?: "pending" | "indexed" | "failed";
  /** Resumo estruturado extraído por IA para PI/Contestação. Null para outros tipos. */
  structuredSummary?: string | null;
}

export interface KnowledgeFolderType {
  id: string;
  name: string;
  parentId: string | null;
}

export interface UserFileType {
  id: string;
  filename: string;
  pathname: string;
  contentType: string;
  createdAt: string;
}

export interface UploadProgress {
  processed: number;
  total: number;
  currentFile?: string;
}

export interface DocRef {
  id: string;
  title: string;
}
