-- Processos trabalhistas: pipeline de gestão de risco e fases
CREATE TABLE IF NOT EXISTS "Processo" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "numeroAutos" varchar(64) NOT NULL,
  "reclamante" varchar(256) NOT NULL,
  "reclamada" varchar(256) NOT NULL,
  "vara" varchar(256),
  "comarca" varchar(128),
  "tribunal" varchar(64),
  "rito" varchar(32),
  "fase" varchar(32),
  "riscoGlobal" varchar(16),
  "valorCausa" varchar(32),
  "provisao" varchar(32),
  "prazoFatal" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Processo_userId_createdAt_idx" ON "Processo"("userId", "createdAt");

-- Verbas do processo com risco individual
CREATE TABLE IF NOT EXISTS "VerbaProcesso" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "processoId" uuid NOT NULL REFERENCES "Processo"("id") ON DELETE CASCADE,
  "verba" varchar(256) NOT NULL,
  "risco" varchar(16) NOT NULL,
  "valorMin" integer,
  "valorMax" integer
);

-- Vincula chat a processo (opcional, nullable)
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "processoId" uuid REFERENCES "Processo"("id") ON DELETE SET NULL;
