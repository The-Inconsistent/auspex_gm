ALTER TABLE "character" ADD COLUMN "xp_spent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "xp_at_ascension" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "ascension_package_waived" boolean DEFAULT false NOT NULL;