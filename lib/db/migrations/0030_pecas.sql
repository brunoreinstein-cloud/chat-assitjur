-- Migration: 0030_pecas.sql
-- Cria tabela Peca para armazenar peças processuais geradas pelos agentes.
-- Permite auditoria, reutilização e navegação de volta ao chat gerador.

CREATE TABLE IF NOT EXISTS "Peca" (
  "id"          uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "processoId"  uuid NOT NULL REFERENCES "Processo"("id") ON DELETE CASCADE,
  "userId"      uuid NOT NULL REFERENCES "User"("id")     ON DELETE CASCADE,
  "titulo"      varchar(512) NOT NULL,
  "tipo"        varchar(64)  NOT NULL DEFAULT 'outro',
  "conteudo"    text,
  "blobUrl"     varchar(2048),
  "chatId"      uuid,
  "createdAt"   timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Peca_processoId_createdAt_idx"
  ON "Peca" ("processoId", "createdAt");

CREATE INDEX IF NOT EXISTS "Peca_userId_createdAt_idx"
  ON "Peca" ("userId", "createdAt");
