import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import {
  type Peca,
  type Processo,
  peca,
  processo,
  type TaskExecution,
  taskExecution,
  type VerbaProcesso,
  verbaProcesso,
} from "@/lib/db/schema";
import { getDb, toDatabaseError, withRetry } from "../connection";

// ─── PROCESSOS ────────────────────────────────────────────────────────────────

export type ProcessoComVerbas = Processo & { verbas: VerbaProcesso[] };

export async function getProcessosByUserId({
  userId,
}: {
  userId: string;
}): Promise<ProcessoComVerbas[]> {
  try {
    // Buscar processos e todas as verbas do user em paralelo (evita 2 queries sequenciais).
    // A query de verbas usa subquery para filtrar por userId sem precisar dos IDs primeiro.
    // withRetry retenta erros transientes de conexão (ECONNREFUSED, ETIMEDOUT).
    const [processos, verbas] = await withRetry(() =>
      Promise.all([
        getDb()
          .select()
          .from(processo)
          .where(eq(processo.userId, userId))
          .orderBy(desc(processo.createdAt)),
        getDb()
          .select()
          .from(verbaProcesso)
          .where(
            inArray(
              verbaProcesso.processoId,
              getDb()
                .select({ id: processo.id })
                .from(processo)
                .where(eq(processo.userId, userId))
            )
          ),
      ])
    );

    if (processos.length === 0) {
      return [];
    }

    const verbasByProcessoId = new Map<string, VerbaProcesso[]>();
    for (const v of verbas) {
      const arr = verbasByProcessoId.get(v.processoId) ?? [];
      arr.push(v);
      verbasByProcessoId.set(v.processoId, arr);
    }

    return processos.map((p) => ({
      ...p,
      verbas: verbasByProcessoId.get(p.id) ?? [],
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

export async function updateProcessoIntake({
  id,
  userId,
  data,
}: {
  id: string;
  userId: string;
  data: {
    titulo?: string;
    tipo?: string;
    blobUrl?: string;
    parsedText?: string;
    totalPages?: number;
    fileHash?: string;
    intakeMetadata?: Record<string, unknown>;
    intakeStatus: string;
    /** Preenche reclamante/reclamada só se actualmente vazios (auto-fill do intake). */
    reclamante?: string;
    reclamada?: string;
  };
}): Promise<Processo | null> {
  try {
    const [updated] = await getDb()
      .update(processo)
      .set(data)
      .where(and(eq(processo.id, id), eq(processo.userId, userId)))
      .returning();
    return updated ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to update processo intake");
  }
}

/**
 * Procura um processo pelo hash do ficheiro (evita re-upload do mesmo PDF).
 */
export async function getProcessoByFileHash({
  userId,
  fileHash,
}: {
  userId: string;
  fileHash: string;
}): Promise<Processo | null> {
  try {
    const [p] = await getDb()
      .select()
      .from(processo)
      .where(and(eq(processo.userId, userId), eq(processo.fileHash, fileHash)))
      .limit(1);
    return p ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to get processo by file hash");
  }
}

// ─── TaskExecution ───────────────────────────────────────────────────────────

export async function createTaskExecution({
  processoId,
  taskId,
  chatId,
}: {
  processoId: string;
  taskId: string;
  chatId?: string;
}): Promise<TaskExecution> {
  try {
    const [created] = await getDb()
      .insert(taskExecution)
      .values({ processoId, taskId, chatId: chatId ?? null, status: "running" })
      .returning();
    return created;
  } catch (err) {
    toDatabaseError(err, "Failed to create task execution");
  }
}

export async function updateTaskExecution({
  id,
  data,
}: {
  id: string;
  data: Partial<{
    status: string;
    result: Record<string, unknown>;
    documentsUrl: string[];
    creditsUsed: number;
    completedAt: Date;
    chatId: string;
  }>;
}): Promise<TaskExecution | null> {
  try {
    const [updated] = await getDb()
      .update(taskExecution)
      .set(data)
      .where(eq(taskExecution.id, id))
      .returning();
    return updated ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to update task execution");
  }
}

export async function getTaskExecutionsByProcessoId({
  processoId,
}: {
  processoId: string;
}): Promise<TaskExecution[]> {
  try {
    return await getDb()
      .select()
      .from(taskExecution)
      .where(eq(taskExecution.processoId, processoId))
      .orderBy(desc(taskExecution.startedAt));
  } catch (err) {
    toDatabaseError(err, "Failed to get task executions by processo id");
  }
}

/** Procura a execução de tarefa associada a um chat específico (para gravar telemetria). */
export async function getTaskExecutionByChatId(
  chatId: string
): Promise<TaskExecution | null> {
  try {
    const [te] = await getDb()
      .select()
      .from(taskExecution)
      .where(eq(taskExecution.chatId, chatId))
      .limit(1);
    return te ?? null;
  } catch {
    return null;
  }
}

// ─── Peças ───────────────────────────────────────────────────────────────────

export async function savePeca({
  processoId,
  userId,
  titulo,
  tipo,
  conteudo,
  blobUrl,
  chatId,
}: {
  processoId: string;
  userId: string;
  titulo: string;
  tipo: string;
  conteudo?: string;
  blobUrl?: string;
  chatId?: string;
}): Promise<Peca> {
  try {
    const [created] = await getDb()
      .insert(peca)
      .values({ processoId, userId, titulo, tipo, conteudo, blobUrl, chatId })
      .returning();
    return created;
  } catch (err) {
    toDatabaseError(err, "Failed to save peca");
  }
}

export async function getPecasByProcessoId({
  processoId,
}: {
  processoId: string;
}): Promise<Peca[]> {
  try {
    return await getDb()
      .select()
      .from(peca)
      .where(eq(peca.processoId, processoId))
      .orderBy(desc(peca.createdAt));
  } catch (err) {
    toDatabaseError(err, "Failed to get pecas by processo id");
  }
}

export async function updatePecaBlobUrl({
  id,
  userId,
  blobUrl,
}: {
  id: string;
  userId: string;
  blobUrl: string;
}): Promise<Peca | null> {
  try {
    const [updated] = await getDb()
      .update(peca)
      .set({ blobUrl })
      .where(and(eq(peca.id, id), eq(peca.userId, userId)))
      .returning();
    return updated ?? null;
  } catch (err) {
    toDatabaseError(err, "Failed to update peca blob url");
  }
}
