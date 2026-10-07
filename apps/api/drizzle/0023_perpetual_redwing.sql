CREATE TABLE "codex_image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "handout" ADD COLUMN "image_id" uuid;--> statement-breakpoint
ALTER TABLE "handout" ADD COLUMN "image_revealed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "location" ADD COLUMN "image_id" uuid;--> statement-breakpoint
ALTER TABLE "location" ADD COLUMN "image_revealed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "npc" ADD COLUMN "image_id" uuid;--> statement-breakpoint
ALTER TABLE "npc" ADD COLUMN "image_revealed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "codex_image" ADD CONSTRAINT "codex_image_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handout" ADD CONSTRAINT "handout_image_id_codex_image_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."codex_image"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_image_id_codex_image_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."codex_image"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc" ADD CONSTRAINT "npc_image_id_codex_image_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."codex_image"("id") ON DELETE set null ON UPDATE no action;