CREATE TABLE IF NOT EXISTS "BuiltInAgentOverride" (
	"agentId" varchar(64) PRIMARY KEY NOT NULL,
	"instructions" text,
	"label" varchar(256),
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "CustomAgent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"name" varchar(256) NOT NULL,
	"instructions" text NOT NULL,
	"baseAgentId" varchar(64),
	"knowledgeDocumentIds" json DEFAULT '[]'::json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "KnowledgeFolder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"parentId" uuid,
	"name" varchar(256) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "LlmUsageRecord" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"chatId" uuid,
	"promptTokens" integer NOT NULL,
	"completionTokens" integer NOT NULL,
	"model" varchar(128),
	"creditsConsumed" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserCreditBalance" (
	"userId" uuid PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserFile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"pathname" varchar(1024) NOT NULL,
	"url" varchar(2048) NOT NULL,
	"filename" varchar(512) NOT NULL,
	"contentType" varchar(128) NOT NULL,
	"extractedTextCache" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "activeStreamId" text;--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "agentId" varchar(64) DEFAULT 'revisor-defesas';--> statement-breakpoint
ALTER TABLE "KnowledgeDocument" ADD COLUMN IF NOT EXISTS "folderId" uuid;--> statement-breakpoint
ALTER TABLE "KnowledgeDocument" ADD COLUMN IF NOT EXISTS "indexingStatus" varchar(32) DEFAULT 'indexed' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "CustomAgent" ADD CONSTRAINT "CustomAgent_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "KnowledgeFolder" ADD CONSTRAINT "KnowledgeFolder_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "KnowledgeFolder" ADD CONSTRAINT "KnowledgeFolder_parentId_fk" FOREIGN KEY ("parentId") REFERENCES "public"."KnowledgeFolder"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "LlmUsageRecord" ADD CONSTRAINT "LlmUsageRecord_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "LlmUsageRecord" ADD CONSTRAINT "LlmUsageRecord_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserCreditBalance" ADD CONSTRAINT "UserCreditBalance_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserFile" ADD CONSTRAINT "UserFile_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "LlmUsageRecord_userId_createdAt_idx" ON "LlmUsageRecord" USING btree ("userId","createdAt");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_folderId_KnowledgeFolder_id_fk" FOREIGN KEY ("folderId") REFERENCES "public"."KnowledgeFolder"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Chat_userId_createdAt_idx" ON "Chat" USING btree ("userId","createdAt");