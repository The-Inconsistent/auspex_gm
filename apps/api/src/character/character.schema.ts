import type { CharacterDetail, Objective } from "@wg/shared";
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { campaign } from "../campaign/campaign.schema.ts";
import { conditions, createdAt } from "../core/sql.ts";

export const character = pgTable("character", {
  id: uuid().primaryKey().defaultRandom(),
  campaignId: uuid()
    .notNull()
    .references(() => campaign.id, { onDelete: "cascade" }),
  name: text().notNull(),
  dodRaw: jsonb(),
  stats: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  overrides: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  build: jsonb().$type<Record<string, unknown>>(), // the CharacterBuild `stats` came from; null for a hand-made sheet
  buildDraft: jsonb().$type<Record<string, unknown>>(), // a builder draft waiting for the GM (`character.draft`)
  // When `build` was last saved: a builder draft a device kept from before it is stale (issue #18). Null before #18.
  builtAt: timestamp({ withTimezone: true }),
  wounds: integer().notNull().default(0), // Wounds taken, not remaining
  shock: integer().notNull().default(0),
  wrath: integer().notNull().default(2),
  traumatic: integer().notNull().default(0),
  annihilated: boolean().notNull().default(false), // one hit over 2 × Max Wounds (p.194)
  xp: integer().notNull().default(0),
  // What advancement has spent of the XP earned in play (resolveBuild's `advancement.spent`, §11.55), written by
  // `character.build`. XP left to spend is `xp - xpSpent`, so a sheet can show it without the creation catalogue.
  xpSpent: integer().notNull().default(0),
  // `xp` when the group last Ascended, so "100 or more XP earned in the current Tier" (Core p.147) is
  // `xp - xpAtAscension >= ASCENSION_XP`. 0 until the first Ascension: all XP so far belongs to the starting Tier.
  xpAtAscension: integer().notNull().default(0),
  // The GM waived this character's Ascension Package for the Ascension just made (Core p.148 step 2); cleared by the
  // next Ascension.
  ascensionPackageWaived: boolean().notNull().default(false),
  conditions: conditions(),
  detail: jsonb().$type<Partial<CharacterDetail>>().notNull().default({}), // Adding Detail (Core pp.32–36)
  objectives: jsonb().$type<Objective[]>().notNull().default([]), // the GM's notes to this Agent's player only
  createdAt: createdAt(),
});
