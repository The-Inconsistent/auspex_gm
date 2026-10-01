ALTER TABLE "beat" ADD COLUMN "goal" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "beat" ADD COLUMN "exits" jsonb DEFAULT '[]'::jsonb NOT NULL;