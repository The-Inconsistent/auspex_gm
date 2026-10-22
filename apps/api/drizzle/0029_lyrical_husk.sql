ALTER TABLE "campaign" ADD COLUMN "clocks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "countdown" jsonb;