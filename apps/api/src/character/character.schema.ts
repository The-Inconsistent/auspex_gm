import { integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { campaign } from "../campaign/campaign.schema.ts";
import { conditions, createdAt } from "../core/sql.ts";

export const character = pgTable("character", {
  id: uuid().primaryKey().defaultRandom(),
  campaignId: uuid().notNull().references(() => campaign.id, { onDelete: "cascade" }),
  name: text().notNull(),
  dodRaw: jsonb(),
  stats: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  overrides: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  wounds: integer().notNull().default(0), // Wounds taken, not remaining
  shock: integer().notNull().default(0),
  wrath: integer().notNull().default(2),
  traumatic: integer().notNull().default(0),
  xp: integer().notNull().default(0),
  conditions: conditions(),
  createdAt: createdAt(),
});
