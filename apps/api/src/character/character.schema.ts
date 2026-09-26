import type { CharacterDetail } from "@wg/shared";
import { boolean, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
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
  wounds: integer().notNull().default(0), // Wounds taken, not remaining
  shock: integer().notNull().default(0),
  wrath: integer().notNull().default(2),
  traumatic: integer().notNull().default(0),
  annihilated: boolean().notNull().default(false), // one hit over 2 × Max Wounds (p.194)
  xp: integer().notNull().default(0),
  conditions: conditions(),
  detail: jsonb().$type<Partial<CharacterDetail>>().notNull().default({}), // Adding Detail (Core pp.32–36)
  createdAt: createdAt(),
});
