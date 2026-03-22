-- Migration: 0029_processo_intake.sql
-- Adiciona campos de intake ao Processo e cria tabela TaskExecution.
-- Permite o fluxo "document-first": upload único → múltiplas tarefas sem re-parse.

-- ── Campos de intake no Processo ──────────────────────────────────────────────

ALTER TABLE "Processo"
  ADD COLUMN IF NOT EXISTS "titulo"          varchar(512),
  ADD COLUMN IF NOT EXISTS "tipo"            varchar(32),
  ADD COLUMN IF NOT EXISTS "blobUrl"         varchar(2048),
  ADD COLUMN IF NOT EXISTS "parsedText"      text,
  ADD COLUMN IF NOT EXISTS "totalPages"      integer,
  ADD COLUMN IF NOT EXISTS "fileHash"        varchar(64),
  ADD COLUMN IF NOT EXISTS "intakeMetadata"  json,
  ADD COLUMN IF NOT EXISTS "intakeStatus"    varchar(16);

-- Índice para detecção de re-upload (mesmo PDF → mesmo hash)
CREATE INDEX IF NOT EXISTS "Processo_userId_fileHash_idx"
  ON "Processo" ("userId", "fileHash");

-- ── Tabela TaskExecution ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "TaskExecution" (
  "id"           uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "processoId"   uuid NOT NULL REFERENCES "Processo"("id") ON DELETE CASCADE,
  "taskId"       varchar(64) NOT NULL,
  "chatId"       uuid,
  "status"       varchar(16) NOT NULL DEFAULT 'running',
  "result"       json,
  "documentsUrl" json,
  "creditsUsed"  integer,
  "startedAt"    timestamp NOT NULL DEFAULT now(),
  "completedAt"  timestamp
);

CREATE INDEX IF NOT EXISTS "TaskExecution_processoId_startedAt_idx"
  ON "TaskExecution" ("processoId", "startedAt");
