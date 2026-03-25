-- Índices em falta para queries frequentes que fazem seq-scan à medida que as tabelas crescem.

-- getUserFilesByUserId: filtra por userId
CREATE INDEX CONCURRENTLY IF NOT EXISTS "UserFile_userId_idx" ON "UserFile" ("userId");

-- getStreamIdsByChatId, deleteChatById: filtra por chatId
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Stream_chatId_idx" ON "Stream" ("chatId");

-- getProcessosByUserId (subquery), replaceVerbasByProcessoId: filtra por processoId
CREATE INDEX CONCURRENTLY IF NOT EXISTS "VerbaProcesso_processoId_idx" ON "VerbaProcesso" ("processoId");
