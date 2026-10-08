import { boolean, jsonb, pgTable, uuid } from "drizzle-orm/pg-core";
import type { CalledTest, TestReport } from "@wg/shared";
import { campaign } from "../campaign/campaign.schema.ts";
import { createdAt } from "../core/sql.ts";

// The Test the GM has called (issue #191): one per campaign, so a new call replaces it (rules-flow.md §11.143), and
// CLOSE or a session's start or end deletes it. Live play only, so a campaign file doesn't carry it.
export const testCall = pgTable("test_call", {
  campaignId: uuid()
    .primaryKey()
    .references(() => campaign.id, { onDelete: "cascade" }),
  id: uuid().notNull().defaultRandom(),
  test: jsonb().$type<CalledTest>().notNull(),
  fear: boolean().notNull().default(false),
  hideDn: boolean().notNull().default(false),
  who: jsonb().$type<string[]>().notNull(),
  reports: jsonb().$type<Record<string, TestReport>>().notNull().default({}),
  createdAt: createdAt(),
});
