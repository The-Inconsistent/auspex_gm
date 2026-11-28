ALTER TABLE "npc" ADD COLUMN "fights_as" text DEFAULT 'threat' NOT NULL;--> statement-breakpoint
ALTER TABLE "npc" ADD COLUMN "follows_id" uuid;--> statement-breakpoint
ALTER TABLE "combatant" ADD COLUMN "ally" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "combatant" ADD COLUMN "controller_id" uuid;--> statement-breakpoint
ALTER TABLE "combatant" ADD COLUMN "npc_id" uuid;--> statement-breakpoint
ALTER TABLE "spend_request" ADD COLUMN "combatant_id" uuid;--> statement-breakpoint
ALTER TABLE "npc" ADD CONSTRAINT "npc_follows_id_character_id_fk" FOREIGN KEY ("follows_id") REFERENCES "public"."character"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combatant" ADD CONSTRAINT "combatant_controller_id_character_id_fk" FOREIGN KEY ("controller_id") REFERENCES "public"."character"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combatant" ADD CONSTRAINT "combatant_npc_id_npc_id_fk" FOREIGN KEY ("npc_id") REFERENCES "public"."npc"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_request" ADD CONSTRAINT "spend_request_combatant_id_combatant_id_fk" FOREIGN KEY ("combatant_id") REFERENCES "public"."combatant"("id") ON DELETE cascade ON UPDATE no action;