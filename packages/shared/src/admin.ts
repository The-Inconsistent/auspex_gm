import { z } from "zod";
import { Action, type ActionInput } from "./actions.ts";
import { Role, Tier } from "./state.ts";

// REST shapes of the admin page (/api/admin). An admin is a Clerk user whose publicMetadata.role is "admin"; the same
// field marks a "creator", and an admin is one too (docs/architecture.md, "Access").

export const AppRole = z.enum(["creator", "admin"]);
export type AppRole = z.infer<typeof AppRole>;

export const AdminUser = z.object({
  id: z.string(),
  name: z.string(),
  role: AppRole.nullable(), // as of their last sign-in; Clerk stays the source
  lastSeenAt: z.string(), // ISO, refreshed at most hourly
  seats: z.array(z.object({ campaignId: z.string(), campaignName: z.string(), role: Role })),
});
export type AdminUser = z.infer<typeof AdminUser>;

export const AdminCampaign = z.object({
  id: z.string(),
  name: z.string(),
  tier: Tier,
  gms: z.array(z.string()), // GM names
  players: z.number().int(), // characters
  session: z.object({ number: z.number().int(), startedAt: z.string() }).nullable(), // the one in progress
  archivedAt: z.string().nullable(),
  lastActivity: z.string(), // latest of the game's creation and any session start or end, ISO
});
export type AdminCampaign = z.infer<typeof AdminCampaign>;

export const AdminEvent = z.object({
  id: z.string(),
  actorUserId: z.string(),
  action: z.string(), // the Action type
  campaignId: z.string().nullable(),
  campaignName: z.string().nullable(), // copied, so the log still names a deleted game
  targetUserId: z.string().nullable(),
  detail: z.string(),
  createdAt: z.string(),
});
export type AdminEvent = z.infer<typeof AdminEvent>;

// The actions POST /api/admin/campaigns/:id/action accepts: the housekeeping an admin does from outside a table.
export const ADMIN_ACTIONS: ReadonlySet<Action["type"]> = new Set([
  "session.abandon",
  "session.delete",
  "member.seat",
  "member.remove",
  "campaign.archive",
  "campaign.unarchive",
  "campaign.delete",
]);
export type AdminActionInput = Extract<
  ActionInput,
  {
    type:
      | "session.abandon"
      | "session.delete"
      | "member.seat"
      | "member.remove"
      | "campaign.archive"
      | "campaign.unarchive"
      | "campaign.delete";
  }
>;
