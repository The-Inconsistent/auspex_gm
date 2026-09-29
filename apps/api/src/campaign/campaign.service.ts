import { timingSafeEqual } from "node:crypto";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import type { AuthUser } from "@wg/auth/api";
import { rulesList, threats, wargear } from "@wg/data";
import type { Lobby, LobbyGame, Role, RuleEntry, Threat, Wargear } from "@wg/shared";
import { appUser, membership } from "../auth/auth.schema.ts";
import { character } from "../character/character.schema.ts";
import { db } from "../core/db.ts";
import { listLibrary } from "../library/library.service.ts";
import { campaign, session } from "./campaign.schema.ts";

// Constant-time compare against ADMIN_KEY (scripts only; people sign in with Clerk).
export function isAdmin(key: string | undefined) {
  const expected = process.env.ADMIN_KEY;
  if (!expected || !key) return false;
  const a = Buffer.from(key),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// A new campaign with its creator seated as GM. `owner.name` is a placeholder until they next sign in.
export function createCampaign({
  name,
  tier,
  owner,
}: {
  name: string;
  tier: number;
  owner: { userId: string; name: string } | null;
}) {
  return db.transaction(async (tx) => {
    const [c] = await tx.insert(campaign).values({ name, tier }).returning({ id: campaign.id });
    const campaignId = c!.id; // the row was just inserted
    if (owner) {
      await tx.insert(appUser).values({ id: owner.userId, name: owner.name }).onConflictDoNothing();
      await tx.insert(membership).values({ campaignId, userId: owner.userId, role: "gm" });
    }
    return { campaignId };
  });
}

// The lobby: the caller's games, and every game with a session in progress (as cards only; opening one needs a seat).
export async function lobby(user: AuthUser): Promise<Lobby> {
  // `characters` is their own library (issue #14): it belongs to no game, so it's listed whether or not they have a
  // seat anywhere.
  const [mine, running, characters] = await Promise.all([
    db
      .select({ campaignId: membership.campaignId, role: membership.role })
      .from(membership)
      .where(eq(membership.userId, user.userId)),
    db.select({ campaignId: session.campaignId, number: session.number }).from(session).where(isNull(session.endedAt)),
    listLibrary(user.userId),
  ]);
  const ids = [...new Set([...mine, ...running].map((r) => r.campaignId))];
  if (!ids.length) return { canCreate: user.creator, mine: [], running: [], characters };

  const [camps, gms, players] = await Promise.all([
    db
      .select({ id: campaign.id, name: campaign.name, tier: campaign.tier })
      .from(campaign)
      .where(inArray(campaign.id, ids)),
    db
      .select({ campaignId: membership.campaignId, name: appUser.name })
      .from(membership)
      .innerJoin(appUser, eq(appUser.id, membership.userId))
      .where(and(inArray(membership.campaignId, ids), eq(membership.role, "gm"))),
    db
      .select({ campaignId: character.campaignId, n: count() })
      .from(character)
      .where(inArray(character.campaignId, ids))
      .groupBy(character.campaignId),
  ]);
  const roleOf = new Map<string, Role>(mine.map((m) => [m.campaignId, m.role]));
  const card = (id: string): LobbyGame | null => {
    const c = camps.find((x) => x.id === id);
    if (!c) return null;
    return {
      ...c,
      gm:
        gms
          .filter((g) => g.campaignId === id)
          .map((g) => g.name)
          .join(", ") || "—",
      players: players.find((p) => p.campaignId === id)?.n ?? 0,
      session: running.find((r) => r.campaignId === id)?.number ?? null,
      role: roleOf.get(id) ?? null,
    };
  };
  const cards = (list: { campaignId: string }[]) =>
    list.map((r) => card(r.campaignId)).filter((g): g is LobbyGame => !!g);
  return { canCreate: user.creator, mine: cards(mine), running: cards(running), characters };
}

// Whether the campaign's character builder may use the homebrew books (a REST read, outside any action).
export async function campaignHomebrew(campaignId: string) {
  const [c] = await db.select({ homebrew: campaign.homebrew }).from(campaign).where(eq(campaign.id, campaignId));
  return c?.homebrew ?? false;
}

export const listThreats = (): Threat[] => [...threats.values()];
export const listWargear = (): Wargear[] => [...wargear.values()];
const rules = rulesList(); // parsed at startup, so a bad file fails fast
export const listRules = (): RuleEntry[] => rules;
