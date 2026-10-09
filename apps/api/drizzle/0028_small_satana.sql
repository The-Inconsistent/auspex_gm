ALTER TABLE "campaign" ADD COLUMN "next_session_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "next_session_place" text DEFAULT '' NOT NULL;