ALTER TABLE "character" ADD COLUMN "annihilated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "combatant" ADD COLUMN "expiring" text[] DEFAULT '{}'::text[] NOT NULL;