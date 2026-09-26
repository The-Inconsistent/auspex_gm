ALTER TABLE "campaign" ADD COLUMN "homebrew" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "build" jsonb;