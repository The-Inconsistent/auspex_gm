import { and, asc, eq, inArray } from "drizzle-orm";
import { CharacterStats, Overrides, type Codex, type Combatant, type LiveState } from "@wg/shared";
import { db } from "./db.ts";
import { adventure, beat, campaign, character, combatant, encounter, faction, handout, location, npc, session } from "./schema.ts";

export async function loadState(campaignId: string): Promise<LiveState | null> {
  const [c] = await db.select().from(campaign).where(eq(campaign.id, campaignId));
  if (!c) return null;

  const chars = await db.select().from(character).where(eq(character.campaignId, campaignId)).orderBy(asc(character.createdAt));
  const [enc] = await db
    .select()
    .from(encounter)
    .where(and(eq(encounter.campaignId, campaignId), eq(encounter.active, true)));
  const rows = enc
    ? await db.select().from(combatant).where(eq(combatant.encounterId, enc.id)).orderBy(asc(combatant.order))
    : [];

  return {
    campaign: { id: c.id, name: c.name, tier: c.tier, glory: c.glory, ruin: c.ruin, framework: c.framework, patron: c.patron },
    characters: chars.map(({ id, name, stats, overrides, wounds, shock, wrath, traumatic, xp, conditions }) => ({
      id, name, stats: CharacterStats.parse(stats), overrides: Overrides.parse(overrides), wounds, shock, wrath, traumatic, xp, conditions,
    })),
    encounter: enc
      ? {
          id: enc.id,
          round: enc.round,
          currentId: enc.currentId,
          lastSide: enc.lastSide,
          seizedSide: enc.seizedSide,
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
                  revealed: r.revealed,
                  stats: r.statSnapshot,
                },
          ),
        }
      : null,
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
    ? await db.select().from(beat).where(inArray(beat.adventureId, adventures.map((a) => a.id))).orderBy(asc(beat.order), asc(beat.createdAt))
    : [];
  // DB rows were validated by CodexInput on write; the casts only narrow text columns back to their enums.
  return {
    factions: factions.map(strip) as Codex["factions"],
    adventures: adventures.map((a) => ({ ...strip(a), beats: beats.filter((b) => b.adventureId === a.id).map(strip) })) as Codex["adventures"],
    locations: locations.map(strip),
    npcs: npcs.map(strip) as Codex["npcs"],
    handouts: handouts.map((h) => ({ ...strip(h), revealedAt: h.revealedAt?.toISOString() ?? null })),
    sessions: sessions.map((s) => ({ id: s.id, number: s.number, startedAt: s.startedAt.toISOString(), endedAt: s.endedAt?.toISOString() ?? null, recap: s.recap, xp: s.xp })),
  };
}
