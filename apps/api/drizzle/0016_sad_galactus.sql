ALTER TABLE "beat" ADD COLUMN "hazards" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "location" ADD COLUMN "hazard_list" jsonb DEFAULT '[]'::jsonb NOT NULL;