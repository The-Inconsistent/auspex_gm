import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { body, createdAt } from "../core/sql.ts";

export const campaign = pgTable("campaign", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  tier: integer().notNull(),
  glory: integer().notNull().default(0),
  ruin: integer().notNull().default(0),
  framework: text().notNull().default(""),
  patron: text().notNull().default(""),
  createdAt: createdAt(),
});

// Columns of every row a campaign owns (sessions and the codex tables).
export const owned = () => ({
  id: uuid().primaryKey().defaultRandom(),
  campaignId: uuid().notNull().references(() => campaign.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const session = pgTable("session", {
  ...owned(), number: integer().notNull(),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp({ withTimezone: true }), recap: body(), xp: integer().notNull().default(0),
});
