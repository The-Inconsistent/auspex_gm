import { bigserial, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { Action } from "@wg/shared";
import { campaign } from "../campaign/campaign.schema.ts";
import { createdAt } from "../core/sql.ts";

// One applied action per row. The row images it changed live in `journal_change`, captured by the `zz_journal`
// trigger (journal.sql) inside the action's own transaction, so nothing can change a live table
// without the journal seeing it. Neither table has the trigger itself.
export const journalEntry = pgTable(
  "journal_entry",
  {
    id: uuid().primaryKey().defaultRandom(),
    campaignId: uuid()
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    userId: text(), // Ctx.userId: null for a guest or the admin key
    action: jsonb().$type<Action>().notNull(), // the parsed Action, so a recap can be drafted from it
    undoes: uuid(), // set on a journal.undo entry: the entry it reverted
    undoneBy: uuid(), // set on an entry once a journal.undo reverted it
    createdAt: createdAt(),
  },
  (t) => [index().on(t.campaignId, t.createdAt)],
);

export const journalChange = pgTable(
  "journal_change",
  {
    seq: bigserial({ mode: "number" }).primaryKey(),
    entryId: uuid()
      .notNull()
      .references(() => journalEntry.id, { onDelete: "cascade" }),
    tbl: text().notNull(),
    rowId: uuid().notNull(),
    op: text().$type<"I" | "U" | "D">().notNull(),
    // INSERT: before null, after the whole row. DELETE: before the whole row, after null. UPDATE: only the changed
    // keys, old and new, so a character's big jsonb isn't copied for a Wound tap.
    before: jsonb().$type<Record<string, unknown>>(),
    after: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [index().on(t.entryId)],
);

export type JournalEntry = typeof journalEntry.$inferSelect;
