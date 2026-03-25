-- Promove o index existente (userId, key) a UNIQUE para suportar
-- INSERT ... ON CONFLICT (userId, key) DO UPDATE no saveUserMemory.
-- O DROP INDEX + CREATE UNIQUE INDEX é atómico dentro de uma transação DDL no Postgres.

DROP INDEX IF EXISTS "UserMemory_userId_key_idx";
CREATE UNIQUE INDEX "UserMemory_userId_key_idx" ON "UserMemory" ("userId", "key");
