import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { z } from "zod";
import type { AdventureStatus, Attitude, BeatStatus, BeatType, FactionStance } from "@wg/shared";
import { owned } from "../campaign/campaign.schema.ts";
import { character } from "../character/character.schema.ts";
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
  goal: body(),
  type: text().$type<BeatType>().notNull().default("social"),
  status: text().$type<BeatStatus>().notNull().default("planned"),
  readAloud: body(),
  gmNotes: body(),
  outcome: body(),
  locationId: uuid().references(() => location.id, { onDelete: "set null" }),
  npcIds: ids(),
  handoutIds: ids(),
  itemIds: ids(), // codex.delete clears a deleted item
  encounter: jsonb().$type<unknown[]>().notNull().default([]),
  exits: jsonb().$type<unknown[]>().notNull().default([]), // BeatExit[]; codex.delete clears a deleted target
  tests: jsonb().$type<unknown[]>().notNull().default([]), // BeatTest[]
  ruin: jsonb().$type<unknown[]>().notNull().default([]), // PoolEntry[]
  glory: jsonb().$type<unknown[]>().notNull().default([]), // PoolEntry[]
  spends: jsonb().$type<unknown[]>().notNull().default([]), // PoolSpend[]
  hazards: jsonb().$type<unknown[]>().notNull().default([]), // BeatHazard[]: picks from its location's hazardList
});

export const location = pgTable("location", {
  ...owned(),
  parentId: uuid().references((): AnyPgColumn => location.id, { onDelete: "set null" }),
  name: text().notNull(),
  description: body(),
  gmNotes: body(),
  hazards: body(),
  hazardList: jsonb().$type<unknown[]>().notNull().default([]), // LocationHazard[]
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
  audience: ids(), // character ids; empty = every player. No FK in a uuid array: character.delete clears them.
});

// Something the Agents can find (issue #51). `wargearId` names a catalogue entry (JSON data, so no FK); `givenTo` is
// server-owned, set by character.giveItem, and a deleted character leaves the item loose.
export const item = pgTable("item", {
  ...owned(),
  name: text().notNull(),
  wargearId: text(),
  description: body(),
  gmNotes: body(),
  locationId: uuid().references(() => location.id, { onDelete: "set null" }),
  npcId: uuid().references(() => npc.id, { onDelete: "set null" }),
  mods: jsonb().$type<unknown[]>().notNull().default([]), // UpgradeMod[]: a relic's Powers (rules-flow.md §11.116)
  givenTo: uuid().references(() => character.id, { onDelete: "set null" }),
});
