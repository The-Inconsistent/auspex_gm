import { boolean, integer, jsonb, pgTable, text, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { CombatantKind, Marker, Side, Threat, ThreatClass, Visibility } from "@wg/shared";
import { campaign } from "../campaign/campaign.schema.ts";
import { character } from "../character/character.schema.ts";
import { conditions, createdAt } from "../core/sql.ts";

// One TURN BACK step (rules-flow §11.170): the fight's turn state, the damage on everyone in it and what a Seize or AWARE
// cost, as they stood before a turn-flow action. Only this api writes it, so the jsonb is typed and not parsed.
export type TurnStep = {
  label: string;
  round: number;
  currentId: string | null;
  lastSide: Side | null;
  seizedSide: Side | null;
  refund: { pool: "glory" | "ruin"; n: number } | null;
  combatants: {
    id: string;
    acted: boolean;
    ambushed: boolean;
    held: boolean;
    expiring: string[];
    wounds: number;
    shock: number;
    mobCount: number | null;
    conditions: string[];
  }[];
  characters: {
    id: string;
    wounds: number;
    shock: number;
    conditions: string[];
    traumatic: number;
    annihilated: boolean;
  }[];
};

export const encounter = pgTable("encounter", {
  id: uuid().primaryKey().defaultRandom(),
  campaignId: uuid()
    .notNull()
    .references(() => campaign.id, { onDelete: "cascade" }),
  active: boolean().notNull().default(true),
  round: integer().notNull().default(0), // 0 = before Round 1 (rules-flow §11.167)
  currentId: uuid().references((): AnyPgColumn => combatant.id, { onDelete: "set null" }),
  lastSide: text().$type<Side>(),
  seizedSide: text().$type<Side>(),
  history: jsonb().$type<TurnStep[]>().notNull().default([]), // newest last, at most TURN_HISTORY
  createdAt: createdAt(),
});

export const combatant = pgTable("combatant", {
  id: uuid().primaryKey().defaultRandom(),
  encounterId: uuid()
    .notNull()
    .references(() => encounter.id, { onDelete: "cascade" }),
  order: integer().notNull(), // display order only; turn order is chosen at the table
  acted: boolean().notNull().default(false),
  ambushed: boolean().notNull().default(false),
  held: boolean().notNull().default(false), // had its Turn and held the action (p.177); implies acted
  kind: text().$type<CombatantKind>().notNull(),
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
  expiring: conditions(), // timed Conditions held when this Turn started; they end with it (§11.8)
  visibility: text().$type<Visibility>().notNull().default("bars"), // players' view of a threat (§11.56)
});
