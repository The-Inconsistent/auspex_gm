import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { SpendKind } from "@wg/shared";
import { campaign } from "../campaign/campaign.schema.ts";
import { character } from "../character/character.schema.ts";
import { createdAt } from "../core/sql.ts";

// Pending spend requests only (rules-flow.md §11.120): answering, cancelling and a session or fight ending delete the row.
export const spendRequest = pgTable("spend_request", {
  id: uuid().primaryKey().defaultRandom(),
  campaignId: uuid()
    .notNull()
    .references(() => campaign.id, { onDelete: "cascade" }),
  characterId: uuid()
    .notNull()
    .references(() => character.id, { onDelete: "cascade" }),
  kind: text().$type<SpendKind>().notNull(),
  amount: integer().notNull().default(1),
  createdAt: createdAt(),
});
