-- Índice para GET /api/credits: listar uso recente por userId (ORDER BY createdAt DESC LIMIT N).
CREATE INDEX IF NOT EXISTS "LlmUsageRecord_userId_createdAt_idx" ON "LlmUsageRecord" ("userId", "createdAt");
