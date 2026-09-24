import { and, eq, isNull } from "drizzle-orm";
import type { Action, ActionResult } from "@wg/shared";
import { ownCharacter } from "../character/character.actions.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { invite, membership } from "./auth.schema.ts";
import { hash, newSecret, type Ctx } from "./auth.service.ts";

export type AccessAction = Extract<Action, { type: "invite.create" | "invite.revoke" | "member.remove" }>;

// GM-only (not in PLAYER_ACTIONS): invite links and removing a signed-in member.
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
  }
}
