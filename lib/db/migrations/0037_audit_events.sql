-- Audit Trail: eventos de rastreabilidade de ações de agentes, humanos e sistema.
-- Schema híbrido: colunas fixas indexadas para queries frequentes + metadata jsonb para dados variáveis.

CREATE TABLE "AuditEvent" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "processoId"       uuid REFERENCES "Processo"("id") ON DELETE CASCADE,
  "userId"           uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "actorType"        text NOT NULL,
  "actorId"          text NOT NULL,
  "action"           text NOT NULL,
  "confidence"       real,
  "creditsConsumed"  integer DEFAULT 0,
  "metadata"         jsonb DEFAULT '{}'::jsonb
);

-- Índice principal: listar eventos de um processo por ordem cronológica reversa
CREATE INDEX "AuditEvent_processoId_createdAt_idx" ON "AuditEvent" ("processoId", "createdAt" DESC);

-- Filtrar por tipo de ator (ai_agent, human, system) e identificador
CREATE INDEX "AuditEvent_actorType_actorId_idx" ON "AuditEvent" ("actorType", "actorId");

-- Filtrar por ação específica
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent" ("action");

-- RLS: isolamento por userId (safety net — app já filtra por userId em queries)
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_event_user_isolation ON "AuditEvent"
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);
