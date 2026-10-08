CREATE TABLE "test_call" (
	"campaign_id" uuid PRIMARY KEY NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"test" jsonb NOT NULL,
	"fear" boolean DEFAULT false NOT NULL,
	"hide_dn" boolean DEFAULT false NOT NULL,
	"who" jsonb NOT NULL,
	"reports" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_call" ADD CONSTRAINT "test_call_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;