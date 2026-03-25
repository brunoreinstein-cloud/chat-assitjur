-- Migration 0037: Row Level Security (RLS) em todas as tabelas sensíveis
--
-- Arquitectura: Next.js + postgres.js (server-side, service_role / postgres role).
-- O servidor liga-se como "postgres" (superuser no Supabase self-hosted) ou
-- com a service_role key (Supabase cloud), ambos com BYPASSRLS por omissão.
-- RLS bloqueia ligações directas com a anon key ou JWT de utilizador final.
--
-- Política: service_role/postgres tem acesso total (BYPASSRLS).
--           Qualquer outro role (anon, authenticated) é bloqueado por omissão
--           — sem políticas permissivas explícitas = acesso negado.
--
-- As políticas abaixo são "deny-by-default + allow service_role":
--   ENABLE ROW LEVEL SECURITY ON "Tabela"
-- Sem ADD POLICY para anon: Supabase bloqueia tudo por omissão com RLS enabled.

-- ─── Tabelas de utilizadores e sessões ─────────────────────────────────────
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

-- ─── Chat e mensagens ───────────────────────────────────────────────────────
ALTER TABLE "Chat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vote_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stream" ENABLE ROW LEVEL SECURITY;

-- ─── Documentos e conhecimento ──────────────────────────────────────────────
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Suggestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeFolder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserFile" ENABLE ROW LEVEL SECURITY;

-- ─── Processo e execução ────────────────────────────────────────────────────
ALTER TABLE "Processo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerbaProcesso" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Peca" ENABLE ROW LEVEL SECURITY;

-- ─── Créditos e uso LLM ─────────────────────────────────────────────────────
ALTER TABLE "UserCreditBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LlmUsageRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditTransaction" ENABLE ROW LEVEL SECURITY;

-- ─── Agentes e configuração ──────────────────────────────────────────────────
ALTER TABLE "CustomAgent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BuiltInAgentOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserMemory" ENABLE ROW LEVEL SECURITY;

-- ─── Leads (público, mas com RLS) ────────────────────────────────────────────
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;

-- ─── Políticas: service_role tem acesso total (BYPASSRLS em Supabase cloud) ──
-- No Supabase cloud, a service_role key usa BYPASSRLS automaticamente — estas
-- políticas são para Supabase self-hosted ou ligações postgres directas onde
-- o role não tem BYPASSRLS por omissão.
-- Criar uma política permissiva para o role "postgres" em cada tabela:

CREATE POLICY "service_role_all" ON "User"               FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "Chat"               FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "Message_v2"         FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "Message"            FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "Vote_v2"            FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "Vote"               FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "Stream"             FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "Document"           FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "Suggestion"         FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "KnowledgeFolder"    FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "KnowledgeDocument"  FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "KnowledgeChunk"     FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "UserFile"           FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "Processo"           FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "TaskExecution"      FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "VerbaProcesso"      FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "Peca"               FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "UserCreditBalance"  FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "LlmUsageRecord"     FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "CreditTransaction"  FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "CustomAgent"        FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "BuiltInAgentOverride" FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "UserMemory"         FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "Lead"               FOR ALL TO postgres USING (true) WITH CHECK (true);
