import { desc, eq } from "drizzle-orm";
import type { Action, ActionResult, AdminCampaign, AdminEvent, AdminUser, RemovedSeats } from "@wg/shared";
import { appUser, membership } from "../auth/auth.schema.ts";
import type { Ctx } from "../auth/auth.service.ts";
import { campaign, session } from "../campaign/campaign.schema.ts";
import { character } from "../character/character.schema.ts";
import { db } from "../core/db.ts";
import type { TableGateway } from "../table/table.gateway.ts";
import { adminEvent } from "./admin.schema.ts";

// Every user the app has seen, with the games they sit at, by name.
export async function listUsers(): Promise<AdminUser[]> {
  const [users, seats] = await Promise.all([
    db.select().from(appUser),
    db
      .select({
        userId: membership.userId,
        campaignId: membership.campaignId,
        campaignName: campaign.name,
        role: membership.role,
      })
      .from(membership)
      .innerJoin(campaign, eq(campaign.id, membership.campaignId))
      .orderBy(campaign.name),
  ]);
  return users
    .map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      lastSeenAt: u.lastSeenAt.toISOString(),
      seats: seats
        .filter((s) => s.userId === u.id)
        .map(({ campaignId, campaignName, role }) => ({ campaignId, campaignName, role })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Every game, newest activity first. ponytail: three whole-table reads, fine for a table of friends; page it past a few hundred games
export async function listCampaigns(): Promise<AdminCampaign[]> {
  const [camps, gms, chars, sessions] = await Promise.all([
    db.select().from(campaign),
    db
      .select({ campaignId: membership.campaignId, name: appUser.name })
      .from(membership)
      .innerJoin(appUser, eq(appUser.id, membership.userId))
      .where(eq(membership.role, "gm"))
      .orderBy(membership.createdAt),
    db.select({ campaignId: character.campaignId }).from(character),
    db
      .select({
        campaignId: session.campaignId,
        number: session.number,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      })
      .from(session),
  ]);
  return camps
    .map((c) => {
      const own = sessions.filter((s) => s.campaignId === c.id);
      const running = own.find((s) => !s.endedAt);
      const touched = [c.createdAt, ...own.flatMap((s) => (s.endedAt ? [s.startedAt, s.endedAt] : [s.startedAt]))];
      return {
        id: c.id,
        name: c.name,
        tier: c.tier,
        gms: gms.filter((g) => g.campaignId === c.id).map((g) => g.name),
        players: chars.filter((p) => p.campaignId === c.id).length,
        session: running ? { number: running.number, startedAt: running.startedAt.toISOString() } : null,
        archivedAt: c.archivedAt?.toISOString() ?? null,
        lastActivity: new Date(Math.max(...touched.map((t) => t.getTime()))).toISOString(),
      };
    })
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

// Latest first, and only the head: the page shows the recent housekeeping, not the whole history.
// ponytail: the table only grows, by one row per housekeeping action; prune old rows if it ever matters
const EVENTS_SHOWN = 50;
export async function listEvents(): Promise<AdminEvent[]> {
  const rows = await db.select().from(adminEvent).orderBy(desc(adminEvent.createdAt)).limit(EVENTS_SHOWN);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

// A Clerk admin acting as one game's GM without a seat, which is what every /api/admin write runs as.
const adminCtx = ({ campaignId, adminId }: { campaignId: string; adminId: string }): Ctx => ({
  campaignId,
  role: "gm",
  characterId: null,
  userId: adminId,
  admin: true,
});

// One housekeeping action at one game, through the same path as a socket action (queue, transaction, kicks,
// broadcast). Null when there's no such game.
export async function adminAction(
  table: TableGateway,
  { adminId, campaignId, action }: { adminId: string; campaignId: string; action: Action },
): Promise<ActionResult | null> {
  const [c] = await db.select({ id: campaign.id }).from(campaign).where(eq(campaign.id, campaignId));
  if (!c) return null;
  return table.run({ ctx: adminCtx({ campaignId: c.id, adminId }), action });
}

// REMOVE FROM ALL GAMES: one member.remove per seat, so each table kicks the user, rebroadcasts and logs it as if an
// admin had pressed it there. Each seat is its own transaction, so a refusal at one game doesn't stop the rest; the
// result says which went and which didn't rather than reporting a half-done removal as an error.
export async function removeSeats(
  table: TableGateway,
  { adminId, userId }: { adminId: string; userId: string },
): Promise<RemovedSeats> {
  const seats = await db
    .select({ campaignId: membership.campaignId, campaignName: campaign.name })
    .from(membership)
    .innerJoin(campaign, eq(campaign.id, membership.campaignId))
    .where(eq(membership.userId, userId));
  const failed: RemovedSeats["failed"] = [];
  for (const { campaignId, campaignName } of seats) {
    const result = await table.run({
      ctx: adminCtx({ campaignId, adminId }),
      action: { type: "member.remove", userId },
    });
    if (!result.ok) failed.push({ campaignName, error: result.error });
  }
  return { removed: seats.length - failed.length, failed };
}
