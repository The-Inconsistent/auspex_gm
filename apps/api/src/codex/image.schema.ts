import { customType, pgTable, text } from "drizzle-orm/pg-core";
import type { ImageMime } from "@wg/shared";
import { owned } from "../campaign/campaign.schema.ts";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

// A GM-uploaded picture (issue #199), referenced by an NPC, place or handout's `imageId`. Only `image.store.ts` reads or
// writes `bytes`, so an object store can take the bytes over without touching the rest.
export const codexImage = pgTable("codex_image", {
  ...owned(),
  mime: text().$type<ImageMime>().notNull(),
  bytes: bytea().notNull(),
});
