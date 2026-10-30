import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type { Whisper } from "@wg/shared";
import { owned } from "../campaign/campaign.schema.ts";

// A GM's private line to some Agents and their replies (rules-flow.md §11.164). A session's start or end deletes them.
// Live play only, so a campaign file doesn't carry them.
export const whisper = pgTable("whisper", {
  ...owned(),
  to: jsonb().$type<string[]>().notNull(),
  text: text().notNull(),
  replies: jsonb().$type<Whisper["replies"]>().notNull().default({}),
});
