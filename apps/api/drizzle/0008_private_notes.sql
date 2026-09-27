ALTER TABLE "character" ADD COLUMN "objectives" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "handout" ADD COLUMN "audience" uuid[] DEFAULT '{}'::uuid[] NOT NULL;