import "server-only";

import { desc, eq } from "drizzle-orm";
import { type ActorType, type AuditEvent, auditEvent } from "@/lib/db/schema";
import { getDb, toDatabaseError, withRetry } from "../connection";

// ─── AUDIT EVENTS ─────────────────────────────────────────────────────────────

export interface InsertAuditEventData {
  processoId?: string | null;
  userId: string;
  actorType: ActorType;
  actorId: string;
  action: string;
  confidence?: number | null;
  creditsConsumed?: number;
  metadata?: Record<string, unknown>;
}

/** Insere um evento de auditoria. Retorna o evento inserido. */
export async function insertAuditEvent(
  data: InsertAuditEventData
): Promise<AuditEvent> {
  try {
    const [event] = await getDb()
      .insert(auditEvent)
      .values({
        processoId: data.processoId ?? undefined,
        userId: data.userId,
        actorType: data.actorType,
        actorId: data.actorId,
        action: data.action,
        confidence: data.confidence ?? undefined,
        creditsConsumed: data.creditsConsumed ?? 0,
        metadata: data.metadata ?? {},
      })
      .returning();

    return event;
  } catch (err) {
    toDatabaseError(err, "Failed to insert audit event");
    throw err;
  }
}

/** Lista eventos de auditoria de um processo, mais recentes primeiro. */
export async function getAuditEventsByProcesso(
  processoId: string,
  limit = 50
): Promise<AuditEvent[]> {
  try {
    return await withRetry(() =>
      getDb()
        .select()
        .from(auditEvent)
        .where(eq(auditEvent.processoId, processoId))
        .orderBy(desc(auditEvent.createdAt))
        .limit(limit)
    );
  } catch (err) {
    toDatabaseError(err, "Failed to get audit events by processo");
    throw err;
  }
}

/** Lista eventos de auditoria de um utilizador, mais recentes primeiro. */
export async function getAuditEventsByUser(
  userId: string,
  limit = 50
): Promise<AuditEvent[]> {
  try {
    return await withRetry(() =>
      getDb()
        .select()
        .from(auditEvent)
        .where(eq(auditEvent.userId, userId))
        .orderBy(desc(auditEvent.createdAt))
        .limit(limit)
    );
  } catch (err) {
    toDatabaseError(err, "Failed to get audit events by user");
    throw err;
  }
}
