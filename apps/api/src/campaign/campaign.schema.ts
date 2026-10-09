import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { body, conditions, createdAt } from "../core/sql.ts";

export const campaign = pgTable("campaign", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  tier: integer().notNull(),
  glory: integer().notNull().default(0),
  ruin: integer().notNull().default(0),
  framework: text().notNull().default(""),
  frameworkBonus: text().notNull().default(""), // the party sheet's FRAMEWORK BONUS box (Core p.374, rules-flow §11.80)
  patron: text().notNull().default(""),
  kind: conditions(), // the kind of game the table agreed on (Core p.316, rules-flow §11.79)
  limits: conditions(), // what the table leaves out (Core p.316)
  homebrew: boolean().notNull().default(false), // the character builder may use the homebrew books (issue #9)
  archivedAt: timestamp({ withTimezone: true }), // read-only until unarchived (campaign.archive)
  createdAt: createdAt(),
});

// Columns of every row a campaign owns (sessions and the codex tables).
export const owned = () => ({
  id: uuid().primaryKey().defaultRandom(),
  campaignId: uuid()
    .notNull()
    .references(() => campaign.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const session = pgTable("session", {
  ...owned(),
  number: integer().notNull(),
  title: text().notNull().default(""), // the GM's name for it (issue #175)
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp({ withTimezone: true }),
  recap: body(),
  notes: body(), // the GM's own, never sent to a phone (issue #195)
  xp: integer().notNull().default(0),
});
