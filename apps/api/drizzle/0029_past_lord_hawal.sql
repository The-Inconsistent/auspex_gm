ALTER TABLE "beat" ADD COLUMN "on_entry" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
-- One scene is played at a time: keep each campaign's first active scene in story order, the rest go back to planned.
UPDATE "beat" SET "status" = 'planned' WHERE "status" = 'active' AND "id" NOT IN (
  SELECT DISTINCT ON (b."campaign_id") b."id" FROM "beat" b JOIN "adventure" a ON a."id" = b."adventure_id"
  WHERE b."status" = 'active' ORDER BY b."campaign_id", a."created_at", b."order"
);--> statement-breakpoint
CREATE UNIQUE INDEX "beat_one_active" ON "beat" USING btree ("campaign_id") WHERE "beat"."status" = 'active';
