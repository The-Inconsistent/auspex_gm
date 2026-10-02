CREATE TABLE "custom_threat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "custom_threat_campaignId_slug_unique" UNIQUE("campaign_id","slug")
);
--> statement-breakpoint
ALTER TABLE "custom_threat" ADD CONSTRAINT "custom_threat_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;