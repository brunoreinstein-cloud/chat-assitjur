-- Migration 0036: Tabela de audit log de créditos (CreditTransaction)
-- Registar todas as movimentações de créditos: débitos LLM, recargas, estornos, ajustes.
-- Imutável: sem UPDATE nem DELETE sobre esta tabela.

CREATE TABLE IF NOT EXISTS "CreditTransaction" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId"        uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "delta"         integer NOT NULL,
  "type"          varchar(32) NOT NULL,
  "referenceId"   varchar(256),
  "balanceBefore" integer NOT NULL,
  "balanceAfter"  integer NOT NULL,
  "createdAt"     timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "CreditTransaction_userId_createdAt_idx"
  ON "CreditTransaction" ("userId", "createdAt");
