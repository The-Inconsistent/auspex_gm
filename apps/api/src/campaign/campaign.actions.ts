import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import {
  ASCENSION_XP,
  MAX_TIER,
  ascensionGroup,
  poolMax,
  rankOf,
  type Action,
  type ActionResult,
  type Pool,
} from "@wg/shared";
import { invite } from "../auth/auth.schema.ts";
import type { Ctx } from "../auth/auth.service.ts";
import { character } from "../character/character.schema.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { bump } from "../core/sql.ts";
import { clearSpendRequests } from "../spend/spend.clear.ts";
import { clearTestCall } from "../test-call/test-call.clear.ts";
import { toCharacter } from "../table/table.state.ts";
import { campaign, session } from "./campaign.schema.ts";

export type CampaignAction = Extract<
  Action,
  {
    type:
      | "campaign.update"
      | "campaign.ascend"
      | "pool.adjust"
      | "session.start"
      | "session.end"
      | "session.edit"
      | "session.abandon"
      | "session.delete"
      | "campaign.archive"
      | "campaign.unarchive"
      | "campaign.delete";
  }
>;

// Every character in table order, for the Ascension rules (ascensionGroup).
async function charactersOf(tx: Tx, campaignId: string) {
  const rows = await tx
    .select()
    .from(character)
    .where(eq(character.campaignId, campaignId))
    .orderBy(asc(character.createdAt));
  return rows.map(toCharacter);
}

// How many characters the unspent-XP nudge names before it counts the rest: the GM report is one line (§11.69).
const NUDGE_NAMES = 3;

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

// Closes the running session without awarding anything. False when none was running.
async function abandonSession(tx: Tx, campaignId: string) {
  const closed = await tx
    .update(session)
    .set({ endedAt: new Date(), xp: 0 })
    .where(and(eq(session.campaignId, campaignId), isNull(session.endedAt)))
    .returning({ id: session.id });
  return closed.length > 0;
}

// A pool changed by a delta, floored at 0 and capped at poolMax (overflow lost, p.320). Shared by `pool.adjust` and
// whatever else moves a pool, e.g. a failed Corruption Test's +1 Ruin. Returns how far it actually moved.
export async function adjustPool(
  tx: Tx,
  { campaignId, pool, delta }: { campaignId: string; pool: Pool; delta: number },
) {
  const cap = poolMax(pool, await playerCount(tx, campaignId));
  const [{ before } = { before: 0 }] = await tx
    .select({ before: campaign[pool] })
    .from(campaign)
    .where(eq(campaign.id, campaignId));
  const [{ after } = { after: 0 }] = await tx
    .update(campaign)
    .set({ [pool]: sql`least(${cap}, ${bump(campaign[pool], delta)})` })
    .where(eq(campaign.id, campaignId))
    .returning({ after: campaign[pool] });
  return after - before;
}

export async function playerCount(tx: Tx, campaignId: string) {
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
      const { type, nextSessionAt, ...rest } = a;
      const patch = {
        ...rest,
        ...(nextSessionAt !== undefined && { nextSessionAt: nextSessionAt === null ? null : new Date(nextSessionAt) }),
      };
      const raised = patch.tier !== undefined && patch.tier > (await campaignTier(tx, cid));
      await tx.update(campaign).set(patch).where(eq(campaign.id, cid));
      // Raising the Tier by hand (a script, a fix-up) is still an Ascension as far as the rules are concerned, so the
      // "100 XP in the current Tier" window has to restart here too (Core p.147) — otherwise the XP that paid for this
      // Tier would pay for the next one as well. `campaign.ascend` is the path that also awards and waives, so a waive
      // from an earlier Milestone doesn't carry over to this one.
      if (raised)
        await tx
          .update(character)
          .set({ xpAtAscension: character.xp, ascensionPackageWaived: false })
          .where(eq(character.campaignId, cid));
      return { ok: true };
    }

    case "pool.adjust": {
      await adjustPool(tx, { campaignId: cid, pool: a.pool, delta: a.delta });
      return { ok: true };
    }

    // Wrath 2 each, Glory 0, Ruin = players (p.162, p.164, p.320); the previous session is closed. The date the GM set
    // for this session has come, so it goes (issue #197 decision 3); the place stays for the next one.
    case "session.start": {
      const players = await playerCount(tx, cid);
      // Read before the resets, so the notice below counts the XP as the last session left it.
      const before = await charactersOf(tx, cid);
      await tx.update(character).set({ wrath: 2 }).where(eq(character.campaignId, cid));
      await clearSpendRequests(tx, { campaignId: cid }); // asked against the pools this just reset
      await clearTestCall(tx, cid); // a Test called last session is over (§11.143)
      await tx.update(campaign).set({ glory: 0, ruin: players, nextSessionAt: null }).where(eq(campaign.id, cid));
      await tx
        .update(session)
        .set({ endedAt: new Date() })
        .where(and(eq(session.campaignId, cid), isNull(session.endedAt)));
      const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(session).where(eq(session.campaignId, cid));
      const [s] = await tx
        .insert(session)
        .values({ campaignId: cid, number: n + 1, title: a.title })
        .returning({ id: session.id });
      // XP is spent between sessions (Core p.146; p.148 step 4 for a Milestone Ascension, which hands out XP nobody has
      // to spend), and what's left is on the player's phone, not the GM's tablet. One line for the whole party, because
      // the GM report joins notices into one — and a long table names only the first few, since eleven names and amounts
      // ran off the line when this was tried on an eleven-Agent party. PARTY prints each character's own XP anyway.
      const unspent = before.filter((c) => c.build && c.xp - c.xpSpent > 0);
      const shown = unspent.slice(0, NUDGE_NAMES).map((c) => `${c.name} ${c.xp - c.xpSpent}`);
      const rest = unspent.length - shown.length;
      const names = list(rest > 0 ? [...shown, `${rest} more`] : shown);
      const notices = unspent.length ? [`Unspent XP: ${names} — ADVANCE spends it (Core p.146, p.148)`] : [];
      return notices.length ? { ok: true, id: s!.id, notices } : { ok: true, id: s!.id }; // the row was just inserted
    }

    // XP to every character (p.321); pools don't carry over, session.start resets them.
    case "session.end": {
      const [s] = await tx
        .select()
        .from(session)
        .where(and(eq(session.campaignId, cid), isNull(session.endedAt)));
      if (!s) fail("No session in progress");
      // Read before the award, because what the GM wants to know is what this session's XP crossed.
      const before = await charactersOf(tx, cid);
      await clearSpendRequests(tx, { campaignId: cid }); // the session the pools were spent in is over
      await clearTestCall(tx, cid);
      await tx.update(session).set({ endedAt: new Date(), recap: a.recap, xp: a.xp }).where(eq(session.id, s.id));
      await tx
        .update(character)
        .set({ xp: sql`${character.xp} + ${a.xp}` })
        .where(eq(character.campaignId, cid));
      // Rank follows the XP earned, +1 per 40 to a maximum of 3 (Core p.146), and is nobody's decision, so the GM is
      // only told. Ascending is the group's (Core pp.147–148, §11.66), so it's an offer, never automatic.
      const tier = await campaignTier(tx, cid);
      const risen = before.filter((c) => rankOf(c.xp + a.xp) > rankOf(c.xp));
      const { group, short } = ascensionGroup(before, tier, a.xp);
      const ready = group.length > 0 && tier < MAX_TIER && !short.length;
      const notices = [
        ...risen.map((c) => `${c.name} reached Rank ${rankOf(c.xp + a.xp)} (Core p.146)`),
        ...(ready ? [`Everyone has earned ${ASCENSION_XP} XP in Tier ${tier}: the group may Ascend (Core p.147)`] : []),
      ];
      return notices.length ? { ok: true, notices } : { ok: true };
    }

    // Any session of this campaign, open or ended (issue #195); only the fields sent change.
    case "session.edit": {
      const [s] = await tx
        .select({ endedAt: session.endedAt })
        .from(session)
        .where(and(eq(session.id, a.sessionId), eq(session.campaignId, cid)));
      if (!s) fail("Session not found");
      if (a.recap !== undefined && !s.endedAt) fail("A running session's recap is written at END SESSION");
      const { type, sessionId, ...patch } = a;
      if (Object.keys(patch).length) await tx.update(session).set(patch).where(eq(session.id, sessionId));
      return { ok: true };
    }

    // For a session that was never played or got left open: no XP, no Rank notices, pools untouched.
    case "session.abandon":
      return (await abandonSession(tx, cid)) ? { ok: true } : fail("No session in progress");

    // Only the latest, so session.start's numbering (count + 1) stays unbroken, and only once it has ended.
    case "session.delete": {
      const [s] = await tx
        .select()
        .from(session)
        .where(eq(session.campaignId, cid))
        .orderBy(desc(session.number))
        .limit(1);
      if (!s) fail("This game has no sessions");
      if (!s.endedAt) fail("End the session in progress before deleting it");
      await tx.delete(session).where(eq(session.id, s.id));
      const kept = s.xp > 0 ? `; the ${s.xp} XP it awarded stays on the characters` : "";
      return { ok: true, notices: [`Deleted session ${s.number}${kept}`] };
    }

    // A read-only game takes no one new, so its open invite links die with it (acceptInvite checks too).
    case "campaign.archive":
      await abandonSession(tx, cid); // nothing to close is fine here
      await tx.update(campaign).set({ archivedAt: new Date() }).where(eq(campaign.id, cid));
      await tx
        .update(invite)
        .set({ revokedAt: new Date() })
        .where(and(eq(invite.campaignId, cid), isNull(invite.revokedAt)));
      return { ok: true };

    case "campaign.unarchive":
      await tx.update(campaign).set({ archivedAt: null }).where(eq(campaign.id, cid));
      return { ok: true };

    // Everything the campaign owns cascades. The gateway then kicks the whole room (kicks) and broadcasts nothing.
    case "campaign.delete": {
      const [c] = await tx
        .select({ name: campaign.name, archivedAt: campaign.archivedAt })
        .from(campaign)
        .where(eq(campaign.id, cid));
      if (!c) fail("Campaign not found");
      if (!ctx.admin && !c.archivedAt) fail("Archive the game before deleting it");
      if (a.name !== c.name) fail("Type the game's name to delete it");
      await tx.delete(campaign).where(eq(campaign.id, cid));
      return { ok: true };
    }

    // The group Ascends together (Core pp.147–148, §11.66): one Tier for the whole campaign, never one character.
    case "campaign.ascend": {
      const tier = await campaignTier(tx, cid);
      if (tier >= MAX_TIER) fail(`Tier ${MAX_TIER} is the highest Tier; there is nothing to Ascend to`);
      const { group, short } = ascensionGroup(await charactersOf(tx, cid), tier);
      if (!group.length) fail("This campaign has no living characters to Ascend");
      // Experience Ascension (Core p.147): "every character in your group has earned 100 or more total XP in the
      // current Tier". Milestone Ascension (Core p.148) is the GM's call, and gives that 100 XP instead (step 1).
      if (a.kind === "experience") {
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
