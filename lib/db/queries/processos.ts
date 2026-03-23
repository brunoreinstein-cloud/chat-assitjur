import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { type Processo, type VerbaProcesso, processo, verbaProcesso } from "@/lib/db/schema";
import { getDb, toDatabaseError } from "../connection";

// ─── PROCESSOS ────────────────────────────────────────────────────────────────

export type ProcessoComVerbas = Processo & { verbas: VerbaProcesso[] };

export async function getProcessosByUserId({
  userId,
}: {
  userId: string;
}): Promise<ProcessoComVerbas[]> {
  try {
    const processos = await getDb()
      .select()
      .from(processo)
      .where(eq(processo.userId, userId))
      .orderBy(desc(processo.createdAt));

    if (processos.length === 0) {
      return [];
    }

    const processoIds = processos.map((p) => p.id);
    const verbas = await getDb()
      .select()
      .from(verbaProcesso)
      .where(inArray(verbaProcesso.processoId, processoIds));

    return processos.map((p) => ({
      ...p,
      verbas: verbas.filter((v) => v.processoId === p.id),
    }));
  } catch (err) {
    toDatabaseError(err, "Failed to get processos by user id");
  }
}

export async function getProcessoById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<ProcessoComVerbas | null> {
  try {
    // Ambas as queries correm em paralelo; descartamos verbas se o processo não existir.
    const [[p], verbas] = await Promise.all([
      getDb()
        .select()
        .from(processo)
        .where(and(eq(processo.id, id), eq(processo.userId, userId))),
      getDb()
        .select()
        .from(verbaProcesso)
        .where(eq(verbaProcesso.processoId, id)),
    ]);

    if (!p) {
      return null;
    }
    return { ...p, verbas };
  } catch (err) {
    toDatabaseError(err, "Failed to get processo by id");
  }
}

export async function createProcesso({
  userId,
  data,
}: {
  userId: string;
  data: {
    numeroAutos: string;
    reclamante: string;
    reclamada: string;
    vara?: string;
    comarca?: string;
    tribunal?: string;
    rito?: string;
    fase?: string;
    riscoGlobal?: string;
    valorCausa?: string;
    provisao?: string;
    prazoFatal?: Date | null;
  };
}): Promise<Processo> {
  try {
    const [created] = await getDb()
      .insert(processo)
      .values({ userId, ...data })
      .returning();
    return created;
  } catch (err) {
    toDatabaseError(err, "Failed to create processo");
  }
}

export async function updateProcesso({
  id,
  userId,
  data,
}: {
  id: string;
  userId: string;
  data: Partial<{
    numeroAutos: string;
    reclamante: string;
    reclamada: string;
    vara: string;
    comarca: string;
    tribunal: string;
    rito: string;
    fase: string;
    riscoGlobal: string;
    valorCausa: string;
    provisao: string;
    prazoFatal: Date | null;
  }>;
}): Promise<Processo | null> {
  try {
    const [updated] = await getDb()
      .update(processo)
      .set(data)
      .where(and(eq(processo.id, id), eq(processo.userId, userId)))
      .returning();
    return updated ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to update processo");
  }
}

export async function deleteProcesso({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    await getDb()
      .delete(processo)
      .where(and(eq(processo.id, id), eq(processo.userId, userId)));
  } catch (err) {
    toDatabaseError(err, "Failed to delete processo");
  }
}

export async function updateProcessoKnowledgeDocuments({
  id,
  userId,
  knowledgeDocumentIds,
}: {
  id: string;
  userId: string;
  knowledgeDocumentIds: string[];
}): Promise<Processo | null> {
  try {
    const [updated] = await getDb()
      .update(processo)
      .set({ knowledgeDocumentIds })
      .where(and(eq(processo.id, id), eq(processo.userId, userId)))
      .returning();
    return updated ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to update processo knowledge documents");
  }
}

export async function replaceVerbasByProcessoId({
  processoId,
  verbas,
}: {
  processoId: string;
  verbas: Array<{
    verba: string;
    risco: string;
    valorMin?: number | null;
    valorMax?: number | null;
  }>;
}) {
  try {
    await getDb()
      .delete(verbaProcesso)
      .where(eq(verbaProcesso.processoId, processoId));

    if (verbas.length > 0) {
      await getDb()
        .insert(verbaProcesso)
        .values(verbas.map((v) => ({ processoId, ...v })));
    }
  } catch (err) {
    toDatabaseError(err, "Failed to replace verbas by processo id");
  }
}
