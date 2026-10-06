import { and, eq, isNull } from "drizzle-orm";
import type { Action, ActionResult } from "@wg/shared";
import { ownCharacter } from "../character/character.actions.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { accessToken, appUser, invite, membership } from "./auth.schema.ts";
import { hash, newSecret, type Ctx } from "./auth.service.ts";

export type AccessAction = Extract<
  Action,
  { type: "invite.create" | "invite.revoke" | "member.remove" | "member.seat" | "seat.leave" }
>;

// GM-only (not in PLAYER_ACTIONS): invite links and removing a signed-in member. seat.leave is the player's own, and
// member.seat is an admin's (authorize).
export async function applyAccessAction(
  tx: Tx,
  { ctx, action: a }: { ctx: Ctx; action: AccessAction },
): Promise<ActionResult> {
  const cid = ctx.campaignId;
  switch (a.type) {
    case "invite.create": {
      // A character invite is one seat, used once. A room invite is the table QR: anyone with it claims a character
      // until it expires.
      if (a.mode === "character")
        await ownCharacter(tx, { campaignId: cid, id: a.characterId ?? fail("Pick a character to invite") });
      else if (a.characterId) fail("A room invite isn't for one character");
      const code = newSecret();
      const [row] = await tx
        .insert(invite)
        .values({
          codeHash: hash(code),
          campaignId: cid,
          mode: a.mode,
          characterId: a.characterId ?? null,
          allowGuests: a.allowGuests,
          expiresAt: new Date(Date.now() + a.hours * 3600_000),
          maxUses: a.mode === "character" ? 1 : null,
        })
        .returning({ id: invite.id });
      return { ok: true, id: row!.id, token: code }; // the row was just inserted; the code is only ever shown now
    }

    case "invite.revoke": {
      const r = await tx
        .update(invite)
        .set({ revokedAt: new Date() })
        .where(and(eq(invite.id, a.id), eq(invite.campaignId, cid), isNull(invite.revokedAt)))
        .returning({ id: invite.id });
      return r.length ? { ok: true } : fail("Invite not found");
    }

    case "member.remove": {
      if (a.userId === ctx.userId) fail("You can't remove yourself");
      const r = await tx
        .delete(membership)
        .where(and(eq(membership.campaignId, cid), eq(membership.userId, a.userId)))
        .returning({ id: membership.id });
      return r.length ? { ok: true } : fail("Member not found");
    }
    case "member.seat": {
      // Only a user the app has seen: the id is a Clerk user id, and a typo mustn't seat nobody.
      const [u] = await tx.select({ id: appUser.id }).from(appUser).where(eq(appUser.id, a.userId));
      if (!u) fail("User not found");
      // A player's seat becomes the GM's; their Agent goes back to reserve.
      await tx
        .insert(membership)
        .values({ campaignId: cid, userId: a.userId, role: "gm" })
        .onConflictDoUpdate({
          target: [membership.campaignId, membership.userId],
          set: { role: "gm", characterId: null },
        });
      return { ok: true };
    }
    case "seat.leave": {
      // No kick: the phone navigates away on the ack, and a kick would drop the socket before the ack reaches it.
      if (ctx.role !== "player" || !ctx.characterId) fail("Only a seated player can leave");
      if (ctx.userId)
        await tx.delete(membership).where(and(eq(membership.campaignId, cid), eq(membership.userId, ctx.userId)));
      // ponytail: a guest can't be told apart from another phone on the same Agent's QR, so all its guest tokens go.
      else
        await tx
          .update(accessToken)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(accessToken.campaignId, cid),
              eq(accessToken.characterId, ctx.characterId),
              isNull(accessToken.revokedAt),
            ),
          );
      return { ok: true };
    }
  }
}
