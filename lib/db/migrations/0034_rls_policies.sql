-- RLS (Row Level Security) para todas as tabelas com dados de utilizador.
-- As políticas usam current_setting('app.current_user_id', true) que deve ser
-- definido pela aplicação antes de cada operação (via SET LOCAL dentro de transação).
--
-- NOTA: Com Drizzle ORM e connection pooling, o RLS é uma camada de segurança
-- ADICIONAL — a aplicação já filtra por userId em todas as queries.
-- RLS serve como safety net caso alguma query esqueça o filtro.

-- ─── ENABLE RLS ────────────────────────────────────────────────────────────────

ALTER TABLE "Chat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vote_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Processo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Peca" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerbaProcesso" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeFolder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomAgent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserMemory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserCreditBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LlmUsageRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Suggestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stream" ENABLE ROW LEVEL SECURITY;

-- ─── BYPASS para o role da aplicação (conexão via Drizzle) ─────────────────────
-- O utilizador Postgres usado pela app (normalmente "postgres") deve ter
-- permissão de bypass para que queries sem SET LOCAL continuem a funcionar.
-- Isto garante retrocompatibilidade: RLS só bloqueia se alguém aceder
-- diretamente à BD sem passar pela aplicação.

-- Se o role da conexão for "postgres" (Supabase default), ele já tem SUPERUSER
-- e bypass automático. Para roles não-superuser, descomentar:
-- ALTER ROLE app_user BYPASSRLS;

-- ─── POLICIES — tabelas com userId direto ──────────────────────────────────────

-- Chat: userId direto
CREATE POLICY chat_user_isolation ON "Chat"
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

-- Processo: userId direto
CREATE POLICY processo_user_isolation ON "Processo"
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

-- Peca: userId direto
CREATE POLICY peca_user_isolation ON "Peca"
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

-- KnowledgeDocument: userId direto
CREATE POLICY knowledge_doc_user_isolation ON "KnowledgeDocument"
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

-- KnowledgeFolder: userId direto
CREATE POLICY knowledge_folder_user_isolation ON "KnowledgeFolder"
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

-- UserFile: userId direto
CREATE POLICY userfile_user_isolation ON "UserFile"
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

-- CustomAgent: userId direto
CREATE POLICY custom_agent_user_isolation ON "CustomAgent"
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

-- UserMemory: userId direto
CREATE POLICY user_memory_user_isolation ON "UserMemory"
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

-- UserCreditBalance: userId é PK
CREATE POLICY credit_balance_user_isolation ON "UserCreditBalance"
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

-- LlmUsageRecord: userId direto
CREATE POLICY llm_usage_user_isolation ON "LlmUsageRecord"
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

-- Document: userId direto
CREATE POLICY document_user_isolation ON "Document"
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

-- Suggestion: userId direto
CREATE POLICY suggestion_user_isolation ON "Suggestion"
  USING ("userId" = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid);

-- ─── POLICIES — tabelas filho (via JOIN com tabela pai) ────────────────────────

-- Message_v2: pertence ao Chat do userId
CREATE POLICY message_user_isolation ON "Message_v2"
  USING ("chatId" IN (
    SELECT id FROM "Chat"
    WHERE "userId" = current_setting('app.current_user_id', true)::uuid
  ));

-- Vote_v2: pertence ao Chat do userId
CREATE POLICY vote_user_isolation ON "Vote_v2"
  USING ("chatId" IN (
    SELECT id FROM "Chat"
    WHERE "userId" = current_setting('app.current_user_id', true)::uuid
  ));

-- Stream: pertence ao Chat do userId
CREATE POLICY stream_user_isolation ON "Stream"
  USING ("chatId" IN (
    SELECT id FROM "Chat"
    WHERE "userId" = current_setting('app.current_user_id', true)::uuid
  ));

-- TaskExecution: pertence ao Processo do userId
CREATE POLICY task_execution_user_isolation ON "TaskExecution"
  USING ("processoId" IN (
    SELECT id FROM "Processo"
    WHERE "userId" = current_setting('app.current_user_id', true)::uuid
  ));

-- VerbaProcesso: pertence ao Processo do userId
CREATE POLICY verba_processo_user_isolation ON "VerbaProcesso"
  USING ("processoId" IN (
    SELECT id FROM "Processo"
    WHERE "userId" = current_setting('app.current_user_id', true)::uuid
  ));

-- KnowledgeChunk: pertence ao KnowledgeDocument do userId
CREATE POLICY knowledge_chunk_user_isolation ON "KnowledgeChunk"
  USING ("knowledgeDocumentId" IN (
    SELECT id FROM "KnowledgeDocument"
    WHERE "userId" = current_setting('app.current_user_id', true)::uuid
  ));
