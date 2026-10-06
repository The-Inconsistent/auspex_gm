import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { body, createdAt } from "../core/sql.ts";

// What an admin did at a table (every action applied with ctx.admin). No foreign keys: the log has to survive the
// deletion of the user or the game it names, which is why the campaign's name is copied here.
export const adminEvent = pgTable("admin_event", {
  id: uuid().primaryKey().defaultRandom(),
  actorUserId: text().notNull(),
  action: text().notNull(),
  campaignId: uuid(),
  campaignName: text(),
  targetUserId: text(),
  detail: body(),
  createdAt: createdAt(),
});
