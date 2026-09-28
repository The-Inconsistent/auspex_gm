import type { CharacterDetail } from "@wg/shared";
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { appUser } from "../auth/auth.schema.ts";
import { createdAt } from "../core/sql.ts";

// A character built outside any campaign, owned by one signed-in user (issue #14). Its own table rather than a
// nullable `character.campaign_id`, so every campaign query stays scoped to `ctx.campaignId`.
export const libraryCharacter = pgTable(
  "library_character",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerUserId: text()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    name: text().notNull().default(""),
    build: jsonb().$type<Record<string, unknown>>(), // a finished CharacterBuild; null until the builder saves one
    draft: jsonb().$type<Record<string, unknown>>(), // the builder's autosaved draft, any shape it writes
    homebrew: boolean().notNull().default(false), // per character here, where there's no campaign to set it
    detail: jsonb().$type<Partial<CharacterDetail>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.ownerUserId)],
);
