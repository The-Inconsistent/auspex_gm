ALTER TABLE "handout" ADD COLUMN "style" text DEFAULT 'plain' NOT NULL;--> statement-breakpoint
ALTER TABLE "handout" ADD COLUMN "header" text DEFAULT '' NOT NULL;