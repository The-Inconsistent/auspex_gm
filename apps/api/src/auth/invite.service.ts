import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { AcceptInvite, type InvitePreview } from "@wg/shared";
import { campaign } from "../campaign/campaign.schema.ts";
import { character } from "../character/character.schema.ts";
import { db, type Db, type Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { accessToken, invite, membership } from "./auth.schema.ts";
import { hash, issueToken } from "./auth.service.ts";
import type { ClerkUser } from "./clerk.ts";

// A live invite by its code: not revoked, not expired, uses left.
async function liveInvite(conn: Db, code: string) {
  const [row] = await conn.select().from(invite).where(and(
    eq(invite.codeHash, hash(code)), isNull(invite.revokedAt), gt(invite.expiresAt, new Date()),
    or(isNull(invite.maxUses), sql`${invite.uses} < ${invite.maxUses}`),
  ));
  return row ?? fail("This invite has expired or was already used. Ask your GM for a new one");
}

// Characters nobody has claimed yet: no member plays them and no live guest token points at them.
async function openCharacters(conn: Db, campaignId: string) {
  const [chars, members, guests] = await Promise.all([
    conn.select({ id: character.id, name: character.name }).from(character).where(eq(character.campaignId, campaignId)),
    conn.select({ characterId: membership.characterId }).from(membership).where(eq(membership.campaignId, campaignId)),
    conn.select({ characterId: accessToken.characterId }).from(accessToken)
      .where(and(eq(accessToken.campaignId, campaignId), isNull(accessToken.revokedAt))),
  ]);
  const claimed = new Set([...members, ...guests].map((r) => r.characterId));
  return chars.filter((c) => !claimed.has(c.id));
}

export async function previewInvite({ code, user }: { code: string; user: ClerkUser | null }): Promise<InvitePreview> {
  const inv = await liveInvite(db, code);
  const [c] = await db.select({ name: campaign.name }).from(campaign).where(eq(campaign.id, inv.campaignId));
  const [ch] = inv.characterId
    ? await db.select({ id: character.id, name: character.name }).from(character).where(eq(character.id, inv.characterId))
    : [];
  const [m] = user
    ? await db.select({ id: membership.id }).from(membership)
      .where(and(eq(membership.campaignId, inv.campaignId), eq(membership.userId, user.userId)))
    : [];
  return {
    campaignId: inv.campaignId, campaignName: c?.name ?? "?", mode: inv.mode, character: ch ?? null,
    openCharacters: inv.mode === "room" ? await openCharacters(db, inv.campaignId) : [],
    allowGuests: inv.allowGuests, signedIn: !!user, member: !!m,
  };
}

// Accept: a signed-in user becomes a member; a guest gets a player token (the caller sets it as the guest cookie).
// Runs in the campaign's action queue (TableGateway.mutate), so the claim checks can't race.
export async function acceptInvite(
  tx: Tx, { code, user, body }: { code: string; user: ClerkUser | null; body: unknown },
): Promise<{ campaignId: string; guestToken?: string }> {
  const parsed = AcceptInvite.safeParse(body);
  if (!parsed.success) fail("Pick a character, or name a new one");
  const b = parsed.data;
  const inv = await liveInvite(tx, code);
  const campaignId = inv.campaignId;
  if (b.asGuest && !inv.allowGuests) fail("This invite needs an account. Sign in first");
  if (!b.asGuest && !user) fail("Sign in first, or join as a guest");
  if (!b.asGuest && user) {
    const [m] = await tx.select({ id: membership.id }).from(membership)
      .where(and(eq(membership.campaignId, campaignId), eq(membership.userId, user.userId)));
    if (m) return { campaignId }; // already seated: nothing to use up
  }

  // Which character: the invited one, an open one the player picked, or a new one by name (room invites).
  const open = await openCharacters(tx, campaignId);
  let characterId: string;
  if (inv.mode === "character") {
    characterId = inv.characterId ?? fail("Invite has no character");
    if (!open.some((c) => c.id === characterId)) fail("That character is already taken");
  } else if (b.characterId) {
    if (!open.some((c) => c.id === b.characterId)) fail("That character is already taken");
    characterId = b.characterId;
  } else if (b.newCharacterName) {
    const [c] = await tx.insert(character).values({ campaignId, name: b.newCharacterName }).returning({ id: character.id });
    characterId = c!.id; // the row was just inserted
  } else fail("Pick a character, or name a new one");

  await tx.update(invite).set({ uses: sql`${invite.uses} + 1` }).where(eq(invite.id, inv.id));
  if (b.asGuest) return { campaignId, guestToken: await issueToken(tx, { campaignId, characterId }) };
  await tx.insert(membership).values({ campaignId, userId: user!.userId, role: "player", characterId }); // !: checked above
  return { campaignId };
}
