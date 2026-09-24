import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { z } from "zod";
import type { AdventureStatus, Attitude, BeatStatus, BeatType, FactionStance } from "@wg/shared";
import { owned } from "../campaign/campaign.schema.ts";
import { body } from "../core/sql.ts";

// Campaign content (docs/campaign-model.md). Editable fields are validated by CodexInput in @wg/shared.
const ids = () =>
  uuid()
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`);

export const faction = pgTable("faction", {
  ...owned(),
  name: text().notNull(),
  keywords: text()
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  stance: text().$type<z.infer<typeof FactionStance>>().notNull().default("neutral"),
  notes: body(),
  secrets: body(),
});

export const adventure = pgTable("adventure", {
  ...owned(),
  title: text().notNull(),
  premise: body(),
  status: text().$type<z.infer<typeof AdventureStatus>>().notNull().default("planned"),
});

export const beat = pgTable("beat", {
  ...owned(),
  adventureId: uuid()
    .notNull()
    .references(() => adventure.id, { onDelete: "cascade" }),
  order: integer().notNull().default(0),
  title: text().notNull(),
  type: text().$type<BeatType>().notNull().default("social"),
  status: text().$type<BeatStatus>().notNull().default("planned"),
  readAloud: body(),
  gmNotes: body(),
  outcome: body(),
  locationId: uuid().references(() => location.id, { onDelete: "set null" }),
  npcIds: ids(),
  handoutIds: ids(),
  encounter: jsonb().$type<unknown[]>().notNull().default([]),
});

export const location = pgTable("location", {
  ...owned(),
  parentId: uuid().references((): AnyPgColumn => location.id, { onDelete: "set null" }),
  name: text().notNull(),
  description: body(),
  gmNotes: body(),
  hazards: body(),
  revealed: boolean().notNull().default(false),
});

export const npc = pgTable("npc", {
  ...owned(),
  factionId: uuid().references(() => faction.id, { onDelete: "set null" }),
  name: text().notNull(),
  role: body(),
  description: body(),
  gmNotes: body(),
  secrets: body(),
  attitude: text().$type<z.infer<typeof Attitude>>().notNull().default("neutral"),
  statSource: jsonb().$type<unknown>().notNull().default({ kind: "none" }),
  revealed: boolean().notNull().default(false),
});

export const handout = pgTable("handout", {
  ...owned(),
  title: text().notNull(),
  body: body(),
  revealed: boolean().notNull().default(false),
  revealedAt: timestamp({ withTimezone: true }),
});
