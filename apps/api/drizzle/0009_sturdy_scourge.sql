CREATE TABLE "library_character" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"build" jsonb,
	"draft" jsonb,
	"homebrew" boolean DEFAULT false NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_character" ADD CONSTRAINT "library_character_owner_user_id_app_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_character_owner_user_id_index" ON "library_character" USING btree ("owner_user_id");