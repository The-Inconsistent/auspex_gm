ALTER TABLE "adventure" ADD COLUMN "shown" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "adventure" ADD COLUMN "brief" text DEFAULT '' NOT NULL;