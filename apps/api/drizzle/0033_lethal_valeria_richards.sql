ALTER TABLE "encounter" ALTER COLUMN "round" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "combatant" ADD COLUMN "held" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "encounter" ADD COLUMN "history" jsonb DEFAULT '[]'::jsonb NOT NULL;