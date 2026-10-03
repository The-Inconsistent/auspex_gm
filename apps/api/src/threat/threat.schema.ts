import { jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import type { Threat } from "@wg/shared";
import { owned } from "../campaign/campaign.schema.ts";

// A stat block the GM wrote or cloned for this table (issue #43). The bestiary stays a folder of files in
// `packages/data`; these are campaign content, like an NPC or a scene, and never reach a player (`toPlayerCodex`).
//
// The threat's id is always `custom-<slug>` and the slug is made once from the name (`threatSlug`), so a rename leaves
// every prepared encounter and NPC pointing at it alone, and an import needs no rewriting of the `threatId`s inside
// jsonb it doesn't remap.
export const customThreat = pgTable(
  "custom_threat",
  {
    ...owned(),
    slug: text().notNull(),
    data: jsonb().$type<Threat>().notNull(), // a full Threat, re-parsed server-side before it is written
  },
  (t) => [unique().on(t.campaignId, t.slug)],
);
