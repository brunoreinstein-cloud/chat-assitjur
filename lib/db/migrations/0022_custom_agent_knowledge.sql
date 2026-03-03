ALTER TABLE "CustomAgent" ADD COLUMN IF NOT EXISTS "knowledgeDocumentIds" jsonb DEFAULT '[]'::jsonb;
