import { boolean, integer, jsonb, pgTable, text, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { CombatantKind, Marker, Side, Threat, ThreatClass, Visibility } from "@wg/shared";
import { campaign } from "../campaign/campaign.schema.ts";
import { character } from "../character/character.schema.ts";
import { npc } from "../codex/codex.schema.ts";
import { conditions, createdAt } from "../core/sql.ts";
import type { TurnStep } from "./encounter.turn-step.ts";

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
  manifested: boolean().notNull().default(false), // activated a psychic power this Round (rules-flow §8, §11.181)
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
  // An ally fights on the Agents' side (issue #350, §11.208). controllerId: the Agent whose player runs it, null = the GM.
  // npcId: the Codex NPC it came from, so its FIGHTS AS is checked as it is now.
  ally: boolean().notNull().default(false),
  controllerId: uuid().references(() => character.id, { onDelete: "set null" }),
  npcId: uuid().references(() => npc.id, { onDelete: "set null" }),
});
