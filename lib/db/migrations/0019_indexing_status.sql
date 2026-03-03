-- Estado da indexação RAG: pending (só guardado), indexed (chunks no pgvector/qdrant), failed (erro ao vetorizar).
ALTER TABLE "KnowledgeDocument" ADD COLUMN IF NOT EXISTS "indexingStatus" varchar(32) DEFAULT 'indexed' NOT NULL;
