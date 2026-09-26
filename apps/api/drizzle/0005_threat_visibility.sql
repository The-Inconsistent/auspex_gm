ALTER TABLE "combatant" ADD COLUMN "visibility" text DEFAULT 'bars' NOT NULL;--> statement-breakpoint
UPDATE "combatant" SET "visibility" = 'stats' WHERE "revealed";