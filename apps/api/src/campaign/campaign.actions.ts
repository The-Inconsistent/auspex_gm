import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import {
  ASCENSION_XP,
  TIERS,
  deriveStats,
  pcStatus,
  poolMax,
  rankOf,
  type Action,
  type ActionResult,
} from "@wg/shared";
import type { Ctx } from "../auth/auth.service.ts";
import { character } from "../character/character.schema.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { bump } from "../core/sql.ts";
import { toCharacter } from "../table/table.state.ts";
import { campaign, session } from "./campaign.schema.ts";

export type CampaignAction = Extract<
  Action,
  { type: "campaign.update" | "campaign.ascend" | "pool.adjust" | "session.start" | "session.end" }
>;

// The top of the app's Tier range (TIERS, state.ts): the books print no Tier above 5, so there is nothing to Ascend to.
const MAX_TIER = Math.max(...TIERS);

// Every character's XP for the Ascension rules, in table order, with whether it is still one of the group: Core p.147's
// "every character in your group" is not a Dead one, and nothing removes a dead character's record, so a casualty would
// otherwise hold the party at its Tier for ever (rules-flow.md §11.66).
async function xpLedger(tx: Tx, campaignId: string) {
  const tier = await campaignTier(tx, campaignId);
  const rows = await tx
    .select()
    .from(character)
    .where(eq(character.campaignId, campaignId))
    .orderBy(asc(character.createdAt));
  return rows.map((row) => {
    const c = toCharacter(row);
    const dead = pcStatus(c, deriveStats({ stats: c.stats, overrides: c.overrides, tier })).includes("Dead");
    return { name: row.name, xp: row.xp, xpAtAscension: row.xpAtAscension, dead };
  });
}

const list = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");

export async function campaignTier(tx: Tx, campaignId: string) {
  return (await campaignRules(tx, campaignId)).tier;
}

// The campaign settings that rules read: its Tier, and whether the character builder may use homebrew books.
export async function campaignRules(tx: Tx, campaignId: string) {
  const [c] = await tx
    .select({ tier: campaign.tier, homebrew: campaign.homebrew })
    .from(campaign)
    .where(eq(campaign.id, campaignId));
  return c!; // ctx.campaignId comes from a valid token, so the campaign exists
}

async function playerCount(tx: Tx, campaignId: string) {
  const [{ n } = { n: 0 }] = await tx
    .select({ n: count() })
    .from(character)
    .where(eq(character.campaignId, campaignId));
  return n;
}

export async function applyCampaignAction(
  tx: Tx,
  { ctx, action: a }: { ctx: Ctx; action: CampaignAction },
): Promise<ActionResult> {
  const cid = ctx.campaignId;
  switch (a.type) {
    case "campaign.update": {
      const { type, ...patch } = a;
      const raised = patch.tier !== undefined && patch.tier > (await campaignTier(tx, cid));
      await tx.update(campaign).set(patch).where(eq(campaign.id, cid));
      // Raising the Tier by hand (a script, a fix-up) is still an Ascension as far as the rules are concerned, so the
      // "100 XP in the current Tier" window has to restart here too (Core p.147) — otherwise the XP that paid for this
      // Tier would pay for the next one as well. `campaign.ascend` is the path that also awards and waives.
      if (raised) await tx.update(character).set({ xpAtAscension: character.xp }).where(eq(character.campaignId, cid));
      return { ok: true };
    }

    case "pool.adjust": {
      const cap = poolMax(a.pool, await playerCount(tx, cid));
      await tx
        .update(campaign)
        .set({ [a.pool]: sql`least(${cap}, ${bump(campaign[a.pool], a.delta)})` })
        .where(eq(campaign.id, cid));
      return { ok: true };
    }

    // Wrath 2 each, Glory 0, Ruin = players (p.162, p.164, p.320); the previous session is closed.
    case "session.start": {
      const players = await playerCount(tx, cid);
      await tx.update(character).set({ wrath: 2 }).where(eq(character.campaignId, cid));
      await tx.update(campaign).set({ glory: 0, ruin: players }).where(eq(campaign.id, cid));
      await tx
        .update(session)
        .set({ endedAt: new Date() })
        .where(and(eq(session.campaignId, cid), isNull(session.endedAt)));
      const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(session).where(eq(session.campaignId, cid));
      const [s] = await tx
        .insert(session)
        .values({ campaignId: cid, number: n + 1 })
        .returning({ id: session.id });
      return { ok: true, id: s!.id }; // the row was just inserted
    }

    // XP to every character (p.321); pools don't carry over, session.start resets them.
    case "session.end": {
      const [s] = await tx
        .select()
        .from(session)
        .where(and(eq(session.campaignId, cid), isNull(session.endedAt)));
      if (!s) fail("No session in progress");
      // Read before the award, because what the GM wants to know is what this session's XP crossed.
      const before = await xpLedger(tx, cid);
      await tx.update(session).set({ endedAt: new Date(), recap: a.recap, xp: a.xp }).where(eq(session.id, s.id));
      await tx
        .update(character)
        .set({ xp: sql`${character.xp} + ${a.xp}` })
        .where(eq(character.campaignId, cid));
      // Rank follows the XP earned, +1 per 40 to a maximum of 3 (Core p.146), and is nobody's decision, so the GM is
      // only told. Ascending is the group's (Core pp.147–148, §11.66), so it's an offer, never automatic.
      const tier = await campaignTier(tx, cid);
      const risen = before.filter((c) => rankOf(c.xp + a.xp) > rankOf(c.xp));
      const group = before.filter((c) => !c.dead); // a Dead character is no longer one of the group (Core p.147)
      const ready =
        group.length > 0 && tier < MAX_TIER && group.every((c) => c.xp + a.xp - c.xpAtAscension >= ASCENSION_XP);
      const notices = [
        ...risen.map((c) => `${c.name} reached Rank ${rankOf(c.xp + a.xp)} (Core p.146)`),
        ...(ready ? [`Everyone has earned ${ASCENSION_XP} XP in Tier ${tier}: the group may Ascend (Core p.147)`] : []),
      ];
      return notices.length ? { ok: true, notices } : { ok: true };
    }

    // The group Ascends together (Core pp.147–148, §11.66): one Tier for the whole campaign, never one character.
    case "campaign.ascend": {
      const tier = await campaignTier(tx, cid);
      if (tier >= MAX_TIER) fail(`Tier ${MAX_TIER} is the highest Tier; there is nothing to Ascend to`);
      const chars = await xpLedger(tx, cid);
      const group = chars.filter((c) => !c.dead); // Core p.147 asks it of the group, and the Dead have left it
      if (!group.length) fail("This campaign has no living characters to Ascend");
      // Experience Ascension (Core p.147): "every character in your group has earned 100 or more total XP in the
      // current Tier". Milestone Ascension (Core p.148) is the GM's call, and gives that 100 XP instead (step 1).
      if (a.kind === "experience") {
        const short = group.filter((c) => c.xp - c.xpAtAscension < ASCENSION_XP);
        if (short.length)
          fail(
            `${list(short.map((c) => c.name))} ${short.length > 1 ? "have" : "has"} not earned ${ASCENSION_XP} XP in Tier ${tier} yet (Core p.147)`,
          );
      }
      const award = a.kind === "milestone" ? ASCENSION_XP : 0;
      await tx
        .update(campaign)
        .set({ tier: tier + 1 }) // step 3; the builder reads the new Tier for the Ascension Package (§11.55)
        .where(eq(campaign.id, cid));
      // One statement, so `xpAtAscension` lands on the XP each character has *after* the Milestone award: the next
      // Ascension counts from here. `ascensionPackageWaived` is this Ascension's waive (Core p.148 step 2), so setting
      // it for everyone also clears the last one's.
      await tx
        .update(character)
        .set({
          xp: sql`${character.xp} + ${award}`,
          xpAtAscension: sql`${character.xp} + ${award}`,
          ascensionPackageWaived: a.waivePackage,
        })
        .where(eq(character.campaignId, cid));
      return { ok: true };
    }
  }
}
