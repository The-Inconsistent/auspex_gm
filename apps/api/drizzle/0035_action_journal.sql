CREATE TABLE "journal_change" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"entry_id" uuid NOT NULL,
	"tbl" text NOT NULL,
	"row_id" uuid NOT NULL,
	"op" text NOT NULL,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
CREATE TABLE "journal_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" text,
	"action" jsonb NOT NULL,
	"undoes" uuid,
	"undone_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_change" ADD CONSTRAINT "journal_change_entry_id_journal_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_change_entry_id_index" ON "journal_change" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_entry_campaign_id_created_at_index" ON "journal_entry" USING btree ("campaign_id","created_at");