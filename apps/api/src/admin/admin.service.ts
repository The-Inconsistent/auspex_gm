import { desc, eq } from "drizzle-orm";
import type { AdminCampaign, AdminEvent, AdminUser } from "@wg/shared";
import { appUser, membership } from "../auth/auth.schema.ts";
import { campaign, session } from "../campaign/campaign.schema.ts";
import { character } from "../character/character.schema.ts";
import { db } from "../core/db.ts";
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

// Latest first; the log never grows past what an admin reads, so only the head is served.
const EVENTS_SHOWN = 50;
export async function listEvents(): Promise<AdminEvent[]> {
  const rows = await db.select().from(adminEvent).orderBy(desc(adminEvent.createdAt)).limit(EVENTS_SHOWN);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

// The campaigns a user sits at, for REMOVE FROM ALL GAMES.
export async function seatsOf(userId: string) {
  return db.select({ campaignId: membership.campaignId }).from(membership).where(eq(membership.userId, userId));
}
