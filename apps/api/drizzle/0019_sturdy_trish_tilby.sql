ALTER TABLE "campaign" ADD COLUMN "kind" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "limits" text[] DEFAULT '{}'::text[] NOT NULL;