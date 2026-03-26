-- Sprint 2: Tabela de versionamento de prompts
-- Armazena snapshots das configurações de agentes quando editadas no admin.
-- Permite histórico e rollback de prompts.

CREATE TABLE IF NOT EXISTS "PromptVersion" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agentId"    VARCHAR(64) NOT NULL,
  "version"    INTEGER NOT NULL,
  "content"    TEXT NOT NULL,
  "label"      VARCHAR(256),
  "modelId"    VARCHAR(128),
  "toolFlags"  JSON,
  "createdAt"  TIMESTAMP DEFAULT now() NOT NULL,
  "createdBy"  VARCHAR(256),
  "changeNote" VARCHAR(512)
);

CREATE UNIQUE INDEX IF NOT EXISTS "prompt_version_agent_version_idx"
  ON "PromptVersion" ("agentId", "version");
