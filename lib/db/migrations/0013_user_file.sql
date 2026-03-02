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
DO $$ BEGIN
 ALTER TABLE "UserFile" ADD CONSTRAINT "UserFile_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
