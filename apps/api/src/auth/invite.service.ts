import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { AuthUser } from "@wg/auth/api";
import { AcceptInvite, type Character, type InvitePreview } from "@wg/shared";
import { campaign } from "../campaign/campaign.schema.ts";
import { character } from "../character/character.schema.ts";
import { db, type Db, type Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { accessToken, invite, membership } from "./auth.schema.ts";
import { toCharacter } from "../table/table.state.ts";
import { hash, issueToken } from "./auth.service.ts";

// A live invite by its code: not revoked, not expired, uses left.
async function liveInvite(conn: Db, code: string) {
  const [row] = await conn
    .select()
    .from(invite)
    .where(
      and(
        eq(invite.codeHash, hash(code)),
        isNull(invite.revokedAt),
        gt(invite.expiresAt, new Date()),
        or(isNull(invite.maxUses), sql`${invite.uses} < ${invite.maxUses}`),
      ),
    );
  return row ?? fail("This invite has expired or was already used. Ask your GM for a new one");
}

// Characters someone plays: a member holds the seat or a live guest token points at them (activeCharacterIds, web).
export async function claimedCharacterIds(conn: Db, campaignId: string): Promise<Set<string>> {
  const [members, guests] = await Promise.all([
    conn.select({ characterId: membership.characterId }).from(membership).where(eq(membership.campaignId, campaignId)),
    conn
      .select({ characterId: accessToken.characterId })
      .from(accessToken)
      .where(and(eq(accessToken.campaignId, campaignId), isNull(accessToken.revokedAt))),
  ]);
  return new Set([...members, ...guests].flatMap((r) => (r.characterId ? [r.characterId] : [])));
}

// Characters nobody has claimed yet.
async function openCharacters(conn: Db, campaignId: string) {
  const [chars, claimed] = await Promise.all([
    conn.select({ id: character.id }).from(character).where(eq(character.campaignId, campaignId)),
    claimedCharacterIds(conn, campaignId),
  ]);
  return chars.filter((c) => !claimed.has(c.id));
}

// A sheet for someone who holds an invite but no seat yet: no objectives, no book prose (see InvitePreview). Ability and
// Talent text stays for a signed-in visitor, who may read the same text in the creation catalogue already (seatless
// /api/creation needs a signed-in Clerk user, CLAUDE.md); a guest gets the names and cites only.
const previewSheet = (c: Character, signedIn: boolean): Character => {
  const bare = (list: Character["stats"]["talents"]) => (signedIn ? list : list.map((r) => ({ ...r, text: "" })));
  // A fitted upgrade's notes are its rules text (withUpgrades, Core p.227), so they need a seat too — on the suit as
  // much as on a weapon — and so do the standing weapon effects: their notes and `gm` mods are book prose
  // (rules-flow.md §11.68). The profile numbers stay, the AR and Traits an upgrade changed with them.
  const weapons = c.stats.weapons.map(({ notes: _, upgradeNames: __, effects: ___, ...w }) => w);
  const { weaponEffects: _effects, ...stats } = c.stats;
  const { notes: _n, upgradeNames: _u, ...armour } = c.stats.armour;
  return {
    ...c,
    objectives: [],
    stats: { ...stats, abilities: bare(c.stats.abilities), talents: bare(c.stats.talents), weapons, armour },
  };
};

export async function previewInvite({ code, user }: { code: string; user: AuthUser | null }): Promise<InvitePreview> {
  const inv = await liveInvite(db, code);
  const [c] = await db
    .select({ name: campaign.name, tier: campaign.tier, framework: campaign.framework })
    .from(campaign)
    .where(eq(campaign.id, inv.campaignId));
  const [chars, claimed] = await Promise.all([
    db.select().from(character).where(eq(character.campaignId, inv.campaignId)).orderBy(asc(character.createdAt)),
    claimedCharacterIds(db, inv.campaignId),
  ]);
  const ch = chars.find((r) => r.id === inv.characterId);
  const [m] = user
    ? await db
        .select({ id: membership.id })
        .from(membership)
        .where(and(eq(membership.campaignId, inv.campaignId), eq(membership.userId, user.userId)))
    : [];
  return {
    campaignId: inv.campaignId,
    campaignName: c?.name ?? "?",
    tier: c?.tier ?? 1,
    framework: c?.framework ?? "",
    mode: inv.mode,
    character: ch ? previewSheet(toCharacter(ch), !!user) : null,
    openCharacters:
      inv.mode === "room"
        ? chars.filter((r) => !claimed.has(r.id)).map((r) => previewSheet(toCharacter(r), !!user))
        : [],
    allowGuests: inv.allowGuests,
    signedIn: !!user,
    member: !!m,
  };
}

// Accept: a signed-in user becomes a member; a guest gets a player token (the caller sets it as the guest cookie).
// Runs in the campaign's action queue (TableGateway.mutate), so the claim checks can't race.
export async function acceptInvite(
  tx: Tx,
  { code, user, body }: { code: string; user: AuthUser | null; body: unknown },
): Promise<{ campaignId: string; guestToken?: string }> {
  const parsed = AcceptInvite.safeParse(body);
  if (!parsed.success) fail("Pick a character, or name a new one");
  const b = parsed.data;
  const inv = await liveInvite(tx, code);
  const campaignId = inv.campaignId;
  // Archiving revokes open invites; this covers a link made by a script or a race with the archive.
  const [c] = await tx.select({ archivedAt: campaign.archivedAt }).from(campaign).where(eq(campaign.id, campaignId));
  if (c?.archivedAt) fail("This game is archived");
  if (b.asGuest && !inv.allowGuests) fail("This invite needs an account. Sign in first");
  if (!b.asGuest && !user) fail("Sign in first, or join as a guest");
  if (!b.asGuest && user) {
    const [m] = await tx
      .select({ id: membership.id })
      .from(membership)
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
    const [c] = await tx
      .insert(character)
      .values({ campaignId, name: b.newCharacterName })
      .returning({ id: character.id });
    characterId = c!.id; // the row was just inserted
  } else fail("Pick a character, or name a new one");

  await tx
    .update(invite)
    .set({ uses: sql`${invite.uses} + 1` })
    .where(eq(invite.id, inv.id));
  if (b.asGuest) return { campaignId, guestToken: await issueToken(tx, { campaignId, characterId }) };
  await tx.insert(membership).values({ campaignId, userId: user!.userId, role: "player", characterId }); // !: checked above
  return { campaignId };
}
