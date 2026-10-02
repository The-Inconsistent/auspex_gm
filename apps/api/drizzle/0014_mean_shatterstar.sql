ALTER TABLE "beat" ADD COLUMN "ruin" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "beat" ADD COLUMN "glory" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "beat" ADD COLUMN "spends" jsonb DEFAULT '[]'::jsonb NOT NULL;