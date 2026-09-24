import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { Marker, Role, Side, Threat, ThreatClass } from "@wg/shared";

const conditions = () => text().array().notNull().default(sql`'{}'::text[]`);
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

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

// Only a SHA-256 of each token is stored; the token itself lives in the player's cookie / QR code.
export const accessToken = pgTable("access_token", {
  tokenHash: text().primaryKey(),
  campaignId: uuid().notNull().references(() => campaign.id, { onDelete: "cascade" }),
  role: text().$type<Role>().notNull(),
  characterId: uuid().references(() => character.id, { onDelete: "cascade" }),
  revokedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

export const encounter = pgTable("encounter", {
  id: uuid().primaryKey().defaultRandom(),
  campaignId: uuid().notNull().references(() => campaign.id, { onDelete: "cascade" }),
  active: boolean().notNull().default(true),
  round: integer().notNull().default(1),
  currentId: uuid().references((): AnyPgColumn => combatant.id, { onDelete: "set null" }),
  lastSide: text().$type<Side>(),
  seizedSide: text().$type<Side>(),
  createdAt: createdAt(),
});

export const combatant = pgTable("combatant", {
  id: uuid().primaryKey().defaultRandom(),
  encounterId: uuid().notNull().references(() => encounter.id, { onDelete: "cascade" }),
  order: integer().notNull(), // display order only; turn order is chosen at the table
  acted: boolean().notNull().default(false),
  ambushed: boolean().notNull().default(false),
  kind: text().$type<"pc" | "threat">().notNull(),
  characterId: uuid().references(() => character.id, { onDelete: "cascade" }),
  threatId: text(),
  threatClass: text().$type<ThreatClass>(),
  statSnapshot: jsonb().$type<Threat>(), // copied at add time, so data fixes don't change a running fight
  label: text(),
  marker: text().$type<Marker>(),
  mobCount: integer(),
  mobStart: integer(),
  personalRuin: integer().notNull().default(0),
  wounds: integer().notNull().default(0),
  shock: integer().notNull().default(0),
  conditions: conditions(),
  revealed: boolean().notNull().default(false),
});

// Campaign content (docs/campaign-model.md). Editable fields are validated by CodexInput in @wg/shared.
const owned = () => ({
  id: uuid().primaryKey().defaultRandom(),
  campaignId: uuid().notNull().references(() => campaign.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});
const ids = () => uuid().array().notNull().default(sql`'{}'::uuid[]`);
const body = () => text().notNull().default("");

export const faction = pgTable("faction", {
  ...owned(), name: text().notNull(), keywords: text().array().notNull().default(sql`'{}'::text[]`),
  stance: text().notNull().default("neutral"), notes: body(), secrets: body(),
});

export const adventure = pgTable("adventure", {
  ...owned(), title: text().notNull(), premise: body(), status: text().notNull().default("planned"),
});

export const beat = pgTable("beat", {
  ...owned(),
  adventureId: uuid().notNull().references(() => adventure.id, { onDelete: "cascade" }),
  order: integer().notNull().default(0),
  title: text().notNull(), type: text().notNull().default("social"), status: text().notNull().default("planned"),
  readAloud: body(), gmNotes: body(), outcome: body(),
  locationId: uuid().references(() => location.id, { onDelete: "set null" }),
  npcIds: ids(), handoutIds: ids(),
  encounter: jsonb().$type<unknown[]>().notNull().default([]),
});

export const location = pgTable("location", {
  ...owned(),
  parentId: uuid().references((): AnyPgColumn => location.id, { onDelete: "set null" }),
  name: text().notNull(), description: body(), gmNotes: body(), hazards: body(),
  revealed: boolean().notNull().default(false),
});

export const npc = pgTable("npc", {
  ...owned(),
  factionId: uuid().references(() => faction.id, { onDelete: "set null" }),
  name: text().notNull(), role: body(), description: body(), gmNotes: body(), secrets: body(),
  attitude: text().notNull().default("neutral"),
  statSource: jsonb().$type<unknown>().notNull().default({ kind: "none" }),
  revealed: boolean().notNull().default(false),
});

export const handout = pgTable("handout", {
  ...owned(), title: text().notNull(), body: body(), revealed: boolean().notNull().default(false),
  revealedAt: timestamp({ withTimezone: true }),
});

export const session = pgTable("session", {
  ...owned(), number: integer().notNull(),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp({ withTimezone: true }), recap: body(), xp: integer().notNull().default(0),
});
