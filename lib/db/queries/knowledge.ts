import "server-only";

import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { type IndexingStatus, knowledgeChunk, knowledgeDocument, knowledgeFolder } from "@/lib/db/schema";
import { getDb, toDatabaseError } from "../connection";

export async function createKnowledgeDocument({
  userId,
  folderId,
  title,
  content,
  id,
  indexingStatus = "indexed",
}: {
  userId: string;
  folderId?: string | null;
  title: string;
  content: string;
  /** ID fixo (ex.: documento sistema do Redator); omitir para gerar aleatório. */
  id?: string;
  /** pending = só guardado (vetorizar depois); indexed (default) = já indexado ou a indexar em seguida. */
  indexingStatus?: IndexingStatus;
}) {
  try {
    const [created] = await getDb()
      .insert(knowledgeDocument)
      .values({
        ...(id ? { id } : {}),
        userId,
        folderId: folderId ?? null,
        title,
        content,
        indexingStatus,
      })
      .returning();
    return created;
  } catch (err) {
    toDatabaseError(err, "Failed to create knowledge document");
  }
}

/** Documentos com indexingStatus = 'pending' para processar por job ou endpoint. */
export function getKnowledgeDocumentsPendingIndexing({
  limit = 50,
  userId,
}: {
  limit?: number;
  /** Se definido, só documentos deste utilizador; caso contrário todos (ex.: job admin). */
  userId?: string;
}) {
  const conditions = [eq(knowledgeDocument.indexingStatus, "pending")];
  if (userId !== undefined) {
    conditions.push(eq(knowledgeDocument.userId, userId));
  }
  return getDb()
    .select()
    .from(knowledgeDocument)
    .where(and(...conditions))
    .orderBy(asc(knowledgeDocument.createdAt))
    .limit(Math.min(Math.max(1, limit), 100));
}

export async function updateKnowledgeDocumentIndexingStatus({
  id,
  userId,
  indexingStatus,
}: {
  id: string;
  userId: string;
  indexingStatus: IndexingStatus;
}) {
  const [updated] = await getDb()
    .update(knowledgeDocument)
    .set({ indexingStatus })
    .where(
      and(eq(knowledgeDocument.id, id), eq(knowledgeDocument.userId, userId))
    )
    .returning();
  return updated ?? null;
}

export async function getKnowledgeDocumentsByUserId({
  userId,
  folderId,
  limit,
  offset,
}: {
  userId: string;
  /** Se definido, filtra documentos desta pasta (null = raiz). */
  folderId?: string | null;
  /** Número máximo de documentos a devolver. Sem limite se omitido. */
  limit?: number;
  /** Número de documentos a saltar (para paginação por offset). */
  offset?: number;
}) {
  try {
    const conditions = [eq(knowledgeDocument.userId, userId)];
    if (folderId !== undefined) {
      if (folderId === null) {
        conditions.push(isNull(knowledgeDocument.folderId));
      } else {
        conditions.push(eq(knowledgeDocument.folderId, folderId));
      }
    }
    const query = getDb()
      .select()
      .from(knowledgeDocument)
      .where(and(...conditions))
      .orderBy(desc(knowledgeDocument.createdAt));
    if (limit !== undefined) {
      query.limit(limit);
    }
    if (offset !== undefined && offset > 0) {
      query.offset(offset);
    }
    return await query;
  } catch (err) {
    toDatabaseError(err, "Failed to get knowledge documents by user id");
  }
}

export async function getKnowledgeDocumentsRecentByUserId({
  userId,
  limit = 8,
}: {
  userId: string;
  limit?: number;
}) {
  try {
    return await getDb()
      .select()
      .from(knowledgeDocument)
      .where(eq(knowledgeDocument.userId, userId))
      .orderBy(desc(knowledgeDocument.createdAt))
      .limit(Math.min(Math.max(1, limit), 50));
  } catch (err) {
    toDatabaseError(err, "Failed to get recent knowledge documents");
  }
}

export async function getKnowledgeDocumentById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [doc] = await getDb()
      .select()
      .from(knowledgeDocument)
      .where(
        and(eq(knowledgeDocument.id, id), eq(knowledgeDocument.userId, userId))
      );
    return doc ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to get knowledge document by id");
  }
}

export async function getKnowledgeDocumentsByIds({
  ids,
  userId,
  allowedUserIds,
}: {
  ids: string[];
  userId: string;
  /** Quando definido, permite incluir documentos destes userIds (ex.: documento sistema do Redator). */
  allowedUserIds?: string[];
}) {
  if (ids.length === 0) {
    return [];
  }
  try {
    const userIdCondition = allowedUserIds?.length
      ? or(
          eq(knowledgeDocument.userId, userId),
          inArray(knowledgeDocument.userId, allowedUserIds)
        )
      : eq(knowledgeDocument.userId, userId);
    return await getDb()
      .select()
      .from(knowledgeDocument)
      .where(and(inArray(knowledgeDocument.id, ids), userIdCondition))
      .orderBy(asc(knowledgeDocument.title));
  } catch (err) {
    toDatabaseError(err, "Failed to get knowledge documents by ids");
  }
}

export async function updateKnowledgeDocumentById({
  id,
  userId,
  folderId,
  title,
  content,
  indexingStatus,
}: {
  id: string;
  userId: string;
  folderId?: string | null;
  title?: string;
  content?: string;
  indexingStatus?: IndexingStatus;
}) {
  try {
    const updates: Partial<{
      folderId: string | null;
      title: string;
      content: string;
      indexingStatus: IndexingStatus;
    }> = {};
    if (folderId !== undefined) {
      updates.folderId = folderId ?? null;
    }
    if (title !== undefined) {
      updates.title = title;
    }
    if (content !== undefined) {
      updates.content = content;
    }
    if (indexingStatus !== undefined) {
      updates.indexingStatus = indexingStatus;
    }
    if (Object.keys(updates).length === 0) {
      return (await getKnowledgeDocumentById({ id, userId })) ?? null;
    }
    const [updated] = await getDb()
      .update(knowledgeDocument)
      .set(updates)
      .where(
        and(eq(knowledgeDocument.id, id), eq(knowledgeDocument.userId, userId))
      )
      .returning();
    return updated ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to update knowledge document");
  }
}

export async function deleteKnowledgeDocumentById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [deleted] = await getDb()
      .delete(knowledgeDocument)
      .where(
        and(eq(knowledgeDocument.id, id), eq(knowledgeDocument.userId, userId))
      )
      .returning();
    return deleted ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to delete knowledge document");
  }
}

/** Salva o resumo estruturado extraído por IA (PI/Contestação) no documento. */
export async function updateKnowledgeDocumentStructuredSummary({
  id,
  structuredSummary,
}: {
  id: string;
  structuredSummary: string;
}): Promise<void> {
  await getDb()
    .update(knowledgeDocument)
    .set({ structuredSummary })
    .where(eq(knowledgeDocument.id, id));
}

export async function getKnowledgeFoldersByUserId({
  userId,
}: {
  userId: string;
}) {
  try {
    return await getDb()
      .select()
      .from(knowledgeFolder)
      .where(eq(knowledgeFolder.userId, userId))
      .orderBy(asc(knowledgeFolder.name));
  } catch (err) {
    toDatabaseError(err, "Failed to get knowledge folders by user id");
  }
}

export async function createKnowledgeFolder({
  userId,
  parentId,
  name,
}: {
  userId: string;
  parentId?: string | null;
  name: string;
}) {
  try {
    const [created] = await getDb()
      .insert(knowledgeFolder)
      .values({ userId, parentId: parentId ?? null, name })
      .returning();
    return created;
  } catch (err) {
    toDatabaseError(err, "Failed to create knowledge folder");
  }
}

export async function updateKnowledgeFolderById({
  id,
  userId,
  parentId,
  name,
}: {
  id: string;
  userId: string;
  parentId?: string | null;
  name?: string;
}) {
  try {
    const updates: Partial<{
      parentId: string | null;
      name: string;
    }> = {};
    if (parentId !== undefined) {
      updates.parentId = parentId ?? null;
    }
    if (name !== undefined) {
      updates.name = name;
    }
    if (Object.keys(updates).length === 0) {
      const [folder] = await getDb()
        .select()
        .from(knowledgeFolder)
        .where(
          and(eq(knowledgeFolder.id, id), eq(knowledgeFolder.userId, userId))
        );
      return folder ?? null;
    }
    const [updated] = await getDb()
      .update(knowledgeFolder)
      .set(updates)
      .where(
        and(eq(knowledgeFolder.id, id), eq(knowledgeFolder.userId, userId))
      )
      .returning();
    return updated ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to update knowledge folder");
  }
}

export async function deleteKnowledgeFolderById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    await getDb()
      .update(knowledgeDocument)
      .set({ folderId: null })
      .where(eq(knowledgeDocument.folderId, id));
    await getDb()
      .update(knowledgeFolder)
      .set({ parentId: null })
      .where(eq(knowledgeFolder.parentId, id));
    const [deleted] = await getDb()
      .delete(knowledgeFolder)
      .where(
        and(eq(knowledgeFolder.id, id), eq(knowledgeFolder.userId, userId))
      )
      .returning();
    return deleted ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to delete knowledge folder");
  }
}

export interface KnowledgeChunkRow {
  id: string;
  text: string;
  knowledgeDocumentId: string;
  title: string;
}

/**
 * Insere chunks com embeddings na tabela KnowledgeChunk.
 * Usado após criar/atualizar um KnowledgeDocument para RAG.
 */
export async function insertKnowledgeChunks({
  knowledgeDocumentId,
  chunksWithEmbeddings,
}: {
  knowledgeDocumentId: string;
  chunksWithEmbeddings: { text: string; embedding: number[] }[];
}) {
  if (chunksWithEmbeddings.length === 0) {
    return;
  }
  await getDb()
    .insert(knowledgeChunk)
    .values(
      chunksWithEmbeddings.map((c, i) => ({
        knowledgeDocumentId,
        chunkIndex: i,
        text: c.text,
        embedding: c.embedding,
      }))
    );
}

/**
 * Remove todos os chunks de um documento (ex.: antes de reindexar).
 */
export async function deleteChunksByKnowledgeDocumentId(
  knowledgeDocumentId: string
) {
  await getDb()
    .delete(knowledgeChunk)
    .where(eq(knowledgeChunk.knowledgeDocumentId, knowledgeDocumentId));
}

/**
 * Busca os chunks mais relevantes para o embedding da pergunta (cosine similarity).
 * Considera documentos do userId; se allowedUserIds for passado, inclui também documentos desses utilizadores (ex.: doc. sistema).
 * Se minSimilarity for definido (0–1), só devolve chunks com similaridade >= minSimilarity (cosine distance <= 1 - minSimilarity).
 */
export async function getRelevantChunks({
  userId,
  documentIds,
  queryEmbedding,
  limit = 12,
  allowedUserIds,
  minSimilarity,
  allUserDocs = false,
}: {
  userId: string;
  documentIds: string[];
  queryEmbedding: number[];
  limit?: number;
  /** Quando definido, inclui chunks de documentos destes userIds (ex.: Redator banco padrão). */
  allowedUserIds?: string[];
  /** Similaridade mínima (0–1). Só devolve chunks com similarity >= este valor. Ex.: 0.25 ou 0.3 (env RAG_MIN_SIMILARITY). */
  minSimilarity?: number;
  /**
   * Quando true, ignora o filtro de documentIds e busca em todos os documentos
   * indexados do utilizador. Ideal para busca global na KB sem seleção manual.
   */
  allUserDocs?: boolean;
}): Promise<KnowledgeChunkRow[]> {
  // Requer embedding válido; requer documentIds não-vazio OU modo allUserDocs
  if (queryEmbedding.length === 0) {
    return [];
  }
  if (!allUserDocs && documentIds.length === 0) {
    return [];
  }
  const embeddingStr = `[${queryEmbedding.join(",")}]`;
  const vectorLiteral = `'${embeddingStr.replaceAll("'", "''")}'::vector`;
  const userIdCondition = allowedUserIds?.length
    ? or(
        eq(knowledgeDocument.userId, userId),
        inArray(knowledgeDocument.userId, allowedUserIds)
      )
    : eq(knowledgeDocument.userId, userId);
  const conditions = [
    userIdCondition,
    sql`${knowledgeChunk.embedding} IS NOT NULL`,
  ];
  // Filtra por documentos específicos apenas quando não é busca global
  if (!allUserDocs && documentIds.length > 0) {
    conditions.push(inArray(knowledgeDocument.id, documentIds));
  }
  if (minSimilarity !== undefined && minSimilarity > 0 && minSimilarity <= 1) {
    const maxDistance = 1 - minSimilarity;
    conditions.push(
      sql`(${knowledgeChunk.embedding} <=> ${sql.raw(vectorLiteral)}) <= ${maxDistance}`
    );
  }
  const rows = await getDb()
    .select({
      id: knowledgeChunk.id,
      text: knowledgeChunk.text,
      knowledgeDocumentId: knowledgeChunk.knowledgeDocumentId,
      title: knowledgeDocument.title,
    })
    .from(knowledgeChunk)
    .innerJoin(
      knowledgeDocument,
      eq(knowledgeChunk.knowledgeDocumentId, knowledgeDocument.id)
    )
    .where(and(...conditions))
    .orderBy(sql`${knowledgeChunk.embedding} <=> ${sql.raw(vectorLiteral)}`)
    .limit(limit);
  return rows as KnowledgeChunkRow[];
}
