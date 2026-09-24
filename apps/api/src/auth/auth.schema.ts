import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Role } from "@wg/shared";
import { campaign } from "../campaign/campaign.schema.ts";
import { character } from "../character/character.schema.ts";
import { createdAt } from "../core/sql.ts";

// Only a SHA-256 of each token is stored; the token itself lives in the player's cookie / QR code.
export const accessToken = pgTable("access_token", {
  tokenHash: text().primaryKey(),
  campaignId: uuid().notNull().references(() => campaign.id, { onDelete: "cascade" }),
  role: text().$type<Role>().notNull(),
  characterId: uuid().references(() => character.id, { onDelete: "cascade" }),
  revokedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});
