import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import {
  CharacterDetail,
  CharacterStats,
  Objectives,
  Overrides,
  rankOf,
  withUpgrades,
  withWeaponEffects,
  type Character,
  type Codex,
  type Combatant,
  type LiveState,
} from "@wg/shared";
import { wargear } from "@wg/data";
import { accessToken, appUser, invite, membership } from "../auth/auth.schema.ts";
import { campaign, session } from "../campaign/campaign.schema.ts";
import { character } from "../character/character.schema.ts";
import { adventure, beat, faction, handout, location, npc } from "../codex/codex.schema.ts";
import { db, type Db } from "../core/db.ts";
import { combatant, encounter } from "../encounter/encounter.schema.ts";

// Upgrades held in gear, keyed off the gear line a requisition writes ("Magnocular Scope (Core p.228)"). The catalogue
// is the api's, so this is where an id can be put next to a name for the phones (Core p.227, §11.63).
const upgradesByLine = new Map(
  [...wargear.values()]
    .filter((w) => w.upgrade)
    .map(
      (w) =>
        [
          w.name,
          {
            id: w.id,
            name: w.name,
            slot: w.upgrade!.slot,
            // What it may be fitted to, so a phone offers a suit's system on the armour and not on a rifle (§11.64). An
            // entry naming neither host is offered nowhere, which is the safe default.
            hosts: (w.upgrade!.fits.kinds ?? ["weapon"]).filter((k) => k === "weapon" || k === "armour"),
            ...(w.upgrade!.gmOnly ? { gmOnly: true } : {}),
          },
        ] as const,
    ),
);
const ownedUpgrades = (gear: string[]) =>
  gear
    .map((g) => upgradesByLine.get(g.replace(/ \([^()]*\)$/, ""))) // only the cite: a name may hold brackets too
    .filter((u) => u !== undefined)
    .map((u) => ({ ...u }));

// A character row as the table sees it (LiveState, the invite preview).
export const toCharacter = ({
  id,
  name,
  stats,
  overrides,
  build,
  buildDraft,
  builtAt,
  wounds,
  shock,
  wrath,
  traumatic,
  annihilated,
  xp,
  xpSpent,
  xpAtAscension,
  ascensionPackageWaived,
  conditions,
  detail,
  objectives,
}: typeof character.$inferSelect): Character => ({
  id,
  name,
  // The sheet as shown, not as stored: the fitted upgrades are applied here (Core p.227, §11.63), so a phone doesn't
  // need the 2 MB catalogue to read its own weapons and the stored profile stays the printed one.
  // Then the standing weapon effects, at the Rank the XP earned gives now (rules-flow.md §11.68).
  stats: withWeaponEffects(withUpgrades(CharacterStats.parse(stats), wargear), {
    rank: rankOf(xp),
    catalogue: wargear,
  }),
  ownedUpgrades: ownedUpgrades(CharacterStats.parse(stats).gear),
  overrides: Overrides.parse(overrides),
  wounds,
  shock,
  wrath,
  traumatic,
  annihilated,
  xp,
  xpSpent,
  xpAtAscension,
  ascensionPackageWaived,
  conditions,
  detail: CharacterDetail.parse(detail),
  objectives: Objectives.parse(objectives),
  build: build ?? null,
  draft: buildDraft ?? null,
  builtAt: builtAt?.getTime() ?? null,
});

// `conn` lets an action read the live state inside its own transaction (the turn rules in encounter.actions).
export async function loadState(campaignId: string, conn: Db = db): Promise<LiveState | null> {
  const [c] = await conn.select().from(campaign).where(eq(campaign.id, campaignId));
  if (!c) return null;

  const chars = await conn
    .select()
    .from(character)
    .where(eq(character.campaignId, campaignId))
    .orderBy(asc(character.createdAt));
  const [enc] = await conn
    .select()
    .from(encounter)
    .where(and(eq(encounter.campaignId, campaignId), eq(encounter.active, true)));
  const rows = enc
    ? await conn.select().from(combatant).where(eq(combatant.encounterId, enc.id)).orderBy(asc(combatant.order))
    : [];
  const members = await conn
    .select({
      userId: membership.userId,
      name: appUser.name,
      role: membership.role,
      characterId: membership.characterId,
    })
    .from(membership)
    .innerJoin(appUser, eq(appUser.id, membership.userId))
    .where(eq(membership.campaignId, campaignId))
    .orderBy(asc(membership.createdAt));
  const invites = await conn
    .select()
    .from(invite)
    .where(
      and(
        eq(invite.campaignId, campaignId),
        isNull(invite.revokedAt),
        gt(invite.expiresAt, new Date()),
        or(isNull(invite.maxUses), sql`${invite.uses} < ${invite.maxUses}`),
      ),
    )
    .orderBy(asc(invite.createdAt));
  const guests = await conn
    .selectDistinct({ characterId: accessToken.characterId })
    .from(accessToken)
    .where(and(eq(accessToken.campaignId, campaignId), isNull(accessToken.revokedAt)));

  return {
    campaign: {
      id: c.id,
      name: c.name,
      tier: c.tier,
      glory: c.glory,
      ruin: c.ruin,
      framework: c.framework,
      patron: c.patron,
      homebrew: c.homebrew,
    },
    characters: chars.map(toCharacter),
    encounter: enc
      ? {
          id: enc.id,
          round: enc.round,
          currentId: enc.currentId,
          lastSide: enc.lastSide,
          seizedSide: enc.seizedSide,
          // A pc row always has characterId; a threat row always has threatId, threatClass and statSnapshot (see addThreat).
          combatants: rows.map((r): Combatant =>
            r.kind === "pc"
              ? { id: r.id, kind: "pc", characterId: r.characterId!, acted: r.acted, ambushed: r.ambushed }
              : {
                  id: r.id,
                  kind: "threat",
                  acted: r.acted,
                  ambushed: r.ambushed,
                  marker: r.marker,
                  threatId: r.threatId!,
                  threatClass: r.threatClass!,
                  label: r.label ?? r.statSnapshot!.name,
                  mobCount: r.mobCount,
                  mobStart: r.mobStart,
                  wounds: r.wounds,
                  shock: r.shock,
                  personalRuin: r.personalRuin,
                  maxWounds: r.statSnapshot!.wounds,
                  maxShock: r.statSnapshot!.shock,
                  conditions: r.conditions,
                  visibility: r.visibility,
                  stats: r.statSnapshot,
                },
          ),
        }
      : null,
    access: {
      members,
      invites: invites.map((i) => ({
        id: i.id,
        mode: i.mode,
        characterId: i.characterId,
        allowGuests: i.allowGuests,
        expiresAt: i.expiresAt.toISOString(),
        uses: i.uses,
        maxUses: i.maxUses,
      })),
      guests: guests.flatMap((g) => (g.characterId ? [g.characterId] : [])),
    },
  };
}

const strip = <T extends { campaignId: string; createdAt: Date }>({ campaignId, createdAt, ...rest }: T) => rest;

export async function loadCodex(campaignId: string): Promise<Codex> {
  const [factions, adventures, locations, npcs, handouts, sessions] = await Promise.all([
    db.select().from(faction).where(eq(faction.campaignId, campaignId)).orderBy(asc(faction.createdAt)),
    db.select().from(adventure).where(eq(adventure.campaignId, campaignId)).orderBy(asc(adventure.createdAt)),
    db.select().from(location).where(eq(location.campaignId, campaignId)).orderBy(asc(location.createdAt)),
    db.select().from(npc).where(eq(npc.campaignId, campaignId)).orderBy(asc(npc.createdAt)),
    db.select().from(handout).where(eq(handout.campaignId, campaignId)).orderBy(asc(handout.createdAt)),
    db.select().from(session).where(eq(session.campaignId, campaignId)).orderBy(asc(session.number)),
  ]);
  const beats = adventures.length
    ? await db
        .select()
        .from(beat)
        .where(
          inArray(
            beat.adventureId,
            adventures.map((a) => a.id),
          ),
        )
        .orderBy(asc(beat.order), asc(beat.createdAt))
    : [];
  // DB rows were validated by CodexInput on write; the casts only narrow the untyped jsonb columns (beat.encounter, npc.statSource).
  return {
    factions: factions.map(strip),
    adventures: adventures.map((a) => ({
      ...strip(a),
      beats: beats.filter((b) => b.adventureId === a.id).map(strip),
    })) as Codex["adventures"],
    locations: locations.map(strip),
    npcs: npcs.map(strip) as Codex["npcs"],
    handouts: handouts.map((h) => ({ ...strip(h), revealedAt: h.revealedAt?.toISOString() ?? null })),
    sessions: sessions.map((s) => ({
      id: s.id,
      number: s.number,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      recap: s.recap,
      xp: s.xp,
    })),
  };
}
