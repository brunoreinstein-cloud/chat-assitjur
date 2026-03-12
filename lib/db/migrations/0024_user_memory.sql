-- Memórias persistentes por utilizador (Custom Memory Tool - Cookbook pattern)
CREATE TABLE IF NOT EXISTS "UserMemory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "key" varchar(256) NOT NULL,
  "value" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  "expiresAt" timestamp
);

CREATE INDEX IF NOT EXISTS "UserMemory_userId_idx"     ON "UserMemory"("userId");
CREATE INDEX IF NOT EXISTS "UserMemory_userId_key_idx" ON "UserMemory"("userId", "key");
