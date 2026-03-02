CREATE TABLE IF NOT EXISTS "KnowledgeFolder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"parentId" uuid,
	"name" varchar(256) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "KnowledgeFolder" ADD CONSTRAINT "KnowledgeFolder_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "KnowledgeFolder" ADD CONSTRAINT "KnowledgeFolder_parentId_fk" FOREIGN KEY ("parentId") REFERENCES "public"."KnowledgeFolder"("id") ON DELETE SET NULL ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "KnowledgeDocument" ADD COLUMN IF NOT EXISTS "folderId" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_folderId_KnowledgeFolder_id_fk" FOREIGN KEY ("folderId") REFERENCES "public"."KnowledgeFolder"("id") ON DELETE SET NULL ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
