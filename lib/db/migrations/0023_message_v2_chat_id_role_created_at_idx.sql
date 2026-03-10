-- Índice composto para getMessageCountByUserId (message + chat join, filtro role = 'user', createdAt >= X).
-- Acelera a contagem de mensagens por utilizador em janelas de tempo (ex.: limite 24h).
CREATE INDEX IF NOT EXISTS "Message_v2_chatId_role_createdAt_idx" ON "Message_v2" ("chatId", "role", "createdAt");
