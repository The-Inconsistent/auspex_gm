import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { CharacterStats, Overrides, type Codex, type Combatant, type LiveState } from "@wg/shared";
import { appUser, invite, membership } from "../auth/auth.schema.ts";
import { campaign, session } from "../campaign/campaign.schema.ts";
import { character } from "../character/character.schema.ts";
import { adventure, beat, faction, handout, location, npc } from "../codex/codex.schema.ts";
import { db, type Db } from "../core/db.ts";
import { combatant, encounter } from "../encounter/encounter.schema.ts";

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

  return {
    campaign: {
      id: c.id,
      name: c.name,
      tier: c.tier,
      glory: c.glory,
      ruin: c.ruin,
      framework: c.framework,
      patron: c.patron,
    },
    characters: chars.map(
      ({ id, name, stats, overrides, wounds, shock, wrath, traumatic, annihilated, xp, conditions }) => ({
        id,
        name,
        stats: CharacterStats.parse(stats),
        overrides: Overrides.parse(overrides),
        wounds,
        shock,
        wrath,
        traumatic,
        annihilated,
        xp,
        conditions,
      }),
    ),
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
