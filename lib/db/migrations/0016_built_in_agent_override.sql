CREATE TABLE IF NOT EXISTS "BuiltInAgentOverride" (
	"agentId" varchar(64) PRIMARY KEY NOT NULL,
	"instructions" text,
	"label" varchar(256),
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
