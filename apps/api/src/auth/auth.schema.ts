import { boolean, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { InviteMode, Role } from "@wg/shared";
import { campaign } from "../campaign/campaign.schema.ts";
import { character } from "../character/character.schema.ts";
import { createdAt } from "../core/sql.ts";

// Guest access: one player token per QR code, for players without an account. Only a SHA-256 of each token is
// stored; the token itself lives in the player's cookie / QR code.
export const accessToken = pgTable("access_token", {
  tokenHash: text().primaryKey(),
  campaignId: uuid()
    .notNull()
    .references(() => campaign.id, { onDelete: "cascade" }),
  role: text().$type<Role>().notNull(),
  characterId: uuid().references(() => character.id, { onDelete: "cascade" }),
  revokedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

// Clerk users we've seen, keyed by the Clerk user id; the name is refreshed from the session token on each sign-in.
export const appUser = pgTable("app_user", {
  id: text().primaryKey(),
  name: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// A signed-in user's seat at one table.
export const membership = pgTable(
  "membership",
  {
    id: uuid().primaryKey().defaultRandom(),
    campaignId: uuid()
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    role: text().$type<Role>().notNull(),
    characterId: uuid().references(() => character.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.campaignId, t.userId)],
);

// Invite links. Like tokens, only the code's hash is stored, so a lost QR is replaced, not recovered.
export const invite = pgTable("invite", {
  id: uuid().primaryKey().defaultRandom(),
  codeHash: text().notNull().unique(),
  campaignId: uuid()
    .notNull()
    .references(() => campaign.id, { onDelete: "cascade" }),
  mode: text().$type<InviteMode>().notNull(),
  characterId: uuid().references(() => character.id, { onDelete: "cascade" }),
  allowGuests: boolean().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  maxUses: integer(), // null = until it expires
  uses: integer().notNull().default(0),
  revokedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});
