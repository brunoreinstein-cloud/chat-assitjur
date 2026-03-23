ALTER TABLE "BuiltInAgentOverride"
  ADD COLUMN IF NOT EXISTS "defaultModelId" varchar(128),
  ADD COLUMN IF NOT EXISTS "toolFlags" json;
