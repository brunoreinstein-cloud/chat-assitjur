-- Índice para GET /api/history: listar chats por userId ordenados por createdAt DESC.
CREATE INDEX IF NOT EXISTS "Chat_userId_createdAt_idx" ON "Chat" ("userId", "createdAt" DESC);
